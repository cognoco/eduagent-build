import { eq, and, desc, sql, type SQL, type Column } from 'drizzle-orm';
import type { Database } from './client';
import {
  profiles,
  consentStates,
  learningSessions,
  subjects,
  assessments,
  retentionCards,
  xpLedger,
  streaks,
  sessionEvents,
  sessionSummaries,
  needsDeepeningTopics,
  onboardingDrafts,
  parkingLotItems,
  teachingPreferences,
  curriculumAdaptations,
  notificationPreferences,
  learningModes,
  sessionEmbeddings,
  bookSuggestions,
  topicSuggestions,
  curriculumBooks,
  learningProfiles,
  vocabulary,
  vocabularyRetentionCards,
  dictationResults,
  quizRounds,
  quizMissedItems,
} from './schema/index';

export function createScopedRepository(db: Database, profileId: string) {
  function scopedWhere(
    table: { profileId: Column },
    extraWhere?: SQL
  ): SQL | undefined {
    const profileFilter = eq(table.profileId, profileId);
    return extraWhere ? and(profileFilter, extraWhere) : profileFilter;
  }

  return {
    profileId,
    db,

    async getProfile() {
      return db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
    },

    sessions: {
      async findMany(extraWhere?: SQL, limit?: number) {
        return db.query.learningSessions.findMany({
          where: scopedWhere(learningSessions, extraWhere),
          ...(limit ? { limit } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.learningSessions.findFirst({
          where: scopedWhere(learningSessions, extraWhere),
        });
      },
    },

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

    assessments: {
      async findMany(extraWhere?: SQL) {
        return db.query.assessments.findMany({
          where: scopedWhere(assessments, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.assessments.findFirst({
          where: scopedWhere(assessments, extraWhere),
        });
      },
    },

    retentionCards: {
      async findMany(extraWhere?: SQL) {
        return db.query.retentionCards.findMany({
          where: scopedWhere(retentionCards, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.retentionCards.findFirst({
          where: scopedWhere(retentionCards, extraWhere),
        });
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
    },

    sessionEvents: {
      async findMany(extraWhere?: SQL) {
        return db.query.sessionEvents.findMany({
          where: scopedWhere(sessionEvents, extraWhere),
        });
      },
    },

    sessionSummaries: {
      async findMany(extraWhere?: SQL) {
        return db.query.sessionSummaries.findMany({
          where: scopedWhere(sessionSummaries, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.sessionSummaries.findFirst({
          where: scopedWhere(sessionSummaries, extraWhere),
        });
      },
    },

    needsDeepeningTopics: {
      async findMany(extraWhere?: SQL) {
        return db.query.needsDeepeningTopics.findMany({
          where: scopedWhere(needsDeepeningTopics, extraWhere),
        });
      },
    },

    onboardingDrafts: {
      async findMany(extraWhere?: SQL, orderBy?: SQL) {
        return db.query.onboardingDrafts.findMany({
          where: scopedWhere(onboardingDrafts, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL, orderBy?: SQL) {
        return db.query.onboardingDrafts.findFirst({
          where: scopedWhere(onboardingDrafts, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
    },

    parkingLotItems: {
      async findMany(extraWhere?: SQL) {
        return db.query.parkingLotItems.findMany({
          where: scopedWhere(parkingLotItems, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.parkingLotItems.findFirst({
          where: scopedWhere(parkingLotItems, extraWhere),
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
      async findFirst(extraWhere?: SQL) {
        return db.query.consentStates.findFirst({
          where: scopedWhere(consentStates, extraWhere),
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

    sessionEmbeddings: {
      async findMany(extraWhere?: SQL) {
        return db.query.sessionEmbeddings.findMany({
          where: scopedWhere(sessionEmbeddings, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.sessionEmbeddings.findFirst({
          where: scopedWhere(sessionEmbeddings, extraWhere),
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

    bookSuggestions: {
      async findBySubject(subjectId: string) {
        const subject = await db.query.subjects.findFirst({
          where: and(
            eq(subjects.id, subjectId),
            eq(subjects.profileId, profileId)
          ),
        });
        if (!subject) return [];
        return db.query.bookSuggestions.findMany({
          where: eq(bookSuggestions.subjectId, subjectId),
        });
      },
    },
    topicSuggestions: {
      async findByBook(bookId: string) {
        const book = await db.query.curriculumBooks.findFirst({
          where: eq(curriculumBooks.id, bookId),
        });
        if (!book) return [];
        const subject = await db.query.subjects.findFirst({
          where: and(
            eq(subjects.id, book.subjectId),
            eq(subjects.profileId, profileId)
          ),
        });
        if (!subject) return [];
        return db.query.topicSuggestions.findMany({
          where: eq(topicSuggestions.bookId, bookId),
        });
      },
    },

    dictationResults: {
      async findMany(extraWhere?: SQL, orderBy?: SQL, limit?: number) {
        return db.query.dictationResults.findMany({
          where: scopedWhere(dictationResults, extraWhere),
          ...(orderBy ? { orderBy } : {}),
          ...(limit ? { limit } : {}),
        });
      },
      async insert(values: {
        date: string;
        sentenceCount: number;
        mistakeCount: number | null;
        mode: 'homework' | 'surprise';
        reviewed: boolean;
      }) {
        const [row] = await db
          .insert(dictationResults)
          .values({ profileId, ...values })
          .returning();
        return row;
      },
    },

    quizRounds: {
      async findMany(extraWhere?: SQL) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(quizRounds, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.quizRounds.findFirst({
          where: scopedWhere(quizRounds, extraWhere),
        });
      },
      /** Look up a single round by id (scoped to the current profile). */
      async findById(roundId: string) {
        return db.query.quizRounds.findFirst({
          where: scopedWhere(quizRounds, eq(quizRounds.id, roundId)),
        });
      },
      async findRecentByActivity(
        activityType: (typeof quizRounds.$inferSelect)['activityType'],
        limit: number
      ) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(
            quizRounds,
            eq(quizRounds.activityType, activityType)
          ),
          orderBy: [desc(quizRounds.createdAt)],
          limit,
        });
      },
      async findCompletedRecent(limit: number) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(quizRounds, eq(quizRounds.status, 'completed')),
          orderBy: [desc(quizRounds.completedAt)],
          limit,
          columns: {
            id: true,
            activityType: true,
            theme: true,
            score: true,
            total: true,
            xpEarned: true,
            createdAt: true,
            completedAt: true,
          },
        });
      },
      /**
       * [Q-10] [CR-3] Per-activity completed-round aggregates in a single
       * query. Uses `array_agg(... ORDER BY ratio DESC)[1]` to resolve the
       * best-round score/total in the same GROUP BY scan — no correlated
       * subqueries, single table pass regardless of activity type count.
       */
      async aggregateCompletedStats() {
        const rows = await db
          .select({
            activityType: quizRounds.activityType,
            roundsPlayed: sql<number>`count(*)::int`,
            totalXp: sql<number>`coalesce(sum(${quizRounds.xpEarned}), 0)::int`,
            bestScore: sql<number | null>`(array_agg(
              ${quizRounds.score}
              order by cast(${quizRounds.score} as float)
                / nullif(${quizRounds.total}, 0) desc nulls last
            ))[1]::int`,
            bestTotal: sql<number | null>`(array_agg(
              ${quizRounds.total}
              order by cast(${quizRounds.score} as float)
                / nullif(${quizRounds.total}, 0) desc nulls last
            ))[1]::int`,
          })
          .from(quizRounds)
          .where(
            and(
              eq(quizRounds.profileId, profileId),
              eq(quizRounds.status, 'completed')
            )
          )
          .groupBy(quizRounds.activityType);

        return rows.map((row) => ({
          activityType: row.activityType,
          roundsPlayed: row.roundsPlayed,
          totalXp: row.totalXp,
          bestScore: row.bestScore ?? null,
          bestTotal: row.bestTotal ?? null,
        }));
      },
      async insert(values: Omit<typeof quizRounds.$inferInsert, 'profileId'>) {
        const [row] = await db
          .insert(quizRounds)
          .values({ ...values, profileId })
          .returning({ id: quizRounds.id });
        return row;
      },
      /**
       * Atomically mark an ACTIVE round completed. Returns the affected row if
       * the UPDATE actually changed status 'active' → 'completed' (under the
       * profile scope). Returns undefined if another caller has already
       * completed the round, which callers MUST translate to a ConflictError.
       *
       * Uses `WHERE status = 'active'` so concurrent complete calls can't
       * double-award XP — only one UPDATE wins.
       */
      async completeActive(
        roundId: string,
        values: {
          results: unknown;
          score: number;
          xpEarned: number;
          completedAt: Date;
        }
      ) {
        const rows = await db
          .update(quizRounds)
          .set({
            results: values.results,
            score: values.score,
            xpEarned: values.xpEarned,
            status: 'completed',
            completedAt: values.completedAt,
          })
          .where(
            and(
              eq(quizRounds.id, roundId),
              eq(quizRounds.profileId, profileId),
              eq(quizRounds.status, 'active')
            )
          )
          .returning({ id: quizRounds.id });
        return rows[0];
      },
    },

    quizMissedItems: {
      async findMany(extraWhere?: SQL) {
        return db.query.quizMissedItems.findMany({
          where: scopedWhere(quizMissedItems, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.quizMissedItems.findFirst({
          where: scopedWhere(quizMissedItems, extraWhere),
        });
      },
      async insertMany(
        values: Array<Omit<typeof quizMissedItems.$inferInsert, 'profileId'>>
      ) {
        if (values.length === 0) return [];
        return db
          .insert(quizMissedItems)
          .values(values.map((v) => ({ ...v, profileId })))
          .returning({ id: quizMissedItems.id });
      },
    },
  };
}

export type ScopedRepository = ReturnType<typeof createScopedRepository>;
