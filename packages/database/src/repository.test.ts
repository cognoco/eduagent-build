import { eq, and, sql } from 'drizzle-orm';
import {
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
  parkingLotItems,
  teachingPreferences,
  curriculumAdaptations,
  onboardingDrafts,
  notificationPreferences,
  learningModes,
  sessionEmbeddings,
  quizRounds,
  quizMissedItems,
  progressSummaries,
  milestones,
  pendingNotices,
  speakingPracticeAttempts,
  mentorNotices,
} from './schema/index.js';
import { createScopedRepository } from './repository.js';
import type { Database } from './client.js';

// ---------------------------------------------------------------------------
// Mock database
// ---------------------------------------------------------------------------

function createMockDb() {
  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest.fn().mockResolvedValue(null);

  const makeQueryProxy = () =>
    new Proxy(
      {},
      {
        get(_target, _prop) {
          return { findMany, findFirst };
        },
      },
    );

  return {
    findMany,
    findFirst,
    db: { query: makeQueryProxy() } as unknown as Database,
  };
}

const TEST_PROFILE_ID = '01933b3c-0000-7000-8000-000000000001';

describe('createScopedRepository', () => {
  it('exposes profileId and db', () => {
    const { db } = createMockDb();
    const repo = createScopedRepository(db, TEST_PROFILE_ID);

    expect(repo.profileId).toBe(TEST_PROFILE_ID);
    expect(repo.db).toBe(db);
  });

  // ---------------------------------------------------------------------------
  // Domain namespaces — findMany without extra where
  // ---------------------------------------------------------------------------

  describe.each([
    ['sessions', learningSessions],
    ['subjects', subjects],
    ['assessments', assessments],
    ['retentionCards', retentionCards],
    ['xpLedger', xpLedger],
    ['bookmarks', bookmarks],
    ['parkingLotItems', parkingLotItems],
    ['teachingPreferences', teachingPreferences],
    ['curriculumAdaptations', curriculumAdaptations],
    ['onboardingDrafts', onboardingDrafts],
    ['notificationPreferences', notificationPreferences],
    ['learningModes', learningModes],
    ['sessionEmbeddings', sessionEmbeddings],
    ['mentorNotices', mentorNotices],
    ['quizRounds', quizRounds],
    ['quizMissedItems', quizMissedItems],
  ] as const)('%s.findMany', (namespace, table) => {
    it('auto-injects profileId filter', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await (
        repo as unknown as Record<
          string,
          { findMany: (w?: unknown) => Promise<unknown[]> }
        >
      )[namespace]!.findMany();

      expect(findMany).toHaveBeenCalledWith({
        where: eq(table.profileId, TEST_PROFILE_ID),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Domain namespaces — findMany with extra where
  // ---------------------------------------------------------------------------

  describe.each([
    ['sessions', learningSessions],
    ['subjects', subjects],
    ['assessments', assessments],
    ['retentionCards', retentionCards],
    ['xpLedger', xpLedger],
    ['bookmarks', bookmarks],
    ['parkingLotItems', parkingLotItems],
    ['teachingPreferences', teachingPreferences],
    ['curriculumAdaptations', curriculumAdaptations],
    ['onboardingDrafts', onboardingDrafts],
    ['notificationPreferences', notificationPreferences],
    ['learningModes', learningModes],
    ['sessionEmbeddings', sessionEmbeddings],
    ['mentorNotices', mentorNotices],
    ['quizRounds', quizRounds],
    ['quizMissedItems', quizMissedItems],
  ] as const)('%s.findMany with extraWhere', (namespace, table) => {
    it('composes profileId with extra condition', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const extraCondition = sql`1 = 1`;

      await (
        repo as unknown as Record<
          string,
          { findMany: (w?: unknown) => Promise<unknown[]> }
        >
      )[namespace]!.findMany(extraCondition);

      expect(findMany).toHaveBeenCalledWith({
        where: and(eq(table.profileId, TEST_PROFILE_ID), extraCondition),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Domain namespaces — findFirst
  // ---------------------------------------------------------------------------

  describe.each([
    ['sessions', learningSessions],
    ['subjects', subjects],
    ['assessments', assessments],
    ['retentionCards', retentionCards],
    ['xpLedger', xpLedger],
    ['bookmarks', bookmarks],
    ['sessionSummaries', sessionSummaries],
    ['parkingLotItems', parkingLotItems],
    ['teachingPreferences', teachingPreferences],
    ['curriculumAdaptations', curriculumAdaptations],
    ['onboardingDrafts', onboardingDrafts],
    ['notificationPreferences', notificationPreferences],
    ['learningModes', learningModes],
    ['sessionEmbeddings', sessionEmbeddings],
    ['mentorNotices', mentorNotices],
    ['quizRounds', quizRounds],
    ['quizMissedItems', quizMissedItems],
  ] as const)('%s.findFirst', (namespace, table) => {
    it('auto-injects profileId filter', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await (
        repo as unknown as Record<
          string,
          { findFirst: (w?: unknown) => Promise<unknown> }
        >
      )[namespace]!.findFirst();

      expect(findFirst).toHaveBeenCalledWith({
        where: eq(table.profileId, TEST_PROFILE_ID),
      });
    });

    it('composes profileId with extra condition', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const extraCondition = sql`1 = 1`;

      await (
        repo as unknown as Record<
          string,
          { findFirst: (w?: unknown) => Promise<unknown> }
        >
      )[namespace]!.findFirst(extraCondition);

      expect(findFirst).toHaveBeenCalledWith({
        where: and(eq(table.profileId, TEST_PROFILE_ID), extraCondition),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // streaks — unique per profile, findFirst only
  // ---------------------------------------------------------------------------

  describe('streaks.findFirst', () => {
    it('queries by profileId', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.streaks.findFirst();

      expect(findFirst).toHaveBeenCalledWith({
        where: eq(streaks.profileId, TEST_PROFILE_ID),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // streaks.findCurrentForToday — decay-on-read [BUG-912]
  // ---------------------------------------------------------------------------

  describe('streaks.findCurrentForToday', () => {
    it('returns null when no streak row exists', async () => {
      const { db } = createMockDb();
      // findFirst already mocked to return null by default
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      const result = await repo.streaks.findCurrentForToday('2026-04-29');

      expect(result).toBeNull();
    });

    it('returns currentStreak:0 for a row 10 days stale with currentStreak:2 saved', async () => {
      const staleRow = {
        id: 'streak-1',
        profileId: TEST_PROFILE_ID,
        currentStreak: 2,
        longestStreak: 7,
        lastActivityDate: '2026-04-19', // 10 days before today
        gracePeriodStartDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const findFirst = jest.fn().mockResolvedValue(staleRow);
      const db = {
        query: new Proxy(
          {},
          {
            get: () => ({
              findFirst,
              findMany: jest.fn().mockResolvedValue([]),
            }),
          },
        ),
      } as unknown as Database;

      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const result = await repo.streaks.findCurrentForToday('2026-04-29');

      expect(result).not.toBeNull();
      // streak decayed to 0 — 10-day gap exceeds MAX_GRACE_DAYS (3)
      expect(result!.currentStreak).toBe(0);
      // longestStreak is historical record — preserved
      expect(result!.longestStreak).toBe(7);
      expect(result!.isOnGracePeriod).toBe(false);
    });

    it('preserves currentStreak for a row active today', async () => {
      const freshRow = {
        id: 'streak-2',
        profileId: TEST_PROFILE_ID,
        currentStreak: 3,
        longestStreak: 5,
        lastActivityDate: '2026-04-29', // same day as today
        gracePeriodStartDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const findFirst = jest.fn().mockResolvedValue(freshRow);
      const db = {
        query: new Proxy(
          {},
          {
            get: () => ({
              findFirst,
              findMany: jest.fn().mockResolvedValue([]),
            }),
          },
        ),
      } as unknown as Database;

      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const result = await repo.streaks.findCurrentForToday('2026-04-29');

      expect(result!.currentStreak).toBe(3);
      expect(result!.isOnGracePeriod).toBe(false);
    });

    it('reports grace period for a row 2 days stale', async () => {
      const graceRow = {
        id: 'streak-3',
        profileId: TEST_PROFILE_ID,
        currentStreak: 5,
        longestStreak: 5,
        lastActivityDate: '2026-04-27', // 2 days before today
        gracePeriodStartDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const findFirst = jest.fn().mockResolvedValue(graceRow);
      const db = {
        query: new Proxy(
          {},
          {
            get: () => ({
              findFirst,
              findMany: jest.fn().mockResolvedValue([]),
            }),
          },
        ),
      } as unknown as Database;

      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const result = await repo.streaks.findCurrentForToday('2026-04-29');

      // Still within grace window — streak is still 5
      expect(result!.currentStreak).toBe(5);
      expect(result!.isOnGracePeriod).toBe(true);
      expect(result!.graceDaysRemaining).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // sessionEvents — findMany only
  // ---------------------------------------------------------------------------

  describe('sessionEvents.findMany', () => {
    it('auto-injects profileId filter', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.sessionEvents.findMany();

      expect(findMany).toHaveBeenCalledWith({
        where: eq(sessionEvents.profileId, TEST_PROFILE_ID),
      });
    });

    it('composes profileId with extra condition', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const extra = sql`1 = 1`;

      await repo.sessionEvents.findMany(extra);

      expect(findMany).toHaveBeenCalledWith({
        where: and(eq(sessionEvents.profileId, TEST_PROFILE_ID), extra),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // needsDeepeningTopics — findMany only
  // ---------------------------------------------------------------------------

  describe('needsDeepeningTopics.findMany', () => {
    it('auto-injects profileId filter', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.needsDeepeningTopics.findMany();

      expect(findMany).toHaveBeenCalledWith({
        where: eq(needsDeepeningTopics.profileId, TEST_PROFILE_ID),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Shape: verify all namespaces are present
  // ---------------------------------------------------------------------------

  describe('repository shape', () => {
    it('exposes all domain namespaces', () => {
      const { db } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      expect(repo).toHaveProperty('sessions');
      expect(repo).toHaveProperty('subjects');
      expect(repo).toHaveProperty('assessments');
      expect(repo).toHaveProperty('retentionCards');
      expect(repo).toHaveProperty('xpLedger');
      expect(repo).toHaveProperty('streaks');
      expect(repo).toHaveProperty('sessionEvents');
      expect(repo).toHaveProperty('sessionSummaries');
      expect(repo).toHaveProperty('bookmarks');
      expect(repo).toHaveProperty('needsDeepeningTopics');
      expect(repo).toHaveProperty('parkingLotItems');
      expect(repo).toHaveProperty('teachingPreferences');
      expect(repo).toHaveProperty('curriculumAdaptations');
      expect(repo).toHaveProperty('onboardingDrafts');
      expect(repo).toHaveProperty('notificationPreferences');
      expect(repo).toHaveProperty('learningModes');
      expect(repo).toHaveProperty('sessionEmbeddings');
      expect(repo).toHaveProperty('quizRounds');
      expect(repo).toHaveProperty('quizMissedItems');
      expect(repo).toHaveProperty('pendingNotices');
      expect(repo).toHaveProperty('speakingPracticeAttempts');
    });
  });

  // ---------------------------------------------------------------------------
  // speakingPracticeAttempts (WI-1777)
  // ---------------------------------------------------------------------------

  describe('speakingPracticeAttempts.findMany', () => {
    it('auto-injects profileId filter', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.speakingPracticeAttempts.findMany();

      expect(findMany).toHaveBeenCalledWith({
        where: eq(speakingPracticeAttempts.profileId, TEST_PROFILE_ID),
      });
    });

    it('composes profileId with extra condition', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const extra = sql`1 = 1`;

      await repo.speakingPracticeAttempts.findMany(extra);

      expect(findMany).toHaveBeenCalledWith({
        where: and(
          eq(speakingPracticeAttempts.profileId, TEST_PROFILE_ID),
          extra,
        ),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-219 / P1-HIGH] progressSummaries scoped helpers — break test
  //
  // Before the fix, callers reached into `db.query.progressSummaries.*`
  // directly with their own where clauses, so a missed `profileId` predicate
  // would leak rows. The scoped helper enforces profileId in every call.
  // ---------------------------------------------------------------------------

  describe('[BUG-219] progressSummaries — profileId scoping', () => {
    it('findMany auto-injects profileId filter', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.progressSummaries.findMany();

      expect(findMany).toHaveBeenCalledWith({
        where: eq(progressSummaries.profileId, TEST_PROFILE_ID),
      });
    });

    it('findFirst auto-injects profileId filter', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.progressSummaries.findFirst();

      expect(findFirst).toHaveBeenCalledWith({
        where: eq(progressSummaries.profileId, TEST_PROFILE_ID),
      });
    });

    it('findFirst composes profileId with extra condition', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const extra = sql`1 = 1`;

      await repo.progressSummaries.findFirst(extra);

      expect(findFirst).toHaveBeenCalledWith({
        where: and(eq(progressSummaries.profileId, TEST_PROFILE_ID), extra),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-219 / P1-HIGH] milestones scoped helpers — break test
  // ---------------------------------------------------------------------------

  describe('[BUG-219] milestones — profileId scoping', () => {
    it('findMany auto-injects profileId filter', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.milestones.findMany();

      expect(findMany).toHaveBeenCalledWith({
        where: eq(milestones.profileId, TEST_PROFILE_ID),
      });
    });

    it('findById composes profileId with the id predicate', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.milestones.findById('milestone-1');

      // Must include BOTH the profileId scope AND the id predicate so a
      // caller cannot read a sibling profile's milestone by passing the
      // wrong id.
      expect(findFirst).toHaveBeenCalledWith({
        where: and(
          eq(milestones.profileId, TEST_PROFILE_ID),
          eq(milestones.id, 'milestone-1'),
        ),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-224 / P2-MED] pendingNotices scoped helpers — break test
  //
  // pendingNotices is keyed on ownerProfileId, not profileId, so it cannot
  // share scopedWhere(). The break test pins the predicate so a future
  // refactor that drops the ownerProfileId filter (or accidentally swaps it
  // for a `profileId` reference that does not exist on this table) will
  // fail CI.
  // ---------------------------------------------------------------------------

  describe('[BUG-224] pendingNotices — ownerProfileId scoping', () => {
    it('findMany auto-injects ownerProfileId filter', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.pendingNotices.findMany();

      expect(findMany).toHaveBeenCalledWith({
        where: eq(pendingNotices.ownerProfileId, TEST_PROFILE_ID),
      });
    });

    it('findById composes ownerProfileId with the id predicate', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.pendingNotices.findById('notice-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: and(
          eq(pendingNotices.ownerProfileId, TEST_PROFILE_ID),
          eq(pendingNotices.id, 'notice-1'),
        ),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-566 / P2-MOD] quizMissedItems.insertMany — sourceRoundId ownership
  //
  // The FK on source_round_id only guarantees the round exists in the DB, not
  // that it belongs to the current profile. A caller passing a cross-profile
  // sourceRoundId would silently create rows with an ownership mismatch.
  //
  // Break test: profile A tries to insert missed items with a sourceRoundId
  // that belongs to profile B (findFirst returns null for profile A's scope) →
  // the batch must be rejected and no rows inserted.
  // ---------------------------------------------------------------------------

  describe('[BUG-566] quizMissedItems.insertMany — cross-profile sourceRoundId rejected', () => {
    it('throws when sourceRoundId does not belong to this profileId', async () => {
      // findFirst returns null → round not found under profileId (profile B's round)
      const findFirst = jest.fn().mockResolvedValue(null);
      const insertFn = jest.fn();

      const db = {
        query: new Proxy(
          {},
          {
            get: () => ({
              findFirst,
              findMany: jest.fn().mockResolvedValue([]),
            }),
          },
        ),
        insert: jest.fn(() => ({
          values: jest.fn(() => ({
            returning: insertFn,
          })),
        })),
      } as unknown as Database;

      const PROFILE_A = '01933b3c-0000-7000-8000-000000000001';
      const PROFILE_B_ROUND = '01933b3c-ffff-7000-8000-000000000099';

      const repo = createScopedRepository(db, PROFILE_A);

      await expect(
        repo.quizMissedItems.insertMany([
          {
            activityType: 'capitals',
            questionText: 'What is the capital of France?',
            correctAnswer: 'Paris',
            sourceRoundId: PROFILE_B_ROUND,
          },
        ]),
      ).rejects.toThrow(/sourceRoundId.*does not belong to profileId/);

      // The insert must NOT have been called — batch aborted before DB write
      expect(insertFn).not.toHaveBeenCalled();
    });

    it('succeeds when all sourceRoundIds belong to this profileId', async () => {
      const ownRound = {
        id: 'round-owned-by-profile-a',
        profileId: TEST_PROFILE_ID,
      };
      const findFirst = jest.fn().mockResolvedValue(ownRound);
      const returningFn = jest
        .fn()
        .mockResolvedValue([{ id: 'missed-item-1' }]);

      const db = {
        query: new Proxy(
          {},
          {
            get: () => ({
              findFirst,
              findMany: jest.fn().mockResolvedValue([]),
            }),
          },
        ),
        insert: jest.fn(() => ({
          values: jest.fn(() => ({
            returning: returningFn,
          })),
        })),
      } as unknown as Database;

      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      const result = await repo.quizMissedItems.insertMany([
        {
          activityType: 'capitals',
          questionText: 'What is the capital of Germany?',
          correctAnswer: 'Berlin',
          sourceRoundId: ownRound.id,
        },
      ]);

      expect(result).toEqual([{ id: 'missed-item-1' }]);
      expect(returningFn).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-218 / P1-HIGH] topicSuggestions.findByBook — TOCTOU break test
  //
  // The pre-fix implementation issued two sequential queries:
  //   1. SELECT … FROM curriculum_books WHERE id = $1
  //   2. SELECT … FROM subjects WHERE id = $book.subjectId AND profile_id = $me
  //   3. SELECT … FROM topic_suggestions WHERE book_id = $1
  //
  // Between step 2 and step 3, the book's subject FK could be rewritten (or a
  // subject reparented) so that the read in step 3 returned rows the caller no
  // longer owned. The fix collapses ownership + read into ONE query.
  //
  // This test fails on the old two-query implementation (it would call
  // `db.query.curriculumBooks.findFirst` first) and passes on the new
  // single-query implementation (it calls `db.select().from(topicSuggestions)`
  // with both joins inside the same statement).
  // ---------------------------------------------------------------------------

  describe('[BUG-218] topicSuggestions.findByBook — single-query ownership', () => {
    it('issues exactly one SELECT (no TOCTOU window between ownership check and read)', async () => {
      const innerJoinCalls: unknown[][] = [];
      const whereCalls: unknown[][] = [];
      const fromCalls: unknown[][] = [];

      const chain: Record<string, unknown> = {};
      chain.select = jest.fn(() => chain);
      chain.from = jest.fn((...args: unknown[]) => {
        fromCalls.push(args);
        return chain;
      });
      chain.innerJoin = jest.fn((...args: unknown[]) => {
        innerJoinCalls.push(args);
        return chain;
      });
      chain.where = jest.fn((...args: unknown[]) => {
        whereCalls.push(args);
        return chain;
      });
      // Make the chain awaitable — drizzle resolves chained selects as thenables.
      (chain as { then?: unknown }).then = (
        onFulfilled: (v: unknown) => unknown,
      ) => Promise.resolve([]).then(onFulfilled);

      // query.curriculumBooks.findFirst would be the smoking gun for the
      // OLD two-query implementation — if it is ever called, the TOCTOU
      // window is back.
      const curriculumBooksFindFirst = jest.fn();
      const subjectsFindFirst = jest.fn();
      const topicSuggestionsFindMany = jest.fn();
      const db = {
        ...chain,
        query: {
          curriculumBooks: { findFirst: curriculumBooksFindFirst },
          subjects: { findFirst: subjectsFindFirst },
          topicSuggestions: { findMany: topicSuggestionsFindMany },
        },
      } as unknown as Database;

      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      await repo.topicSuggestions.findByBook('book-1');

      // Single SELECT chain — no separate ownership pre-check.
      expect(curriculumBooksFindFirst).not.toHaveBeenCalled();
      expect(subjectsFindFirst).not.toHaveBeenCalled();
      expect(topicSuggestionsFindMany).not.toHaveBeenCalled();

      // Joins both curriculum_books and subjects so ownership is enforced
      // inside the SQL alongside the row read.
      expect(fromCalls).toHaveLength(1);
      expect(innerJoinCalls).toHaveLength(2);
      expect(whereCalls).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // [CR-2026-05-21-168] memoryFacts.findCascadeAncestry — typed column names
  //
  // Before the fix:
  //   - The recursive CTE arm used raw string literals `m.superseded_by` and
  //     `m.profile_id` — a column rename silently returns wrong/empty rows.
  //   - `db.execute()` result was returned as-is (untyped), callers downcast freely.
  //
  // After the fix:
  //   - Column names are derived from `memoryFacts.supersededBy.name` and
  //     `memoryFacts.profileId.name` so renames propagate to the CTE.
  //   - Returned rows are cast to `MemoryFactRow[]` (compile-time type derived
  //     from `typeof memoryFacts.$inferSelect`) — no runtime dependency added.
  // ---------------------------------------------------------------------------

  describe('[CR-2026-05-21-168] memoryFacts.findCascadeAncestry — typed column names', () => {
    it('returns rows from db.execute as an array', async () => {
      const now = new Date().toISOString();
      const row = {
        id: '01933b3c-0000-7000-8000-000000000001',
        profile_id: TEST_PROFILE_ID,
        category: 'preference',
        text: 'Likes mathematics',
        text_normalized: 'likes mathematics',
        metadata: {},
        source_session_ids: [],
        source_event_ids: [],
        observed_at: now,
        superseded_by: null,
        superseded_at: null,
        embedding: null,
        confidence: 'medium' as const,
        created_at: now,
        updated_at: now,
      };

      const executeFn = jest.fn().mockResolvedValue({ rows: [row] });
      const db = {
        query: new Proxy(
          {},
          { get: () => ({ findFirst: jest.fn(), findMany: jest.fn() }) },
        ),
        execute: executeFn,
      } as unknown as Database;

      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const result = await repo.memoryFacts.findCascadeAncestry('fact-1');

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: row.id,
        profile_id: TEST_PROFILE_ID,
        category: 'preference',
        text: 'Likes mathematics',
      });
    });

    it('returns an empty array when the CTE finds no rows', async () => {
      const executeFn = jest.fn().mockResolvedValue({ rows: [] });
      const db = {
        query: new Proxy(
          {},
          { get: () => ({ findFirst: jest.fn(), findMany: jest.fn() }) },
        ),
        execute: executeFn,
      } as unknown as Database;

      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const result = await repo.memoryFacts.findCascadeAncestry('fact-1');

      expect(result).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// quizRounds.findByIdForUpdate — BUG-851 row-lock invariant [WI-350]
// ---------------------------------------------------------------------------

describe('quizRounds.findByIdForUpdate', () => {
  /**
   * Invariant: findByIdForUpdate must call .for('update') on the select chain.
   * Without the FOR UPDATE clause the row-lock is absent and concurrent
   * appendRecordedAttempt writes can slip between the SELECT and the subsequent
   * completion UPDATE — reintroducing the TOCTOU race fixed by BUG-851.
   * Callers must invoke this method as the FIRST operation inside db.transaction
   * (FOR UPDATE is a no-op when executed outside a transaction).
   */
  function makeSelectChain(returnRows: unknown[]) {
    // Each builder method in the Drizzle select chain returns `this` so we
    // can spy on the full call sequence.
    const forSpy = jest.fn();
    const limitFn = jest.fn().mockResolvedValue(returnRows);
    const forFn = jest.fn().mockReturnValue({ limit: limitFn });
    const whereFn = jest.fn().mockReturnValue({ for: forFn });
    const fromFn = jest.fn().mockReturnValue({ where: whereFn });
    const selectFn = jest.fn().mockReturnValue({ from: fromFn });

    const db = {
      query: new Proxy(
        {},
        { get: () => ({ findFirst: jest.fn(), findMany: jest.fn() }) },
      ),
      select: selectFn,
    } as unknown as Database;

    return { db, selectFn, fromFn, whereFn, forFn, forSpy, limitFn };
  }

  it('calls .for("update") on the select chain — FOR UPDATE clause is present', async () => {
    const roundId = 'round-1';
    const { db, forFn } = makeSelectChain([]);
    const repo = createScopedRepository(db, TEST_PROFILE_ID);

    await repo.quizRounds.findByIdForUpdate(roundId);

    expect(forFn).toHaveBeenCalledWith('update');
  });

  it('returns the first row when a matching round exists', async () => {
    const roundId = 'round-1';
    const mockRow = {
      id: roundId,
      profileId: TEST_PROFILE_ID,
      status: 'active',
    };
    const { db } = makeSelectChain([mockRow]);
    const repo = createScopedRepository(db, TEST_PROFILE_ID);

    const result = await repo.quizRounds.findByIdForUpdate(roundId);

    expect(result).toEqual(mockRow);
  });

  it('returns null when no row matches', async () => {
    const { db } = makeSelectChain([]);
    const repo = createScopedRepository(db, TEST_PROFILE_ID);

    const result = await repo.quizRounds.findByIdForUpdate('nonexistent-round');

    expect(result).toBeNull();
  });
});
