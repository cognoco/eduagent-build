// @inngest-admin: cross-profile
import { and, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { sessionSummaries } from '@eduagent/database';
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepRetentionPurgeEnabled,
  getStepVoyageApiKey,
} from '../helpers';
import { purgeSessionTranscript } from '../../services/transcript-purge';
import { captureException } from '../../services/sentry';

const transcriptPurgeEventDataSchema = z.object({
  profileId: z.string().uuid(),
  sessionSummaryId: z.string().uuid(),
});

const PURGE_LIMIT = 100;
const DELAYED_LIMIT = 50;

export const transcriptPurgeCron = inngest.createFunction(
  {
    id: 'transcript-purge-cron',
    name: 'Queue transcript purges for aged summaries',
  },
  { cron: '0 5 * * *' },
  async ({ step }) => {
    if (!getStepRetentionPurgeEnabled()) {
      return { status: 'disabled', queued: 0 };
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);

    const candidates = await step.run('find-purge-candidates', async () => {
      const db = getStepDatabase();
      return db
        .select({
          sessionSummaryId: sessionSummaries.id,
          sessionId: sessionSummaries.sessionId,
          profileId: sessionSummaries.profileId,
        })
        .from(sessionSummaries)
        .where(
          and(
            isNull(sessionSummaries.purgedAt),
            isNotNull(sessionSummaries.llmSummary),
            isNotNull(sessionSummaries.learnerRecap),
            isNotNull(sessionSummaries.summaryGeneratedAt),
            lte(sessionSummaries.summaryGeneratedAt, cutoff),
          ),
        )
        .limit(PURGE_LIMIT);
    });

    const delayed = await step.run(
      'find-delayed-purge-candidates',
      async () => {
        const delayedCutoff = new Date();
        delayedCutoff.setUTCDate(delayedCutoff.getUTCDate() - 37);

        const db = getStepDatabase();
        return db
          .select({
            sessionSummaryId: sessionSummaries.id,
            sessionId: sessionSummaries.sessionId,
            profileId: sessionSummaries.profileId,
          })
          .from(sessionSummaries)
          .where(
            and(
              isNull(sessionSummaries.purgedAt),
              isNotNull(sessionSummaries.summaryGeneratedAt),
              or(
                isNull(sessionSummaries.llmSummary),
                isNull(sessionSummaries.learnerRecap),
              ),
              lte(sessionSummaries.summaryGeneratedAt, delayedCutoff),
            ),
          )
          .limit(DELAYED_LIMIT);
      },
    );

    if (candidates.length === 0) {
      if (delayed.length > 0) {
        // [BUG-993] captureException surfaces delayed purge count to Sentry so
        // ops can query how many sessions are stuck past day-37 without a
        // complete summary. The Inngest dashboard alert targets the event count;
        // Sentry captures the same signal so both surfaces stay in sync.
        captureException(
          new Error(
            `transcript-purge-cron: ${delayed.length} session(s) past day-37 with missing llmSummary/learnerRecap`,
          ),
          {
            extra: {
              surface: 'transcript-purge-delayed',
              delayedCount: delayed.length,
              sessionIds: delayed.map((c) => c.sessionId),
            },
          },
        );
        await step.sendEvent('notify-purge-delayed', {
          name: 'app/session.purge.delayed',
          data: {
            delayedCount: delayed.length,
            sessionIds: delayed.map((candidate) => candidate.sessionId),
            missingPreconditionCount: delayed.length,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return { status: 'completed', queued: 0, delayed: delayed.length };
    }

    const timestamp = new Date().toISOString();
    await step.sendEvent(
      'fan-out-transcript-purge',
      candidates.map((candidate) => ({
        name: 'app/session.transcript.purge' as const,
        data: { ...candidate, timestamp },
      })),
    );

    if (delayed.length > 0) {
      // [BUG-993] Same captureException pattern as the candidates.length === 0
      // branch above: surfaces delayed count to Sentry alongside the Inngest event.
      captureException(
        new Error(
          `transcript-purge-cron: ${delayed.length} session(s) past day-37 with missing llmSummary/learnerRecap`,
        ),
        {
          extra: {
            surface: 'transcript-purge-delayed',
            delayedCount: delayed.length,
            sessionIds: delayed.map((c) => c.sessionId),
          },
        },
      );
      await step.sendEvent('notify-purge-delayed', {
        name: 'app/session.purge.delayed',
        data: {
          delayedCount: delayed.length,
          sessionIds: delayed.map((candidate) => candidate.sessionId),
          missingPreconditionCount: delayed.length,
          timestamp,
        },
      });
    }

    return {
      status: 'completed',
      queued: candidates.length,
      delayed: delayed.length,
    };
  },
);

// ---------------------------------------------------------------------------
// onFailure handler — fires after all 3 retries are exhausted.
//
// [BUG-992] The SLO alert for app/session.transcript.purged tracks failure
// rate (warn >2%, page >5%) via the Inngest dashboard. For the dashboard to
// expose a queryable failure-rate counter, a terminal-failure event must be
// emitted explicitly — Inngest function failures alone are not surfaced as
// first-class events by default. captureException ensures Sentry also records
// the terminal failure so the two surfaces stay in sync.
// ---------------------------------------------------------------------------
export const transcriptPurgeHandlerOnFailure = inngest.createFunction(
  {
    id: 'transcript-purge-handler-on-failure',
    name: 'Handle terminal transcript purge failures (SLO)',
  },
  { event: 'inngest/function.failed' },
  async ({ event }) => {
    const failedEvent = event.data as {
      function_id?: string;
      run_id?: string;
      error?: { name?: string; message?: string };
      event?: { data?: Record<string, unknown> };
    };

    // Only handle failures from our purge handler
    if (failedEvent.function_id !== 'transcript-purge-handler') {
      return { status: 'skipped' };
    }

    const originalData = (failedEvent.event?.data ?? {}) as Record<
      string,
      unknown
    >;

    captureException(
      new Error(
        `transcript-purge: all retries exhausted — ${failedEvent.error?.message ?? 'unknown error'}`,
      ),
      {
        extra: {
          surface: 'transcript-purge-on-failure',
          profileId: originalData.profileId ?? null,
          sessionSummaryId: originalData.sessionSummaryId ?? null,
          runId: failedEvent.run_id ?? null,
          errorName: failedEvent.error?.name ?? null,
        },
      },
    );

    return {
      status: 'captured',
      profileId: originalData.profileId ?? null,
      sessionSummaryId: originalData.sessionSummaryId ?? null,
    };
  },
);

export const transcriptPurgeHandler = inngest.createFunction(
  {
    id: 'transcript-purge-handler',
    name: 'Purge one transcript after retention window',
    concurrency: { limit: 5 },
    retries: 3,
  },
  { event: 'app/session.transcript.purge' },
  async ({ event, step }) => {
    const parsed = transcriptPurgeEventDataSchema.safeParse(event.data);
    if (!parsed.success) {
      captureException(new Error('Invalid transcript purge payload'), {
        extra: {
          surface: 'transcript-purge',
          validationIssues: parsed.error.issues
            .map(
              (issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`,
            )
            .join('; '),
        },
      });
      return { status: 'invalid_payload' as const };
    }

    const { profileId, sessionSummaryId } = parsed.data;

    const result = await step.run('purge-transcript', async () => {
      try {
        const db = getStepDatabase();
        return await purgeSessionTranscript(
          db,
          profileId,
          sessionSummaryId,
          getStepVoyageApiKey(),
        );
      } catch (error) {
        captureException(error, {
          profileId,
          extra: {
            sessionSummaryId,
            surface: 'transcript-purge',
          },
        });
        throw error;
      }
    });

    if (result.status === 'purged') {
      await step.sendEvent('notify-transcript-purged', {
        name: 'app/session.transcript.purged',
        data: {
          profileId,
          sessionId: result.sessionId,
          sessionSummaryId: result.sessionSummaryId,
          eventsDeleted: result.eventsDeleted,
          embeddingRowsReplaced: result.embeddingRowsReplaced,
          purgedAt: result.purgedAt ?? undefined,
        },
      });
    } else {
      // Per CLAUDE.md "silent recovery without escalation is banned": each
      // skip path must be observable in metrics, not just structured logs.
      // The reason field is bounded by purgeSessionTranscript and lets ops
      // group skip rate per cause without scraping log lines.
      await step.sendEvent('notify-transcript-purge-skipped', {
        name: 'app/session.transcript.purge.skipped',
        data: {
          profileId,
          sessionId: result.sessionId,
          sessionSummaryId: result.sessionSummaryId ?? sessionSummaryId,
          reason: result.reason ?? 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
    }

    return result;
  },
);
