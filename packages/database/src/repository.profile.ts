import { and, asc, desc, eq, gt, isNotNull, or, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import { applyStreakDecay } from './streaks-rules';
import {
  subjects,
  retentionCards,
  xpLedger,
  streaks,
  teachingPreferences,
  curriculumAdaptations,
  notificationPreferences,
  learningModes,
  learningProfiles,
  vocabulary,
  vocabularyRetentionCards,
  dictationModeEnum,
  dictationResults,
  consentStates,
  celebrationEvents,
  mentorActivityLedger,
} from './schema/index';
import type { ScopedWhere } from './repository._shared';

/**
 * Profile-config / learner-data single-table namespaces of the profile-scoped
 * repository (extracted from repository.ts, WI-1089). Behavior unchanged.
 */
export function createProfileRepository(
  db: Database,
  profileId: string,
  scopedWhere: ScopedWhere,
) {
  return {
    subjects: {
      async findMany(extraWhere?: SQL) {
        return db.query.subjects.findMany({
          where: scopedWhere(subjects, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.subjects.findFirst({
          where: scopedWhere(subjects, extraWhere),
        });
      },
    },

    retentionCards: {
      async findMany(
        extraWhere?: SQL,
        options?: { limit?: number; orderBy?: 'nextReviewAtAsc' },
      ) {
        return db.query.retentionCards.findMany({
          where: scopedWhere(retentionCards, extraWhere),
          ...(options?.limit ? { limit: options.limit } : {}),
          ...(options?.orderBy === 'nextReviewAtAsc'
            ? { orderBy: asc(retentionCards.nextReviewAt) }
            : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.retentionCards.findFirst({
          where: scopedWhere(retentionCards, extraWhere),
        });
      },
      /**
       * Return topicIds where this profile has demonstrated retention
       * progress — either repetitions advanced past the seed value, or a
       * recall has been logged. Used by `resolveNextTopic` to skip topics
       * the learner already retains.
       *
       * Filters out fresh cards (`repetitions = 0` AND `last_reviewed_at
       * IS NULL`). `ensureRetentionCard` creates a row on first probe
       * extract or first recall attempt, so the bare existence of a row
       * means "encountered", not "retained". Counting encountered topics
       * as completed locked learners out of suggestions for any topic
       * they had merely seen once.
       *
       * Ordering is unspecified; caller is responsible for dedup/Set usage.
       */
      async listCompletedTopicIds(): Promise<string[]> {
        const rows = await db
          .select({ topicId: retentionCards.topicId })
          .from(retentionCards)
          .where(
            and(
              eq(retentionCards.profileId, profileId),
              or(
                gt(retentionCards.repetitions, 0),
                isNotNull(retentionCards.lastReviewedAt),
              ),
            ),
          );
        return rows
          .map((row) => row.topicId)
          .filter((id): id is string => typeof id === 'string');
      },
    },

    xpLedger: {
      async findMany(extraWhere?: SQL) {
        return db.query.xpLedger.findMany({
          where: scopedWhere(xpLedger, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.xpLedger.findFirst({
          where: scopedWhere(xpLedger, extraWhere),
        });
      },
    },

    streaks: {
      async findFirst() {
        return db.query.streaks.findFirst({
          where: eq(streaks.profileId, profileId),
        });
      },
      /**
       * Read the streak row for today and apply lazy decay so callers never
       * receive a stale "N-day streak" when the profile has been inactive past
       * the grace window. Pass `todayIso` in tests to control the clock;
       * production callers can omit it to default to the real date.
       *
       * Returns null only when the profile has never had a streak row at all.
       */
      async findCurrentForToday(todayIso?: string): Promise<{
        currentStreak: number;
        longestStreak: number;
        lastActivityDate: string | null;
        gracePeriodStartDate: string | null;
        isOnGracePeriod: boolean;
        graceDaysRemaining: number;
      } | null> {
        const row = await db.query.streaks.findFirst({
          where: eq(streaks.profileId, profileId),
        });
        if (!row) return null;
        const today = todayIso ?? new Date().toISOString().slice(0, 10);
        return applyStreakDecay(row, today);
      },
    },

    mentorActivityLedger: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[], limit?: number) {
        return db.query.mentorActivityLedger.findMany({
          where: scopedWhere(mentorActivityLedger, extraWhere),
          ...(orderBy ? { orderBy } : {}),
          ...(limit !== undefined ? { limit } : {}),
        });
      },
    },

    teachingPreferences: {
      async findMany(extraWhere?: SQL) {
        return db.query.teachingPreferences.findMany({
          where: scopedWhere(teachingPreferences, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.teachingPreferences.findFirst({
          where: scopedWhere(teachingPreferences, extraWhere),
        });
      },
    },

    curriculumAdaptations: {
      async findMany(extraWhere?: SQL) {
        return db.query.curriculumAdaptations.findMany({
          where: scopedWhere(curriculumAdaptations, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.curriculumAdaptations.findFirst({
          where: scopedWhere(curriculumAdaptations, extraWhere),
        });
      },
    },

    consentStates: {
      async findMany(extraWhere?: SQL) {
        return db.query.consentStates.findMany({
          where: scopedWhere(consentStates, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.consentStates.findFirst({
          where: scopedWhere(consentStates, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
    },

    notificationPreferences: {
      async findMany(extraWhere?: SQL) {
        return db.query.notificationPreferences.findMany({
          where: scopedWhere(notificationPreferences, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.notificationPreferences.findFirst({
          where: scopedWhere(notificationPreferences, extraWhere),
        });
      },
    },

    learningModes: {
      async findMany(extraWhere?: SQL) {
        return db.query.learningModes.findMany({
          where: scopedWhere(learningModes, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.learningModes.findFirst({
          where: scopedWhere(learningModes, extraWhere),
        });
      },
    },

    learningProfiles: {
      async findMany(extraWhere?: SQL) {
        return db.query.learningProfiles.findMany({
          where: scopedWhere(learningProfiles, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.learningProfiles.findFirst({
          where: scopedWhere(learningProfiles, extraWhere),
        });
      },
    },

    vocabulary: {
      async findMany(extraWhere?: SQL) {
        return db.query.vocabulary.findMany({
          where: scopedWhere(vocabulary, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.vocabulary.findFirst({
          where: scopedWhere(vocabulary, extraWhere),
        });
      },
    },

    vocabularyRetentionCards: {
      async findMany(extraWhere?: SQL) {
        return db.query.vocabularyRetentionCards.findMany({
          where: scopedWhere(vocabularyRetentionCards, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.vocabularyRetentionCards.findFirst({
          where: scopedWhere(vocabularyRetentionCards, extraWhere),
        });
      },
    },

    dictationResults: {
      async findMany(extraWhere?: SQL) {
        return db.query.dictationResults.findMany({
          where: scopedWhere(dictationResults, extraWhere),
        });
      },
      async listRecentDistinctDates(limit: number) {
        return db
          .selectDistinct({ date: dictationResults.date })
          .from(dictationResults)
          .where(scopedWhere(dictationResults))
          .orderBy(desc(dictationResults.date))
          .limit(limit);
      },
      async insert(values: {
        completionKey: string;
        date: string;
        sentenceCount: number;
        mistakeCount: number | null;
        // [CR-162] Derive from schema enum so this type stays in sync automatically.
        mode: (typeof dictationModeEnum.enumValues)[number];
        reviewed: boolean;
        // [WI-902] Source sentence texts; null/omitted for old clients.
        sentences?: string[] | null;
      }) {
        // Conflict target is (profileId, completionKey): distinct dictation
        // sessions carry distinct completionKeys, so they persist as distinct
        // rows instead of overwriting each other on the legacy
        // (profileId, date, mode) target. A genuine client retry of the same
        // completionKey still updates in place — that is the intended
        // idempotency key. (Legacy callers that omit completionKey share a
        // per-day-per-mode derived key and still collapse, by design.)
        const [row] = await db
          .insert(dictationResults)
          .values({ profileId, ...values })
          .onConflictDoUpdate({
            target: [
              dictationResults.profileId,
              dictationResults.completionKey,
            ],
            // [S4] Omit `date` and `mode` from the retry update set. A genuine
            // client retry carries the same values so updating them is a no-op;
            // keeping them here would silently clobber the original row's mode
            // if a client ever reuses a completionKey across a mode switch.
            set: {
              sentenceCount: values.sentenceCount,
              mistakeCount: values.mistakeCount,
              reviewed: values.reviewed,
              // [WI-902] Refresh persisted sentences on a genuine retry only
              // when the client supplied a non-null value; omit when null or
              // undefined so a retry that omits or explicitly clears the field
              // does not clobber a previously stored set. Note: the route and
              // service coerce absent sentences to null before reaching here,
              // so the guard must use != null (loose equality) rather than
              // !== undefined to catch both forms.
              ...(values.sentences != null
                ? { sentences: values.sentences }
                : {}),
            },
          })
          .returning();
        return row;
      },
    },

    celebrationEvents: {
      async findMany(extraWhere?: SQL) {
        return db.query.celebrationEvents.findMany({
          where: scopedWhere(celebrationEvents, extraWhere),
        });
      },
    },
  };
}
