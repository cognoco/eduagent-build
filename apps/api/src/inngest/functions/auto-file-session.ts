// @inngest-admin: event-profile (profileId from event; all filing and library ops scoped by profileId)
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  sessionAutoFileRequestedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import {
  buildLibraryIndex,
  fileToLibrary,
  resolveFilingResult,
} from '../../services/filing';
import { routeAndCall } from '../../services/llm';
import {
  claimSessionForAutoFiling,
  getSessionTranscript,
  markSessionAutoFiled,
  markSessionAutoFilingFailed,
} from '../../services/session';
import { deleteTopicIfSafe } from '../../services/curriculum';
import { FILING_CONFIG } from '../../config/filing';
import { writeActivityMoment } from '../../services/activity-ledger';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

export interface AutoFileStep {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  sendEvent(id: string, payload: unknown): Promise<unknown>;
}

function formatTranscript(
  transcript: Awaited<ReturnType<typeof getSessionTranscript>>,
): string | null {
  if (!transcript || transcript.archived) {
    return null;
  }

  const lines = transcript.exchanges.map((exchange) => {
    const role = exchange.role === 'user' ? 'Learner' : 'Tutor';
    return `${role}: ${exchange.content}`;
  });

  return lines.length > 0 ? lines.join('\n') : null;
}

async function runAutoFileSession({
  event,
  step,
}: {
  event: { data: unknown };
  step: AutoFileStep;
}): Promise<unknown> {
  // [BUG-844] safeParse, never parse: a ZodError thrown here counts as a
  // handler failure, and with retries: 2 a malformed (guaranteed-fail) payload
  // re-parses and re-throws 3 times before onFailure fires — burning the whole
  // retry budget on a payload that can never succeed. Return a non-retried
  // terminal result instead (same pattern as billing-trial-subscription-failed).
  const parsed = sessionAutoFileRequestedEventSchema.safeParse(event.data);
  if (!parsed.success) {
    captureException(
      new Error(
        `session.auto_file_requested: invalid payload — ${parsed.error.message}`,
      ),
      {
        extra: {
          site: 'autoFileSession.invalid_payload',
          rawData: summarizeRawPayload(event.data),
        },
      },
    );
    logger.warn('auto_file_session.invalid_payload', {
      issues: parsed.error.issues,
    });
    return { status: 'invalid_payload' };
  }

  const { profileId, sessionId } = parsed.data;

  const claim = await step.run('claim-session', async () => {
    const db = getStepDatabase();
    return claimSessionForAutoFiling(db, profileId, sessionId);
  });

  if (!claim) {
    return { status: 'skipped', reason: 'claim_lost' };
  }

  if (claim.filingRetryCount > FILING_CONFIG.maxRetries) {
    await step.run('mark-failed-retry-cap', async () => {
      const db = getStepDatabase();
      return markSessionAutoFilingFailed(db, profileId, sessionId);
    });

    return { status: 'failed', reason: 'retry_cap' };
  }

  // PII egress: step returns are memoized into Inngest's third-party state
  // store, so this step carries an existence marker only — the formatted
  // transcript is rehydrated from the DB inside the file-session step closure
  // and never serialized into Inngest state (same closure pattern as
  // freeform-filing's retry-filing step).
  const transcriptAvailable = await step.run('fetch-transcript', async () => {
    const db = getStepDatabase();
    const formatted = formatTranscript(
      await getSessionTranscript(db, profileId, sessionId),
    );
    return formatted ? { available: true as const } : null;
  });

  if (!transcriptAvailable) {
    await step.run('mark-failed-transcript-unavailable', async () => {
      const db = getStepDatabase();
      return markSessionAutoFilingFailed(db, profileId, sessionId);
    });

    return { status: 'failed', reason: 'transcript_unavailable' };
  }

  const result = await step.run('file-session', async () => {
    const db = getStepDatabase();
    // Rehydrated here instead of riding the fetch-transcript step return.
    // A transcript that vanished between steps (e.g. purged) yields null and
    // the function marks the filing failed below.
    const sessionTranscript = formatTranscript(
      await getSessionTranscript(db, profileId, sessionId),
    );
    if (!sessionTranscript) {
      return null;
    }
    const libraryIndex = await buildLibraryIndex(db, profileId);
    const filingResponse = await fileToLibrary(
      { sessionTranscript, sessionMode: 'freeform' },
      libraryIndex,
      routeAndCall,
    );

    return resolveFilingResult(db, {
      profileId,
      sessionId,
      filedFrom: 'session_filing',
      filingResponse,
    });
  });

  if (!result) {
    // Distinct step name from the never-available branch above: this is the
    // vanished-between-steps case (transcript purged after the availability
    // check). Distinct names keep the two branches collision-proof even if a
    // future edit removes the early return above.
    await step.run('mark-failed-transcript-vanished', async () => {
      const db = getStepDatabase();
      return markSessionAutoFilingFailed(db, profileId, sessionId);
    });

    return { status: 'failed', reason: 'transcript_unavailable' };
  }

  const finalized = await step.run('finalize-session', async () => {
    const db = getStepDatabase();
    return markSessionAutoFiled(db, profileId, sessionId, result.topicId);
  });

  if (!finalized) {
    await step.run('cleanup-raced-topic', async () => {
      const db = getStepDatabase();
      return deleteTopicIfSafe(db, profileId, sessionId, result.topicId);
    });

    return {
      status: 'skipped',
      reason: 'final_update_lost',
      topicId: result.topicId,
    };
  }

  await step.run('write-ledger-moment', async () => {
    const db = getStepDatabase();
    try {
      await writeActivityMoment({
        db,
        profileId,
        actorJob: 'auto-file-session',
        kind: 'session_filed',
        templateKey: 'ledger.session_filed.default',
        params: {
          topicTitle: result.topicTitle,
          subjectId: result.shelfId,
          bookId: result.bookId,
          topicId: result.topicId,
        },
      });
      return { written: true };
    } catch (err) {
      captureException(err, {
        profileId,
        extra: {
          site: 'autoFileSession.writeLedgerMoment',
          sessionId,
          topicId: result.topicId,
        },
      });
      return { written: false };
    }
  });

  const timestamp = new Date().toISOString();
  await step.sendEvent('notify-filing-completed', {
    name: 'app/filing.completed',
    data: {
      bookId: result.bookId,
      topicTitle: result.topicTitle,
      profileId,
      sessionId,
      timestamp,
    },
  });

  return {
    status: 'completed',
    ...result,
    timestamp,
  };
}

