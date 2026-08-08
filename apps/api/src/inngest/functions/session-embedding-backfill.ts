// @inngest-admin: cross-profile
// ---------------------------------------------------------------------------
// Session-embedding catch-up — WI-3141
//
// `session-completed`'s embed step fails closed: if the summary-safe text is
// not available when it runs, it writes NOTHING rather than falling back to
// the raw transcript (services/session-embedding-content.ts explains why).
// That trades a privacy risk for a completeness risk, and this pair of
// functions pays the completeness back.
//
// Every cause of a fail-closed embed is a summary that was missing or partial
// at embed time, and the summary-reconciliation cron (04:00 UTC) already
// repairs exactly those: it recreates missing `session_summaries` rows,
// regenerates missing `llm_summary`, and regenerates missing `learner_recap`.
// This sweep runs at 04:30 UTC — after that repair, before the 05:00
// transcript purge — and writes the embedding for any session whose summary
// is now complete but which has no `session_embeddings` row. A Voyage outage
// during session-completed heals through the same path.
//
// The two gates on the initial write are re-checked here rather than assumed,
// because this is a second, independent write path into the same index:
//   - the WI-3140 safety firewall (`learning_sessions.safety_flagged_at`)
//   - the GDPR llm-disclosure consent gate (`isLlmExchangeConsentAllowed`)
// Filtering on them in the scan query alone would leave a window between scan
// and handler; both are therefore re-read inside the handler step.
// ---------------------------------------------------------------------------

import { and, asc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { NonRetriableError, RetryAfterError } from 'inngest';
import {
  learningSessions,
  sessionEmbeddings,
  sessionSummaries,
} from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase, getStepVoyageApiKey } from '../helpers';
import {
  upsertSessionEmbedding,
  VoyageEmbeddingHttpError,
} from '../../services/embeddings';
import { loadSummarySafeEmbeddingContent } from '../../services/session-embedding-content';
import { isLlmExchangeConsentAllowed } from '../../services/identity-v2/consent-status-v2';
import { createLogger } from '../../services/logger';

const logger = createLogger();

const backfillEventDataSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  topicId: z.string().uuid().nullable().optional(),
});

/** One page per day. Sized like the sibling reconciliation fan-outs. */
const BACKFILL_LIMIT = 100;

/**
 * Only sessions still inside the 30-day raw-retention window are swept. Past
 * it the transcript purge owns the row and writes the same summary-derived
 * content, so a backfill would duplicate that work.
 */
const BACKFILL_WINDOW_DAYS = 30;

export const sessionEmbeddingBackfillCron = inngest.createFunction(
  {
    id: 'session-embedding-backfill-cron',
    name: 'Backfill session embeddings deferred by a missing summary',
  },
  { cron: '30 4 * * *' },
  async ({ step }) => {
    // Cutoff computed INSIDE step.run for replay stability — same reason as
    // transcript-purge-cron.ts and summary-reconciliation-cron.ts.
    const candidates = await step.run('find-unembedded-sessions', async () => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - BACKFILL_WINDOW_DAYS);

      const db = getStepDatabase();
      return db
        .select({
          sessionId: sessionSummaries.sessionId,
          profileId: sessionSummaries.profileId,
          topicId: sessionSummaries.topicId,
        })
        .from(sessionSummaries)
        .innerJoin(
          learningSessions,
          and(
            eq(learningSessions.id, sessionSummaries.sessionId),
            eq(learningSessions.profileId, sessionSummaries.profileId),
          ),
        )
        .leftJoin(
          sessionEmbeddings,
          and(
            eq(sessionEmbeddings.sessionId, sessionSummaries.sessionId),
            eq(sessionEmbeddings.profileId, sessionSummaries.profileId),
          ),
        )
        .where(
          and(
            isNull(sessionEmbeddings.id),
            isNull(sessionSummaries.purgedAt),
            // llm_summary only — learner_recap is optional in the embedding
            // content (services/session-embedding-content.ts explains why a
            // short session never gets one).
            isNotNull(sessionSummaries.llmSummary),
            // [WI-3140] A safety-flagged session is never embedded. Re-checked
            // in the handler too — this predicate only keeps the fan-out small.
            isNull(learningSessions.safetyFlaggedAt),
            isNotNull(learningSessions.endedAt),
            gte(learningSessions.endedAt, since),
          ),
        )
        .orderBy(asc(learningSessions.endedAt))
        .limit(BACKFILL_LIMIT);
    });

    if (candidates.length === 0) {
      return { status: 'completed', queued: 0 };
    }

    const timestamp = await step.run('snapshot-fanout-timestamp', () =>
      new Date().toISOString(),
    );

    await step.sendEvent(
      'fan-out-session-embedding-backfill',
      candidates.map((candidate) => ({
        name: 'app/session.embedding.backfill' as const,
        data: { ...candidate, timestamp },
      })),
    );

    return { status: 'completed', queued: candidates.length };
  },
);

