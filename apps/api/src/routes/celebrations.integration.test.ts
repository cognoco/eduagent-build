/**
 * Integration: GET /v1/celebrations/pending + POST /v1/celebrations/seen
 *
 * Exercises the celebrations routes through the real app + real database.
 * JWT verification uses real signed tokens (via the fetch interceptor installed
 * at module load — mirrors the pattern in subjects-upstream-llm-error.integration.test.ts).
 *
 * Boundaries:
 *   - Only Clerk JWKS is mocked (external boundary, fetch interceptor)
 *   - Neon HTTP passthrough is registered so CI local-pg and Neon dev both work
 *   - getPendingCelebrations / markCelebrationsSeen / getCelebrationLevel all run real
 *   - Celebrations are seeded via direct DB inserts into coaching_card_cache
 */

import { eq } from 'drizzle-orm';
import { coachingCardCache } from '@eduagent/database';
import type { PendingCelebration } from '@eduagent/schemas';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from '../../../../tests/integration/helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedLearningModeRecord,
} from '../../../../tests/integration/route-fixtures';
import {
  installFetchInterceptor,
  restoreFetch,
  addFetchHandler,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';

import { app } from '../index';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Fetch interceptor + JWKS mock
// (cross-package setup.ts does this globally; apps/api jest.integration.config.cjs
//  uses api-setup.ts which does NOT — so each suite installs the interceptor itself.)
// ---------------------------------------------------------------------------
const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
// Allow Neon HTTP driver passthrough (no-op when the local pg driver is used).
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------
const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-celebrations-user';
const AUTH_EMAIL = 'integration-celebrations@integration.test';

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/** Inserts a coaching_card_cache row with pending celebrations for a profile. */
async function seedPendingCelebrations(
  profileId: string,
  celebrations: PendingCelebration[],
): Promise<void> {
  const db = createIntegrationDb();
  await db
    .insert(coachingCardCache)
    .values({
      profileId,
      cardData: {
        kind: 'home_surface_cache_v1' as const,
        cachedAt: new Date().toISOString(),
        rankedHomeCards: [],
        interactionStats: {
          tapsByCardId: {},
          dismissalsByCardId: {},
          events: [],
        },
      },
      pendingCelebrations: celebrations,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .onConflictDoUpdate({
      target: coachingCardCache.profileId,
      set: {
        pendingCelebrations: celebrations,
        updatedAt: new Date(),
      },
    });
}

/** Reads the coaching_card_cache row for assertions. */
async function loadCacheRow(profileId: string) {
  const db = createIntegrationDb();
  return db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });
}

/** Creates a recent PendingCelebration that has not been seen yet. */
function freshCelebration(
  overrides: Partial<PendingCelebration> = {},
): PendingCelebration {
  return {
    celebration: 'comet',
    reason: 'topic_mastered',
    detail: null,
    queuedAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago — well within 7-day window
    ...overrides,
  };
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
// Helper: create a profile + default learning mode record for the test user
// ---------------------------------------------------------------------------

async function createOwnerProfile(): Promise<string> {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: AUTH_USER_ID, email: AUTH_EMAIL },
    displayName: 'Celebrations Tester',
    birthYear: 2000,
  });
  return profile.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/celebrations/pending', () => {
  it('defaults to child viewer and returns pending celebrations filtered by celebration level', async () => {
    const profileId = await createOwnerProfile();
    // 'all' level: all celebrations should pass through
    await seedLearningModeRecord({ profileId, celebrationLevel: 'all' });

    const celebration = freshCelebration({
      celebration: 'polar_star',
      reason: 'topic_mastered',
    });
    await seedPendingCelebrations(profileId, [celebration]);

    const res = await app.request(
      '/v1/celebrations/pending',
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
    const body = (await res.json()) as {
      pendingCelebrations: PendingCelebration[];
    };
    expect(body.pendingCelebrations).toHaveLength(1);
    expect(body.pendingCelebrations[0]).toMatchObject({
      celebration: 'polar_star',
      reason: 'topic_mastered',
    });
  });

  it('viewer=parent returns unfiltered celebrations (including non-parent-visible reasons skipped by child)', async () => {
    const profileId = await createOwnerProfile();

    // 'deep_diver' is NOT in PARENT_VISIBLE_REASONS, so the parent viewer
    // will filter it out. 'topic_mastered' IS parent-visible.
    const parentVisible = freshCelebration({
      celebration: 'comet',
      reason: 'topic_mastered',
    });
    const parentHidden = freshCelebration({
      celebration: 'polar_star',
      reason: 'deep_diver',
    });
    await seedPendingCelebrations(profileId, [parentVisible, parentHidden]);

    const res = await app.request(
      '/v1/celebrations/pending?viewer=parent',
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
    const body = (await res.json()) as {
      pendingCelebrations: PendingCelebration[];
    };
    // Parent viewer: only parent-visible reasons are returned.
    const reasons = body.pendingCelebrations.map((c) => c.reason);
    expect(reasons).toContain('topic_mastered');
    expect(reasons).not.toContain('deep_diver');
  });

  it('viewer=child applies filterCelebrationsByLevel (big_only suppresses small celebrations)', async () => {
    const profileId = await createOwnerProfile();
    // 'big_only' level: only 'comet' and 'orions_belt' should pass
    await seedLearningModeRecord({ profileId, celebrationLevel: 'big_only' });

    const smallCelebration = freshCelebration({
      celebration: 'polar_star', // not big
      reason: 'topic_mastered',
    });
    const bigCelebration = freshCelebration({
      celebration: 'comet', // big
      reason: 'curriculum_complete',
    });
    await seedPendingCelebrations(profileId, [
      smallCelebration,
      bigCelebration,
    ]);

    const res = await app.request(
      '/v1/celebrations/pending?viewer=child',
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
    const body = (await res.json()) as {
      pendingCelebrations: PendingCelebration[];
    };
    // Only big celebrations (comet / orions_belt) survive big_only filter.
    const names = body.pendingCelebrations.map((c) => c.celebration);
    expect(names).not.toContain('polar_star');
    expect(names).toContain('comet');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await app.request(
      '/v1/celebrations/pending',
      { method: 'GET' },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });
});

describe('Integration: POST /v1/celebrations/seen', () => {
  it('marks celebrations as seen in the DB and returns { ok: true }', async () => {
    const profileId = await createOwnerProfile();
    const celebration = freshCelebration();
    await seedPendingCelebrations(profileId, [celebration]);

    const res = await app.request(
      '/v1/celebrations/seen',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ viewer: 'child' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Verify the DB row was actually updated.
    const row = await loadCacheRow(profileId);
    expect(row).not.toBeNull();
    expect(row!.celebrationsSeenByChild).not.toBeNull();
  });

  it('marks parent seen when viewer=parent', async () => {
    const profileId = await createOwnerProfile();
    await seedPendingCelebrations(profileId, [freshCelebration()]);

    const res = await app.request(
      '/v1/celebrations/seen',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ viewer: 'parent' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = await loadCacheRow(profileId);
    expect(row!.celebrationsSeenByParent).not.toBeNull();
  });

  it('returns 400 when the request body fails zod validation (invalid viewer value)', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/celebrations/seen',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ viewer: 'guardian' }), // not a valid enum value
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing the viewer field entirely', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/celebrations/seen',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({}),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await app.request(
      '/v1/celebrations/seen',
      {
        method: 'POST',
        body: JSON.stringify({ viewer: 'child' }),
        headers: { 'Content-Type': 'application/json' },
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});
