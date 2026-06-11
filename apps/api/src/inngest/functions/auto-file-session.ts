import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { sessionAutoFileRequestedEventSchema } from '@eduagent/schemas';
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
  const payload = sessionAutoFileRequestedEventSchema.parse(event.data);
  const { profileId, sessionId } = payload;

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

  const sessionTranscript = await step.run('fetch-transcript', async () => {
    const db = getStepDatabase();
    return formatTranscript(
      await getSessionTranscript(db, profileId, sessionId),
    );
  });

  if (!sessionTranscript) {
    await step.run('mark-failed-transcript-unavailable', async () => {
      const db = getStepDatabase();
      return markSessionAutoFilingFailed(db, profileId, sessionId);
    });

    return { status: 'failed', reason: 'transcript_unavailable' };
  }

  const result = await step.run('file-session', async () => {
    const db = getStepDatabase();
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
        visibility: 'self',
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
