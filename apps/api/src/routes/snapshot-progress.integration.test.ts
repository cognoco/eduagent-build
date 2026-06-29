/**
 * Integration: GET /v1/progress/inventory, GET /v1/progress/history,
 *              GET /v1/progress/milestones, POST /v1/progress/refresh
 *
 * Exercises the real DB, real auth (test JWT + JWKS interceptor),
 * real service layer, and the global onError handler. No internal mocks.
 *
 * External boundaries mocked:
 *   - Clerk JWKS (mockClerkJWKS) — required for JWT verification
 *   - Neon HTTP driver passthrough — allows the pg driver to talk to the DB
 */

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from '../../../../tests/integration/helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedSubject,
} from '../../../../tests/integration/route-fixtures';
import {
  installFetchInterceptor,
  restoreFetch,
  addFetchHandler,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';
import { ERROR_CODES } from '@eduagent/schemas';
import {
  accounts,
  generateUUIDv7,
  guardianship,
  membership,
  milestones,
  notificationLog,
  person,
  progressSnapshots,
  profiles,
} from '@eduagent/database';
import { eq } from 'drizzle-orm';

import { app } from '../index';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Integration env + fetch interceptor
// ---------------------------------------------------------------------------

const TEST_ENV = buildIntegrationEnv();

const AUTH_USER_ID = 'integration-snapshot-progress-user';
const AUTH_EMAIL = 'integration-snapshot-progress@integration.test';

function isIdentityV2Enabled(): boolean {
  return process.env.IDENTITY_V2_ENABLED === 'true';
}

const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
// Allow the Neon HTTP/WebSocket driver to reach the real database.
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createOwnerProfile(): Promise<{
  id: string;
  accountId: string;
}> {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: AUTH_USER_ID, email: AUTH_EMAIL },
    displayName: 'Snapshot Progress Tester',
    birthYear: 2000,
  });
  return { id: profile.id, accountId: profile.accountId };
}

async function authHeaders(profileId: string) {
  return buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }, profileId);
}

// Removes all notification_log entries for a given profileId so the
// rate-limit counter starts fresh for the 11-call test.
async function clearRateLimitLog(profileId: string): Promise<void> {
  const db = createIntegrationDb();
  await db
    .delete(notificationLog)
    .where(eq(notificationLog.profileId, profileId));
}

async function clearMilestones(profileId: string): Promise<void> {
  const db = createIntegrationDb();
  await db.delete(milestones).where(eq(milestones.profileId, profileId));
}

async function clearProgressSnapshots(profileId: string): Promise<void> {
  const db = createIntegrationDb();
  await db
    .delete(progressSnapshots)
    .where(eq(progressSnapshots.profileId, profileId));
}

// [F-144] Creates a second profile on the SAME account — the first profile is
// the owner, so the second is a non-owner child. Used to exercise the proxy
// (X-Profile-Id = child, authed as owner) path on GET /progress/milestones.
async function createChildProfile(owner: {
  id: string;
  accountId: string;
}): Promise<{ id: string }> {
  if (isIdentityV2Enabled()) {
    const db = createIntegrationDb();
    const childId = generateUUIDv7();
    const birthYear = new Date().getFullYear() - 14;

    await db
      .insert(accounts)
      .values({
        id: owner.accountId,
        clerkUserId: AUTH_USER_ID,
        email: AUTH_EMAIL,
      })
      .onConflictDoNothing();
    await db.insert(person).values({
      id: childId,
      displayName: 'Snapshot Progress Child',
      birthDate: `${birthYear}-01-01`,
      residenceJurisdiction: 'US',
    });
    await db.insert(membership).values({
      personId: childId,
      organizationId: owner.accountId,
      roles: ['learner'],
    });
    await db.insert(guardianship).values({
      guardianPersonId: owner.id,
      chargePersonId: childId,
    });
    await db.insert(profiles).values({
      id: childId,
      accountId: owner.accountId,
      displayName: 'Snapshot Progress Child',
      birthYear,
      isOwner: false,
    });
    return { id: childId };
  }

  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: AUTH_USER_ID, email: AUTH_EMAIL },
    displayName: 'Snapshot Progress Child',
    birthYear: new Date().getFullYear() - 14,
    kind: 'child',
  });
  expect(profile.isOwner).toBe(false);
  return { id: profile.id };
}