export const sessionEmbeddingBackfill = inngest.createFunction(
  {
    id: 'session-embedding-backfill',
    name: 'Write one deferred summary-safe session embedding',
    concurrency: { limit: 5 },
    retries: 3,
    // A cron re-fire or operator replay can deliver the same session twice.
    // The write itself is an upsert, but deduping avoids a second Voyage call.
    idempotency: 'event.data.sessionId',
  },
  { event: 'app/session.embedding.backfill' },
  async ({ event, step }) => {
    const parsed = backfillEventDataSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `[session-embedding-backfill] invalid payload: ${parsed.error.message}`,
      );
    }
    const { profileId, sessionId, topicId } = parsed.data;

    return step.run('write-summary-safe-embedding', async () => {
      const db = getStepDatabase();

      const existing = await db.query.sessionEmbeddings.findFirst({
        where: and(
          eq(sessionEmbeddings.sessionId, sessionId),
          eq(sessionEmbeddings.profileId, profileId),
        ),
        columns: { id: true },
      });
      if (existing) {
        return { status: 'skipped_already_embedded' as const };
      }

      // [WI-3140] Fresh read of the safety marker — this write path must be
      // as closed to safeguarding sessions as session-completed's is.
      const safetyFlagRow = await db.query.learningSessions.findFirst({
        where: and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
        ),
        columns: { safetyFlaggedAt: true },
      });
      if (safetyFlagRow?.safetyFlaggedAt) {
        logger.warn('[session-embedding-backfill] embedding skipped', {
          event: 'safety.session_embedding_skipped',
          surface: 'session-embedding-backfill',
          profileId,
          sessionId,
          reason: 'session_safety_flagged',
        });
        return { status: 'skipped_safety_flagged' as const };
      }

      // Same GDPR llm-disclosure gate the initial write applies: consent can
      // have been withdrawn between the session and this sweep.
      const gdprAllowed = await isLlmExchangeConsentAllowed(db, profileId);
      if (!gdprAllowed) {
        return { status: 'skipped_consent_withdrawn' as const };
      }

      const summarySafe = await loadSummarySafeEmbeddingContent(
        db,
        sessionId,
        profileId,
      );
      if (summarySafe.status !== 'ok') {
        // Still not repairable. Not an error: the reconciliation cron keeps
        // working on the summary and the next sweep will retry. Logged so a
        // permanently stuck session is visible rather than silently skipped.
        logger.warn('[session-embedding-backfill] summary still unavailable', {
          event: 'privacy.session_embedding_deferred',
          surface: 'session-embedding-backfill',
          profileId,
          sessionId,
          reason: summarySafe.reason,
        });
        return {
          status: 'skipped_summary_unavailable' as const,
          reason: summarySafe.reason,
        };
      }

      try {
        await upsertSessionEmbedding(
          db,
          sessionId,
          profileId,
          topicId ?? summarySafe.topicId,
          summarySafe.content,
          getStepVoyageApiKey(),
        );
      } catch (error) {
        if (
          error instanceof VoyageEmbeddingHttpError &&
          error.status === 429 &&
          error.retryAfterMs !== null
        ) {
          throw new RetryAfterError(
            'Voyage embedding rate limited during session-embedding backfill',
            error.retryAfterMs,
            { cause: error },
          );
        }
        // Rethrow bare: Inngest retries, then inngestFunctionFailedObserve
        // escalates the terminal failure. Same shape as transcriptPurgeHandler,
        // and it keeps a driver error's message (which can embed queried
        // content) out of a Sentry payload we would assemble here.
        throw error;
      }

      return { status: 'embedded' as const };
    });
  },
);
