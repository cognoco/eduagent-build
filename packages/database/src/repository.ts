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
import type { QuizActivityType } from '@eduagent/schemas';
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
  curricula,
  curriculumTopics,
  monthlyReports,
  weeklyReports,
  learningProfiles,
  progressSummaries,
  milestones,
  pendingNotices,
  vocabulary,
  vocabularyRetentionCards,
  dictationModeEnum,
  dictationResults,
  quizRounds,
  quizMissedItems,
  quizMasteryItems,
  memoryFacts,
  type MemoryFactRow,
  practiceActivityEvents,
  celebrationEvents,
  mentorActivityLedger,
} from './schema/index';

// [BUG-704 / P-8] Single source of truth for the runtime DB enum
// (quizActivityTypeEnum at quiz.ts:4-8 = ['capitals', 'vocabulary', 'guess_who']).
// [BUG-390] Imported from @eduagent/schemas — was previously a local redefinition.
// QuizActivityType is defined once in packages/schemas/src/quiz.ts and re-exported
// via the schemas barrel. The local redefinition has been removed.

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
      async findCascadeAncestry(factId: string): Promise<MemoryFactRow[]> {
        // CR-2026-05-21-168: The recursive arm previously used raw snake_case
        // string literals (`m.superseded_by`, `m.profile_id`). These strings
        // survive column renames silently — drizzle's typed sites get a compile
        // error but the raw string would return wrong/empty rows at runtime.
        //
        // Fix: derive column names from the typed drizzle schema at runtime via
        // `.name` — if a future migration renames the column, the schema is
        // updated in one place and this CTE also picks up the new name.
        // `${memoryFacts.X}` cannot be used directly in the recursive arm
        // because drizzle expands it to `"table_name"."col"` (table-qualified),
        // which is invalid SQL when the table is aliased as `m`.
        // `sql.raw(memoryFacts.X.name)` emits the bare column name only.
        //
        // The return type is pinned to `MemoryFactRow[]` (derived from
        // `typeof memoryFacts.$inferSelect`) so callers receive a typed array
        // without a runtime dependency. This follows the same idiom as other
        // raw-query methods in this file that cast `result.rows`.
        const result = await db.execute(sql`
          WITH RECURSIVE ancestry AS (
            SELECT * FROM ${memoryFacts}
              WHERE ${memoryFacts.id} = ${factId}
                AND ${memoryFacts.profileId} = ${profileId}
            UNION
            SELECT m.* FROM ${memoryFacts} m
              INNER JOIN ancestry a ON m.${sql.raw(memoryFacts.supersededBy.name)} = a.id
              WHERE m.${sql.raw(memoryFacts.profileId.name)} = ${profileId}
          )
          SELECT * FROM ancestry
        `);
        return result.rows as MemoryFactRow[];
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
      /**
       * Return topic suggestions for a book, scoped to the current profile.
       *
       * [BUG-218 / P1-HIGH] TOCTOU fix: the previous implementation issued two
       * sequential queries — one to confirm the book existed and was owned by
       * a subject this profile owns, then a separate query to read its
       * suggestions. Between those two reads, a subject could be reparented or
       * the book's subject FK rewritten, allowing a stale ownership check to
       * authorise a read against a book the profile no longer owned. The fix
       * collapses this into a single query that enforces ownership inside the
       * SELECT via books→subjects joins, so the row-visibility predicate and
       * the ownership predicate evaluate as one snapshot.
       */
      async findByBook(bookId: string) {
        return db
          .select({
            id: topicSuggestions.id,
            bookId: topicSuggestions.bookId,
            title: topicSuggestions.title,
            createdAt: topicSuggestions.createdAt,
            usedAt: topicSuggestions.usedAt,
          })
          .from(topicSuggestions)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, topicSuggestions.bookId),
          )
          .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
          .where(
            and(
              eq(topicSuggestions.bookId, bookId),
              eq(subjects.profileId, profileId),
            ),
          );
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
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
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
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
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
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
          .where(
            and(
              eq(subjects.id, subjectId),
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
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
          .where(
            and(
              eq(subjects.id, subjectId),
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
              // when the client supplied them; omit when undefined so a retry
              // that drops the field does not clobber a previously stored set.
              ...(values.sentences !== undefined
                ? { sentences: values.sentences }
                : {}),
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
      /**
       * [BUG-851] Lock-and-read a round row inside a transaction. Used by
       * `completeQuizRound` to serialize the read-then-write window against
       * concurrent `appendRecordedAttempt` writes from `/quiz/check`. Without
       * `FOR UPDATE`, READ COMMITTED lets a check-call append (jsonb || UPDATE)
       * between this SELECT and the subsequent completion UPDATE — that
       * in-flight attempt is then overwritten by the stale snapshot. The
       * status='active' guard prevents double-completion but not lost writes.
       *
       * **Invariant [WI-350]:** must be called as the FIRST operation inside
       * `db.transaction()`. `.for('update')` is a no-op outside a transaction
       * (lock releases immediately on statement end), so calling this outside
       * a transaction silently removes all concurrency protection. Future
       * quiz-like multi-write flows that skip this lock reintroduce the race.
       *
       * Returns null when no row matches.
       */
      async findByIdForUpdate(roundId: string) {
        const rows = await db
          .select()
          .from(quizRounds)
          .where(scopedWhere(quizRounds, eq(quizRounds.id, roundId)))
          .for('update')
          .limit(1);
        return rows[0] ?? null;
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
      /**
       * [CR-2026-05-19-H10] Fetch the most-recent COMPLETED rounds for a
       * given activity type. Used by the difficulty-bump check, which counts
       * perfect-score completions toward the bump threshold. The status
       * predicate is enforced in SQL — never filter status in application
       * code after a bare `findRecentByActivity` call, because abandoned
       * (prefetched-but-never-played) rounds will occupy slots in the
       * `limit` window and the bump will silently never fire.
       */
      async findRecentCompletedByActivity(
        activityType: (typeof quizRounds.$inferSelect)['activityType'],
        limit: number,
      ) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(
            quizRounds,
            and(
              eq(quizRounds.activityType, activityType),
              eq(quizRounds.status, 'completed'),
            ),
          ),
          orderBy: [desc(quizRounds.completedAt)],
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

        // [BUG-566] Validate every distinct sourceRoundId belongs to this
        // profileId. The FK only guarantees the round exists — it does not
        // guarantee it belongs to the current profile. A caller could supply
        // a sourceRoundId from a different profile, breaking cross-account
        // audit invariants.
        const distinctRoundIds = [
          ...new Set(values.map((v) => v.sourceRoundId)),
        ];
        for (const roundId of distinctRoundIds) {
          const round = await db.query.quizRounds.findFirst({
            where: scopedWhere(quizRounds, eq(quizRounds.id, roundId)),
          });
          if (!round) {
            throw new Error(
              `[BUG-566] quizMissedItems.insertMany: sourceRoundId ${roundId} does not belong to profileId ${profileId}`,
            );
          }
        }

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
        const now = new Date();
        const nextReview = new Date(now);
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
            // [CR-2026-05-19-H9] Initialize lastReviewedAt to the moment of
            // the discovery answer. SM-2's first re-review will compute the
            // inter-review gap from this timestamp.
            lastReviewedAt: now,
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
        // [CR-2026-05-19-H9] `lastReviewedAt` is set ONLY here (and on initial
        // insert in upsertFromCorrectAnswer). MC-streak writes
        // (incrementMcSuccessCount / resetMcSuccessCount) must NOT touch this
        // column, or SM-2's next-review interval math will be computed from a
        // bogus "just reviewed" timestamp and items will resurface too soon.
        const now = new Date();
        return db
          .update(quizMasteryItems)
          .set({
            easeFactor: values.easeFactor,
            interval: values.interval,
            repetitions: values.repetitions,
            nextReviewAt: values.nextReviewAt,
            lastReviewedAt: now,
            updatedAt: now,
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

    practiceActivityEvents: {
      async findMany(extraWhere?: SQL) {
        return db.query.practiceActivityEvents.findMany({
          where: scopedWhere(practiceActivityEvents, extraWhere),
        });
      },
    },

    celebrationEvents: {
      async findMany(extraWhere?: SQL) {
        return db.query.celebrationEvents.findMany({
          where: scopedWhere(celebrationEvents, extraWhere),
        });
      },
    },

    // [BUG-219 / P1-HIGH] progressSummaries — scoped-repo helpers. Previously
    // every caller had to repeat `eq(progressSummaries.profileId, X)` by hand
    // (or worse, query the table by id alone), opening the door to cross-
    // profile reads. Centralising the predicate here makes the contract
    // enforceable by `profile-isolation.test.ts` and matches every other
    // single-table scoped namespace above.
    progressSummaries: {
      async findMany(extraWhere?: SQL) {
        return db.query.progressSummaries.findMany({
          where: scopedWhere(progressSummaries, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.progressSummaries.findFirst({
          where: scopedWhere(progressSummaries, extraWhere),
        });
      },
    },

    // [BUG-219 / P1-HIGH] milestones — same rationale as progressSummaries.
    // `findById` enforces profileId in the WHERE clause so a caller cannot
    // accidentally read a milestone owned by a sibling profile by passing the
    // wrong id.
    milestones: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.milestones.findMany({
          where: scopedWhere(milestones, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.milestones.findFirst({
          where: scopedWhere(milestones, extraWhere),
        });
      },
      async findById(milestoneId: string) {
        return db.query.milestones.findFirst({
          where: scopedWhere(milestones, eq(milestones.id, milestoneId)),
        });
      },
    },

    // [BUG-224 / P2-MED] pendingNotices uses ownerProfileId (not profileId),
    // so it cannot share scopedWhere(). Implement it explicitly so callers
    // stop reaching for `db.query.pendingNotices.*` directly and the scoping
    // contract stays centralised.
    pendingNotices: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        const ownerFilter = eq(pendingNotices.ownerProfileId, profileId);
        return db.query.pendingNotices.findMany({
          where: extraWhere ? and(ownerFilter, extraWhere) : ownerFilter,
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        const ownerFilter = eq(pendingNotices.ownerProfileId, profileId);
        return db.query.pendingNotices.findFirst({
          where: extraWhere ? and(ownerFilter, extraWhere) : ownerFilter,
        });
      },
      async findById(noticeId: string) {
        return db.query.pendingNotices.findFirst({
          where: and(
            eq(pendingNotices.ownerProfileId, profileId),
            eq(pendingNotices.id, noticeId),
          ),
        });
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
