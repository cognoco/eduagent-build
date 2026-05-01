import { inngest } from '../client';
import { getStepDatabase, getStepVoyageApiKey } from '../helpers';
import {
  updateRetentionFromSession,
  updateNeedsDeepeningProgress,
} from '../../services/retention-data';
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
import {
  incrementSummarySkips,
  resetSummarySkips,
  updateMedianResponseSeconds,
} from '../../services/settings';
import {
  processEvaluateCompletion,
  processTeachBackCompletion,
} from '../../services/verification-completion';
import { captureException } from '../../services/sentry';
import { createLogger } from '../../services/logger';
import { queueCelebration } from '../../services/celebrations';
import {
  buildBrowseHighlight,
  FREEFORM_TOPIC_SENTINEL,
  generateSessionInsights,
} from '../../services/session-highlights';
import { generateLearnerRecap } from '../../services/session-recap';
import {
  curriculumTopics,
  learningSessions,
  profiles,
  retentionCards,
  sessionEvents,
  sessionSummaries,
  subjects,
} from '@eduagent/database';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { cefrLevelSchema, verificationTypeSchema } from '@eduagent/schemas';
import {
  analyzeSessionTranscript,
  applyAnalysis,
  getLearningProfile,
  type StruggleNotification,
} from '../../services/learner-profile';
import { sendStruggleNotification } from '../../services/notifications';

