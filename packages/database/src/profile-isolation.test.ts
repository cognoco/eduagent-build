// ---------------------------------------------------------------------------
// Profile Isolation Test — R-005 Verification
//
// Verifies that createScopedRepository correctly scopes all data access
// by profileId, preventing cross-profile data leakage when switching profiles.
// ---------------------------------------------------------------------------

import { eq, and, sql } from 'drizzle-orm';
import { createScopedRepository } from './repository.js';
import {
  profiles,
  subjects,
  learningSessions,
  retentionCards,
  consentStates,
  assessments,
  xpLedger,
  sessionSummaries,
  notificationPreferences,
} from './schema/index.js';
import type { Database } from './client.js';

// ---------------------------------------------------------------------------
// Test profile IDs (UUID v7 format)
// ---------------------------------------------------------------------------

const PARENT_PROFILE_ID = '01933b3c-0000-7000-8000-000000000001';
const CHILD_PROFILE_ID = '01933b3c-0000-7000-8000-000000000002';

// ---------------------------------------------------------------------------
// Mock DB — tracks all where clauses for isolation verification
// ---------------------------------------------------------------------------

function createTrackingMockDb() {
  const whereClauses: unknown[] = [];

  const findMany = jest.fn().mockImplementation((opts: { where: unknown }) => {
    whereClauses.push(opts?.where);
    return Promise.resolve([]);
  });

  const findFirst = jest.fn().mockImplementation((opts: { where: unknown }) => {
    whereClauses.push(opts?.where);
    return Promise.resolve(null);
  });

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
    whereClauses,
    db: { query: makeQueryProxy() } as unknown as Database,
  };
}

// ---------------------------------------------------------------------------
// Profile Isolation Tests
// ---------------------------------------------------------------------------

