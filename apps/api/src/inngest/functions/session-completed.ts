import { inngest } from '../client';
import { INNGEST_PLAN_CONCURRENCY_CAP } from '../plan-limits';
import {
  getStepDatabase,
  getStepMemoryFactsDedupConfig,
  getStepVoyageApiKey,
  isIdentityV2EnabledInStep,
} from '../helpers';
import { isGdprProcessingAllowedV2 } from '../../services/identity-v2/consent-status-v2';
import { getPersonLlmContext } from '../../services/identity-v2/helpers';
import {
  updateRetentionFromSession,
  updateNeedsDeepeningProgress,
} from '../../services/retention-data';
import { resetRetentionCardForRelearn } from '../../services/apply-retention-update';
import { getCurrentLanguageProgress } from '../../services/language-curriculum';
import { extractVocabularyFromTranscript } from '../../services/vocabulary-extract';
import { upsertExtractedVocabulary } from '../../services/vocabulary';
import { createPendingSessionSummary } from '../../services/summaries';
import { recordSessionActivity } from '../../services/streaks';
import {
  extractSessionContent,
  storeSessionEmbedding,
} from '../../services/embeddings';
import {
  precomputeCoachingCard,
  writeCoachingCardCache,
} from '../../services/coaching-cards';
import { refreshProgressSnapshot } from '../../services/snapshot-aggregation';
import { insertSessionXpEntry } from '../../services/xp';
import { extractAndStoreHomeworkSummary } from '../../services/homework-summary';
import { updateMedianResponseSeconds } from '../../services/settings';
import { isGdprProcessingAllowed } from '../../services/consent';
import {
  processEvaluateCompletion,
  processTeachBackCompletion,
} from '../../services/verification-completion';
import * as sentry from '../../services/sentry';
import { createLogger } from '../../services/logger';
import { queueCelebration } from '../../services/celebrations';
import {
  buildBrowseHighlight,
  FREEFORM_TOPIC_SENTINEL,
  generateSessionInsights,
} from '../../services/session-highlights';
import { generateLearnerRecap } from '../../services/session-recap';
import { generateAndStoreLlmSummary } from '../../services/session-llm-summary';
import {
  curriculumBooks,
  curriculumTopics,
  createScopedRepository,
  learningSessions,
  membership,
  memoryFacts,
  person,
  profiles,
  retentionCards,
  sessionEvents,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { projectAiResponseContent } from '../../services/llm/project-response';
import { parseConversationLanguage } from '../../services/llm';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  cefrLevelSchema,
  computeAgeBracket,
  sessionCompletedEventSchema,
  verificationTypeSchema,
} from '@eduagent/schemas';
import { NonRetriableError } from 'inngest';
import {
  analyzeSessionTranscript,
  applyAnalysis,
  getLearningProfile,
} from '../../services/learner-profile';
import { sendStruggleNotification } from '../../services/notifications';
import {
  makeEmbedderFromEnv,
  type FactEmbedder,
} from '../../services/memory/embed-fact';
import {
  isMemoryFactsDedupEnabled,
  isProfileInDedupRollout,
} from '../../config';
import { runDedupForProfile } from '../../services/memory/dedup-pass';
import {
  ensureFreeSubscription,
  ensureFreeSubscriptionV2,
  decrementQuota,
  safeRefundQuota,
  getQuotaPool,
} from '../../services/billing';
import { safeSend } from '../../services/safe-non-core';

const logger = createLogger();

// [PROFILE-SCOPE-GUARD] Verify ownership via the parent chain
// (topics → books → subjects.profileId) before exposing the title.
// Mirrors the pattern in services/notes.ts:verifyTopicOwnership so a
// stale/spoofed topicId cannot leak titles across accounts.
// Hoisted from a closure inside processSessionCompleted so the integration
// test can exercise the WHERE-clause ownership predicate directly (a unit-
// level db mock has no SQL engine and cannot evaluate the predicate).
export async function loadTopicTitle(
  db: Database,
  currentTopicId: string | null | undefined,
  ownerProfileId: string,
): Promise<string | null> {
  if (!currentTopicId) return null;
  const [topic] = await db
    .select({ title: curriculumTopics.title })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.profileId, ownerProfileId),
      ),
    )
    .where(eq(curriculumTopics.id, currentTopicId))
    .limit(1);
  return topic?.title ?? null;
}

export async function embedNewFactsForProfile(
  db: Database,
  profileId: string,
  embedder: FactEmbedder,
  options?: { limit?: number },
): Promise<{
  embedded: number;
  failed: number;
  scanned: number;
  embeddedIds: string[];
  failedIds: string[];
}> {
  const rows = await db
    .select({
      id: memoryFacts.id,
      text: memoryFacts.text,
      category: memoryFacts.category,
    })
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.profileId, profileId),
        isNull(memoryFacts.embedding),
        sql`${memoryFacts.supersededBy} IS NULL`,
      ),
    )
    .orderBy(desc(memoryFacts.createdAt), desc(memoryFacts.id))
    .limit(options?.limit ?? 50);

  let embedded = 0;
  let failed = 0;
  const embeddedIds: string[] = [];
  const failedIds: string[] = [];

  // [L7-F8] Parallelize the per-row Voyage call. The underlying embedder is
  // single-text (Voyage batch API not currently wired into FactEmbedder), but
  // Promise.all eliminates the serial-HTTP latency stack while still going
  // through `embedFactText`'s classification and 4xx/5xx handling. If Voyage
  // rate-limits, the per-row classifier marks the row `rate_limited` /
  // `transient` and Inngest step retry covers re-scan on next tick.
  //
  // [L9-F2] Removed orphan `app/embed.skipped` dispatch — no handler exists
  // for the event anywhere in the codebase (grep 2026-05-23), so each retry
  // multiplied a no-op observability emit. Failure surfacing now lives in the
  // structured logger.warn below plus the Sentry path for unexpected classes.
  const results = await Promise.all(
    rows.map(async (row) => {
      logger.info('[memory_facts] embed-on-write attempted', {
        event: 'memory_facts.embed_on_write.attempted',
        profileId,
        category: row.category,
        source: 'embed_on_write',
      });
      const result = await embedder(row.text);
      return { row, result };
    }),
  );

  // [BUG-759] Collect successful embeddings, then issue grouped bulk
  // UPDATEs after the failure-classification loop. Previously this was a
  // per-row `db.update().where(eq(id, row.id))` inside the same for-loop,
  // which (a) issued N round-trips on every replay and (b) bumped
  // `updatedAt` on every retry because the predicate did not block writes
  // that had already succeeded. The `isNull(embedding)` predicate below
  // collapses replays to no-ops at the DB level.
  type SuccessfulEmbed = { id: string; vector: number[] };
  const successes: SuccessfulEmbed[] = [];

  for (const { row, result } of results) {
    if (!result.ok) {
      failed += 1;
      failedIds.push(row.id);
      logger.warn('[memory_facts] embed-on-write failed', {
        event: 'memory_facts.embed_on_write.failed',
        profileId,
        category: row.category,
        reason: result.reason,
      });
      // [CR-2026-05-19-M1] Documented benign classes (`invalid_input` = Voyage
      // 4xx poison-pill; `no_voyage_key` = missing config) are NOT routed to
      // Sentry. Other classes are unexpected and DO escalate so transient/
      // rate-limit spikes page on sustained drift.
      if (
        result.class !== 'invalid_input' &&
        result.class !== 'no_voyage_key'
      ) {
        sentry.captureException(new Error(result.message), {
          extra: {
            surface: 'session_completed.embed_new_facts',
            profileId,
            category: row.category,
            failureClass: result.class,
            reason: result.reason,
          },
        });
      }
      continue;
    }

    successes.push({ id: row.id, vector: result.vector });
  }

  if (successes.length > 0) {
    // Each row has its own vector, so we cannot collapse to a single
    // `set({embedding: X})`. Group by vector identity to coalesce
    // duplicates (rare but possible: identical fact texts produced by
    // distinct rows would dedupe at the embedder boundary), and use
    // `inArray(id, ids)` so each group is one round-trip rather than N.
    const now = new Date();
    const grouped = new Map<string, { vector: number[]; ids: string[] }>();
    for (const s of successes) {
      const key = JSON.stringify(s.vector);
      const existing = grouped.get(key);
      if (existing) {
        existing.ids.push(s.id);
      } else {
        grouped.set(key, { vector: s.vector, ids: [s.id] });
      }
    }

    for (const { vector, ids } of grouped.values()) {
      await db
        .update(memoryFacts)
        .set({ embedding: vector, updatedAt: now })
        .where(
          and(
            inArray(memoryFacts.id, ids),
            eq(memoryFacts.profileId, profileId),
            // [BUG-759] Idempotency: a replay that finds the rows already
            // embedded matches no rows here, so the UPDATE is a no-op
            // rather than a re-write with a fresh updatedAt timestamp.
            isNull(memoryFacts.embedding),
          ),
        );
    }

    embedded = successes.length;
    embeddedIds.push(...successes.map((s) => s.id));
  }

  return { embedded, failed, scanned: rows.length, embeddedIds, failedIds };
}

