/**
 * Integration: GET /v1/streaks + GET /v1/xp
 *
 * Tests the real Hono app end-to-end — auth middleware, profile-scope
 * middleware, consent middleware, route handlers, and the real
 * getStreakData / getXpSummary service functions all run against a live DB.
 *
 * External boundaries mocked:
 *   - Clerk JWKS (fetch-interceptor + mockClerkJWKS)
 *   - Neon HTTP passthrough (addFetchHandler for .neon.tech)
 *
 * No internal jest.mock() — GC1 compliant.
 */

import {
  buildIntegrationEnv,
  cleanupAccounts,
} from '../../../../tests/integration/helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedCurriculum,
  seedStreakRecord,
  seedSubject,
  seedXpLedgerEntry,
} from '../../../../tests/integration/route-fixtures';
import {
  installFetchInterceptor,
  restoreFetch,
  addFetchHandler,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';
import {
  streakEndpointResponseSchema,
  xpSummaryEndpointResponseSchema,
} from '@eduagent/schemas';

import { app } from '../index';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-streaks-route-user';
const AUTH_EMAIL = 'integration-streaks-route@integration.test';

// Install real JWT verification with Clerk JWKS interceptor.
// Mirrors the pattern in subjects-upstream-llm-error.integration.test.ts —
// this suite installs its own interceptor rather than relying on a global
// setup file that may not be present for all test runner configurations.
const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
// Allow the Neon HTTP driver to reach the real database.
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createOwnerProfile(): Promise<string> {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: AUTH_USER_ID, email: AUTH_EMAIL },
    displayName: 'Streaks Route Tester',
    // Birth year 2000 → adult, no consent block
    birthYear: 2000,
  });
  return profile.id;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  jest.clearAllMocks();
  clearJWKSCache();
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
  restoreFetch();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/streaks', () => {
  it('returns 200 with seeded streak data', async () => {
    const profileId = await createOwnerProfile();

    // Seed a streak row with a known state.
    const today = new Date().toISOString().slice(0, 10);
    await seedStreakRecord({
      profileId,
      currentStreak: 5,
      longestStreak: 12,
      lastActivityDate: today,
      gracePeriodStartDate: null,
    });

    const res = await app.request(
      '/v1/streaks',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    // Must parse against the published schema — validates shape contract.
    const parsed = streakEndpointResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.streak.currentStreak).toBe(5);
      expect(parsed.data.streak.longestStreak).toBe(12);
      expect(parsed.data.streak.lastActivityDate).toBe(today);
      expect(parsed.data.streak.isOnGracePeriod).toBe(false);
      expect(parsed.data.streak.graceDaysRemaining).toBe(0);
    }
  });

  it('returns 200 with zero/default shape when no streak row exists', async () => {
    const profileId = await createOwnerProfile();
    // No seedStreakRecord call — profile has no streak row.

    const res = await app.request(
      '/v1/streaks',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = streakEndpointResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      // getStreakData returns zeros/nulls when no row exists.
      expect(parsed.data.streak.currentStreak).toBe(0);
      expect(parsed.data.streak.longestStreak).toBe(0);
      expect(parsed.data.streak.lastActivityDate).toBeNull();
      expect(parsed.data.streak.gracePeriodStartDate).toBeNull();
      expect(parsed.data.streak.isOnGracePeriod).toBe(false);
      expect(parsed.data.streak.graceDaysRemaining).toBe(0);
    }
  });

  it('returns 401 when no JWT is provided', async () => {
    const res = await app.request(
      '/v1/streaks',
      {
        method: 'GET',
        // No Authorization header
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});

describe('Integration: GET /v1/xp', () => {
  it('returns 200 with seeded XP data aggregated correctly', async () => {
    const profileId = await createOwnerProfile();

    // Seed a subject + two curriculum topics so xp_ledger FK constraints pass.
    const subject = await seedSubject(profileId, 'Mathematics');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      bookTitle: 'Maths Book',
      topics: [{ title: 'Topic A' }, { title: 'Topic B' }],
    });

    const [topic1Id, topic2Id] = curriculum.topicIds;

    // Seed XP ledger entries across different statuses.
    // xp_ledger has a unique index on (profileId, topicId) — one row per topic.
    await seedXpLedgerEntry({
      profileId,
      subjectId: subject.id,
      topicId: topic1Id!,
      amount: 100,
      status: 'verified',
    });
    await seedXpLedgerEntry({
      profileId,
      subjectId: subject.id,
      topicId: topic2Id!,
      amount: 50,
      status: 'pending',
    });

    const res = await app.request(
      '/v1/xp',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = xpSummaryEndpointResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.xp.totalXp).toBe(150);
      expect(parsed.data.xp.verifiedXp).toBe(100);
      expect(parsed.data.xp.pendingXp).toBe(50);
      expect(parsed.data.xp.decayedXp).toBe(0);
      expect(parsed.data.xp.topicsCompleted).toBe(2);
      expect(parsed.data.xp.topicsVerified).toBe(1);
    }
  });

  it('returns 401 when no JWT is provided', async () => {
    const res = await app.request(
      '/v1/xp',
      {
        method: 'GET',
        // No Authorization header
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});
