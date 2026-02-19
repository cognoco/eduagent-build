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
  needsDeepeningTopics,
  parkingLotItems,
  teachingPreferences,
  curriculumAdaptations,
  onboardingDrafts,
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
    ['parkingLotItems', parkingLotItems],
    ['teachingPreferences', teachingPreferences],
    ['curriculumAdaptations', curriculumAdaptations],
    ['onboardingDrafts', onboardingDrafts],
  ] as const)('%s.findMany', (namespace, table) => {
    it('auto-injects profileId filter', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await (
        repo as Record<
          string,
          { findMany: (w?: unknown) => Promise<unknown[]> }
        >
      )[namespace].findMany();

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
    ['parkingLotItems', parkingLotItems],
    ['teachingPreferences', teachingPreferences],
    ['curriculumAdaptations', curriculumAdaptations],
    ['onboardingDrafts', onboardingDrafts],
  ] as const)('%s.findMany with extraWhere', (namespace, table) => {
    it('composes profileId with extra condition', async () => {
      const { db, findMany } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const extraCondition = sql`1 = 1`;

      await (
        repo as Record<
          string,
          { findMany: (w?: unknown) => Promise<unknown[]> }
        >
      )[namespace].findMany(extraCondition);

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
    ['sessionSummaries', sessionSummaries],
    ['parkingLotItems', parkingLotItems],
    ['teachingPreferences', teachingPreferences],
    ['curriculumAdaptations', curriculumAdaptations],
    ['onboardingDrafts', onboardingDrafts],
  ] as const)('%s.findFirst', (namespace, table) => {
    it('auto-injects profileId filter', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);

      await (
        repo as Record<string, { findFirst: (w?: unknown) => Promise<unknown> }>
      )[namespace].findFirst();

      expect(findFirst).toHaveBeenCalledWith({
        where: eq(table.profileId, TEST_PROFILE_ID),
      });
    });

    it('composes profileId with extra condition', async () => {
      const { db, findFirst } = createMockDb();
      const repo = createScopedRepository(db, TEST_PROFILE_ID);
      const extraCondition = sql`1 = 1`;

      await (
        repo as Record<string, { findFirst: (w?: unknown) => Promise<unknown> }>
      )[namespace].findFirst(extraCondition);

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

      expect(repo.sessions).toBeDefined();
      expect(repo.subjects).toBeDefined();
      expect(repo.assessments).toBeDefined();
      expect(repo.retentionCards).toBeDefined();
      expect(repo.xpLedger).toBeDefined();
      expect(repo.streaks).toBeDefined();
      expect(repo.sessionEvents).toBeDefined();
      expect(repo.sessionSummaries).toBeDefined();
      expect(repo.needsDeepeningTopics).toBeDefined();
      expect(repo.parkingLotItems).toBeDefined();
      expect(repo.teachingPreferences).toBeDefined();
      expect(repo.curriculumAdaptations).toBeDefined();
      expect(repo.onboardingDrafts).toBeDefined();
    });
  });
});