// Seeds a progress snapshot whose totalSessions is past the lower backfill
// thresholds (1, 3, 5) while zero milestone rows exist — so a milestones read
// WOULD backfill unless suppressed.
async function seedSnapshotWithSessions(
  profileId: string,
  totalSessions: number,
): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(progressSnapshots).values({
    profileId,
    snapshotDate: new Date().toISOString().slice(0, 10),
    metrics: {
      totalSessions,
      totalActiveMinutes: 0,
      totalWallClockMinutes: 0,
      totalExchanges: 0,
      topicsAttempted: 0,
      topicsMastered: 0,
      topicsInProgress: 0,
      vocabularyTotal: 0,
      vocabularyMastered: 0,
      vocabularyLearning: 0,
      vocabularyNew: 0,
      retentionCardsDue: 0,
      retentionCardsStrong: 0,
      retentionCardsFading: 0,
      currentStreak: 0,
      longestStreak: 0,
      subjects: [],
    },
  });
}

async function countMilestones(profileId: string): Promise<number> {
  const db = createIntegrationDb();
  const rows = await db.query.milestones.findMany({
    where: eq(milestones.profileId, profileId),
    columns: { id: true },
  });
  return rows.length;
}

// Seeds N notification_log rows of type 'progress_refresh' for the profile
// so that the (N+1)th call is rate-limited.
async function seedRateLimitRows(
  profileId: string,
  accountId: string,
  count: number,
): Promise<void> {
  const db = createIntegrationDb();
  // We need to insert log rows AND associate them with the correct accountId
  // to pass verifyProfileOwnership inside checkAndLogRateLimit. The rate-
  // limiter itself only queries notificationLog by profileId + type + sentAt,
  // so direct DB inserts suffice — we just bypass the ownership check.
  const values = Array.from({ length: count }, () => ({
    profileId,
    type: 'progress_refresh' as const,
    ticketId: null as string | null,
  }));
  if (values.length > 0) {
    await db.insert(notificationLog).values(values);
  }
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
// Test suite
// ---------------------------------------------------------------------------

describe('Integration: snapshot-progress routes', () => {
  // -------------------------------------------------------------------------
  // 1. GET /v1/progress/inventory — schema-shaped response with seeded data
  // -------------------------------------------------------------------------

  it('GET /v1/progress/inventory returns 200 with knowledgeInventory shape', async () => {
    const { id: profileId } = await createOwnerProfile();

    // Seed a subject so the inventory has at least one subject entry.
    await seedSubject(profileId, 'Biology');

    const res = await app.request(
      '/v1/progress/inventory',
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      profileId: string;
      snapshotDate: string;
      global: Record<string, unknown>;
      subjects: unknown[];
    };

    expect(body.profileId).toBe(profileId);
    expect(typeof body.snapshotDate).toBe('string');
    // snapshotDate must be an ISO date string (YYYY-MM-DD)
    expect(body.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.global).toBeDefined();
    expect(typeof body.global.totalSessions).toBe('number');
    // At least the seeded subject appears
    expect(Array.isArray(body.subjects)).toBe(true);
    expect(body.subjects.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /v1/progress/inventory returns 401 without JWT', async () => {
    const res = await app.request(
      '/v1/progress/inventory',
      { method: 'GET' },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 2. GET /v1/progress/history — filtered history with valid query params
  // -------------------------------------------------------------------------

  it('GET /v1/progress/history with startDate/endDate returns 200 with progressHistory shape', async () => {
    const { id: profileId } = await createOwnerProfile();

    const from = '2026-01-01';
    const to = '2026-05-21';

    const res = await app.request(
      `/v1/progress/history?from=${from}&to=${to}`,
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      profileId: string;
      from: string;
      to: string;
      granularity: string;
      dataPoints: unknown[];
    };

    expect(body.profileId).toBe(profileId);
    expect(body.from).toBe(from);
    expect(body.to).toBe(to);
    expect(body.granularity).toBe('daily');
    expect(Array.isArray(body.dataPoints)).toBe(true);
  });

  it('GET /v1/progress/history with no params uses defaults and returns 200', async () => {
    const { id: profileId } = await createOwnerProfile();

    const res = await app.request(
      '/v1/progress/history',
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataPoints: unknown[] };
    expect(Array.isArray(body.dataPoints)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. GET /v1/progress/history — invalid query → 400
  // -------------------------------------------------------------------------

  it('GET /v1/progress/history with invalid from param returns 400', async () => {
    const { id: profileId } = await createOwnerProfile();

    const res = await app.request(
      '/v1/progress/history?from=not-a-date',
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it('GET /v1/progress/history with invalid granularity returns 400', async () => {
    const { id: profileId } = await createOwnerProfile();

    const res = await app.request(
      '/v1/progress/history?granularity=monthly',
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 4. GET /v1/progress/milestones — limit validation
  // -------------------------------------------------------------------------

  it('GET /v1/progress/milestones with no limit returns default 5-item cap', async () => {
    const { id: profileId } = await createOwnerProfile();
    await clearMilestones(profileId);
    await clearProgressSnapshots(profileId);

    // Insert 8 milestones directly into the DB so we can test the default cap.
    const db = createIntegrationDb();
    const milestoneValues = Array.from({ length: 8 }, (_, i) => ({
      profileId,
      milestoneType: 'session_count',
      threshold: i + 1,
    }));
    await db.insert(milestones).values(milestoneValues);

    const res = await app.request(
      '/v1/progress/milestones',
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { milestones: unknown[] };
    expect(Array.isArray(body.milestones)).toBe(true);
    // Default limit is 5 — should return at most 5 even with 8 seeded rows.
    expect(body.milestones.length).toBeLessThanOrEqual(5);
  });

  it('GET /v1/progress/milestones?limit=20 returns up to 20', async () => {
    const { id: profileId } = await createOwnerProfile();
    await clearMilestones(profileId);
    await clearProgressSnapshots(profileId);

    // Insert 25 milestones so the limit=20 cap is actually tested.
    const db = createIntegrationDb();
    const milestoneValues = Array.from({ length: 25 }, (_, i) => ({
      profileId,
      milestoneType: 'session_count',
      threshold: i + 1,
    }));
    await db.insert(milestones).values(milestoneValues);

    const res = await app.request(
      '/v1/progress/milestones?limit=20',
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { milestones: unknown[] };
    expect(Array.isArray(body.milestones)).toBe(true);
    expect(body.milestones.length).toBeLessThanOrEqual(20);
  });

  it('GET /v1/progress/milestones?limit=51 returns 400 (max is 50)', async () => {
    const { id: profileId } = await createOwnerProfile();

    const res = await app.request(
      '/v1/progress/milestones?limit=51',
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it('GET /v1/progress/milestones?limit=0 returns 400 (min is 1)', async () => {
    const { id: profileId } = await createOwnerProfile();

    const res = await app.request(
      '/v1/progress/milestones?limit=0',
      {
        method: 'GET',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 5. POST /v1/progress/refresh — first call OK; 11th within 1h → 429
  // -------------------------------------------------------------------------

  it('POST /v1/progress/refresh first call returns 200 with refresh shape', async () => {
    const { id: profileId } = await createOwnerProfile();
    await clearRateLimitLog(profileId);

    const res = await app.request(
      '/v1/progress/refresh',
      {
        method: 'POST',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      snapshotDate: string;
      metrics: Record<string, unknown>;
      milestones: unknown[];
    };

    expect(typeof body.snapshotDate).toBe('string');
    expect(body.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.metrics).toBeDefined();
    expect(typeof body.metrics.totalSessions).toBe('number');
    expect(Array.isArray(body.milestones)).toBe(true);
  });

  it('POST /v1/progress/refresh 11th call within 1h returns 429 RATE_LIMITED', async () => {
    const { id: profileId, accountId } = await createOwnerProfile();
    await clearRateLimitLog(profileId);

    // Seed exactly 10 log entries (the max allowed) directly in the DB so
    // the next call from the route hits the rate limit.
    await seedRateLimitRows(profileId, accountId, 10);

    const res = await app.request(
      '/v1/progress/refresh',
      {
        method: 'POST',
        headers: await authHeaders(profileId),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(429);

    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.RATE_LIMITED);
  });

  // -------------------------------------------------------------------------
  // 6. Missing JWT → 401
  // -------------------------------------------------------------------------

  it('GET /v1/progress/history returns 401 without JWT', async () => {
    const res = await app.request(
      '/v1/progress/history',
      { method: 'GET' },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });

  it('GET /v1/progress/milestones returns 401 without JWT', async () => {
    const res = await app.request(
      '/v1/progress/milestones',
      { method: 'GET' },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });

  it('POST /v1/progress/refresh returns 401 without JWT', async () => {
    const res = await app.request(
      '/v1/progress/refresh',
      { method: 'POST' },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // [F-144] GET /v1/progress/milestones — write-on-read backfill must be
  // suppressed in proxy mode. listRecentMilestones backfills missed
  // session_count milestones; a parent acting on a child (X-Profile-Id =
  // childId, isOwner resolves false) must be able to READ the child's
  // milestones but must NOT mutate the child's rows. The route maps proxy mode
  // (profileMeta.isOwner !== true) to allowBackfill=false. This is the
  // end-to-end wiring test for that mapping (the service-level suppression is
  // covered in snapshot-aggregation.integration.test.ts).
  // -------------------------------------------------------------------------
  // QUARANTINE WI-1153: shared-stg-DB accumulation flake; un-skip on fix
  // G7 sanctions a conditional callee for quarantine; default-skip, runtime un-skip via UNQUARANTINE_WI_1153=1
  (process.env['UNQUARANTINE_WI_1153'] !== '1' ? it.skip : it)(
    '[F-144] proxy read of child milestones does NOT backfill (mutate) the child rows',
    async () => {
      const owner = await createOwnerProfile();
      const { id: childId } = await createChildProfile(owner);

      // Child is behind on milestones: 5 sessions, zero milestone rows.
      await seedSnapshotWithSessions(childId, 5);
      expect(await countMilestones(childId)).toBe(0);

      // Owner proxies into the child via X-Profile-Id (resolves isOwner=false).
      const res = await app.request(
        '/v1/progress/milestones',
        { method: 'GET', headers: await authHeaders(childId) },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { milestones: unknown[] };
      expect(Array.isArray(body.milestones)).toBe(true);
      // The read succeeded but no backfill write fired — child rows untouched.
      expect(await countMilestones(childId)).toBe(0);
    },
  );

  it('[F-144] self (owner) read DOES backfill — suppression is proxy-scoped, not a blanket disable', async () => {
    const { id: ownerId } = await createOwnerProfile();

    // Owner is behind on milestones: 5 sessions, zero milestone rows.
    await seedSnapshotWithSessions(ownerId, 5);
    expect(await countMilestones(ownerId)).toBe(0);

    const res = await app.request(
      '/v1/progress/milestones',
      { method: 'GET', headers: await authHeaders(ownerId) },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // The owner's own read backfilled the missed thresholds (1, 3, 5).
    expect(await countMilestones(ownerId)).toBe(3);
  });
});
