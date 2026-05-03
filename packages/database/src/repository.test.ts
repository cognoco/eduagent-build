import { eq, and, sql } from 'drizzle-orm';
import {
  profiles,
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
  consentStates,
  notificationPreferences,
  learningModes,
  sessionEmbeddings,
  quizRounds,
  quizMissedItems,
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
      }
    );

  return {
    findMany,
    findFirst,
    db: { query: makeQueryProxy() } as unknown as Database,
  };
}

const TEST_PROFILE_ID = '01933b3c-0000-7000-8000-000000000001';

// ---------------------------------------------------------------------------
// getProfile (backward compatibility)
// ---------------------------------------------------------------------------

describe('createScopedRepository', () => {
  it('exposes profileId and db', () => {
    const { db } = createMockDb();
    const repo = createScopedRepository(db, TEST_PROFILE_ID);

    expect(repo.profileId).toBe(TEST_PROFILE_ID);
    expect(repo.db).toBe(db);
  });

  describe('getProfile', () => {
    it('queries profiles by id', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await repo.getProfile();

      expect(findFirst).toHaveBeenCalledWith({
        where: eq(profiles.id, TEST_PROFILE_ID),
      });
    });
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
    ['consentStates', consentStates],
    ['notificationPreferences', notificationPreferences],
    ['learningModes', learningModes],
    ['sessionEmbeddings', sessionEmbeddings],
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
    ['consentStates', consentStates],
    ['notificationPreferences', notificationPreferences],
    ['learningModes', learningModes],
    ['sessionEmbeddings', sessionEmbeddings],
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
    ['consentStates', consentStates],
    ['notificationPreferences', notificationPreferences],
    ['learningModes', learningModes],
    ['sessionEmbeddings', sessionEmbeddings],
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
          }
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
          }
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
          }
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
      expect(repo).toHaveProperty('consentStates');
      expect(repo).toHaveProperty('notificationPreferences');
      expect(repo).toHaveProperty('learningModes');
      expect(repo).toHaveProperty('sessionEmbeddings');
      expect(repo).toHaveProperty('quizRounds');
      expect(repo).toHaveProperty('quizMissedItems');
    });
  });
});
