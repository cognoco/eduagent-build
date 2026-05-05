// @inngest-admin: cross-profile
import { and, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { sessionSummaries } from '@eduagent/database';
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepRetentionPurgeEnabled,
  getStepVoyageApiKey,
} from '../helpers';
import { purgeSessionTranscript } from '../../services/transcript-purge';
import { captureException } from '../../services/sentry';

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
            isNotNull(sessionSummaries.summaryGeneratedAt),
            lte(sessionSummaries.summaryGeneratedAt, cutoff)
          )
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
            missingSummary:
              sql<boolean>`${sessionSummaries.llmSummary} IS NULL`.as(
                'missingSummary'
              ),
          })
          .from(sessionSummaries)
          .where(
            and(
              isNull(sessionSummaries.purgedAt),
              isNotNull(sessionSummaries.summaryGeneratedAt),
              lte(sessionSummaries.summaryGeneratedAt, delayedCutoff)
            )
          )
          .limit(DELAYED_LIMIT);
      }
    );

    const delayedBlocked = delayed.filter(
      (candidate) => candidate.missingSummary
    );

    if (candidates.length === 0) {
      if (delayedBlocked.length > 0) {
        await step.sendEvent('notify-purge-delayed', {
          name: 'app/session.purge.delayed',
          data: {
            delayedCount: delayedBlocked.length,
            sessionIds: delayedBlocked.map((candidate) => candidate.sessionId),
            missingSummaryCount: delayedBlocked.filter(
              (candidate) => candidate.missingSummary
            ).length,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return { status: 'completed', queued: 0, delayed: delayedBlocked.length };
    }

    const timestamp = new Date().toISOString();
    await step.sendEvent(
      'fan-out-transcript-purge',
      candidates.map((candidate) => ({
        name: 'app/session.transcript.purge' as const,
        data: { ...candidate, timestamp },
      }))
    );

    if (delayedBlocked.length > 0) {
      await step.sendEvent('notify-purge-delayed', {
        name: 'app/session.purge.delayed',
        data: {
          delayedCount: delayedBlocked.length,
          sessionIds: delayedBlocked.map((candidate) => candidate.sessionId),
          missingSummaryCount: delayedBlocked.filter(
            (candidate) => candidate.missingSummary
          ).length,
          timestamp,
        },
      });
    }

    return {
      status: 'completed',
      queued: candidates.length,
      delayed: delayedBlocked.length,
    };
  }
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
    const { profileId, sessionSummaryId } = event.data as {
      profileId: string;
      sessionSummaryId: string;
    };

    const result = await step.run('purge-transcript', async () => {
      try {
        const db = getStepDatabase();
        return await purgeSessionTranscript(
          db,
          profileId,
          sessionSummaryId,
          getStepVoyageApiKey()
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
  }
);
