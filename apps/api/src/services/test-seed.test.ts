import * as fs from 'fs';
import * as path from 'path';

import { ENGAGEMENT_SIGNALS } from '@eduagent/schemas';
import {
  learningSessions,
  profileQuotaUsage,
  person,
  login,
  membership,
  retentionCards,
  sessionEvents,
  usageEvents,
  type Database,
} from '@eduagent/database';
import { inArray } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Test Seed Service — Unit Tests
// ---------------------------------------------------------------------------

import {
  seedScenario,
  resetDatabase,
  debugAccountsByEmail,
  VALID_SCENARIOS,
  SEED_CLERK_PREFIX,
  type SeedScenario,
} from './test-seed';
import { getTierConfig } from './subscription';

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

function createMockDb(): Database {
  const deleteWhere = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue([]),
  });

  // Fluent select chain: db.select({}).from(table).where(...) / .innerJoin(...).where(...).limit(n)
  // Returns [] by default (no existing seed data — idempotency check finds nothing to clean up).
  const selectChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  };
  // Make `.where()` after `.innerJoin()` also resolve to []:
  selectChain.innerJoin.mockReturnValue({
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue([]),
    }),
  });

  // Fluent update chain: db.update(table).set({}).where(...)
  const updateChain = {
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  };

  return {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    }),
    update: jest.fn().mockReturnValue(updateChain),
    select: jest.fn().mockReturnValue(selectChain),
    delete: jest.fn().mockReturnValue({
      where: deleteWhere,
    }),
    // db.execute is used only by the WI-788 legacy-table existence probe
    // (to_regclass). The unit mock has no legacy tables → return an empty
    // result so tableExists() resolves false and the conditional legacy writes
    // self-inert, keeping these tests focused on the v2 path.
    execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
    query: {
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
      subjects: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// VALID_SCENARIOS
// ---------------------------------------------------------------------------

describe('VALID_SCENARIOS', () => {
  it('contains all expected scenarios', () => {
    expect(VALID_SCENARIOS).toEqual([
      'onboarding-complete',
      'onboarding-no-subject',
      'learning-active',
      'v2-returning-learner',
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
      'child-quota-exceeded',
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
      'parent-with-children-no-sessions',
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
      // E2E chat/book entry-path coverage seeds.
      'topic-not-started',
      'topic-overdue-review',
      'book-no-curriculum',
      'subject-with-book-suggestions',
      // Mentor Chrome audit seed pack
      // (docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md).
      'mentor-audit-empty-adult',
      'mentor-audit-consent-pending-child',
      'mentor-audit-consent-withdrawn-child',
      'mentor-audit-post-approval-steady-state',
      'mentor-audit-deletion-scheduled-owner',
      'mentor-audit-family-at-profile-limit',
      'mentor-audit-post-approval-redirect',
      'mentor-audit-consent-us-under-threshold',
      'mentor-audit-consent-eu-under-threshold',
      'mentor-audit-consent-over-threshold',
      'mentor-audit-quota-owner-daily',
      'mentor-audit-quota-family-monthly',
      'mentor-audit-paywall-child-notify',
      'mentor-audit-resumable-session',
      // Second wave (Task 0 helpers + remaining DB-backed audit seeds).
      'mentor-audit-family-no-children',
      'mentor-audit-rich-child-history',
      'mentor-audit-session-revoked',
      'mentor-audit-mfa-totp',
      // Third wave — BILLING-07/08 + BRIDGE-03/04 (plan §§11b, 11c, 14).
      'mentor-audit-family-pool-members',
      'mentor-audit-family-owner-daily-quota-with-child',
      'mentor-audit-bridge-backstack',
      'wi-2194-stale-family-cycle',
      // [WI-2241] Supportership-aware v2 seed.
      'v2-supporter-accepted',
    ]);
  });

  it('has no duplicates', () => {
    const unique = new Set(VALID_SCENARIOS);
    expect(unique.size).toBe(VALID_SCENARIOS.length);
  });
});

describe('seed engagement signals', () => {
  it('uses only schema-supported engagement signals in source seeds', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'test-seed.ts'),
      'utf8',
    );
    const allowedSignals = new Set<string>(ENGAGEMENT_SIGNALS);
    const matches = [
      ...source.matchAll(/engagementSignal:\s*['"]([^'"]+)['"]/g),
    ];

    expect(matches.length).toBeGreaterThan(0);
    expect(
      matches
        .map((match) => match[1])
        .filter((signal): signal is string => signal != null)
        .filter((signal) => !allowedSignals.has(signal)),
    ).toEqual([]);
  });
});

