import {
  eq,
  and,
  asc,
  desc,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
  type Column,
} from 'drizzle-orm';
import type { Database } from './client';
import { applyStreakDecay } from './streaks-rules';
import { VECTOR_DIM } from './schema/_pgvector';
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
  bookmarks,
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
  curriculumTopics,
  monthlyReports,
  weeklyReports,
  learningProfiles,
  vocabulary,
  vocabularyRetentionCards,
  dictationResults,
  quizRounds,
  quizMissedItems,
  quizMasteryItems,
  memoryFacts,
} from './schema/index';

// [BUG-704 / P-8] Single source of truth for the runtime DB enum
// (quizActivityTypeEnum at schema/quiz.ts:15-19 = ['capitals', 'vocabulary',
// 'guess_who']). Each repository method below previously redeclared a narrower
// `'capitals' | 'guess_who'` literal, silently excluding 'vocabulary' from
// the type system even though the DB column accepts it. Vocabulary mastery
// rows could be inserted via raw SQL but couldn't be queried/updated through
// the repository — a TypeScript-level data lockout. Widened here so all six
// signatures stay aligned with the DB enum.
type QuizActivityType = 'capitals' | 'vocabulary' | 'guess_who';

export function createScopedRepository(db: Database, profileId: string) {
  if (!profileId || profileId.trim() === '') {
    throw new Error(
      'createScopedRepository: profileId must be a non-empty string',
    );
  }
  function scopedWhere(
    table: { profileId: Column },
    extraWhere?: SQL,
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
      async findMany(extraWhere?: SQL, limit?: number, orderBy?: SQL | SQL[]) {
        return db.query.learningSessions.findMany({
          where: scopedWhere(learningSessions, extraWhere),
          ...(limit ? { limit } : {}),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.learningSessions.findFirst({
          where: scopedWhere(learningSessions, extraWhere),
        });
      },
      /**
       * Return topicIds this profile has *meaningfully completed* in a
       * learning session. Used by `resolveNextTopic` to skip topics the
       * learner has already worked through.
       *
       * Filters:
       * - `status IN ('completed','auto_closed')` — terminal states only.
       *   Active/paused sessions don't count: a learner mid-session or
       *   paused for later hasn't finished the topic.
       * - `exchange_count >= 3` — matches the recap-firing threshold in
       *   `session-recap.ts`. Below this, the session was too short to
       *   represent meaningful work; counting it would lock the learner
       *   out of topics they only briefly touched.
       */
      async listCompletedTopicIds(): Promise<string[]> {
        const rows = await db
          .select({ topicId: learningSessions.topicId })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.profileId, profileId),
              sql`${learningSessions.topicId} IS NOT NULL`,
              inArray(learningSessions.status, ['completed', 'auto_closed']),
              gte(learningSessions.exchangeCount, 3),
            ),
          );
        return rows
          .map((row) => row.topicId)
          .filter((id): id is string => typeof id === 'string');
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

    sessionEvents: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.sessionEvents.findMany({
          where: scopedWhere(sessionEvents, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.sessionEvents.findFirst({
          where: scopedWhere(sessionEvents, extraWhere),
          ...(orderBy ? { orderBy } : {}),
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

    bookmarks: {
      async findMany(extraWhere?: SQL) {
        return db.query.bookmarks.findMany({
          where: scopedWhere(bookmarks, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.bookmarks.findFirst({
          where: scopedWhere(bookmarks, extraWhere),
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
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[], limit?: number) {
        return db.query.onboardingDrafts.findMany({
          where: scopedWhere(onboardingDrafts, extraWhere),
          ...(orderBy ? { orderBy } : {}),
          ...(limit !== undefined ? { limit } : {}),
        });
      },
      async findFirst(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
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
    memoryFacts: {
      async findManyActive(extraWhere?: SQL) {
        return db.query.memoryFacts.findMany({
          where: scopedWhere(
            memoryFacts,
            extraWhere
              ? and(sql`${memoryFacts.supersededBy} IS NULL`, extraWhere)
              : sql`${memoryFacts.supersededBy} IS NULL`,
          ),
          orderBy: [asc(memoryFacts.createdAt), asc(memoryFacts.id)],
        });
      },
      async findFirstActive(extraWhere?: SQL) {
        return db.query.memoryFacts.findFirst({
          where: scopedWhere(
            memoryFacts,
            extraWhere
              ? and(sql`${memoryFacts.supersededBy} IS NULL`, extraWhere)
              : sql`${memoryFacts.supersededBy} IS NULL`,
          ),
          orderBy: [asc(memoryFacts.createdAt), asc(memoryFacts.id)],
        });
      },
      async findActiveCandidatesWithEmbedding() {
        return db.query.memoryFacts.findMany({
          where: scopedWhere(
            memoryFacts,
            and(
              sql`${memoryFacts.supersededBy} IS NULL`,
              sql`${memoryFacts.embedding} IS NOT NULL`,
              sql`${memoryFacts.category} <> 'suppressed'`,
            ),
          ),
          orderBy: [asc(memoryFacts.createdAt), asc(memoryFacts.id)],
        });
      },
      async findCascadeAncestry(factId: string) {
        return db.execute(sql`
          WITH RECURSIVE ancestry AS (
            SELECT * FROM ${memoryFacts}
              WHERE ${memoryFacts.id} = ${factId}
                AND ${memoryFacts.profileId} = ${profileId}
            UNION
            SELECT m.* FROM ${memoryFacts} m
              INNER JOIN ancestry a ON m.superseded_by = a.id
              WHERE m.profile_id = ${profileId}
          )
          SELECT * FROM ancestry
        `);
      },
      async findRelevant(
        queryEmbedding: number[],
        k: number,
        extraWhere?: SQL,
      ) {
        if (
          queryEmbedding.length !== VECTOR_DIM ||
          queryEmbedding.some((value) => !Number.isFinite(value)) ||
          k <= 0
        ) {
          return [];
        }

        const overFetch = k * 4;
        const queryLiteral = sql`${`[${queryEmbedding.join(',')}]`}::vector`;
        const defaultFilters = and(
          sql`${memoryFacts.supersededBy} IS NULL`,
          sql`${memoryFacts.category} <> 'suppressed'`,
        );
        const baseWhere = scopedWhere(
          memoryFacts,
          extraWhere ? and(defaultFilters, extraWhere) : defaultFilters,
        );

        return db
          .select({
            id: memoryFacts.id,
            profileId: memoryFacts.profileId,
            category: memoryFacts.category,
            text: memoryFacts.text,
            textNormalized: memoryFacts.textNormalized,
            metadata: memoryFacts.metadata,
            sourceSessionIds: memoryFacts.sourceSessionIds,
            sourceEventIds: memoryFacts.sourceEventIds,
            observedAt: memoryFacts.observedAt,
            confidence: memoryFacts.confidence,
            createdAt: memoryFacts.createdAt,
            distance: sql<number>`${memoryFacts.embedding} <=> ${queryLiteral}`,
          })
          .from(memoryFacts)
          .where(and(baseWhere, sql`${memoryFacts.embedding} IS NOT NULL`))
          .orderBy(sql`${memoryFacts.embedding} <=> ${queryLiteral}`)
          .limit(overFetch);
      },
    },
    monthlyReports: {
      async findMany(extraWhere?: SQL, options?: { limit?: number }) {
        return db.query.monthlyReports.findMany({
          where: scopedWhere(monthlyReports, extraWhere),
          orderBy: desc(monthlyReports.reportMonth),
          ...(options?.limit ? { limit: options.limit } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.monthlyReports.findFirst({
          where: scopedWhere(monthlyReports, extraWhere),
        });
      },
    },
    weeklyReports: {
      async findMany(extraWhere?: SQL, options?: { limit?: number }) {
        return db.query.weeklyReports.findMany({
          where: scopedWhere(weeklyReports, extraWhere),
          orderBy: desc(weeklyReports.reportWeek),
          ...(options?.limit ? { limit: options.limit } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.weeklyReports.findFirst({
          where: scopedWhere(weeklyReports, extraWhere),
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
            eq(subjects.profileId, profileId),
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
            eq(subjects.profileId, profileId),
          ),
        });
        if (!subject) return [];
        return db.query.topicSuggestions.findMany({
          where: eq(topicSuggestions.bookId, bookId),
        });
      },
    },

    curriculumTopics: {
      /**
       * Return a single topic iff it belongs to a book whose subject is
       * owned by this profile. Returns null for unknown topicIds and for
       * cross-profile topicIds — the caller cannot distinguish, by design.
       * Callers that want to observe deny events should log at the service
       * layer where the project logger is available (see resolveNextTopic).
       */
      async findById(topicId: string): Promise<CurriculumTopicRow | null> {
        const [row] = await db
          .select({
            id: curriculumTopics.id,
            bookId: curriculumTopics.bookId,
            sortOrder: curriculumTopics.sortOrder,
            title: curriculumTopics.title,
            bookSortOrder: curriculumBooks.sortOrder,
            subjectId: curriculumBooks.subjectId,
          })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
          .where(
            and(
              eq(curriculumTopics.id, topicId),
              eq(subjects.profileId, profileId),
            ),
          )
          .limit(1);
        return row ?? null;
      },

      /**
       * Return up to `limit` topics inside `bookId` with sortOrder greater
       * than `minSortOrder`, ordered ascending. Ownership enforced via the
       * books→subjects join chain. The limit is caller-supplied so product
       * policy (how many candidates is "enough") stays in the service layer.
       *
       * Skipped topics (`curriculum_topics.skipped = true`) are filtered
       * out: a topic the learner explicitly skipped via the shelf must not
       * resurface as a "next topic" suggestion. The id tie-break makes
       * ordering deterministic when two topics share a sortOrder (rare but
       * possible after manual curriculum edits).
       */
      async findLaterInBook(
        bookId: string,
        minSortOrder: number,
        limit: number,
      ): Promise<Array<{ id: string; title: string }>> {
        return db
          .select({ id: curriculumTopics.id, title: curriculumTopics.title })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
          .where(
            and(
              eq(curriculumTopics.bookId, bookId),
              gt(curriculumTopics.sortOrder, minSortOrder),
              eq(curriculumTopics.skipped, false),
              eq(subjects.profileId, profileId),
            ),
          )
          .orderBy(asc(curriculumTopics.sortOrder), asc(curriculumTopics.id))
          .limit(limit);
      },

      /**
       * Return up to `limit` topics in *other* books of the given subject —
       * specifically books with `sort_order > currentBookSortOrder`, ordered
       * ascending by (book.sortOrder, topic.sortOrder, topic.id). Used as a
       * fallback when `findLaterInBook` is exhausted (learner finished the
       * last topic in a book) so the recap can suggest the start of the
       * next book instead of silently dropping the "Up next" card.
       *
       * Filters out skipped topics. Ownership enforced via the
       * books→subjects join chain.
       */
      async findEarliestInLaterBooks(
        subjectId: string,
        currentBookSortOrder: number,
        limit: number,
      ): Promise<Array<{ id: string; title: string }>> {
        return db
          .select({ id: curriculumTopics.id, title: curriculumTopics.title })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
          .where(
            and(
              eq(curriculumBooks.subjectId, subjectId),
              gt(curriculumBooks.sortOrder, currentBookSortOrder),
              eq(curriculumTopics.skipped, false),
              eq(subjects.profileId, profileId),
            ),
          )
          .orderBy(
            asc(curriculumBooks.sortOrder),
            asc(curriculumTopics.sortOrder),
            asc(curriculumTopics.id),
          )
          .limit(limit);
      },

      /**
       * Return topics whose title matches any of `keywords` (case-insensitive
       * substring), scoped to a subject this profile owns. Returns at most
       * `limit` rows.
       *
       * BUG-643 [P-3]: empty keyword arrays return [] without hitting the DB —
       * `or(...[])` is invalid drizzle SQL and would have thrown at the
       * driver layer. Callers may still short-circuit upstream, but this
       * helper is now safe to call directly.
       */
      async findMatchingInSubject(
        subjectId: string,
        keywords: string[],
        limit: number,
      ): Promise<Array<{ id: string; title: string }>> {
        if (keywords.length === 0) return [];
        return db
          .select({ id: curriculumTopics.id, title: curriculumTopics.title })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
          .where(
            and(
              eq(curriculumBooks.subjectId, subjectId),
              eq(subjects.profileId, profileId),
              or(
                ...keywords.map((keyword) =>
                  ilike(curriculumTopics.title, `%${keyword}%`),
                ),
              ),
            ),
          )
          .limit(limit);
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
          .onConflictDoUpdate({
            target: [dictationResults.profileId, dictationResults.date],
            set: {
              sentenceCount: values.sentenceCount,
              mistakeCount: values.mistakeCount,
              mode: values.mode,
              reviewed: values.reviewed,
            },
          })
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
        limit: number,
      ) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(
            quizRounds,
            eq(quizRounds.activityType, activityType),
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
      async findCompletedForStreaks(limit: number) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(quizRounds, eq(quizRounds.status, 'completed')),
          orderBy: [desc(quizRounds.completedAt)],
          limit,
          columns: {
            activityType: true,
            languageCode: true,
            results: true,
          },
        });
      },
      /**
       * [Q-10] [CR-3] Per-activity completed-round aggregates in a single
       * query. Uses `array_agg(... ORDER BY ratio DESC)[1]` to resolve the
       * best-round score/total in the same GROUP BY scan — no correlated
       * subqueries, single table pass regardless of activity type count.
       *
       * [BUG-926] Groups by (activityType, languageCode) so vocabulary rounds
       * for different languages produce separate stat rows. languageCode is
       * NULL for capitals and guess_who rounds.
       */
      async aggregateCompletedStats() {
        const rows = await db
          .select({
            activityType: quizRounds.activityType,
            languageCode: quizRounds.languageCode,
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
              eq(quizRounds.status, 'completed'),
            ),
          )
          .groupBy(quizRounds.activityType, quizRounds.languageCode);

        return rows.map((row) => ({
          activityType: row.activityType,
          languageCode: row.languageCode ?? null,
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
        },
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
              eq(quizRounds.status, 'active'),
            ),
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
        values: Array<Omit<typeof quizMissedItems.$inferInsert, 'profileId'>>,
      ) {
        if (values.length === 0) return [];
        return db
          .insert(quizMissedItems)
          .values(values.map((v) => ({ ...v, profileId })))
          .returning({ id: quizMissedItems.id });
      },
      async markSurfaced(
        activityType: (typeof quizMissedItems.$inferSelect)['activityType'],
      ) {
        const rows = await db
          .update(quizMissedItems)
          .set({ surfaced: true })
          .where(
            and(
              eq(quizMissedItems.profileId, profileId),
              eq(quizMissedItems.activityType, activityType),
              eq(quizMissedItems.surfaced, false),
            ),
          )
          .returning({ id: quizMissedItems.id });
        return rows.length;
      },
    },

    quizMasteryItems: {
      async findDueByActivity(activityType: QuizActivityType, limit: number) {
        return db.query.quizMasteryItems.findMany({
          where: scopedWhere(
            quizMasteryItems,
            and(
              eq(quizMasteryItems.activityType, activityType),
              lte(quizMasteryItems.nextReviewAt, new Date()),
            ),
          ),
          orderBy: [quizMasteryItems.nextReviewAt],
          limit,
        });
      },

      async upsertFromCorrectAnswer(values: {
        activityType: QuizActivityType;
        itemKey: string;
        itemAnswer: string;
      }) {
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + 1);

        const [row] = await db
          .insert(quizMasteryItems)
          .values({
            profileId,
            activityType: values.activityType,
            itemKey: values.itemKey,
            itemAnswer: values.itemAnswer,
            easeFactor: 2.5,
            interval: 1,
            repetitions: 0,
            nextReviewAt: nextReview,
          })
          .onConflictDoNothing({
            target: [
              quizMasteryItems.profileId,
              quizMasteryItems.activityType,
              quizMasteryItems.itemKey,
            ],
          })
          .returning({ id: quizMasteryItems.id });
        return row ?? null;
      },

      async updateSm2(
        itemKey: string,
        activityType: QuizActivityType,
        values: {
          easeFactor: number;
          interval: number;
          repetitions: number;
          nextReviewAt: Date;
        },
      ) {
        return db
          .update(quizMasteryItems)
          .set({
            easeFactor: values.easeFactor,
            interval: values.interval,
            repetitions: values.repetitions,
            nextReviewAt: values.nextReviewAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey),
            ),
          )
          .returning({ id: quizMasteryItems.id });
      },

      async findByKey(activityType: QuizActivityType, itemKey: string) {
        return db.query.quizMasteryItems.findFirst({
          where: scopedWhere(
            quizMasteryItems,
            and(
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey),
            ),
          ),
        });
      },

      async incrementMcSuccessCount(
        itemKey: string,
        activityType: QuizActivityType,
      ) {
        return db
          .update(quizMasteryItems)
          .set({
            mcSuccessCount: sql`${quizMasteryItems.mcSuccessCount} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey),
            ),
          )
          .returning({
            id: quizMasteryItems.id,
            mcSuccessCount: quizMasteryItems.mcSuccessCount,
          });
      },

      async resetMcSuccessCount(
        itemKey: string,
        activityType: QuizActivityType,
        resetTo: number,
      ) {
        return db
          .update(quizMasteryItems)
          .set({
            mcSuccessCount: resetTo,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey),
            ),
          )
          .returning({ id: quizMasteryItems.id });
      },
    },
  };
}

export type ScopedRepository = ReturnType<typeof createScopedRepository>;

export interface CurriculumTopicRow {
  id: string;
  bookId: string;
  sortOrder: number;
  title: string;
  bookSortOrder: number;
  subjectId: string;
}