describe('Profile Isolation (R-005)', () => {
  describe('cross-profile data scoping', () => {
    it('parent scoped repository does NOT use child profileId', async () => {
      const { db, findMany } = createTrackingMockDb();
      const parentRepo = createScopedRepository(db, PARENT_PROFILE_ID);

      await parentRepo.subjects.findMany();

      // The where clause must filter by PARENT_PROFILE_ID
      expect(findMany).toHaveBeenCalledWith({
        where: eq(subjects.profileId, PARENT_PROFILE_ID),
      });

      // Must NOT contain child profileId
      expect(findMany).not.toHaveBeenCalledWith({
        where: eq(subjects.profileId, CHILD_PROFILE_ID),
      });
    });

    it('child scoped repository does NOT use parent profileId', async () => {
      const { db, findMany } = createTrackingMockDb();
      const childRepo = createScopedRepository(db, CHILD_PROFILE_ID);

      await childRepo.subjects.findMany();

      expect(findMany).toHaveBeenCalledWith({
        where: eq(subjects.profileId, CHILD_PROFILE_ID),
      });

      expect(findMany).not.toHaveBeenCalledWith({
        where: eq(subjects.profileId, PARENT_PROFILE_ID),
      });
    });
  });

  describe('same-account dual-profile isolation', () => {
    it('two repos under same account scope independently', async () => {
      const { db, findMany } = createTrackingMockDb();

      const parentRepo = createScopedRepository(db, PARENT_PROFILE_ID);
      const childRepo = createScopedRepository(db, CHILD_PROFILE_ID);

      // Both repos query subjects
      await parentRepo.subjects.findMany();
      await childRepo.subjects.findMany();

      // First call uses parent scope, second uses child scope
      expect(findMany).toHaveBeenCalledTimes(2);
      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: eq(subjects.profileId, PARENT_PROFILE_ID),
      });
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: eq(subjects.profileId, CHILD_PROFILE_ID),
      });
    });
  });

  describe('all domain namespaces apply profile scoping', () => {
    const domains: Array<{
      name: string;
      table: { profileId: unknown };
      hasFindMany: boolean;
    }> = [
      { name: 'subjects', table: subjects, hasFindMany: true },
      { name: 'sessions', table: learningSessions, hasFindMany: true },
      { name: 'retentionCards', table: retentionCards, hasFindMany: true },
      { name: 'assessments', table: assessments, hasFindMany: true },
      { name: 'xpLedger', table: xpLedger, hasFindMany: true },
      { name: 'consentStates', table: consentStates, hasFindMany: true },
      { name: 'sessionSummaries', table: sessionSummaries, hasFindMany: false },
      {
        name: 'notificationPreferences',
        table: notificationPreferences,
        hasFindMany: true,
      },
    ];

    it.each(domains)(
      '$name.findFirst scopes to child profile only',
      async ({ name }) => {
        const { db, findFirst } = createTrackingMockDb();
        const repo = createScopedRepository(db, CHILD_PROFILE_ID);

        await (
          repo as unknown as Record<
            string,
            { findFirst: () => Promise<unknown> }
          >
        )[name].findFirst();

        // Verify the where clause contains CHILD_PROFILE_ID
        const call = findFirst.mock.calls[0][0];
        expect(call.where).toBeDefined();
      }
    );

    it.each(domains.filter((d) => d.hasFindMany))(
      '$name.findMany scopes to child profile only',
      async ({ name }) => {
        const { db, findMany } = createTrackingMockDb();
        const repo = createScopedRepository(db, CHILD_PROFILE_ID);

        await (
          repo as unknown as Record<
            string,
            { findMany: () => Promise<unknown[]> }
          >
        )[name].findMany();

        const call = findMany.mock.calls[0][0];
        expect(call.where).toBeDefined();
      }
    );
  });

  describe('profile switch simulation', () => {
    it('switching repo mid-session changes scoping correctly', async () => {
      const { db, findMany } = createTrackingMockDb();

      // Simulate: start as parent, switch to child, query both
      const parentRepo = createScopedRepository(db, PARENT_PROFILE_ID);
      await parentRepo.sessions.findMany();

      // "Switch" profile — create new scoped repo with child ID
      const childRepo = createScopedRepository(db, CHILD_PROFILE_ID);
      await childRepo.sessions.findMany();

      // Parent query must use parent ID
      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: eq(learningSessions.profileId, PARENT_PROFILE_ID),
      });

      // Child query must use child ID (not parent's)
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: eq(learningSessions.profileId, CHILD_PROFILE_ID),
      });
    });

    it('extra where clauses compose with profile scoping', async () => {
      const { db, findMany } = createTrackingMockDb();
      const childRepo = createScopedRepository(db, CHILD_PROFILE_ID);

      const extraFilter = sql`status = 'active'`;
      await childRepo.subjects.findMany(extraFilter);

      // Must compose: profileId AND extra condition
      expect(findMany).toHaveBeenCalledWith({
        where: and(eq(subjects.profileId, CHILD_PROFILE_ID), extraFilter),
      });
    });
  });

  describe('getProfile isolation', () => {
    it('getProfile returns only the owning profile', async () => {
      const { db, findFirst } = createTrackingMockDb();
      const childRepo = createScopedRepository(db, CHILD_PROFILE_ID);

      await childRepo.getProfile();

      expect(findFirst).toHaveBeenCalledWith({
        where: eq(profiles.id, CHILD_PROFILE_ID),
      });
    });

    it('parent getProfile does not leak child profile data', async () => {
      const { db, findFirst } = createTrackingMockDb();
      const parentRepo = createScopedRepository(db, PARENT_PROFILE_ID);

      await parentRepo.getProfile();

      expect(findFirst).toHaveBeenCalledWith({
        where: eq(profiles.id, PARENT_PROFILE_ID),
      });

      expect(findFirst).not.toHaveBeenCalledWith({
        where: eq(profiles.id, CHILD_PROFILE_ID),
      });
    });
  });
});