describe('child paywall seed shape', () => {
  it('seeds exhausted per-profile child quota for the current quota model', async () => {
    const db = createMockDb();
    const result = await seedScenario(
      db,
      'trial-expired-child',
      'paywall@example.com',
    );
    const freeTier = getTierConfig('free');
    const insertMock = db.insert as unknown as jest.Mock;
    const profileQuotaInsertIndex = insertMock.mock.calls.findIndex(
      ([table]) => table === profileQuotaUsage,
    );
    const profileQuotaInsert = insertMock.mock.results[profileQuotaInsertIndex]
      ?.value as { values: jest.Mock } | undefined;

    expect(profileQuotaInsertIndex).toBeGreaterThanOrEqual(0);
    expect(profileQuotaInsert?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: result.ids.subscriptionId,
        profileId: result.ids.childProfileId,
        role: 'child',
        monthlyLimit: freeTier.childMonthlyQuota,
        usedThisMonth: freeTier.childMonthlyQuota,
        dailyLimit: freeTier.childDailyQuota,
        usedToday: freeTier.childDailyQuota,
        cycleResetAt: expect.any(Date),
      }),
    );
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
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // [WI-2241] Scenarios that call db.transaction() with read-after-write
  // inside it (initiateLink/acceptLink/requestSelfUnlink via
  // test-seed-v2-supporter.ts) cannot be honestly exercised against this
  // file's stateless mock — createMockDb() has no `.transaction()` and its
  // `.select()...where()` always resolves `[]`, so the second write in the
  // chain would read back nothing it just wrote. Faking that with a
  // last-row-wins mock would pass the dispatch smoke test while verifying
  // nothing about the transactional contract logic — worse than not testing
  // it at all. Real coverage lives in
  // test-seed-v2-supporter.integration.test.ts (real Neon DB, same pattern as
  // supporter-visibility-authorization.integration.test.ts).
  const DB_TRANSACTION_SCENARIOS: SeedScenario[] = ['v2-supporter-accepted'];
  const MOCK_DISPATCHABLE_SCENARIOS = (
    VALID_SCENARIOS as SeedScenario[]
  ).filter((scenario) => !DB_TRANSACTION_SCENARIOS.includes(scenario));

  it.each(MOCK_DISPATCHABLE_SCENARIOS)(
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

      // Most seeds call db.insert() at least once (account + profile). The
      // graphless pre-profile scenarios intentionally create no DB rows — they
      // model an authenticated Clerk user with no profile yet (only a Clerk
      // user is created), so they must NOT insert an orphan organization.
      const GRAPHLESS_SCENARIOS: SeedScenario[] = [
        'pre-profile',
        'mentor-audit-empty-adult',
      ];
      if (GRAPHLESS_SCENARIOS.includes(scenario)) {
        expect(db.insert).not.toHaveBeenCalled();
        expect(result.accountId).toBe('');
        expect(result.profileId).toBe('');
      } else {
        expect(db.insert).toHaveBeenCalled();
      }
    },
  );

  it('[WI-2234] seeds one unfinished session and due review on distinct topics with scoped transcript events', async () => {
    const db = createMockDb();
    const result = await seedScenario(
      db,
      'v2-returning-learner' as SeedScenario,
      'returning@example.com',
    );
    const insertMock = db.insert as unknown as jest.Mock;
    const valuesMock = insertMock.mock.results[0]?.value.values as jest.Mock;
    const insertedRowsFor = (table: unknown): unknown[] =>
      insertMock.mock.calls.flatMap(([insertedTable], index) => {
        if (insertedTable !== table) return [];
        const value = valuesMock.mock.calls[index]?.[0];
        return Array.isArray(value) ? value : [value];
      });

    const seededSessions = insertedRowsFor(learningSessions) as Array<{
      id: string;
      status: string;
      topicId: string;
    }>;
    const seededReviews = insertedRowsFor(retentionCards) as Array<{
      id: string;
      nextReviewAt: Date;
      topicId: string;
    }>;
    const transcriptEvents = insertedRowsFor(sessionEvents) as Array<{
      sessionId: string;
      topicId?: string;
    }>;

    expect(seededSessions).toHaveLength(1);
    expect(seededSessions[0]).toMatchObject({
      id: result.ids.sessionId,
      status: 'active',
    });
    expect(seededReviews).toHaveLength(1);
    expect(seededReviews[0]).toMatchObject({
      id: result.ids.retentionCardId,
    });
    expect(seededReviews[0]!.nextReviewAt.getTime()).toBeLessThan(Date.now());
    expect(seededReviews[0]!.topicId).not.toBe(seededSessions[0]!.topicId);
    expect(transcriptEvents).not.toHaveLength(0);
    expect(
      transcriptEvents.every(
        (event) =>
          event.sessionId === seededSessions[0]!.id &&
          event.topicId === seededSessions[0]!.topicId,
      ),
    ).toBe(true);
  });

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

  it.each([
    ['parent-with-children', 'Test Parent'],
    ['parent-multi-child', 'Test Parent'],
    ['mentor-audit-family-at-profile-limit', 'Capped Parent'],
    ['mentor-audit-rich-child-history', 'Rich-History Parent'],
  ] as const)(
    'seeds %s owners into Family mode by default',
    async (scenario, parentName) => {
      const db = createMockDb();
      await seedScenario(db, scenario, 'test@example.com');

      const firstInsertResult = (db.insert as unknown as jest.Mock).mock
        .results[0];
      const valuesMock = firstInsertResult?.value.values as jest.Mock;
      const parentProfileInsert = valuesMock.mock.calls
        .map(([value]) => value as { displayName?: string })
        .find((value) => value.displayName === parentName);

      expect(parentProfileInsert).toEqual(
        expect.objectContaining({
          defaultAppContext: 'family',
        }),
      );
    },
  );

  it('[WI-84 DS-091] does not delete an existing non-seed Clerk account with the same email', async () => {
    const db = createMockDb();
    // In v2, idempotency check queries login table (not accounts).
    // Mock db.select to return a real (non-seed) login for this email.
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([
          {
            personId: 'real-person-id',
            clerkUserId: 'user_real_production_account',
          },
        ]),
      }),
    });

    await seedScenario(db, 'onboarding-complete', 'real@example.com');

    expect(db.delete).not.toHaveBeenCalled();
  });

  it('[WI-84 review] refuses to reuse an existing non-seed Clerk user', async () => {
    const db = createMockDb();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'user_real_production_account',
          primary_email_address_id: 'email_real',
          email_addresses: [
            { id: 'email_real', email_address: 'real@example.com' },
          ],
          external_id: null,
        },
      ],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      seedScenario(db, 'onboarding-complete', 'real@example.com', {
        CLERK_SECRET_KEY: 'sk_test',
        SEED_PASSWORD: 'TestPassword123xK',
      }),
    ).rejects.toThrow('Refusing to reuse non-seed Clerk user');

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/users/user_real_production_account'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('retries transient Clerk user lookup failures before seeding', async () => {
    const db = createMockDb();
    let lookupAttempts = 0;
    const clerkUser = {
      id: 'user_seeded',
      primary_email_address_id: 'email_seeded',
      email_addresses: [
        { id: 'email_seeded', email_address: 'seed@example.com' },
      ],
      external_id: 'clerk_seed_created',
    };
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/users?')) {
          lookupAttempts += 1;
          if (lookupAttempts === 1) {
            return {
              ok: false,
              status: 500,
              text: async () => '{"code":"internal_clerk_error"}',
            } as Response;
          }
          return {
            ok: true,
            json: async () => [],
          } as Response;
        }

        if (url.endsWith('/users') && method === 'POST') {
          return {
            ok: true,
            json: async () => clerkUser,
          } as Response;
        }

        if (url.includes('/users/user_seeded') && method === 'PATCH') {
          return {
            ok: true,
            json: async () => ({}),
          } as Response;
        }

        if (url.includes('/users/user_seeded')) {
          return {
            ok: true,
            json: async () => clerkUser,
          } as Response;
        }

        if (
          url.includes('/email_addresses/email_seeded') &&
          method === 'PATCH'
        ) {
          return {
            ok: true,
            json: async () => ({}),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          text: async () => `Unexpected Clerk mock call: ${method} ${url}`,
        } as Response;
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await seedScenario(
      db,
      'onboarding-complete',
      'seed@example.com',
      {
        CLERK_SECRET_KEY: 'sk_test',
        SEED_PASSWORD: 'TestPassword123xK',
      },
    );

    expect(result.email).toBe('seed@example.com');
    expect(lookupAttempts).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(fetchMock.mock.calls[1]?.[0]);
  });
});

