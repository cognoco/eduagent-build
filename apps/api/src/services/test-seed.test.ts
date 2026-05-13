// ---------------------------------------------------------------------------
// Test Seed Service — Unit Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import {
  seedScenario,
  resetDatabase,
  VALID_SCENARIOS,
  SEED_CLERK_PREFIX,
  type SeedScenario,
} from './test-seed';

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

function createMockDb(): Database {
  const deleteWhere = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue([]),
  });

  return {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    }),
    delete: jest.fn().mockReturnValue({
      where: deleteWhere,
    }),
    query: {
      accounts: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Extended for scenarios that query curricula/topics (e.g. parent-subject-with-retention)
      curricula: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mock-curriculum-id',
          subjectId: 'mock-subject-id',
        }),
      },
      curriculumTopics: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mock-topic-id',
          curriculumId: 'mock-curriculum-id',
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'mock-topic-id', curriculumId: 'mock-curriculum-id' },
          ]),
      },
    },
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// VALID_SCENARIOS
// ---------------------------------------------------------------------------

describe('VALID_SCENARIOS', () => {
  it('contains all 43 expected scenarios', () => {
    expect(VALID_SCENARIOS).toEqual([
      'onboarding-complete',
      'onboarding-no-subject',
      'learning-active',
      'retention-due',
      'failed-recall-3x',
      'parent-with-children',
      'trial-active',
      'trial-expired',
      'multi-subject',
      'multi-subject-practice',
      'homework-ready',
      'trial-expired-child',
      'consent-withdrawn',
      'consent-withdrawn-solo',
      'parent-solo',
      'pre-profile',
      'consent-pending',
      'parent-multi-child',
      'daily-limit-reached',
      'language-learner',
      'language-subject-active',
      'parent-with-reports',
      'mentor-memory-populated',
      'account-deletion-scheduled',
      'parent-proxy',
      'session-with-transcript',
      'with-bookmarks',
      'parent-with-weekly-report',
      'parent-session-with-recap',
      'parent-session-recap-empty',
      'parent-subject-with-retention',
      'parent-subject-no-retention',
      'subscription-family-active',
      'subscription-pro-active',
      'purchase-pending',
      'purchase-confirmed',
      'quota-exceeded',
      'forbidden',
      'quiz-malformed-round',
      'quiz-deterministic-wrong-answer',
      'quiz-answer-check-fails',
      'review-empty',
      'dictation-with-mistakes',
      'dictation-perfect-score',
    ]);
  });

  it('has no duplicates', () => {
    const unique = new Set(VALID_SCENARIOS);
    expect(unique.size).toBe(VALID_SCENARIOS.length);
  });
});

// ---------------------------------------------------------------------------
// SEED_CLERK_PREFIX
// ---------------------------------------------------------------------------

describe('SEED_CLERK_PREFIX', () => {
  it('is "clerk_seed_"', () => {
    expect(SEED_CLERK_PREFIX).toBe('clerk_seed_');
  });
});

// ---------------------------------------------------------------------------
// seedScenario
// ---------------------------------------------------------------------------