// ---------------------------------------------------------------------------
// Step error isolation — two tiers:
//
//   CRITICAL steps (must-retry): re-throw from within step.run so Inngest's
//     own retry machinery fires. These write durable user-facing state (SM-2
//     retention cards, XP/streak) whose loss would be observable to the user.
//
//   SOFT steps (best-effort enrichment): use runIsolated — errors are
//     captured to Sentry with a structured tag and the function continues.
//     A missing coaching card or embedding is annoying but not data-loss.
//
// [FIX-INNGEST-1] Prior to this fix every step used runIsolated, so Inngest
// always saw success and never retried. Critical writes could silently fail
// on transient DB hiccups with no recovery path.
// ---------------------------------------------------------------------------

interface StepOutcome {
  step: string;
  status: 'ok' | 'skipped' | 'failed';
  error?: string;
  qualityRating?: number;
}

// [CR-119.1]: Extended step results that carry extra data through Inngest
// replay. Using explicit interfaces because Inngest's Jsonify<T> doesn't
// always preserve intersection types from spread returns.
interface DashboardStepResult extends StepOutcome {
  streak: { currentStreak: number; longestStreak: number } | null;
}

// [BUG-181] update-vocabulary-retention previously assigned language
// progress to closure variables (`let previousLanguageProgress` /
// `let nextLanguageProgress`) read by check-milestone-completion. On
// Inngest replay, step.run results are memoized but closure assignments
// inside the memoized function body are NOT re-executed — the downstream
// step would see `null` and silently miss milestone celebrations.
// Carry the values through the step result instead.
interface VocabularyRetentionStepResult extends StepOutcome {
  previousLanguageProgress: Awaited<
    ReturnType<typeof getCurrentLanguageProgress>
  > | null;
  nextLanguageProgress: Awaited<
    ReturnType<typeof getCurrentLanguageProgress>
  > | null;
}

// Close reasons that indicate no user engagement — SM-2 fallback should not apply.
// The plan listed 'crash_recovery' and 'app_background' but these do not exist
// in the codebase as of 2026-04-16. Add them here if they are introduced.
//
// NOTE: 'auto_closed' is intentionally NOT in this list. An auto_closed session
// with exchangeCount > 0 means the user engaged before being timed out, so it
// should still count toward the streak. The isAbandoned guard (~line 127) uses
// summaryStatus to skip the filing wait — that is a separate concern from
// streak eligibility. Only 'silence_timeout' (stale-cleanup cron, 30 min idle,
// no user action) represents truly unattended sessions.
const UNATTENDED_REASONS = ['silence_timeout'] as const;