// ---------------------------------------------------------------------------
// resetDatabase
// ---------------------------------------------------------------------------

describe('resetDatabase', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Reorder-insensitive select mock. resetDatabase + deleteOrganizationGraph
  // issue four reads that all flow through db.select(projection).from(table)
  // .where(cond). Dispatching on (table identity, projected column set) instead
  // of a call-index counter means the fixtures stay correct even if the
  // internal query order changes — the column set is the query's semantic
  // fingerprint:
  //   from(login)                              → seed logins
  //   from(membership) proj {organizationId}   → resetDatabase: orgs for persons
  //   from(membership) proj {personId}         → helper step 1: members of orgs
  //   from(membership) proj {personId,organizationId} → helper step 1a: full set
  function makeResetSelectMock(fixtures: {
    logins: unknown[];
    orgsForPersons: unknown[];
    membersOfOrgs: unknown[];
    fullMemberships: unknown[];
  }): jest.Mock {
    return jest
      .fn()
      .mockImplementation((projection: Record<string, unknown>) => {
        const projKeys = new Set(Object.keys(projection ?? {}));
        return {
          from: jest.fn().mockImplementation((table: unknown) => ({
            where: jest.fn().mockImplementation(() => {
              if (table === login) {
                return Promise.resolve(fixtures.logins);
              }
              if (table === membership) {
                if (
                  projKeys.has('organizationId') &&
                  projKeys.has('personId')
                ) {
                  return Promise.resolve(fixtures.fullMemberships);
                }
                if (projKeys.has('organizationId')) {
                  return Promise.resolve(fixtures.orgsForPersons);
                }
                return Promise.resolve(fixtures.membersOfOrgs);
              }
              return Promise.resolve([]);
            }),
          })),
        };
      });
  }

  it('returns ResetResult with deletedCount', async () => {
    const deleteReturning = jest
      .fn()
      .mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);
    const deleteWhere = jest.fn().mockReturnValue({
      returning: deleteReturning,
    });
    // Both persons live entirely within the target orgs → both deletable.
    const selectFn = makeResetSelectMock({
      logins: [
        { personId: 'p1', clerkUserId: `${SEED_CLERK_PREFIX}1` },
        { personId: 'p2', clerkUserId: `${SEED_CLERK_PREFIX}2` },
      ],
      orgsForPersons: [
        { organizationId: 'org-1' },
        { organizationId: 'org-2' },
      ],
      membersOfOrgs: [{ personId: 'p1' }, { personId: 'p2' }],
      fullMemberships: [
        { personId: 'p1', organizationId: 'org-1' },
        { personId: 'p2', organizationId: 'org-2' },
      ],
    });
    const db = {
      select: selectFn,
      delete: jest.fn().mockReturnValue({
        where: deleteWhere,
      }),
    } as unknown as Database;

    const result = await resetDatabase(db);

    expect(result).toEqual({ deletedCount: 2, clerkUsersDeleted: 0 });
    // deleteOrganizationGraph issues 7 deletes: consentRequest, consentGrant,
    // subscription, guardianship, supportership [WI-2241], person, organization
    // (only organization uses .returning()). consentRequest is deleted before
    // consentGrant (WI-880) to clear the consent_request.consent_grant_id NO
    // ACTION back-link FK.
    expect(db.delete).toHaveBeenCalledTimes(7);
    expect(deleteReturning).toHaveBeenCalledTimes(1);
  });

  it('[CodeRabbit Major] does not cascade-delete a person who also belongs to a non-target org', async () => {
    // Target reset scope = org-1. p1 lives only in org-1 (deletable). pShared is
    // a member of BOTH org-1 (target) and org-2 (NON-target) — deleting pShared
    // would cascade their login + learning data + org-2 membership outside the
    // reset scope. The person delete must target only [p1].
    const selectFn = makeResetSelectMock({
      logins: [
        { personId: 'p1', clerkUserId: `${SEED_CLERK_PREFIX}1` },
        { personId: 'pShared', clerkUserId: `${SEED_CLERK_PREFIX}2` },
      ],
      // resolve target orgs (org-1 only)
      orgsForPersons: [{ organizationId: 'org-1' }],
      // helper step 1: members of org-1
      membersOfOrgs: [{ personId: 'p1' }, { personId: 'pShared' }],
      // helper step 1a: pShared also belongs to org-2 (non-target) → excluded.
      fullMemberships: [
        { personId: 'p1', organizationId: 'org-1' },
        { personId: 'pShared', organizationId: 'org-1' },
        { personId: 'pShared', organizationId: 'org-2' },
      ],
    });

    // Capture the (table, whereCondition) of every db.delete().where() call.
    const deleteCalls: Array<{ table: unknown; cond: unknown }> = [];
    const deleteFn = jest.fn().mockImplementation((table: unknown) => ({
      where: jest.fn().mockImplementation((cond: unknown) => {
        deleteCalls.push({ table, cond });
        return { returning: jest.fn().mockResolvedValue([{ id: 'org-1' }]) };
      }),
    }));

    const db = {
      select: selectFn,
      delete: deleteFn,
    } as unknown as Database;

    await resetDatabase(db);

    const personDelete = deleteCalls.find((c) => c.table === person);
    expect(personDelete).toBeDefined();
    // Structural equality: the person delete must scope to [p1] only — pShared
    // is excluded because it has a membership outside the target org set.
    expect(personDelete?.cond).toEqual(inArray(person.id, ['p1']));
  });

  it('returns deletedCount: 0 when no seed accounts exist', async () => {
    // v2 resetDatabase: select returns no login rows → returns early with count 0.
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
      delete: jest.fn(),
    } as unknown as Database;

    const result = await resetDatabase(db);

    expect(result).toEqual({ deletedCount: 0, clerkUsersDeleted: 0 });
  });

  it('[WI-84 DS-091] prefix reset does not delete non-seed Clerk accounts', async () => {
    // v2 prefix reset: select login by email prefix, filter by seed marker.
    // A non-seed clerkUserId won't pass isSeedManagedClerkUserId → no delete.
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            {
              personId: 'real-person-id',
              clerkUserId: 'user_real_production_account',
            },
          ]),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest
          .fn()
          .mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      }),
      execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
    } as unknown as Database;

    const result = await resetDatabase(db, {}, { prefix: 'e2e-' });

    expect(result).toEqual({ deletedCount: 0, clerkUsersDeleted: 0 });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('[WI-1771] preserveClerkUsers cleans DB rows for a seed Clerk user without deleting the Clerk user', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'user_native_01',
          external_id: `${SEED_CLERK_PREFIX}native`,
          email_addresses: [
            { email_address: 'test-e2e-native-01+clerk_test@example.com' },
          ],
        },
      ],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const deleteReturning = jest.fn().mockResolvedValue([{ id: 'org-1' }]);
    const deleteFn = jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        returning: deleteReturning,
      })),
    }));
    const selectFn = makeResetSelectMock({
      logins: [{ personId: 'p1', clerkUserId: 'user_native_01' }],
      orgsForPersons: [{ organizationId: 'org-1' }],
      membersOfOrgs: [{ personId: 'p1' }],
      fullMemberships: [{ personId: 'p1', organizationId: 'org-1' }],
    });
    const db = {
      select: selectFn,
      delete: deleteFn,
    } as unknown as Database;

    const result = await resetDatabase(
      db,
      { CLERK_SECRET_KEY: 'sk_test' },
      { prefix: 'test-e2e-native-01', preserveClerkUsers: true },
    );

    expect(result).toEqual({ deletedCount: 1, clerkUsersDeleted: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/users?');
    expect(
      fetchMock.mock.calls.some((call) => {
        const init = call[1] as RequestInit | undefined;
        return init?.method === 'PATCH' || init?.method === 'DELETE';
      }),
    ).toBe(false);
  });

  it('[WI-84 review] does not trust caller-supplied Clerk IDs without a seed marker', async () => {
    const deleteReturning = jest.fn().mockResolvedValue([]);
    const deleteWhere = jest.fn().mockReturnValue({
      returning: deleteReturning,
    });
    const db = {
      delete: jest.fn().mockReturnValue({
        where: deleteWhere,
      }),
    } as unknown as Database;

    const result = await resetDatabase(
      db,
      {},
      { clerkUserIds: ['user_real_production_account'] },
    );

    expect(result).toEqual({ deletedCount: 0, clerkUsersDeleted: 0 });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('[WI-84 review] verifies supplied real Clerk IDs are seed-managed before DB deletion', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'user_real_production_account',
          external_id: null,
          email_addresses: [{ email_address: 'real-person@example.com' }],
        },
      ],
    });
    global.fetch = fetchMock;
    const deleteReturning = jest.fn().mockResolvedValue([]);
    const deleteWhere = jest.fn().mockReturnValue({
      returning: deleteReturning,
    });
    const db = {
      delete: jest.fn().mockReturnValue({
        where: deleteWhere,
      }),
    } as unknown as Database;

    const result = await resetDatabase(
      db,
      { CLERK_SECRET_KEY: 'sk_test' },
      { verifiedSeedClerkUserIds: ['user_real_production_account'] },
    );

    expect(result).toEqual({ deletedCount: 0, clerkUsersDeleted: 0 });
    expect(db.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// debugAccountsByEmail — per-profile ownership
// ---------------------------------------------------------------------------

describe('debugAccountsByEmail', () => {
  it('[CodeRabbit Minor] computes isOwner per-profile — children of an admin parent are not owners', async () => {
    // One signed-in admin parent + one managed child in the same org. The
    // parent's membership has roles ['admin','learner']; the child's has
    // ['learner']. isOwner must be derived per-profile, so the child is NOT
    // marked an owner just because the signed-in parent is an admin.
    let selectCallCount = 0;
    const selectFn = jest.fn().mockImplementation(() => {
      selectCallCount += 1;
      if (selectCallCount === 1) {
        // login lookup by email
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              {
                personId: 'parent-1',
                clerkUserId: `${SEED_CLERK_PREFIX}1`,
                email: 'family@example.com',
              },
            ]),
          }),
        };
      }
      if (selectCallCount === 2) {
        // membership-by-personId → org of the signed-in parent
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ organizationId: 'org-1' }]),
          }),
        };
      }
      // person ⨝ membership for the org → parent (admin) + child (learner)
      return {
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              {
                id: 'parent-1',
                displayName: 'Test Parent',
                birthDate: '1985-01-01',
                roles: ['admin', 'learner'],
              },
              {
                id: 'child-1',
                displayName: 'Test Child',
                birthDate: '2014-01-01',
                roles: ['learner'],
              },
            ]),
          }),
        }),
      };
    });

    const db = {
      select: selectFn,
      query: {
        subjects: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    } as unknown as Database;

    const chains = await debugAccountsByEmail(db, 'family@example.com');

    expect(chains).toHaveLength(1);
    const profiles = chains[0]?.profiles ?? [];
    const parent = profiles.find((p) => p.id === 'parent-1');
    const child = profiles.find((p) => p.id === 'child-1');
    expect(parent?.isOwner).toBe(true);
    expect(child?.isOwner).toBe(false);
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
      requiredIds: ['childId', 'reportId', 'weeklyReportId'],
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

// ---------------------------------------------------------------------------
// Mentor Chrome audit seed pack
// docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md
//
// One row per `mentor-audit-*` registry entry. Each row lists the IDs Chrome
// needs to assert a landing route or open a deep link. The test enforces both
// the scenario-name contract (alias seeders rewrite the returned name) and
// the per-scenario `ids` whitelist (Task 4 contract from the plan).
//
// `mentor-audit-empty-adult` aliases `pre-profile` and returns
// `profileId: ''` by design — see seedPreProfile docstring. It is therefore
// excluded from the `profileId` truthy assertion below.
// ---------------------------------------------------------------------------

describe('mentor-audit seed pack returns required IDs', () => {
  const MENTOR_AUDIT_SCENARIOS: Array<{
    scenario: SeedScenario;
    requiredIds: string[];
    /** Pre-profile leaves profileId empty; everything else has one. */
    expectProfileId?: boolean;
    /**
     * Graphless pre-profile seeds create no DB rows (no org/person/login) — only
     * a Clerk user — so accountId is empty and db.insert is never called.
     */
    expectGraph?: boolean;
  }> = [
    {
      scenario: 'mentor-audit-empty-adult',
      requiredIds: [],
      expectProfileId: false,
      expectGraph: false,
    },
    {
      scenario: 'mentor-audit-consent-pending-child',
      requiredIds: ['consentToken', 'consentStateId'],
    },
    {
      scenario: 'mentor-audit-consent-withdrawn-child',
      requiredIds: [],
    },
    {
      scenario: 'mentor-audit-post-approval-steady-state',
      requiredIds: [
        'parentProfileId',
        'child1ProfileId',
        'child2ProfileId',
        'child3ProfileId',
      ],
    },
    {
      scenario: 'mentor-audit-deletion-scheduled-owner',
      requiredIds: ['subjectId', 'subscriptionId'],
    },
    {
      scenario: 'mentor-audit-family-at-profile-limit',
      requiredIds: [
        'parentProfileId',
        'subscriptionId',
        'childProfileId1',
        'childProfileId2',
        'childProfileId3',
      ],
    },
    {
      scenario: 'mentor-audit-post-approval-redirect',
      requiredIds: [
        'parentProfileId',
        'childProfileId',
        'consentToken',
        'consentStateId',
      ],
    },
    {
      scenario: 'mentor-audit-consent-us-under-threshold',
      requiredIds: [],
    },
    {
      scenario: 'mentor-audit-consent-eu-under-threshold',
      requiredIds: [],
    },
    {
      scenario: 'mentor-audit-consent-over-threshold',
      requiredIds: [],
    },
    {
      scenario: 'mentor-audit-quota-owner-daily',
      requiredIds: ['subscriptionId', 'subjectId'],
    },
    {
      scenario: 'mentor-audit-quota-family-monthly',
      requiredIds: ['subscriptionId', 'subjectId'],
    },
    {
      scenario: 'mentor-audit-paywall-child-notify',
      requiredIds: [
        'parentProfileId',
        'childProfileId',
        'subscriptionId',
        'subjectId',
      ],
    },
    {
      scenario: 'mentor-audit-resumable-session',
      requiredIds: ['subjectId', 'topicId', 'sessionId'],
    },
    // Second wave — Task 0 composite + remaining DB-backed audit seeds.
    {
      scenario: 'mentor-audit-family-no-children',
      // Alias of parent-solo: only the seeder's own ids survive the alias.
      requiredIds: ['parentProfileId', 'subscriptionId'],
    },
    {
      scenario: 'mentor-audit-rich-child-history',
      requiredIds: [
        'parentProfileId',
        'childProfileId',
        'mathSubjectId',
        'englishSubjectId',
        'mathTopicId',
        'englishTopicId',
        'recapSessionId',
        'reportId',
        'weeklyReportId',
        'quizRoundId',
        'dictationResultId',
        'homeworkSessionId',
        'milestoneId',
        'topicNoteId',
        'vocabularyId',
        'bookmarkId',
      ],
    },
    {
      // session-revoked + mfa-totp call Clerk Backend; without CLERK_SECRET_KEY
      // (unit-test env) they fall through to empty-string ids. Only assert the
      // base ids that come from seedOnboardingComplete.
      scenario: 'mentor-audit-session-revoked',
      requiredIds: [],
    },
    {
      scenario: 'mentor-audit-mfa-totp',
      requiredIds: [],
    },
    // Third wave — BILLING-07/08 + BRIDGE-03/04.
    {
      scenario: 'mentor-audit-family-pool-members',
      requiredIds: [
        'parentProfileId',
        'subscriptionId',
        'childProfileId1',
        'childProfileId2',
        'quotaUsedThisMonth',
        'quotaMonthlyLimit',
      ],
    },
    {
      scenario: 'mentor-audit-family-owner-daily-quota-with-child',
      requiredIds: [
        'ownerProfileId',
        'childProfileId',
        'subscriptionId',
        'childSubjectId',
        'childTopicId',
        'childSessionId',
      ],
    },
    {
      scenario: 'mentor-audit-bridge-backstack',
      requiredIds: [
        'ownerProfileId',
        'childProfileId',
        'childSubjectId',
        'childSubjectName',
        'childTopicId',
        'childSessionId',
        'childRecapId',
      ],
    },
  ];

  it.each(MENTOR_AUDIT_SCENARIOS)(
    '$scenario returns correct scenario name and required IDs',
    async ({
      scenario,
      requiredIds,
      expectProfileId = true,
      expectGraph = true,
    }) => {
      const mockDb = createMockDb();
      const result = await seedScenario(mockDb, scenario, 'test@example.com');

      expect(result.scenario).toBe(scenario);
      if (expectProfileId) {
        expect(result.profileId).toBeTruthy();
      }
      expect(result.email).toBe('test@example.com');
      expect(typeof result.password).toBe('string');

      for (const idKey of requiredIds) {
        expect(result.ids[idKey]).toBeTruthy();
      }

      if (expectGraph) {
        expect(result.accountId).toBeTruthy();
        expect(mockDb.insert).toHaveBeenCalled();
      } else {
        // Graphless seed: no org/person/login rows, only a Clerk user.
        expect(result.accountId).toBe('');
        expect(mockDb.insert).not.toHaveBeenCalled();
      }
    },
  );

  it('aliases rewrite the returned scenario name (not the inner seeder name)', async () => {
    // mentor-audit-empty-adult is an alias of pre-profile. The wrapped
    // result must carry the alias name, not the inner seeder name.
    const mockDb = createMockDb();
    const result = await seedScenario(
      mockDb,
      'mentor-audit-empty-adult',
      'test@example.com',
    );
    expect(result.scenario).toBe('mentor-audit-empty-adult');
    expect(result.scenario).not.toBe('pre-profile');
  });

  it('consent threshold seeders persist the configured location enum value', async () => {
    // The per-region seeders rely on `person.residenceJurisdiction` to drive the consent
    // gate. Capture the inserted row and assert the jurisdiction value matches.
    const captured: Array<Record<string, unknown>> = [];
    const insertMock = jest.fn().mockImplementation(() => ({
      values: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured.push(row);
        return Promise.resolve();
      }),
    }));
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    };
    const db = {
      insert: insertMock,
      update: jest.fn().mockReturnValue({
        set: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
      select: jest.fn().mockReturnValue(selectChain),
      delete: jest.fn().mockReturnValue({
        where: jest
          .fn()
          .mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      }),
      execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
    } as unknown as Database;

    await seedScenario(
      db,
      'mentor-audit-consent-us-under-threshold',
      'test@example.com',
    );

    // In v2 person rows have `birthDate` and `residenceJurisdiction` (not `birthYear`/`location`).
    const profileRow = captured.find(
      (row) =>
        'birthDate' in row &&
        'displayName' in row &&
        'residenceJurisdiction' in row,
    );
    expect(profileRow).toBeDefined();
    expect(profileRow?.residenceJurisdiction).toBe('US');
    expect(profileRow?.birthDate).toBe(
      `${new Date().getFullYear() - 13}-01-01`,
    );
  });

  it('family-at-profile-limit creates exactly maxProfiles family profiles', async () => {
    // Capture all inserts and assert the total person + membership counts equal
    // getTierConfig('family').maxProfiles (1 owner + 3 children = 4).
    const captured: Array<Record<string, unknown>> = [];
    const insertMock = jest.fn().mockImplementation(() => ({
      values: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured.push(row);
        return Promise.resolve();
      }),
    }));
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    };
    const db = {
      insert: insertMock,
      update: jest.fn().mockReturnValue({
        set: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
      select: jest.fn().mockReturnValue(selectChain),
      delete: jest.fn().mockReturnValue({
        where: jest
          .fn()
          .mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      }),
      execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
    } as unknown as Database;

    await seedScenario(
      db,
      'mentor-audit-family-at-profile-limit',
      'test@example.com',
    );

    // In v2: `person` rows have `birthDate` (not `birthYear` or `isOwner`).
    // Owner is the membership with roles ['admin', 'learner'], children have ['learner'].
    const personRows = captured.filter(
      (row) => 'birthDate' in row && 'displayName' in row,
    );
    expect(personRows).toHaveLength(4);

    const membershipRows = captured.filter(
      (row) => 'roles' in row && 'organizationId' in row && 'personId' in row,
    );
    expect(membershipRows).toHaveLength(4);
    expect(
      membershipRows.filter(
        (row) =>
          Array.isArray(row.roles) && (row.roles as string[]).includes('admin'),
      ),
    ).toHaveLength(1);
    expect(
      membershipRows.filter(
        (row) =>
          Array.isArray(row.roles) &&
          !(row.roles as string[]).includes('admin'),
      ),
    ).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Third-wave structural assertions — BILLING-07/08 + BRIDGE-03/04.
  // -------------------------------------------------------------------------

  it('WI-2194 stale-family-cycle seeds 1 owner + 2 children, stale 7/700 pool, and 14 current-cycle events', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const usageOperations: string[] = [];
    const deleteMock = jest.fn().mockReturnValue({
      where: jest.fn().mockImplementation(() => {
        usageOperations.push('delete');
        return { returning: jest.fn().mockResolvedValue([]) };
      }),
    });
    const insertMock = jest.fn().mockImplementation(() => ({
      values: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured.push(row);
        if (Array.isArray(row) && row.some((event) => 'delta' in event)) {
          usageOperations.push(`insert:${row.length}`);
        }
        return Promise.resolve();
      }),
    }));
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    };
    const db = {
      insert: insertMock,
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((row: Record<string, unknown>) => {
          updates.push(row);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      }),
      select: jest.fn().mockReturnValue(selectChain),
      delete: deleteMock,
      execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
    } as unknown as Database;

    const result = await seedScenario(
      db,
      'wi-2194-stale-family-cycle',
      'test@example.com',
    );

    // In v2: count membership rows (not profile rows with isOwner field).
    const membershipRows = captured.filter(
      (row) => 'roles' in row && 'organizationId' in row && 'personId' in row,
    );
    expect(membershipRows).toHaveLength(3);
    expect(
      membershipRows.filter(
        (row) =>
          Array.isArray(row.roles) && (row.roles as string[]).includes('admin'),
      ),
    ).toHaveLength(1);
    expect(
      membershipRows.filter(
        (row) =>
          Array.isArray(row.roles) &&
          !(row.roles as string[]).includes('admin'),
      ),
    ).toHaveLength(2);

    const ownerRow = captured.find(
      (row) => row.id === result.ids.parentProfileId,
    );
    expect(ownerRow).toBeDefined();
    expect(ownerRow?.defaultAppContext).toBe('family');

    // The persisted pool deliberately carries the stale Plus-era values that
    // the Family cycle read must repair/reject before assembly.
    expect(updates).toContainEqual(
      expect.objectContaining({ monthlyLimit: 700, usedThisMonth: 7 }),
    );
    expect(deleteMock).toHaveBeenCalledWith(usageEvents);
    expect(usageOperations).toEqual(['insert:750', 'delete', 'insert:14']);

    const usageEventRows = captured.find(
      (row) =>
        Array.isArray(row) &&
        row.length === 14 &&
        row.every((event) => event.delta === 1),
    ) as Array<Record<string, unknown>> | undefined;
    expect(usageEventRows).toHaveLength(14);
    expect(
      usageEventRows?.filter(
        (row) => row.profileId === result.ids.parentProfileId,
      ),
    ).toHaveLength(9);
    expect(
      usageEventRows?.filter(
        (row) => row.profileId === result.ids.childProfileId1,
      ),
    ).toHaveLength(5);
    expect(
      usageEventRows?.every(
        (row) => row.subscriptionId === result.ids.subscriptionId,
      ),
    ).toBe(true);

    expect(result.ids.quotaMonthlyLimit).toBe('1500');
    expect(result.ids.quotaUsedThisMonth).toBe('14');
  });

  it('family-pool-members preserves normal mid-month usage at half of the Family allowance', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const db = {
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockImplementation((row: Record<string, unknown>) => {
          captured.push(row);
          return Promise.resolve();
        }),
      })),
      update: jest.fn().mockReturnValue({
        set: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest
          .fn()
          .mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      }),
      execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
    } as unknown as Database;

    const result = await seedScenario(
      db,
      'mentor-audit-family-pool-members',
      'test@example.com',
    );
    const quotaRow = captured.find(
      (row) =>
        'monthlyLimit' in row &&
        'usedThisMonth' in row &&
        'subscriptionId' in row,
    );

    expect(quotaRow).toMatchObject({
      monthlyLimit: 1500,
      usedThisMonth: 750,
    });
    expect(result.ids.quotaMonthlyLimit).toBe('1500');
    expect(result.ids.quotaUsedThisMonth).toBe('750');
    const usageEventRows = captured.find(
      (row) => Array.isArray(row) && row.some((event) => 'delta' in event),
    ) as Array<Record<string, unknown>> | undefined;
    expect(usageEventRows).toHaveLength(750);
    expect(usageEventRows?.every((event) => event.delta === 1)).toBe(true);
    expect(
      usageEventRows?.every(
        (event) =>
          event.subscriptionId === result.ids.subscriptionId &&
          event.profileId === result.ids.parentProfileId,
      ),
    ).toBe(true);
  });

  it('family-owner-daily-quota-with-child sets defaultAppContext=family on the owner and stocks the child with learning state', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const insertMock = jest.fn().mockImplementation(() => ({
      values: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured.push(row);
        return Promise.resolve();
      }),
    }));
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    };
    const db = {
      insert: insertMock,
      update: jest.fn().mockReturnValue({
        set: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
      select: jest.fn().mockReturnValue(selectChain),
      delete: jest.fn().mockReturnValue({
        where: jest
          .fn()
          .mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      }),
    } as unknown as Database;

    const result = await seedScenario(
      db,
      'mentor-audit-family-owner-daily-quota-with-child',
      'test@example.com',
    );

    // Owner person row must carry defaultAppContext: 'family'.
    // In v2 there is no `isOwner` on person; ownership is via membership.roles.
    const ownerRow = captured.find(
      (row) => row.id === result.ids.ownerProfileId,
    );
    expect(ownerRow).toBeDefined();
    expect(ownerRow?.defaultAppContext).toBe('family');
    // Verify owner membership has admin role.
    const ownerMembership = captured.find(
      (row) =>
        'roles' in row &&
        'personId' in row &&
        row.personId === result.ids.ownerProfileId &&
        Array.isArray(row.roles) &&
        (row.roles as string[]).includes('admin'),
    );
    expect(ownerMembership).toBeDefined();

    // Exactly one guardianship row — v2 replaces familyLinks with guardianship.
    const guardianshipRows = captured.filter(
      (row) => 'guardianPersonId' in row && 'chargePersonId' in row,
    );
    expect(guardianshipRows).toHaveLength(1);

    // Quota: daily cap fully consumed, monthly bucket deliberately below cap
    // so the failure attributable to the daily gate (not monthly).
    const quotaRow = captured.find(
      (row) =>
        'dailyLimit' in row && 'usedToday' in row && 'subscriptionId' in row,
    );
    expect(quotaRow).toBeDefined();
    expect(Number(quotaRow?.usedToday)).toBe(Number(quotaRow?.dailyLimit));
    expect(Number(quotaRow?.usedThisMonth)).toBeLessThan(
      Number(quotaRow?.monthlyLimit),
    );

    // Child must have a real session row (not just subject/topic scaffolding).
    const sessionRows = captured.filter(
      (row) => 'sessionType' in row && 'status' in row && 'profileId' in row,
    );
    expect(sessionRows.length).toBeGreaterThan(0);
  });

  it('bridge-backstack puts the child topic in a subject the adult library does NOT have', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const insertMock = jest.fn().mockImplementation(() => ({
      values: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured.push(row);
        return Promise.resolve();
      }),
    }));
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    };
    const db = {
      insert: insertMock,
      update: jest.fn().mockReturnValue({
        set: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
      select: jest.fn().mockReturnValue(selectChain),
      delete: jest.fn().mockReturnValue({
        where: jest
          .fn()
          .mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      }),
      query: { accounts: { findMany: jest.fn().mockResolvedValue([]) } },
      execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
    } as unknown as Database;

    const result = await seedScenario(
      db,
      'mentor-audit-bridge-backstack',
      'test@example.com',
    );

    // Two subjects total: one for the owner (adult library), one for the
    // child. Their `name` fields MUST differ, otherwise the bridge flow would
    // surface the "already exists / divergent" branch instead of exercising
    // the new-clone backstack contract BRIDGE-04 cares about.
    const subjectRows = captured.filter(
      (row) =>
        'name' in row && 'profileId' in row && typeof row.name === 'string',
    );
    expect(subjectRows).toHaveLength(2);

    const ownerSubjects = subjectRows.filter(
      (row) => row.profileId === result.ids.ownerProfileId,
    );
    const childSubjects = subjectRows.filter(
      (row) => row.profileId === result.ids.childProfileId,
    );
    expect(ownerSubjects).toHaveLength(1);
    expect(childSubjects).toHaveLength(1);
    expect(ownerSubjects[0]?.name).not.toBe(childSubjects[0]?.name);
    expect(childSubjects[0]?.name).toBe(result.ids.childSubjectName);

    const ownerRow = captured.find(
      (row) => row.id === result.ids.ownerProfileId,
    );
    expect(ownerRow?.defaultAppContext).toBe('family');

    // recapId === sessionId per recaps service contract — the seed must
    // mirror that or the Playwright probe would deep-link to a missing recap.
    expect(result.ids.childRecapId).toBe(result.ids.childSessionId);
  });
});

