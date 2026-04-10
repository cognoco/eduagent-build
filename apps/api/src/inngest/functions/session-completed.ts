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
import { queueCelebration } from '../../services/celebrations';
import {
  curriculumTopics,
  learningSessions,
  retentionCards,
  sessionEvents,
  subjects,
} from '@eduagent/database';
import { and, asc, eq } from 'drizzle-orm';
import { verificationTypeSchema } from '@eduagent/schemas';
import {
  analyzeSessionTranscript,
  applyAnalysis,
  getLearningProfile,
} from '../../services/learner-profile';

// ---------------------------------------------------------------------------
// Step error isolation — each step catches its own errors so that a failure
// in one step (e.g. Voyage AI down) never blocks the remaining steps.
// Errors are logged to Sentry and the step returns a degraded result.
// ---------------------------------------------------------------------------

interface StepOutcome {
  step: string;
  status: 'ok' | 'skipped' | 'failed';
  error?: string;
  qualityRating?: number;
}

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
    captureException(err, { profileId });
    console.error(`[session-completed] step "${name}" failed:`, err);
    return {
      step: name,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const sessionCompleted = inngest.createFunction(
  { id: 'session-completed', name: 'Process session completion' },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
    const {
      profileId,
      sessionId,
      topicId,
      subjectId,
      summaryStatus,
      timestamp,
      interleavedTopicIds,
      verificationType,
      sessionType,
    } = event.data;

    // AD6: Wait for filing to complete before progressing, so that the
    // progress snapshot captures topic placement from the filing step.
    // Freeform sessions (no topicId) and homework sessions trigger filing
    // as a separate async step; we give it up to 60 s to land.
    if (sessionType === 'homework' || !topicId) {
      await step.waitForEvent('wait-for-filing', {
        event: 'app/filing.completed',
        match: 'data.sessionId',
        timeout: '60s',
      });
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
        orderBy: asc(sessionEvents.createdAt),
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
      return sorted.length % 2 === 0
        ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
        : sorted[middle]!;
    };

    // FR92: Determine which topics need retention updates
    // Interleaved sessions update all practiced topics; others update the single topicId
    const retentionTopicIds: string[] = (
      interleavedTopicIds as string[] | undefined
    )?.length
      ? (interleavedTopicIds as string[])
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
            console.warn(
              `[session-completed] Unknown verificationType: ${String(
                verificationType
              )}`
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

    // Step 1b: Update retention data via SM-2
    // Conservative: skip retention update when no quality rating was provided,
    // rather than defaulting to 3 (which inflates metrics). Issue #19.
    outcomes.push(
      await step.run('update-retention', async () => {
        if (retentionTopicIds.length === 0)
          return { step: 'update-retention', status: 'skipped' as const };
        if (completionQualityRating == null) {
          console.warn(
            `[session-completed] No qualityRating for session ${sessionId} — skipping retention update`
          );
          return { step: 'update-retention', status: 'skipped' as const };
        }
        return runIsolated('update-retention', profileId, async () => {
          const db = getStepDatabase();
          for (const tid of retentionTopicIds) {
            await updateRetentionFromSession(
              db,
              profileId,
              tid,
              completionQualityRating,
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
              orderBy: asc(sessionEvents.createdAt),
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

            const extractedVocabulary = await extractVocabularyFromTranscript(
              transcript,
              subject.languageCode
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
              extractedVocabulary.map((item) => ({
                ...item,
                milestoneId:
                  previousLanguageProgress?.currentMilestone?.milestoneId ??
                  undefined,
                quality,
              }))
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
    outcomes.push(
      await step.run('write-coaching-card', async () =>
        runIsolated('write-coaching-card', profileId, async () => {
          const db = getStepDatabase();
          if ((db.query as Record<string, unknown>)?.['progressSnapshots']) {
            await refreshProgressSnapshot(db, profileId);
          }
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

    // Step 3: Analyze learner transcript and update learning profile (Epic 16).
    // Runs AFTER write-coaching-card per the plan — profile analysis is
    // background enrichment and should not delay user-facing coaching card.
    outcomes.push(
      await step.run('analyze-learner-profile', async () =>
        runIsolated('analyze-learner-profile', profileId, async () => {
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
            orderBy: asc(sessionEvents.createdAt),
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

          const topicTitle = topicId ? await loadTopicTitle(db, topicId) : null;
          const sessionRow = await db.query.learningSessions.findFirst({
            where: and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.profileId, profileId)
            ),
            columns: { rawInput: true },
          });

          const analysis = await analyzeSessionTranscript(
            transcriptEvents,
            subjectRow?.name ?? null,
            topicTitle,
            sessionRow?.rawInput
          );

          if (!analysis) {
            return;
          }

          await applyAnalysis(
            db,
            profileId,
            analysis,
            subjectRow?.name ?? null
          );
        })
      )
    );

    // Step 4: Update dashboard — streaks + XP
    // FR86: Only count toward Honest Streak when recall quality >= 3 (pass)
    // XP insertion still runs for any completed session.
    let updatedStreak: { currentStreak: number; longestStreak: number } | null =
      null;
    outcomes.push(
      await step.run('update-dashboard', async () => {
        const result = await runIsolated(
          'update-dashboard',
          profileId,
          async () => {
            const db = getStepDatabase();
            const today = timestamp
              ? new Date(timestamp).toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10);

            // Streak and XP are independent writes — no transaction needed.
            // The neon-http driver does not support multi-statement transactions;
            // wrapping these in db.transaction() would either fail outright or
            // fall back to non-atomic execution via the client.ts shim.
            if (
              completionQualityRating != null &&
              completionQualityRating >= 3
            ) {
              updatedStreak = await recordSessionActivity(db, profileId, today);
            }

            await insertSessionXpEntry(
              db,
              profileId,
              topicId ?? null,
              subjectId
            );
          }
        );
        return result;
      })
    );

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

          // Use the streak value from the update-dashboard step to avoid
          // a race condition where concurrent session-completed events
          // could read the same streak and queue duplicate celebrations.
          const currentStreak = updatedStreak?.currentStreak ?? 0;

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
    return {
      status: failed.length > 0 ? 'completed-with-errors' : 'completed',
      sessionId,
      outcomes,
    };
  }
);