export const autoFileSession = inngest.createFunction(
  {
    id: 'auto-file-session',
    name: 'Auto-file freeform session',
    retries: 2,
    idempotency: 'event.data.dispatchId',
    concurrency: { key: 'event.data.sessionId', limit: 1 },
    // Inngest calls onFailure after the configured function retries are
    // exhausted. That is the terminal branch for failures after claim.
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: { event?: { data?: unknown } } };
      error: unknown;
    }) => {
      const parsed = sessionAutoFileRequestedEventSchema.safeParse(
        event.data.event?.data,
      );
      if (!parsed.success) {
        logger.warn(
          '[auto-file-session] terminal failure had invalid payload',
          {
            issues: parsed.error.issues,
          },
        );
        return { status: 'skipped', reason: 'invalid_payload' };
      }

      const db = getStepDatabase();
      await markSessionAutoFilingFailed(
        db,
        parsed.data.profileId,
        parsed.data.sessionId,
      );
      logger.error('auto_file_session.terminal_failure', {
        profileId: parsed.data.profileId,
        sessionId: parsed.data.sessionId,
        dispatchId: parsed.data.dispatchId,
        reason: 'handler_retries_exhausted',
        errorName: error instanceof Error ? error.name : typeof error,
      });
      captureException(error, {
        profileId: parsed.data.profileId,
        extra: {
          site: 'autoFileSession.onFailure',
          sessionId: parsed.data.sessionId,
          dispatchId: parsed.data.dispatchId,
        },
      });

      return { status: 'failed', sessionId: parsed.data.sessionId };
    },
  },
  { event: 'app/session.auto_file_requested' },
  runAutoFileSession,
);