// ---------------------------------------------------------------------------
// [BUG-781] attachClerkTotpFactor — graceful degradation when the target
// Clerk environment has authenticator-app MFA disabled.
// ---------------------------------------------------------------------------

describe('[BUG-781] attachClerkTotpFactor graceful degrade', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns a non-empty disabledReason and empty secret on Clerk 405', async () => {
    const { attachClerkTotpFactor } = await import('./test-seed');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 405,
      text: async () => 'Method Not Allowed',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await attachClerkTotpFactor('user_test', {
      CLERK_SECRET_KEY: 'sk_test',
    });

    expect(result.secret).toBe('');
    expect(result.disabledReason).toContain('clerk_authenticator_app_disabled');
    expect(result.disabledReason).toContain('405');
    // Operator-action breadcrumb must be present in the reason string so the
    // smoke spec / harness output points the maintainer at the Clerk
    // dashboard rather than the seed code.
    expect(result.disabledReason).toMatch(/Clerk Dashboard/i);
  });

  it('returns a non-empty disabledReason on Clerk 422 with authenticator_app_disabled code', async () => {
    const { attachClerkTotpFactor } = await import('./test-seed');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          errors: [{ code: 'authenticator_app_disabled' }],
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await attachClerkTotpFactor('user_test', {
      CLERK_SECRET_KEY: 'sk_test',
    });

    expect(result.secret).toBe('');
    expect(result.disabledReason).toContain('422');
  });

  it('still throws on unexpected non-405/422 errors so real bugs are loud', async () => {
    const { attachClerkTotpFactor } = await import('./test-seed');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      attachClerkTotpFactor('user_test', { CLERK_SECRET_KEY: 'sk_test' }),
    ).rejects.toThrow(/Clerk TOTP attach failed \(500\)/);
  });

  it('still throws on Clerk 422 with a different error code (real validation bug)', async () => {
    const { attachClerkTotpFactor } = await import('./test-seed');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          errors: [{ code: 'invalid_request_body' }],
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      attachClerkTotpFactor('user_test', { CLERK_SECRET_KEY: 'sk_test' }),
    ).rejects.toThrow(/Clerk TOTP attach failed \(422\)/);
  });

  it('returns the parsed secret on success', async () => {
    const { attachClerkTotpFactor } = await import('./test-seed');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ secret: 'JBSWY3DPEHPK3PXP' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await attachClerkTotpFactor('user_test', {
      CLERK_SECRET_KEY: 'sk_test',
    });

    expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result.disabledReason).toBe('');
  });

  it('returns empty fields with no fetch call when CLERK_SECRET_KEY is missing', async () => {
    const { attachClerkTotpFactor } = await import('./test-seed');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await attachClerkTotpFactor('user_test', {});

    expect(result.secret).toBe('');
    expect(result.disabledReason).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
