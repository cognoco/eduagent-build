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
  buildBrowseHighlight,
  generateSessionInsights,
} from '../../services/session-highlights';
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

// [CR-119.1]: Extended step results that carry extra data through Inngest
// replay. Using explicit interfaces because Inngest's Jsonify<T> doesn't
// always preserve intersection types from spread returns.
interface DashboardStepResult extends StepOutcome {
  streak: { currentStreak: number; longestStreak: number } | null;
}

// Close reasons that indicate no user engagement — SM-2 fallback should not apply.
// The plan listed 'crash_recovery' and 'app_background' but these do not exist
// in the codebase as of 2026-04-16. Add them here if they are introduced.
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
    if (sessionType === 'homework' || !topicId) {
      await step.waitForEvent('wait-for-filing', {
        event: 'app/filing.completed',
        match: 'data.sessionId',
        timeout: '60s',
      });
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
            console.warn(
              `[session-completed] generate-session-insights: no session_summaries row for session=${sessionId}, profile=${profileId} — recap skipped`
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
              orderBy: asc(sessionEvents.createdAt),
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
              console.warn(
                `[session-completed] generate-session-insights: LLM validation failed (${result.reason}) for session=${sessionId}, falling back to template highlight`
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
            const topics = topicTitle ? [topicTitle] : ['a topic'];

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
              duration
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

            const analysis = await analyzeSessionTranscript(
              transcriptEvents,
              subjectRow?.name ?? null,
              topicTitle,
              sessionRow?.rawInput
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
      let stepStreak: {
        currentStreak: number;
        longestStreak: number;
      } | null = null;
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
          // [F-044] Use effectiveQuality (includes engagement fallback) instead
          // of raw completionQualityRating. Most session-close paths don't set
          // qualityRating in the event, so the raw value is null and the streak
          // was never updated. Any session with user engagement should count.
          if (effectiveQuality != null) {
            stepStreak = await recordSessionActivity(db, profileId, today);
          }

          await insertSessionXpEntry(db, profileId, topicId ?? null, subjectId);
        }
      );
      return { ...result, streak: stepStreak } as DashboardStepResult;
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
    return {
      status: failed.length > 0 ? 'completed-with-errors' : 'completed',
      sessionId,
      outcomes,
    };
  }
);