const logger = createLogger();

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
  fn: () => Promise<number | undefined | void>
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
    captureException(err, {
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
  fn: () => Promise<void>
): Promise<StepOutcome> {
  await fn(); // throws on error — Inngest retries the whole step.run
  return { step: name, status: 'ok' };
}

export const sessionCompleted = inngest.createFunction(
  { id: 'session-completed', name: 'Process session completion' },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
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
    if ((sessionType === 'homework' || !topicId) && !isAbandoned) {
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
          'session-completed: filing waitForEvent timed out after 60s'
        );
        captureException(timeoutErr, { profileId });
        // [logging sweep] structured logger so PII fields land as JSON context
        logger.warn(
          '[session-completed] filing waitForEvent timed out — proceeding with stale topic placement',
          {
            sessionId,
            profileId,
            sessionType: sessionType ?? 'unknown',
          }
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
          where: eq(learningSessions.id, sessionId),
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
    let previousLanguageProgress: Awaited<
      ReturnType<typeof getCurrentLanguageProgress>
    > | null = null;
    let nextLanguageProgress: Awaited<
      ReturnType<typeof getCurrentLanguageProgress>
    > | null = null;

    const loadTopicTitle = async (
      db: ReturnType<typeof getStepDatabase>,
      currentTopicId: string | null | undefined
    ): Promise<string | null> => {
      if (!currentTopicId) return null;
      const [topic] = await db
        .select({ title: curriculumTopics.title })
        .from(curriculumTopics)
        .where(eq(curriculumTopics.id, currentTopicId))
        .limit(1);
      return topic?.title ?? null;
    };

    const computeSessionMedianResponseSeconds = async () => {
      const db = getStepDatabase();
      const events = await db.query.sessionEvents.findMany({
        where: and(
          eq(sessionEvents.sessionId, sessionId),
          eq(sessionEvents.profileId, profileId)
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
            Math.round((event.createdAt.getTime() - lastAiAt.getTime()) / 1000)
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
          (id): id is string => typeof id === 'string'
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
            captureException(
              new Error(
                `session-completed: unknown verificationType ${String(
                  verificationType
                )}`
              ),
              {
                profileId,
                extra: {
                  sessionId,
                  verificationType: String(verificationType),
                },
              }
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
                topicId
              );
            } else {
              return processTeachBackCompletion(
                db,
                profileId,
                sessionId,
                topicId
              );
            }
          }
        );
      }
    );
    outcomes.push(verificationCompletionOutcome);

    const derivedQualityRating =
      typeof verificationCompletionOutcome.qualityRating === 'number'
        ? verificationCompletionOutcome.qualityRating
        : undefined;
    const completionQualityRating =
      derivedQualityRating ?? (event.data.qualityRating as number | undefined);

    // F-8/F-9: For relearn sessions closed without a summary, SM-2 was
    // silently skipped, leaving reset cards stuck at intervalDays=1 forever.
    // Apply a conservative fallback quality=3 ("correct with difficulty") when
    // no explicit rating is available, UNLESS the session ended without any
    // user action (e.g. stale-cleanup cron). In that case no learning occurred
    // and we should not advance the card.
    //
    // Verified close reasons via grep (apps/api/src/services/session/session-crud.ts:390,
    // apps/mobile/src/app/(app)/session/use-session-actions.ts:349):
    //   'silence_timeout' — stale-cleanup cron (30 min idle, no user action)
    //   'user_ended'      — user explicitly ended the session
    let effectiveQuality = completionQualityRating;
    if (effectiveQuality == null) {
      const closeReason = event.data.reason as string | undefined;
      if (
        closeReason &&
        (UNATTENDED_REASONS as readonly string[]).includes(closeReason)
      ) {
        // No quality signal — session ended without user action, skip SM-2.
      } else if (retentionTopicIds.length > 0 && (exchangeCount ?? 0) > 0) {
        // User-closed session with at least one exchange but no summary
        // (e.g., skipped or crash). Use conservative quality=3 to advance
        // relearn cards out of reset. Zero-exchange sessions have no learning
        // signal — skip SM-2 entirely.
        effectiveQuality = 3;
      }
    }

    // Step 1b: Update retention data via SM-2
    // Conservative: skip retention update when no quality rating was provided,
    // rather than defaulting to 3 (which inflates metrics). Issue #19.
    // F-8/F-9: effectiveQuality applies a fallback=3 for user-closed sessions
    // without a summary so relearn cards are not stuck at intervalDays=1.
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
            }
          );
          return { step: 'update-retention', status: 'skipped' as const };
        }
        return runCritical('update-retention', async () => {
          const db = getStepDatabase();
          for (const tid of retentionTopicIds) {
            await updateRetentionFromSession(
              db,
              profileId,
              tid,
              effectiveQuality,
              timestamp
            );
          }
        });
      })
    );

    outcomes.push(
      await step.run('update-vocabulary-retention', async () => {
        if (!subjectId) {
          return {
            step: 'update-vocabulary-retention',
            status: 'skipped' as const,
          };
        }

        return runIsolated(
          'update-vocabulary-retention',
          profileId,
          async () => {
            const db = getStepDatabase();
            const subject = await db.query.subjects.findFirst({
              where: eq(subjects.id, subjectId),
            });
            if (
              !subject ||
              subject.pedagogyMode !== 'four_strands' ||
              !subject.languageCode
            ) {
              return;
            }

            previousLanguageProgress = await getCurrentLanguageProgress(
              db,
              profileId,
              subjectId
            );

            const events = await db.query.sessionEvents.findMany({
              where: and(
                eq(sessionEvents.sessionId, sessionId),
                eq(sessionEvents.profileId, profileId)
              ),
              // [BUG-913 sweep] Tie-break by id when created_at collides — see
              // session-crud.ts getSessionTranscript for the full rationale.
              orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
            });

            const transcript = events
              .filter(
                (entry) =>
                  entry.eventType === 'user_message' ||
                  entry.eventType === 'ai_response'
              )
              .map((entry) => ({
                role:
                  entry.eventType === 'user_message'
                    ? ('user' as const)
                    : ('assistant' as const),
                content: entry.content,
              }));

            const cefrLevel = previousLanguageProgress?.currentLevel ?? null;

            const extractedVocabulary = await extractVocabularyFromTranscript(
              transcript,
              subject.languageCode,
              cefrLevel
            );

            if (extractedVocabulary.length === 0) {
              nextLanguageProgress = previousLanguageProgress;
              return;
            }

            const quality = Math.max(
              0,
              Math.min(5, completionQualityRating ?? 3)
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
                    previousLanguageProgress?.currentMilestone?.milestoneId ??
                    undefined,
                  quality,
                };
              })
            );

            nextLanguageProgress = await getCurrentLanguageProgress(
              db,
              profileId,
              subjectId
            );
          }
        );
      })
    );

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
          for (const tid of retentionTopicIds) {
            await updateNeedsDeepeningProgress(
              db,
              profileId,
              tid,
              completionQualityRating
            );
          }
        });
      })
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
              previousMilestoneId
          );
        })
      )
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
          });
          await createPendingSessionSummary(
            db,
            sessionId,
            profileId,
            topicId ?? null,
            summaryStatus ?? 'pending'
          );

          // Precompute coaching card and write to cache (ARCH-11)
          const card = await precomputeCoachingCard(db, profileId);
          await writeCoachingCardCache(db, profileId, card);
        })
      )
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
                eq(sessionSummaries.profileId, profileId)
              )
            )
            .limit(1);

          if (!summaryRow) {
            // [logging sweep] structured logger so PII fields land as JSON context
            logger.warn(
              '[session-completed] generate-session-insights: no session_summaries row — recap skipped',
              {
                sessionId,
                profileId,
              }
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
                ])
              ),
              // [BUG-913 sweep] Tie-break by id when created_at collides — see
              // session-crud.ts getSessionTranscript for the full rationale.
              orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
              columns: { eventType: true, content: true },
            });

            const transcriptText = transcriptEvents
              .map(
                (e) =>
                  `${e.eventType === 'user_message' ? 'Student' : 'Mentor'}: ${
                    e.content
                  }`
              )
              .join('\n\n');

            const result = await generateSessionInsights(transcriptText);

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
                }
              );
              // [SWEEP-SILENT-RECOVERY] LLM drift signal — must be queryable.
              // Without Sentry we can't see how often the insights LLM is
              // returning unparseable output and parents are silently getting
              // template highlights instead of personalised recaps.
              captureException(
                new Error(
                  `session-completed: generate-session-insights validation failed: ${result.reason}`
                ),
                {
                  profileId,
                  extra: {
                    sessionId,
                    surface: 'generate-session-insights',
                    reason: result.reason,
                  },
                }
              );
            }
          }

          if (!highlight) {
            const [profile] = await db
              .select({ displayName: profiles.displayName })
              .from(profiles)
              .where(eq(profiles.id, profileId))
              .limit(1);
            const topicTitle = topicId
              ? await loadTopicTitle(db, topicId)
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
                  .where(eq(subjects.id, subjectId))
                  .limit(1)
              : [null];

            const [session] = await db
              .select({
                wallClockSeconds: learningSessions.wallClockSeconds,
                durationSeconds: learningSessions.durationSeconds,
              })
              .from(learningSessions)
              .where(eq(learningSessions.id, sessionId))
              .limit(1);
            const duration =
              session?.wallClockSeconds ?? session?.durationSeconds ?? 60;

            highlight = buildBrowseHighlight(
              profile?.displayName ?? 'Your child',
              topics,
              duration,
              subjectRow?.name
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
            .where(eq(sessionSummaries.id, summaryRow.id));
        })
      )
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
                eq(sessionSummaries.profileId, profileId)
              )
            )
            .limit(1);

          if (!summaryRow || !subjectId) {
            return;
          }

          const [profile] = await db
            .select({ birthYear: profiles.birthYear })
            .from(profiles)
            .where(eq(profiles.id, profileId))
            .limit(1);

          const recap = await generateLearnerRecap(db, {
            sessionId,
            profileId,
            topicId: topicId ?? null,
            subjectId,
            exchangeCount: exchangeCount ?? 0,
            birthYear: profile?.birthYear ?? null,
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
            .where(eq(sessionSummaries.id, summaryRow.id));
        })
      )
    );

    // Step 3: Analyze learner transcript and update learning profile (Epic 16).
    // [EP15-M3]: runs AFTER write-coaching-card — profile analysis is background
    // enrichment and must not delay user-facing coaching card. EP15-C3 confirmed
    // this ordering is safe: snapshot pipeline never reads learning_profiles.
    // step.run memoizes its return value — on Inngest replay the callback is
    // NOT re-executed, so mutable closure variables would stay []. Returning
    // notifications as part of the step result ensures they survive replay.
    const analyzeOutcome = await step.run(
      'analyze-learner-profile',
      async () => {
        let stepNotifications: StruggleNotification[] = [];
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

            const transcriptEvents = await db.query.sessionEvents.findMany({
              where: and(
                eq(sessionEvents.sessionId, sessionId),
                eq(sessionEvents.profileId, profileId)
              ),
              // [BUG-913 sweep] Tie-break by id when created_at collides — see
              // session-crud.ts getSessionTranscript for the full rationale.
              orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
              columns: {
                eventType: true,
                content: true,
              },
            });

            const [subjectRow] = subjectId
              ? await db
                  .select({ name: subjects.name })
                  .from(subjects)
                  .where(eq(subjects.id, subjectId))
                  .limit(1)
              : [null];

            const topicTitle = topicId
              ? await loadTopicTitle(db, topicId)
              : null;
            const sessionRow = await db.query.learningSessions.findFirst({
              where: and(
                eq(learningSessions.id, sessionId),
                eq(learningSessions.profileId, profileId)
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
                      entry
                    ): entry is { topic: string; subject: string | null } =>
                      typeof entry === 'object' &&
                      entry !== null &&
                      typeof (entry as { topic?: unknown }).topic === 'string'
                  )
                  .map((entry) => ({
                    topic: entry.topic,
                    subject: entry.subject ?? null,
                  }))
              : [];
            const suppressedTopics = Array.isArray(
              existingProfile.suppressedInferences
            )
              ? (existingProfile.suppressedInferences as unknown[]).filter(
                  (value): value is string => typeof value === 'string'
                )
              : [];

            const analysis = await analyzeSessionTranscript(
              transcriptEvents,
              subjectRow?.name ?? null,
              topicTitle,
              sessionRow?.rawInput,
              'session',
              { knownStruggles, suppressedTopics }
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
              subjectId
            );

            stepNotifications = analysisResult.notifications;
          }
        );
        return { ...outcome, notifications: stepNotifications };
      }
    );
    outcomes.push(analyzeOutcome);

    // Step 3b: FR247.6 — Send struggle push notifications to parent
    const pendingStruggleNotifications = analyzeOutcome.notifications ?? [];
    if (pendingStruggleNotifications.length > 0) {
      const notifications = [...pendingStruggleNotifications];
      outcomes.push(
        await step.run('notify-struggle', async () =>
          runIsolated('notify-struggle', profileId, async () => {
            const db = getStepDatabase();
            for (const notification of notifications) {
              await sendStruggleNotification(db, profileId, notification);
            }
          })
        )
      );
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
            voyageApiKey
          );
        })
      )
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
        return runIsolated('extract-homework-summary', profileId, async () => {
          const db = getStepDatabase();
          await extractAndStoreHomeworkSummary(db, profileId, sessionId);
        });
      })
    );

    // Step 7: Track consecutive summary skips (FR94 — Casual Explorer prompt)
    outcomes.push(
      await step.run('track-summary-skips', async () =>
        runIsolated('track-summary-skips', profileId, async () => {
          if (event.data.summaryTrackingHandled) {
            return;
          }
          const db = getStepDatabase();
          if (summaryStatus === 'skipped') {
            await incrementSummarySkips(db, profileId);
          } else if (
            summaryStatus === 'submitted' ||
            summaryStatus === 'accepted'
          ) {
            await resetSummarySkips(db, profileId);
          }
        })
      )
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
            sessionMedianSeconds
          );
        })
      )
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
              'evaluate_success'
            );
          }

          if (currentVerification === 'teach_back' && (quality ?? 0) >= 4) {
            await queueCelebration(
              db,
              profileId,
              'twin_stars',
              'teach_back_success'
            );
          }

          if (currentTopicId && (quality ?? 0) >= 4) {
            const [retentionCard] = await db
              .select({ repetitions: retentionCards.repetitions })
              .from(retentionCards)
              .where(
                and(
                  eq(retentionCards.profileId, profileId),
                  eq(retentionCards.topicId, currentTopicId)
                )
              )
              .limit(1);

            if ((retentionCard?.repetitions ?? 0) > 2) {
              const topicTitle = await loadTopicTitle(db, currentTopicId);
              await queueCelebration(
                db,
                profileId,
                'comet',
                'topic_mastered',
                topicTitle ?? currentTopicId
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
        })
      )
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
  }
);