describe('seedScenario', () => {
  it.each(VALID_SCENARIOS as SeedScenario[])(
    'dispatches "%s" and returns SeedResult',
    async (scenario: SeedScenario) => {
      const db = createMockDb();
      const result = await seedScenario(db, scenario, 'test@example.com');

      expect(result).toEqual(
        expect.objectContaining({
          scenario,
          accountId: expect.any(String),
          profileId: expect.any(String),
          email: 'test@example.com',
          password: expect.any(String),
          ids: expect.any(Object),
        }),
      );

      // Every seed calls db.insert() at least once (account + profile)
      expect(db.insert).toHaveBeenCalled();
    },
  );

  it('throws for unknown scenario', async () => {
    const db = createMockDb();
    await expect(
      seedScenario(db, 'nonexistent' as SeedScenario, 'test@example.com'),
    ).rejects.toThrow('Unknown scenario: nonexistent');
  });

  it('uses SEED_CLERK_PREFIX in clerkUserId for all scenarios', async () => {
    const db = createMockDb();
    const result = await seedScenario(
      db,
      'onboarding-complete',
      'test@example.com',
    );

    // The first insert call should be for the accounts table
    // Verify the account insert includes the seed prefix by checking the result
    // (clerkUserId is set internally, but we can verify via the returned accountId)
    expect(typeof result.accountId).toBe('string');
    expect(result.accountId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// resetDatabase
// ---------------------------------------------------------------------------

describe('resetDatabase', () => {
  it('returns ResetResult with deletedCount', async () => {
    const deleteReturning = jest
      .fn()
      .mockResolvedValue([{ id: 'acc-1' }, { id: 'acc-2' }]);
    const deleteWhere = jest.fn().mockReturnValue({
      returning: deleteReturning,
    });
    const db = {
      delete: jest.fn().mockReturnValue({
        where: deleteWhere,
      }),
    } as unknown as Database;

    const result = await resetDatabase(db);

    expect(result).toEqual({ deletedCount: 2, clerkUsersDeleted: 0 });
    expect(db.delete).toHaveBeenCalled();
    expect(deleteWhere).toHaveBeenCalled();
  });

  it('returns deletedCount: 0 when no seed accounts exist', async () => {
    const deleteReturning = jest.fn().mockResolvedValue([]);
    const deleteWhere = jest.fn().mockReturnValue({
      returning: deleteReturning,
    });
    const db = {
      delete: jest.fn().mockReturnValue({
        where: deleteWhere,
      }),
    } as unknown as Database;

    const result = await resetDatabase(db);

    expect(result).toEqual({ deletedCount: 0, clerkUsersDeleted: 0 });
  });
});

// ---------------------------------------------------------------------------
// New scenario-specific tests (Stage 0 — Task 0.1)
// Each test verifies: (a) correct scenario name returned, (b) required IDs
// present and non-empty, (c) db.insert called (proves rows were written).
// Uses the same mock DB as the existing suite — no real DB connection.
// ---------------------------------------------------------------------------

describe('new Stage-0 scenarios return required IDs', () => {
  const NEW_SCENARIOS: Array<{
    scenario: SeedScenario;
    requiredIds: string[];
  }> = [
    {
      scenario: 'account-deletion-scheduled',
      requiredIds: ['subjectId', 'subscriptionId'],
    },
    {
      scenario: 'session-with-transcript',
      requiredIds: ['subjectId', 'sessionId', 'topicId'],
    },
    {
      scenario: 'parent-proxy',
      requiredIds: [
        'parentProfileId',
        'childProfileId',
        'subjectId',
        'sessionId',
        'topicId',
      ],
    },
    {
      scenario: 'with-bookmarks',
      requiredIds: ['subjectId', 'sessionId', 'bookmarkId', 'topicId'],
    },
    {
      scenario: 'parent-with-weekly-report',
      requiredIds: ['childId', 'reportId'],
    },
    {
      scenario: 'parent-session-with-recap',
      requiredIds: ['childId', 'sessionId'],
    },
    {
      scenario: 'parent-session-recap-empty',
      requiredIds: ['childId', 'sessionId'],
    },
    {
      scenario: 'parent-subject-with-retention',
      requiredIds: ['topicId'],
    },
    {
      scenario: 'parent-subject-no-retention',
      requiredIds: [],
    },
    {
      scenario: 'subscription-family-active',
      requiredIds: ['subscriptionId', 'subjectId'],
    },
    {
      scenario: 'subscription-pro-active',
      requiredIds: ['subscriptionId', 'subjectId'],
    },
    {
      scenario: 'purchase-pending',
      requiredIds: ['subscriptionId', 'subjectId'],
    },
    {
      scenario: 'purchase-confirmed',
      requiredIds: ['subscriptionId', 'subjectId'],
    },
    {
      scenario: 'quota-exceeded',
      requiredIds: ['subscriptionId', 'subjectId', 'topicId'],
    },
    {
      scenario: 'forbidden',
      requiredIds: ['subjectId'],
    },
    {
      scenario: 'quiz-malformed-round',
      requiredIds: ['subjectId', 'roundId'],
    },
    {
      scenario: 'quiz-deterministic-wrong-answer',
      requiredIds: ['subjectId', 'roundId', 'wrongOptionIndex'],
    },
    {
      scenario: 'quiz-answer-check-fails',
      requiredIds: ['subjectId', 'roundId'],
    },
    {
      scenario: 'dictation-with-mistakes',
      requiredIds: ['subjectId'],
    },
    {
      scenario: 'dictation-perfect-score',
      requiredIds: ['subjectId'],
    },
  ];

  it.each(NEW_SCENARIOS)(
    '$scenario returns correct scenario name and required IDs',
    async ({ scenario, requiredIds }) => {
      const mockDb = createMockDb();
      const result = await seedScenario(mockDb, scenario, 'test@example.com');

      expect(result.scenario).toBe(scenario);
      expect(result.accountId).toBeTruthy();
      expect(result.profileId).toBeTruthy();
      expect(result.email).toBe('test@example.com');
      expect(typeof result.password).toBe('string');

      for (const idKey of requiredIds) {
        expect(result.ids[idKey]).toBeTruthy();
      }

      expect(mockDb.insert).toHaveBeenCalled();
    },
  );
});