async function runIsolated(
  name: string,
  profileId: string,
  fn: () => Promise<number | undefined | void>,
): Promise<StepOutcome> {
  try {
    const result = await fn();
    return {
      step: name,
      status: 'ok',
      // Propagate numeric return values (e.g. sm2Quality from verification)
      ...(typeof result === 'number' ? { qualityRating: result } : {}),
    };
  } catch (err) {
    // [FIX-INNGEST-1] Structured tag so we can query soft-step failure rate
    // per step name. Required by "Silent Recovery Without Escalation is Banned".
    sentry.captureException(err, {
      profileId,
      extra: { step: name, surface: 'session-completed' },
    });
    // [logging sweep] structured logger so PII fields land as JSON context
    logger.error('[session-completed] soft step failed', {
      step: name,
      profileId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      step: name,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// CRITICAL step: re-throws so Inngest's retry machinery fires. Use for writes
// that are durable user-facing state (SM-2 retention cards, XP/streak).
// The caller must wrap this inside step.run — do NOT add a catch around it.
async function runCritical(
  name: string,
  fn: () => Promise<void>,
): Promise<StepOutcome> {
  await fn(); // throws on error — Inngest retries the whole step.run
  return { step: name, status: 'ok' };
}

export const sessionCompleted = inngest.createFunction(
  {
    id: 'session-completed',
    name: 'Process session completion',
    // [BUG-146] Per-profile concurrency cap. This function fans out heavy
    // LLM work (analyzeSessionTranscript, generateSessionInsights,
    // generateLearnerRecap, generateAndStoreLlmSummary) plus Voyage
    // embeddings and Neon writes. Without a cap, a flurry of session-
    // completed events for one profile would stampede the LLM provider
    // and Neon connection pool. limit=25 mirrors the heavy-LLM cadence
    // used by weekly-progress-push; keying on profileId spreads parallelism
    // across profiles without serialising the whole function.
    // Intended 25 (per-profile); capped to the Inngest plan limit. Raise after
    // a plan upgrade — see INNGEST_PLAN_CONCURRENCY_CAP.
    concurrency: {
      limit: INNGEST_PLAN_CONCURRENCY_CAP,
      key: 'event.data.profileId',
    },
    // [BUG-154] Function-level idempotency keyed on sessionId prevents
    // duplicate `app/session.completed` deliveries for the same session
    // from re-triggering the pipeline (which would re-emit dedup-events
    // and re-run all enrichment steps). Inngest memoizes step.run results
    // within a single invocation, but only function-level idempotency
    // dedupes across separate event deliveries.
    idempotency: 'event.data.sessionId',
  },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
    // Validate event payload at entry. Malformed payloads (wrong
    // types for qualityRating, exchangeCount, reason, or missing required
    // ids) would otherwise silently corrupt SM-2 scheduling, streak credit,
    // or isUnattended gating via raw `as` casts. NonRetriableError
    // dead-letters the event immediately so ops can detect and investigate
    // without accumulating incorrect state.
    const parsed = sessionCompletedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `[session-completed] Invalid event payload: ${parsed.error.message}`,
      );
    }

    const {
      profileId,
      sessionId,
      subjectId,
      summaryStatus,
      timestamp,
      verificationType,
      sessionType,
    } = event.data;
    // topicId must be `let` so it can be backfilled after the waitForEvent
    // re-read (F-6: filing may complete just before the 60s timeout fires).
    let topicId = event.data.topicId as string | null | undefined;

    // AD6: Wait for filing to complete before progressing, so that the
    // progress snapshot captures topic placement from the filing step.
    // Freeform sessions (no topicId) and homework sessions trigger filing
    // as a separate async step; we give it up to 60 s to land.
    const isAbandoned = summaryStatus === 'auto_closed';
    const eventMode = event.data.mode as string | undefined;
    const shouldWaitForFiling =
      (sessionType === 'homework' || !topicId) &&
      !isAbandoned &&
      eventMode !== 'recitation';
    if (shouldWaitForFiling) {
      const filingEvent = await step.waitForEvent('wait-for-filing', {
        event: 'app/filing.completed',
        match: 'data.sessionId',
        timeout: '60s',
      });
      // [BUG-852] Inngest returns null on timeout. We intentionally do NOT
      // fail the step here — filing may have completed via DB write even if
      // the event was missed (the re-read below covers that). But silent
      // proceed-with-stale-placement was invisible in observability, so
      // escalate to Sentry + structured warn so we can quantify how often
      // the 60s window is too short.
      // [SWEEP-SILENT-RECOVERY] In addition to captureException, dispatch a
      // queryable Inngest event so a non-Sentry observability rule can page
      // on rate spikes — a systematic regression in upstream filing would
      // silently degrade topic placement for every session otherwise.
      if (filingEvent == null) {
        const timeoutErr = new Error(
          'session-completed: filing waitForEvent timed out after 60s',
        );
        sentry.captureException(timeoutErr, { profileId });
        // [logging sweep] structured logger so PII fields land as JSON context
        logger.warn(
          '[session-completed] filing waitForEvent timed out — proceeding with stale topic placement',
          {
            sessionId,
            profileId,
            sessionType: sessionType ?? 'unknown',
          },
        );
        await step.sendEvent('filing-timed-out', {
          name: 'app/session.filing_timed_out',
          data: {
            sessionId,
            profileId,
            sessionType: sessionType ?? null,
            timeoutMs: 60_000,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // F-6: Filing may have backfilled topicId even if the event didn't arrive
    // in time (network delay, retry succeeded). Re-read the session row so
    // downstream steps use the correct topicId and exchangeCount.
    let exchangeCount = event.data.exchangeCount as number | undefined;
    if (!topicId || exchangeCount == null) {
      const freshSession = await step.run('re-read-session', async () => {
        const db = getStepDatabase();
        const row = await db.query.learningSessions.findFirst({
          where: and(
            eq(learningSessions.id, sessionId),
            eq(learningSessions.profileId, profileId),
          ),
        });
        return row
          ? { topicId: row.topicId, exchangeCount: row.exchangeCount }
          : null;
      });
      if (freshSession?.topicId && !topicId) {
        topicId = freshSession.topicId;
      }
      if (freshSession != null && exchangeCount == null) {
        exchangeCount = freshSession.exchangeCount;
      }
    }

    const outcomes: StepOutcome[] = [];

    const computeSessionMedianResponseSeconds = async () => {
      const db = getStepDatabase();
      const events = await db.query.sessionEvents.findMany({
        where: and(
          eq(sessionEvents.sessionId, sessionId),
          eq(sessionEvents.profileId, profileId),
        ),
        // [BUG-913 sweep] Tie-break by id when created_at collides — see
        // session-crud.ts getSessionTranscript for the full rationale.
        orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
      });

      let lastAiAt: Date | null = null;
      const responseSeconds: number[] = [];

      for (const event of events) {
        if (event.eventType === 'ai_response') {
          lastAiAt = event.createdAt;
          continue;
        }

        if (
          event.eventType === 'user_message' &&
          lastAiAt &&
          event.createdAt > lastAiAt
        ) {
          responseSeconds.push(
            Math.round((event.createdAt.getTime() - lastAiAt.getTime()) / 1000),
          );
        }
      }

      if (responseSeconds.length === 0) return null;
      const sorted = [...responseSeconds].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        const lo = sorted[middle - 1];
        const hi = sorted[middle];
        if (lo === undefined || hi === undefined) return null;
        return Math.round((lo + hi) / 2);
      }
      const mid = sorted[middle];
      if (mid === undefined) return null;
      return mid;
    };

    // FR92: Determine which topics need retention updates
    // Interleaved sessions update all practiced topics; others update the single topicId
    const rawInterleaved = event.data.interleavedTopicIds;
    const retentionTopicIds: string[] = Array.isArray(rawInterleaved)
      ? (rawInterleaved as unknown[]).filter(
          (id): id is string => typeof id === 'string',
        )
      : topicId
        ? [topicId]
        : [];

    // Step 1: Process verification-specific completion (EVALUATE / TEACH_BACK)
    // Parses structured assessment from LLM output, maps to SM-2 quality,
    // and stores in session_events for audit trail + downstream features.
    const verificationCompletionOutcome = await step.run(
      'process-verification-completion',
      async () => {
        // C-05: validate verificationType at runtime using Zod schema
        // from @eduagent/schemas. If the value is invalid or a new type is
        // added without a handler, we log a warning rather than silently
        // skipping.
        const parsed = verificationTypeSchema.safeParse(verificationType);
        if (!parsed.success) {
          if (verificationType != null) {
            // [logging sweep] structured logger so PII fields land as JSON context
            logger.warn('[session-completed] Unknown verificationType', {
              verificationType: String(verificationType),
              profileId,
            });
            // [SWEEP-SILENT-RECOVERY] Capture for queryable failure rate —
            // an unknown verificationType arriving here is a contract drift
            // signal (new type added without a handler). Without Sentry we
            // can't quantify how often this fires and where it originates.
            sentry.captureException(
              new Error(
                `session-completed: unknown verificationType ${String(
                  verificationType,
                )}`,
              ),
              {
                profileId,
                extra: {
                  sessionId,
                  verificationType: String(verificationType),
                },
              },
            );
          }
          return {
            step: 'process-verification-completion',
            status: 'skipped' as const,
          };
        }
        const vType = parsed.data;
        if (vType !== 'evaluate' && vType !== 'teach_back') {
          return {
            step: 'process-verification-completion',
            status: 'skipped' as const,
          };
        }
        if (!topicId) {
          return {
            step: 'process-verification-completion',
            status: 'skipped' as const,
          };
        }
        return runIsolated(
          'process-verification-completion',
          profileId,
          async () => {
            const db = getStepDatabase();
            if (vType === 'evaluate') {
              return processEvaluateCompletion(
                db,
                profileId,
                sessionId,
                topicId,
              );
            } else {
              return processTeachBackCompletion(db, profileId, sessionId);
            }
          },
        );
      },
    );
    outcomes.push(verificationCompletionOutcome);

    const derivedQualityRating =
      typeof verificationCompletionOutcome.qualityRating === 'number'
        ? verificationCompletionOutcome.qualityRating
        : undefined;
    const completionQualityRating =
      derivedQualityRating ?? (event.data.qualityRating as number | undefined);

    // Only explicit quality signals advance SM-2. A user-ended, skipped, or
    // crash-recovered session with a couple of exchanges is activity, but not
    // proof that the topic was learned.
    const effectiveQuality = completionQualityRating;

    // Step 1a: Relearn retention reset — must run BEFORE SM-2 update.
    // Pre-redesign, startRelearn reset the card at session start; SM-2 then
    // advanced it at session end. The redesign deferred the reset to here, but
    // running it AFTER update-retention overwrote SM-2's freshly written
    // schedule (intervalDays / nextReviewAt / repetitions) back to baseline,
    // leaving relearn cards with nextReviewAt=null and never re-surfacing.
    // Reset first, then SM-2 advances from baseline using effectiveQuality.
    //
    // [BUG-185] The next step (update-retention) reads the card and uses
    // `updatedAt` for both the D-01 double-counting guard and the
    // optimistic-lock WHERE clause. This step MUST preserve the existing
    // `updatedAt` value — bumping it here would cause SM-2 to short-circuit
    // and skip the advance.
    //
    // The reset helper preserves updatedAt via a self-referencing SQL
    // expression, so a future schema-level auto-update hook cannot silently
    // break the D-01 guard used by update-retention.
    outcomes.push(
      await step.run('relearn-retention-reset', async () => {
        const sessionMode = event.data.mode as string | undefined;
        if (
          sessionMode !== 'relearn' ||
          (exchangeCount ?? 0) <= 0 ||
          effectiveQuality == null ||
          !topicId
        ) {
          return {
            step: 'relearn-retention-reset',
            status: 'skipped' as const,
          };
        }

        return runCritical('relearn-retention-reset', async () => {
          const db = getStepDatabase();
          await resetRetentionCardForRelearn({ db, profileId, topicId });
        });
      }),
    );

    // Step 1b: Update retention data via SM-2
    // Conservative: skip retention update when no quality rating was provided,
    // rather than defaulting to 3 (which inflates metrics). Issue #19.
    outcomes.push(
      await step.run('update-retention', async () => {
        if (retentionTopicIds.length === 0)
          return { step: 'update-retention', status: 'skipped' as const };
        if (effectiveQuality == null) {
          // [logging sweep] structured logger so PII fields land as JSON context
          logger.warn(
            '[session-completed] No qualityRating — skipping retention update',
            {
              sessionId,
              profileId,
            },
          );
          return { step: 'update-retention', status: 'skipped' as const };
        }
        return runCritical('update-retention', async () => {
          const db = getStepDatabase();
          // [L7-F7] Parallelize per-topic SM-2 updates — they are independent
          // writes against retention_cards keyed by (profileId, topicId).
          await Promise.all(
            retentionTopicIds.map((tid) =>
              updateRetentionFromSession(
                db,
                profileId,
                tid,
                effectiveQuality,
                timestamp,
              ),
            ),
          );
        });
      }),
    );

    // [BUG-181] Return language progress through the step result so the value
    // survives Inngest replay memoization. Mutating closure vars inside
    // step.run is replay-unsafe — on replay the memoized result is reused but
    // the closure assignments are NOT re-executed.
    const vocabularyOutcome = (await step.run(
      'update-vocabulary-retention',
      async (): Promise<VocabularyRetentionStepResult> => {
        if (!subjectId) {
          return {
            step: 'update-vocabulary-retention',
            status: 'skipped' as const,
            previousLanguageProgress: null,
            nextLanguageProgress: null,
          };
        }

        let stepPrevious: Awaited<
          ReturnType<typeof getCurrentLanguageProgress>
        > | null = null;
        let stepNext: Awaited<
          ReturnType<typeof getCurrentLanguageProgress>
        > | null = null;

        const isolated = await runIsolated(
          'update-vocabulary-retention',
          profileId,
          async () => {
            const db = getStepDatabase();
            const subject = await db.query.subjects.findFirst({
              where: and(
                eq(subjects.id, subjectId),
                eq(subjects.profileId, profileId),
              ),
            });
            if (
              !subject ||
              subject.pedagogyMode !== 'four_strands' ||
              !subject.languageCode
            ) {
              return;
            }

            stepPrevious = await getCurrentLanguageProgress(
              db,
              profileId,
              subjectId,
            );

            const events = await db.query.sessionEvents.findMany({
              where: and(
                eq(sessionEvents.sessionId, sessionId),
                eq(sessionEvents.profileId, profileId),
              ),
              // [BUG-913 sweep] Tie-break by id when created_at collides — see
              // session-crud.ts getSessionTranscript for the full rationale.
              orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
            });

            const transcript = events
              .filter(
                (entry) =>
                  entry.eventType === 'user_message' ||
                  entry.eventType === 'ai_response',
              )
              .map((entry) => ({
                role:
                  entry.eventType === 'user_message'
                    ? ('user' as const)
                    : ('assistant' as const),
                content: entry.content,
              }));

            const cefrLevel = stepPrevious?.currentLevel ?? null;

            const extractedVocabulary = await extractVocabularyFromTranscript(
              transcript,
              subject.languageCode,
              cefrLevel,
            );

            if (extractedVocabulary.length === 0) {
              stepNext = stepPrevious;
              return;
            }

            const quality = Math.max(
              0,
              Math.min(5, completionQualityRating ?? 3),
            );
            await upsertExtractedVocabulary(
              db,
              profileId,
              subjectId,
              extractedVocabulary.map((item) => {
                // Prefer LLM-assigned level; fall back to milestone's current level.
                // Validate both through cefrLevelSchema to ensure type safety.
                const rawLevel = item.cefrLevel ?? cefrLevel ?? undefined;
                const parsedLevel = cefrLevelSchema.safeParse(rawLevel);
                return {
                  ...item,
                  cefrLevel: parsedLevel.success ? parsedLevel.data : undefined,
                  milestoneId:
                    stepPrevious?.currentMilestone?.milestoneId ?? undefined,
                  quality,
                };
              }),
            );

            stepNext = await getCurrentLanguageProgress(
              db,
              profileId,
              subjectId,
            );
          },
        );

        return {
          ...isolated,
          previousLanguageProgress: stepPrevious,
          nextLanguageProgress: stepNext,
        };
      },
    )) as unknown as VocabularyRetentionStepResult;
    outcomes.push(vocabularyOutcome);

    const previousLanguageProgress = vocabularyOutcome.previousLanguageProgress;
    const nextLanguageProgress = vocabularyOutcome.nextLanguageProgress;

    // Step 1c: Update needs-deepening progress (FR63)
    outcomes.push(
      await step.run('update-needs-deepening', async () => {
        if (retentionTopicIds.length === 0)
          return { step: 'update-needs-deepening', status: 'skipped' as const };
        if (completionQualityRating == null) {
          return { step: 'update-needs-deepening', status: 'skipped' as const };
        }
        return runIsolated('update-needs-deepening', profileId, async () => {
          const db = getStepDatabase();
          // [L7-F7] Parallelize per-topic needs-deepening updates.
          await Promise.all(
            retentionTopicIds.map((tid) =>
              updateNeedsDeepeningProgress(
                db,
                profileId,
                tid,
                completionQualityRating,
              ),
            ),
          );
        });
      }),
    );

    outcomes.push(
      await step.run('check-milestone-completion', async () =>
        runIsolated('check-milestone-completion', profileId, async () => {
          const db = getStepDatabase();
          const previousMilestoneId =
            previousLanguageProgress?.currentMilestone?.milestoneId;
          const nextMilestoneId =
            nextLanguageProgress?.currentMilestone?.milestoneId;

          if (
            !previousMilestoneId ||
            !nextLanguageProgress ||
            previousMilestoneId === nextMilestoneId
          ) {
            return;
          }

          await queueCelebration(
            db,
            profileId,
            'comet',
            'topic_mastered',
            previousLanguageProgress?.currentMilestone?.milestoneTitle ??
              previousMilestoneId,
          );
        }),
      ),
    );

    // Step 2: Write coaching card / session summary
    // Runs before analyze-learner-profile so the next session's home screen
    // opens with a fresh coaching card even if LLM profile analysis is slow.
    // [EP15-C3 RESOLVED]: Plan F-1 mandated memory → snapshot → cards, but
    // computeProgressMetrics never reads learning_profiles — the pipelines
    // are independent. Latency-first order confirmed correct; plan AD6 amended.
    outcomes.push(
      await step.run('write-coaching-card', async () =>
        runIsolated('write-coaching-card', profileId, async () => {
          const db = getStepDatabase();
          // [EP15-I6] Schema guard removed — migration 0020 makes the table
          // unconditionally present in all environments. Tests must seed the
          // real schema rather than relying on `db.query` shape checks.
          //
          // [EP15-C4 AR-13] Pass sessionEndedAt so refreshProgressSnapshot
          // can debounce: if two completions for the same profile land in
          // the same minute, the second one sees the first's snapshot was
          // already updated after the session ended and returns it cached.
          await refreshProgressSnapshot(db, profileId, {
            sessionEndedAt: timestamp ? new Date(timestamp) : new Date(),
            identityV2Enabled: isIdentityV2EnabledInStep(),
          });
          await createPendingSessionSummary(
            db,
            sessionId,
            profileId,
            topicId ?? null,
            summaryStatus ?? 'pending',
          );

          // Precompute coaching card and write to cache (ARCH-11)
          // [CUT-B1 §2.5(iii)] v2 seam threaded via the step flag.
          const card = await precomputeCoachingCard(db, profileId, {
            identityV2Enabled: isIdentityV2EnabledInStep(),
          });
          await writeCoachingCardCache(db, profileId, card);
        }),
      ),
    );

    // Step 2b: Generate parent-facing session recap fields [PEH-S2]
    outcomes.push(
      await step.run('generate-session-insights', async () =>
        runIsolated('generate-session-insights', profileId, async () => {
          const db = getStepDatabase();

          // Find the session_summaries row created by write-coaching-card
          const [summaryRow] = await db
            .select({ id: sessionSummaries.id })
            .from(sessionSummaries)
            .where(
              and(
                eq(sessionSummaries.sessionId, sessionId),
                eq(sessionSummaries.profileId, profileId),
              ),
            )
            .limit(1);

          if (!summaryRow) {
            // [logging sweep] structured logger so PII fields land as JSON context
            logger.warn(
              '[session-completed] generate-session-insights: no session_summaries row — recap skipped',
              {
                sessionId,
                profileId,
              },
            );
            return;
          }

          let highlight: string | null = null;
          let narrative: string | null = null;
          let conversationPrompt: string | null = null;
          let engagementSignal: string | null = null;

          if ((exchangeCount ?? 0) >= 3) {
            const transcriptEvents = await db.query.sessionEvents.findMany({
              where: and(
                eq(sessionEvents.sessionId, sessionId),
                eq(sessionEvents.profileId, profileId),
                inArray(sessionEvents.eventType, [
                  'user_message',
                  'ai_response',
                ]),
              ),
              // [BUG-913 sweep] Tie-break by id when created_at collides — see
              // session-crud.ts getSessionTranscript for the full rationale.
              orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
              columns: { eventType: true, content: true },
            });

            // [PROMPT-INJECT][WI-122 / DS-033] Strip envelope JSON from
            // assistant turns via projectAiResponseContent. The transcript-
            // boundary fencing (HTML-entity encode every angle bracket and
            // ampersand so a learner turn cannot escape the surrounding
            // <transcript> tag) is owned by buildSessionInsightsUserPrompt
            // in services/session-highlights.ts — keep the per-turn escape
            // out of this assembly path so the same protection applies
            // regardless of caller.
            //
            // INVARIANT: transcriptText must flow only to
            // generateSessionInsights, which routes through
            // buildSessionInsightsUserPrompt and applies escapeXml to the
            // whole transcript inside the <transcript> data block. If a
            // second consumer of transcriptText is ever added here, either
            // route it through the same fencing helper or reinstate the
            // per-turn escapeXml — bare transcript text is not safe for any
            // sink that interpolates it into an XML data block.
            const transcriptText = transcriptEvents
              .map((e) => {
                const content =
                  e.eventType === 'ai_response'
                    ? projectAiResponseContent(e.content, { silent: true })
                    : e.content;
                return `${
                  e.eventType === 'user_message' ? 'Student' : 'Mentor'
                }: ${content}`;
              })
              .join('\n\n');

            // [BUG-734] Pass ageBracket so router can apply age-appropriate
            // safety preamble. Falls back to undefined if birthYear is missing
            // (router applies minor-safe default).
            // i18n Phase 1 — pull conversation_language so the parent-facing
            // insights render in the learner's selected language.
            // [CUT-B1 §2.5(iii)] v2 seam: birthYear + conversation_language from person.
            let profileForBracket:
              | { birthYear: number; conversationLanguage: string | null }
              | undefined;
            if (isIdentityV2EnabledInStep()) {
              const ctx = await getPersonLlmContext(db, profileId);
              profileForBracket = ctx
                ? {
                    birthYear: ctx.birthYear,
                    conversationLanguage: ctx.conversationLanguage,
                  }
                : undefined;
            } else {
              const [row] = await db
                .select({
                  birthYear: profiles.birthYear,
                  conversationLanguage: profiles.conversationLanguage,
                })
                .from(profiles)
                .where(eq(profiles.id, profileId))
                .limit(1);
              profileForBracket = row;
            }
            const ageBracket =
              profileForBracket?.birthYear != null
                ? computeAgeBracket(profileForBracket.birthYear)
                : undefined;

            const result = await generateSessionInsights(transcriptText, {
              ageBracket,
              // DB returns string | null; parse to union before passing to LLM.
              conversationLanguage: parseConversationLanguage(
                profileForBracket?.conversationLanguage,
              ),
            });

            if (result.valid) {
              highlight = result.insights.highlight;
              narrative = result.insights.narrative;
              conversationPrompt = result.insights.conversationPrompt;
              engagementSignal = result.insights.engagementSignal;
            } else {
              // [logging sweep] structured logger so PII fields land as JSON context
              logger.warn(
                '[session-completed] generate-session-insights: LLM validation failed — falling back to template highlight',
                {
                  sessionId,
                  profileId,
                  reason: result.reason,
                },
              );
              // [SWEEP-SILENT-RECOVERY] LLM drift signal — must be queryable.
              // Without Sentry we can't see how often the insights LLM is
              // returning unparseable output and parents are silently getting
              // template highlights instead of personalised recaps.
              sentry.captureException(
                new Error(
                  `session-completed: generate-session-insights validation failed: ${result.reason}`,
                ),
                {
                  profileId,
                  extra: {
                    sessionId,
                    surface: 'generate-session-insights',
                    reason: result.reason,
                  },
                },
              );
            }
          }

          if (!highlight) {
            // [WI-586] v2 path: read displayName from person (profiles dropped).
            const displayName = isIdentityV2EnabledInStep()
              ? ((
                  await db.query.person.findFirst({
                    where: eq(person.id, profileId),
                    columns: { displayName: true },
                  })
                )?.displayName ?? null)
              : ((
                  await db
                    .select({ displayName: profiles.displayName })
                    .from(profiles)
                    .where(eq(profiles.id, profileId))
                    .limit(1)
                )[0]?.displayName ?? null);
            const profile = { displayName };
            const topicTitle = topicId
              ? await loadTopicTitle(db, topicId, profileId)
              : null;
            // [BUG-526 / BUG-878] Pass the shared freeform sentinel so the
            // highlight builder renders friendly "had a learning session"
            // copy instead of the awkward "studied a freeform session".
            const topics = topicTitle
              ? [topicTitle]
              : [FREEFORM_TOPIC_SENTINEL];

            // Resolve subject name for context in the highlight
            const [subjectRow] = subjectId
              ? await db
                  .select({ name: subjects.name })
                  .from(subjects)
                  .where(
                    and(
                      eq(subjects.id, subjectId),
                      eq(subjects.profileId, profileId),
                    ),
                  )
                  .limit(1)
              : [null];

            const [session] = await db
              .select({
                wallClockSeconds: learningSessions.wallClockSeconds,
                durationSeconds: learningSessions.durationSeconds,
              })
              .from(learningSessions)
              .where(
                and(
                  eq(learningSessions.id, sessionId),
                  eq(learningSessions.profileId, profileId),
                ),
              )
              .limit(1);
            const duration =
              session?.wallClockSeconds ?? session?.durationSeconds ?? 60;

            highlight = buildBrowseHighlight(
              profile?.displayName ?? 'Your child',
              topics,
              duration,
              subjectRow?.name,
            );
          }

          // Write the highlight to session_summaries
          await db
            .update(sessionSummaries)
            .set({
              highlight,
              narrative,
              conversationPrompt,
              engagementSignal,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(sessionSummaries.id, summaryRow.id),
                eq(sessionSummaries.profileId, profileId),
              ),
            );
        }),
      ),
    );

    outcomes.push(
      await step.run('generate-learner-recap', async () =>
        runIsolated('generate-learner-recap', profileId, async () => {
          const db = getStepDatabase();

          const [summaryRow] = await db
            .select({ id: sessionSummaries.id })
            .from(sessionSummaries)
            .where(
              and(
                eq(sessionSummaries.sessionId, sessionId),
                eq(sessionSummaries.profileId, profileId),
              ),
            )
            .limit(1);

          if (!summaryRow || !subjectId) {
            return;
          }

          // [WI-586] v2 path: read birthYear + conversationLanguage from person.
          const profile = isIdentityV2EnabledInStep()
            ? await getPersonLlmContext(db, profileId)
            : await db
                .select({
                  birthYear: profiles.birthYear,
                  conversationLanguage: profiles.conversationLanguage,
                })
                .from(profiles)
                .where(eq(profiles.id, profileId))
                .limit(1)
                .then((rows) => rows[0] ?? null);

          if (!profile) {
            throw new Error(
              `[session-completed] Profile not found for profileId=${profileId} — aborting`,
            );
          }

          const recap = await generateLearnerRecap(db, {
            sessionId,
            profileId,
            topicId: topicId ?? null,
            subjectId,
            exchangeCount: exchangeCount ?? 0,
            birthYear: profile.birthYear,
            // i18n Phase 1 — thread the learner's UI locale into the recap LLM.
            // DB returns string | null; parse to union before passing forward.
            conversationLanguage: parseConversationLanguage(
              profile?.conversationLanguage,
            ),
          });

          if (!recap) {
            return;
          }

          await db
            .update(sessionSummaries)
            .set({
              closingLine: recap.closingLine,
              learnerRecap: recap.learnerRecap,
              nextTopicId: recap.nextTopicId,
              nextTopicReason: recap.nextTopicReason,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(sessionSummaries.id, summaryRow.id),
                eq(sessionSummaries.profileId, profileId),
              ),
            );
        }),
      ),
    );

    // Capture summary outcome from the work step; emit observability events
    // OUTSIDE the step.run so retries don't duplicate them (Inngest memoises
    // the run's return value but does not suppress inner step.sendEvent).
    type LlmSummaryStepResult =
      | { kind: 'no-summary-row' }
      | { kind: 'no-summary-generated'; sessionSummaryId: string }
      | { kind: 'errored'; sessionSummaryId: string | null }
      | {
          kind: 'generated';
          sessionSummaryId: string;
          sessionState: string;
          topicsCount: number;
          narrativeLength: number;
        };
    const llmSummaryStep = await step.run(
      'generate-llm-summary',
      async (): Promise<{
        outcome: StepOutcome;
        summaryResult: LlmSummaryStepResult;
      }> => {
        let summaryRowId: string | null = null;
        try {
          const db = getStepDatabase();

          const summaryRow = await db.query.sessionSummaries.findFirst({
            where: and(
              eq(sessionSummaries.sessionId, sessionId),
              eq(sessionSummaries.profileId, profileId),
            ),
            columns: { id: true },
          });

          if (!summaryRow) {
            return {
              outcome: { step: 'generate-llm-summary', status: 'ok' },
              summaryResult: { kind: 'no-summary-row' },
            };
          }
          summaryRowId = summaryRow.id;

          // i18n Phase 1 — load conversation_language so the parent-facing
          // summary renders in the learner's selected language.
          // [WI-586] v2 path: read conversationLanguage from person (profiles dropped).
          const llmSummaryConversationLanguage = isIdentityV2EnabledInStep()
            ? ((
                await db.query.person.findFirst({
                  where: eq(person.id, profileId),
                  columns: { conversationLanguage: true },
                })
              )?.conversationLanguage ?? null)
            : ((
                await db
                  .select({
                    conversationLanguage: profiles.conversationLanguage,
                  })
                  .from(profiles)
                  .where(eq(profiles.id, profileId))
                  .limit(1)
              )[0]?.conversationLanguage ?? null);

          const summary = await generateAndStoreLlmSummary(db, {
            sessionId,
            profileId,
            summaryId: summaryRow.id,
            subjectId: subjectId ?? null,
            topicId: topicId ?? null,
            // DB returns string | null; parse to union before passing to LLM.
            conversationLanguage: parseConversationLanguage(
              llmSummaryConversationLanguage,
            ),
          });

          if (!summary) {
            return {
              outcome: { step: 'generate-llm-summary', status: 'ok' },
              summaryResult: {
                kind: 'no-summary-generated',
                sessionSummaryId: summaryRow.id,
              },
            };
          }

          return {
            outcome: { step: 'generate-llm-summary', status: 'ok' },
            summaryResult: {
              kind: 'generated',
              sessionSummaryId: summaryRow.id,
              sessionState: summary.sessionState,
              topicsCount: summary.topicsCovered.length,
              narrativeLength: summary.narrative.length,
            },
          };
        } catch (err) {
          sentry.captureException(err, {
            profileId,
            extra: {
              step: 'generate-llm-summary',
              surface: 'session-completed',
            },
          });
          logger.error('[session-completed] soft step failed', {
            step: 'generate-llm-summary',
            profileId,
            error: err instanceof Error ? err.message : String(err),
          });
          // Promote to `errored` so the failure event fires below — silent
          // recovery without escalation is banned by AGENTS.md.
          return {
            outcome: {
              step: 'generate-llm-summary',
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            },
            summaryResult: { kind: 'errored', sessionSummaryId: summaryRowId },
          };
        }
      },
    );
    outcomes.push(llmSummaryStep.outcome);

    if (
      llmSummaryStep.summaryResult.kind === 'no-summary-generated' ||
      llmSummaryStep.summaryResult.kind === 'errored'
    ) {
      await step.sendEvent('notify-session-summary-failed', {
        name: 'app/session.summary.failed',
        data: {
          profileId,
          sessionId,
          sessionSummaryId: llmSummaryStep.summaryResult.sessionSummaryId,
          timestamp: new Date().toISOString(),
        },
      });
    } else if (llmSummaryStep.summaryResult.kind === 'generated') {
      await step.sendEvent('notify-session-summary-generated', {
        name: 'app/session.summary.generated',
        data: {
          profileId,
          sessionId,
          sessionSummaryId: llmSummaryStep.summaryResult.sessionSummaryId,
          sessionState: llmSummaryStep.summaryResult.sessionState,
          topicsCount: llmSummaryStep.summaryResult.topicsCount,
          narrativeLength: llmSummaryStep.summaryResult.narrativeLength,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Step 3: Analyze learner transcript and update learning profile (Epic 16).
    // [EP15-M3]: runs AFTER write-coaching-card — profile analysis is background
    // enrichment and must not delay user-facing coaching card. EP15-C3 confirmed
    // this ordering is safe: snapshot pipeline never reads learning_profiles.
    //
    // Struggle notifications are SENT inside this step rather than returned:
    // a memoized step return is persisted in Inngest's third-party state
    // store, and the notifications carry the minor's struggle topics. The
    // step result holds shape-only counters (detected/sent/failed) so the
    // notify outcome still survives Inngest replay without round-tripping
    // topic strings through step state. Send failures are isolated per
    // notification (Sentry + counter) so a push hiccup never fails the
    // analysis itself.
    const analyzeOutcome = await step.run(
      'analyze-learner-profile',
      async () => {
        let struggleNotificationsDetected = 0;
        let struggleNotificationsSent = 0;
        let struggleNotificationsFailed = 0;
        const outcome = await runIsolated(
          'analyze-learner-profile',
          profileId,
          async () => {
            const db = getStepDatabase();
            const existingProfile = await getLearningProfile(db, profileId);

            if (!existingProfile) {
              return;
            }

            // Consent gate: memoryConsentStatus is NOT NULL (defaults to
            // 'pending') for all rows after migration 0019, so the consent
            // check is authoritative. `memoryEnabled` governs injection only.
            if (
              existingProfile.memoryConsentStatus !== 'granted' ||
              existingProfile.memoryCollectionEnabled === false
            ) {
              return;
            }

            // [WI-221] GDPR regulatory-consent gate at the processing site,
            // BEFORE the transcript is sent to the LLM. revokeConsent sets GDPR
            // status to WITHDRAWN without clearing memoryConsentStatus, so the
            // memory gate above is insufficient: without this a withdrawn-but-
            // memory-granted profile's transcript would still be transmitted to
            // the external LLM provider (the regulated processing act under GDPR
            // Art. 7(3)) before applyAnalysis later blocks only the write.
            // [CUT-B1 §2.5(i)] v2 seam: GDPR gate via resolver.
            const gdprAllowed = isIdentityV2EnabledInStep()
              ? await isGdprProcessingAllowedV2(db, profileId)
              : await isGdprProcessingAllowed(db, profileId);
            if (!gdprAllowed) {
              return;
            }

            const transcriptEvents = await db.query.sessionEvents.findMany({
              where: and(
                eq(sessionEvents.sessionId, sessionId),
                eq(sessionEvents.profileId, profileId),
              ),
              // [BUG-913 sweep] Tie-break by id when created_at collides — see
              // session-crud.ts getSessionTranscript for the full rationale.
              orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
              columns: {
                eventType: true,
                content: true,
              },
            });

            // [L3-001] Scope subject lookup by profileId so a crafted/replayed
            // event with a foreign subjectId cannot leak another profile's
            // subject name into this profile's LLM context.
            const [subjectRow] = subjectId
              ? await db
                  .select({ name: subjects.name })
                  .from(subjects)
                  .where(
                    and(
                      eq(subjects.id, subjectId),
                      eq(subjects.profileId, profileId),
                    ),
                  )
                  .limit(1)
              : [null];

            const topicTitle = topicId
              ? await loadTopicTitle(db, topicId, profileId)
              : null;
            const sessionRow = await db.query.learningSessions.findFirst({
              where: and(
                eq(learningSessions.id, sessionId),
                eq(learningSessions.profileId, profileId),
              ),
              columns: { rawInput: true },
            });

            // [P0-3] Feed existing struggles + suppressed topics into the
            // analysis prompt so the LLM emits deltas (not duplicates) and
            // never re-surfaces topics the parent has hidden.
            const knownStruggles = Array.isArray(existingProfile.struggles)
              ? (existingProfile.struggles as Array<unknown>)
                  .filter(
                    (
                      entry,
                    ): entry is { topic: string; subject: string | null } =>
                      typeof entry === 'object' &&
                      entry !== null &&
                      typeof (entry as { topic?: unknown }).topic === 'string',
                  )
                  .map((entry) => ({
                    topic: entry.topic,
                    subject: entry.subject ?? null,
                  }))
              : [];
            const suppressedTopics = Array.isArray(
              existingProfile.suppressedInferences,
            )
              ? (existingProfile.suppressedInferences as unknown[]).filter(
                  (value): value is string => typeof value === 'string',
                )
              : [];

            const analysis = await analyzeSessionTranscript(
              transcriptEvents,
              subjectRow?.name ?? null,
              topicTitle,
              sessionRow?.rawInput,
              'session',
              { knownStruggles, suppressedTopics },
            );

            if (!analysis) {
              return;
            }

            const analysisResult = await applyAnalysis(
              db,
              profileId,
              analysis,
              subjectRow?.name ?? null,
              'inferred',
              subjectId,
              { identityV2Enabled: isIdentityV2EnabledInStep() },
            );

            // FR247.6 — struggle pushes to the parent, sent at the source so
            // the topic strings never enter memoized step state. Delivery is
            // effectively at-most-once per confidence transition: if the
            // process dies mid-step, the step re-runs applyAnalysis, whose
            // merge is idempotent — the before/after diff then detects no new
            // transition, so already-sent pushes are not re-sent (and
            // sendStruggleNotification's 24h per-type dedup backstops any
            // duplicate window).
            struggleNotificationsDetected = analysisResult.notifications.length;
            for (const notification of analysisResult.notifications) {
              try {
                await sendStruggleNotification(db, profileId, notification, {
                  identityV2Enabled: isIdentityV2EnabledInStep(),
                });
                struggleNotificationsSent += 1;
              } catch (err) {
                struggleNotificationsFailed += 1;
                sentry.captureException(err, {
                  profileId,
                  extra: {
                    step: 'notify-struggle',
                    surface: 'session-completed',
                  },
                });
                logger.error('[session-completed] soft step failed', {
                  step: 'notify-struggle',
                  profileId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          },
        );
        return {
          ...outcome,
          struggleNotifications: {
            detected: struggleNotificationsDetected,
            sent: struggleNotificationsSent,
            failed: struggleNotificationsFailed,
          },
        };
      },
    );
    outcomes.push(analyzeOutcome);

    // [L1-002] Soft step — best-effort embedding. The downstream dedup step
    // reads embeddedIds; on Voyage outage or transient embed failure we must
    // NOT let the exception propagate (Inngest would retry the whole step and
    // ultimately surface a failed function), since the rest of the pipeline
    // (dashboard, XP, retention) already succeeded. Mirror the no_voyage_key
    // sentinel on any failure so dedup sees an empty embeddedIds set and the
    // function continues.
    const embedNewFactsResult = await step.run(
      'embed-new-memory-facts',
      async () => {
        let apiKey: string | undefined;
        try {
          apiKey = getStepVoyageApiKey();
        } catch {
          logger.warn('[memory_facts] embed-on-write skipped', {
            event: 'memory_facts.embed_on_write.skipped',
            profileId,
            reason: 'no_voyage_key',
          });
          return {
            embedded: 0,
            failed: 0,
            scanned: 0,
            embeddedIds: [],
            failedIds: [],
            softFailure: false as const,
          };
        }

        const db = getStepDatabase();
        try {
          return {
            ...(await embedNewFactsForProfile(
              db,
              profileId,
              makeEmbedderFromEnv(apiKey),
              { limit: 50 },
            )),
            softFailure: false as const,
          };
        } catch (err) {
          sentry.captureException(err, {
            profileId,
            extra: {
              step: 'embed-new-memory-facts',
              surface: 'session-completed',
            },
          });
          logger.error('[session-completed] soft step failed', {
            step: 'embed-new-memory-facts',
            profileId,
            error: err instanceof Error ? err.message : String(err),
          });
          return {
            embedded: 0,
            failed: 0,
            scanned: 0,
            embeddedIds: [],
            failedIds: [],
            softFailure: true as const,
          };
        }
      },
    );
    outcomes.push({
      step: 'embed-new-memory-facts',
      status: embedNewFactsResult.softFailure ? 'failed' : 'ok',
    });

    const dedupResult = await step.run('dedup-new-facts', async () => {
      const dedupConfig = getStepMemoryFactsDedupConfig();
      if (
        !isMemoryFactsDedupEnabled(dedupConfig.enabled) ||
        !isProfileInDedupRollout(profileId, dedupConfig.rolloutPct)
      ) {
        return null;
      }

      const db = getStepDatabase();
      return runDedupForProfile({
        db,
        scoped: createScopedRepository(db, profileId),
        profileId,
        candidateIds: (embedNewFactsResult.embeddedIds as string[]).filter(
          Boolean,
        ),
        threshold: dedupConfig.threshold,
        cap: dedupConfig.maxLlmCalls,
      });
    });
    if (dedupResult) {
      outcomes.push({ step: 'dedup-new-facts', status: 'ok' });
      // [BUG-795] Dedup outcome tuples (skipped_no_embedding, suppressed_skip,
      // capped_skip, failed, merged, cap_hit) are pure observability markers —
      // no Inngest handler consumes them. They were previously dispatched via
      // step.sendEvent with a *dynamically computed* name (`name: e.name`),
      // which (a) created orphan queue records nobody handled and (b) was
      // invisible to the orphan-dispatcher guard because the guard only sees
      // string-literal event names. Emit them as structured logs instead,
      // matching the cascade-delete `emit` -> logger.info convention
      // (services/learner-profile.ts:1451). The dedup pass already mirrors
      // every event into DedupPassReport counters, so the per-event log is the
      // observability surface, not a control signal.
      for (const event of dedupResult.events) {
        logger.info('[memory_facts] dedup outcome', {
          event: event.name,
          ...event.data,
        });
      }
    }

    // Step 3b: FR247.6 — struggle pushes were sent inside
    // analyze-learner-profile (see the minor-PII note there). Keep the
    // notify-struggle outcome entry so soft-failure dashboards retain the
    // per-step failure signal.
    const struggleNotifyCounts = analyzeOutcome.struggleNotifications;
    if (struggleNotifyCounts && struggleNotifyCounts.detected > 0) {
      outcomes.push({
        step: 'notify-struggle',
        status: struggleNotifyCounts.failed > 0 ? 'failed' : 'ok',
        ...(struggleNotifyCounts.failed > 0
          ? {
              error: `${struggleNotifyCounts.failed}/${struggleNotifyCounts.detected} struggle notifications failed to send`,
            }
          : {}),
      });
    }

    // Step 4: Update dashboard — streaks + XP
    // FR86: Only count toward Honest Streak when recall quality >= 3 (pass)
    // XP insertion still runs for any completed session.
    // [CR-119.1]: Return streak as part of the step result so it survives
    // Inngest replay — same memoization pattern as stepNotifications above.
    const dashboardOutcome = (await step.run('update-dashboard', async () => {
      // [FIX-INNGEST-1] CRITICAL step — no try/catch, errors propagate to Inngest
      // for retry. Streak and XP are user-facing data; silent loss breaks
      // gamification and erodes user trust.
      let stepStreak: {
        currentStreak: number;
        longestStreak: number;
      } | null = null;
      const db = getStepDatabase();
      const today = timestamp
        ? new Date(timestamp).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      // Streak and XP are independent writes — no transaction needed.
      // The neon-http driver does not support multi-statement transactions;
      // wrapping these in db.transaction() would either fail outright or
      // fall back to non-atomic execution via the client.ts shim.
      //
      // Streak recording is decoupled from effectiveQuality (which gates
      // SM-2 retention updates).  Any session with user engagement
      // (exchangeCount > 0) should count toward the streak, UNLESS it
      // was an unattended close (e.g. silence_timeout from the stale-
      // cleanup cron where no learning occurred).
      const reason = event.data.reason as string | undefined;
      const isUnattended =
        reason != null &&
        (UNATTENDED_REASONS as readonly string[]).includes(reason);
      if (!isUnattended && (exchangeCount ?? 0) > 0) {
        stepStreak = await recordSessionActivity(db, profileId, today);
      }

      await insertSessionXpEntry(db, profileId, topicId ?? null, subjectId);
      // Note: no try/catch — errors propagate to Inngest for retry.
      return {
        step: 'update-dashboard',
        status: 'ok' as const,
        streak: stepStreak,
      } as DashboardStepResult;
    })) as unknown as DashboardStepResult;
    outcomes.push(dashboardOutcome);

    // Step 5: Generate and store session embedding
    outcomes.push(
      await step.run('generate-embeddings', async () =>
        runIsolated('generate-embeddings', profileId, async () => {
          const db = getStepDatabase();
          const voyageApiKey = getStepVoyageApiKey();
          const content = await extractSessionContent(db, sessionId, profileId);
          await storeSessionEmbedding(
            db,
            sessionId,
            profileId,
            topicId ?? null,
            content,
            voyageApiKey,
          );
        }),
      ),
    );

    // Step 6: Extract parent-facing homework summary (Story 14.12)
    outcomes.push(
      await step.run('extract-homework-summary', async () => {
        if (sessionType !== 'homework') {
          return {
            step: 'extract-homework-summary',
            status: 'skipped' as const,
          };
        }

        // [WI-734] Profile fetch is OUTSIDE runIsolated so a missing-profile
        // error escapes to step.run and Inngest retries the step — absorbing
        // transient replication lag. The quota gate + LLM call remain inside
        // runIsolated (soft-step): quota exhaustion and LLM failures record
        // status='failed' without triggering a step retry.
        const db = getStepDatabase();
        // i18n Phase 1 — thread conversation_language to the homework
        // summary LLM so the parent-facing card matches the learner locale.
        // Also fetch subscription anchor so we can gate this LLM call on quota.
        // [WI-784] v2 twin: under IDENTITY_V2_ENABLED read person +
        // membership (no profiles.accountId which was dropped 2026-06-14).
        // Legacy path (flag-off) is byte-identical.
        const identityV2 = isIdentityV2EnabledInStep();
        let homeworkProfile:
          | { conversationLanguage: string | null }
          | undefined;
        let homeworkOrganizationId: string | undefined;
        if (identityV2) {
          const [personRow] = await db
            .select({ conversationLanguage: person.conversationLanguage })
            .from(person)
            .where(eq(person.id, profileId))
            .limit(1);
          homeworkProfile = personRow;
          if (personRow) {
            // person → membership(org) resolution. No orderBy: this mirrors the
            // canonical v2 resolver `organizationOfPerson` in billing-v2/family-v2.ts
            // (and every other person→org site in identity-v2/), which all rely on
            // the single-membership-per-person assumption the cutover seeds. The
            // membership_person_org_unique index only bars duplicate (person,org)
            // pairs, so if multi-org membership is ever introduced this — and the
            // shared resolver — must gain a deterministic orderBy together; pinning
            // only this site would diverge from the established pattern.
            const membershipRow = await db.query.membership.findFirst({
              where: eq(membership.personId, profileId),
              columns: { organizationId: true },
            });
            homeworkOrganizationId = membershipRow?.organizationId;
          }
        } else {
          const [profileRow] = await db
            .select({
              conversationLanguage: profiles.conversationLanguage,
              accountId: profiles.accountId,
            })
            .from(profiles)
            .where(eq(profiles.id, profileId))
            .limit(1);
          homeworkProfile = profileRow;
          homeworkOrganizationId = profileRow?.accountId ?? undefined;
        }

        // Route through the metered wrapper. The HTTP middleware
        // cannot gate Inngest steps, so we call decrementQuota directly.
        // ensureFreeSubscription / ensureFreeSubscriptionV2 are idempotent —
        // they return the existing row for users who already have a subscription.
        if (!homeworkProfile) {
          // Hard-stop: person/profile row required to resolve
          // subscription anchor + language. Throw reaches step.run so Inngest
          // retries (handles transient replication lag). captureException fires
          // here (not via runIsolated catch) so it is recorded on every retry
          // attempt. safeSend emits a structured event to satisfy the billing
          // silent-recovery ban (AGENTS.md: bare warn is not enough).
          const missingProfileErr = new Error(
            '[billing] homework-summary: person/profile row missing — cannot resolve subscription/language',
          );
          logger.warn(
            '[metering] homework-summary: profile row missing, step will retry',
            { event: 'metering.homework_summary.profile_missing', profileId },
          );
          sentry.captureException(missingProfileErr, { profileId });
          await safeSend(
            () =>
              inngest.send({
                // orphan-allow: observability-only signal (no handler needed);
                // consumed out-of-band by ops alerting. Paired with explicit
                // captureException (line above) and logger.warn to satisfy the
                // billing silent-recovery ban.
                name: 'app/billing.homework_summary.profile_missing',
                data: {
                  profileId,
                  occurredAt: new Date().toISOString(),
                  source: 'homework_summary',
                },
              }),
            'billing.homework_summary.profile_missing',
            { profileId },
          );
          throw missingProfileErr;
        }

        // [WI-784] Hard-stop: under IDENTITY_V2_ENABLED, organizationId comes
        // from membership.findFirst — if membership hasn't replicated yet, it is
        // undefined here. This guard is OUTSIDE runIsolated (same as the profile
        // check above) so a missing membership throws to step.run and Inngest
        // retries, absorbing transient replication lag instead of permanently
        // recording a 'failed' soft step. In the legacy path this cannot be
        // undefined (profiles.accountId is a required column).
        if (!homeworkOrganizationId) {
          const missingOrgErr = new Error(
            '[billing] homework-summary: organization/account id missing — membership not yet replicated',
          );
          logger.warn(
            '[metering] homework-summary: organizationId missing, step will retry',
            {
              event: 'metering.homework_summary.org_missing',
              profileId,
              identityV2,
            },
          );
          sentry.captureException(missingOrgErr, { profileId });
          throw missingOrgErr;
        }

        // [WI-784] v2 twin: ensureFreeSubscriptionV2 reads the v2
        // `subscription` table keyed by organizationId; legacy path reads
        // `subscriptions` via accountId. decrementQuota / safeRefundQuota
        // already accept identityV2 to select the v2 ownership cross-check.
        const subscription = identityV2
          ? await ensureFreeSubscriptionV2(db, homeworkOrganizationId)
          : await ensureFreeSubscription(db, homeworkOrganizationId);
        const decrementResult = await decrementQuota(
          db,
          subscription.id,
          profileId,
          identityV2,
        );
        if (!decrementResult.success) {
          // [C7] profile_mismatch is a data-integrity anomaly (the profileId
          // is not in this subscription's account), NOT a quota event.
          // Emitting it as 'monthly_exceeded' would fire a spurious "child
          // hit monthly cap" parent notification. Escalate separately and skip
          // the quota-exhausted notification path.
          if (decrementResult.source === 'profile_mismatch') {
            logger.warn(
              '[metering] homework-summary: profile_mismatch on decrementQuota — skipping LLM, escalating',
              {
                event: 'metering.homework_summary.profile_mismatch',
                subscriptionId: subscription.id,
                profileId,
              },
            );
            await safeSend(
              () =>
                inngest.send({
                  // orphan-allow: data-integrity signal, consumed by ops alerting.
                  name: 'app/billing.homework_summary.profile_mismatch',
                  data: {
                    subscriptionId: subscription.id,
                    profileId,
                    occurredAt: new Date().toISOString(),
                  },
                }),
              'billing.homework_summary.profile_mismatch',
              { subscriptionId: subscription.id, profileId },
            );
            return { step: 'extract-homework-summary', status: 'ok' as const };
          }

          // [S7] Quota exhausted — skip the LLM call and emit a structured
          // event so the silent-recovery ban is satisfied (bare logger.warn
          // is not enough per AGENTS.md). The metering module emits this for
          // per-profile tiers; the shared-pool path does not set resetsAt, so
          // we derive it from the subscription's cycleResetAt here.
          const quotaPool = await getQuotaPool(db, subscription.id);
          const resetsAt =
            decrementResult.resetsAt ??
            (decrementResult.source === 'daily_exceeded'
              ? new Date(
                  Date.UTC(
                    new Date().getUTCFullYear(),
                    new Date().getUTCMonth(),
                    new Date().getUTCDate() + 1,
                    1,
                    0,
                    0,
                    0,
                  ),
                ).toISOString()
              : (quotaPool?.cycleResetAt ?? new Date().toISOString()));
          await safeSend(
            () =>
              inngest.send({
                name: 'app/billing.profile_quota.exhausted',
                data: {
                  subscriptionId: subscription.id,
                  profileId,
                  kind:
                    decrementResult.source === 'daily_exceeded'
                      ? 'daily_exceeded'
                      : 'monthly_exceeded',
                  resetsAt,
                  occurredAt: new Date().toISOString(),
                  source: 'homework_summary',
                },
              }),
            'billing.homework_summary.quota_exhausted',
            // [S7] Include resetsAt in the observable data so tests (and log
            // correlators) can assert the value without invoking the closure.
            { subscriptionId: subscription.id, profileId, resetsAt },
          );
          logger.warn('[metering] homework-summary skipped — quota exhausted', {
            event: 'metering.homework_summary.quota_exhausted',
            subscriptionId: subscription.id,
            profileId,
            source: decrementResult.source,
          });
          return { step: 'extract-homework-summary', status: 'ok' as const };
        }

        return runIsolated('extract-homework-summary', profileId, async () => {
          try {
            await extractAndStoreHomeworkSummary(db, profileId, sessionId, {
              // DB returns string | null; parse to union before passing to LLM.
              conversationLanguage: parseConversationLanguage(
                homeworkProfile?.conversationLanguage,
              ),
            });
          } catch (err) {
            // LLM call failed after quota was decremented — refund so
            // the learner is not charged for a failed summary generation.
            await safeRefundQuota(db, subscription.id, {
              route: 'inngest.session_completed.homework_summary',
              profileId,
              source:
                decrementResult.source === 'monthly' ||
                decrementResult.source === 'top_up'
                  ? decrementResult.source
                  : undefined,
              quotaModel: decrementResult.quotaModel,
              topUpCreditId: decrementResult.topUpCreditId,
              identityV2,
            });
            throw err;
          }
        });
      }),
    );

    outcomes.push(
      await step.run('update-pace-baseline', async () =>
        runIsolated('update-pace-baseline', profileId, async () => {
          const db = getStepDatabase();
          const sessionMedianSeconds =
            await computeSessionMedianResponseSeconds();
          if (sessionMedianSeconds == null) return;
          await updateMedianResponseSeconds(
            db,
            profileId,
            sessionMedianSeconds,
          );
        }),
      ),
    );

    outcomes.push(
      await step.run('queue-celebrations', async () =>
        runIsolated('queue-celebrations', profileId, async () => {
          const db = getStepDatabase();
          const quality = completionQualityRating;
          const currentTopicId = topicId as string | null | undefined;
          // C-05: Zod runtime validation for verification type
          const vParsed = verificationTypeSchema.safeParse(verificationType);
          const currentVerification = vParsed.success
            ? vParsed.data
            : undefined;

          if (currentVerification === 'evaluate' && (quality ?? 0) >= 4) {
            await queueCelebration(
              db,
              profileId,
              'twin_stars',
              'evaluate_success',
            );
          }

          if (currentVerification === 'teach_back' && (quality ?? 0) >= 4) {
            await queueCelebration(
              db,
              profileId,
              'twin_stars',
              'teach_back_success',
            );
          }

          if (currentTopicId && (quality ?? 0) >= 4) {
            const [retentionCard] = await db
              .select({ repetitions: retentionCards.repetitions })
              .from(retentionCards)
              .where(
                and(
                  eq(retentionCards.profileId, profileId),
                  eq(retentionCards.topicId, currentTopicId),
                ),
              )
              .limit(1);

            if ((retentionCard?.repetitions ?? 0) > 2) {
              const topicTitle = await loadTopicTitle(
                db,
                currentTopicId,
                profileId,
              );
              await queueCelebration(
                db,
                profileId,
                'comet',
                'topic_mastered',
                topicTitle ?? currentTopicId,
              );
            }
          }

          // [CR-119.1]: Read streak from the step result (not a closure
          // variable) so the value survives Inngest replay memoization.
          const currentStreak = dashboardOutcome.streak?.currentStreak ?? 0;

          if (currentStreak === 7) {
            await queueCelebration(db, profileId, 'comet', 'streak_7');
          }

          if (currentStreak === 30) {
            await queueCelebration(db, profileId, 'orions_belt', 'streak_30');
          }
        }),
      ),
    );

    const failed = outcomes.filter((o) => o.status === 'failed');

    // [FIX-INNGEST-1] Emit a queryable observability event when any soft step
    // failed so dashboards / alerts can detect systematic enrichment degradation
    // without polling Sentry. A spike in this event rate signals upstream issues
    // (Voyage AI down, LLM service errors, DB overload) before user complaints.
    if (failed.length > 0) {
      await step.sendEvent('session-completed-with-errors', {
        name: 'app/session.completed_with_errors',
        data: {
          sessionId,
          profileId,
          failedSteps: failed.map((o) => ({
            step: o.step,
            error: o.error ?? null,
          })),
          timestamp: new Date().toISOString(),
        },
      });
    }

    return {
      status: failed.length > 0 ? 'completed-with-errors' : 'completed',
      sessionId,
      outcomes,
    };
  },
);
