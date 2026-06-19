/**
 * Integration: POST /v1/notices/:id/seen
 *
 * Exercises the real app stack end-to-end — auth, profile-scope middleware,
 * zValidator param check, route handler, and `markPendingNoticeSeen` service —
 * against a real database. No internal mocks.
 *
 * Behaviors covered:
 *   1. Valid notice owned by profile → 200 { seen: true } + seenAt set in DB.
 *   2. Notice ID does not exist → 404 "Notice not found".
 *   3. Notice belongs to another profile → 404 (scoped, must not leak existence).
 *   4. Invalid UUID param → 400 via zValidator.
 *   5. Missing JWT → 401.
 *   6. Retry of an already-seen notice → 200 { seen: true } (idempotent, not 404).
 *
 * External boundaries mocked (per GC1/test rules):
 *   - Clerk JWKS (fetch interceptor)
 *   - Neon HTTP passthrough (native fetch fallback)
 */

import { eq } from 'drizzle-orm';
import { pendingNotices } from '@eduagent/database';
import { ERROR_CODES } from '@eduagent/schemas';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from '../../../../tests/integration/helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
} from '../../../../tests/integration/route-fixtures';
import {
  installFetchInterceptor,
  restoreFetch,
  addFetchHandler,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';
import { clearJWKSCache } from '../middleware/jwt';

import { app } from '../index';

// ---------------------------------------------------------------------------
// Test env + external-boundary intercepts
// ---------------------------------------------------------------------------

const TEST_ENV = buildIntegrationEnv();

const AUTH_USER_ID = 'integration-notices-user';
const AUTH_EMAIL = 'integration-notices@integration.test';

const OTHER_USER_ID = 'integration-notices-other';
const OTHER_EMAIL = 'integration-notices-other@integration.test';

// Real JWT verification + Clerk JWKS interceptor (external boundary).
const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
addFetchHandler(/\.neon\.tech/, (url: string, init: RequestInit | undefined) =>
  nativeFetch(url, init),
);

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedNotice(ownerProfileId: string): Promise<string> {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(pendingNotices)
    .values({
      ownerProfileId,
      type: 'consent_archived',
      payloadJson: { childName: 'Test Child' },
    })
    .returning({ id: pendingNotices.id });
  if (!row) throw new Error('pendingNotices insert did not return a row');
  return row.id;
}

async function loadNotice(noticeId: string) {
  const db = createIntegrationDb();
  return db.query.pendingNotices.findFirst({
    where: eq(pendingNotices.id, noticeId),
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let profileId: string;
let otherProfileId: string;

beforeEach(async () => {
  clearJWKSCache();
  await cleanupAccounts({
    emails: [AUTH_EMAIL, OTHER_EMAIL],
    clerkUserIds: [AUTH_USER_ID, OTHER_USER_ID],
  });

  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: AUTH_USER_ID, email: AUTH_EMAIL },
    displayName: 'Notices Tester',
    birthYear: 2000,
  });
  profileId = profile.id;

  const otherProfile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: OTHER_USER_ID, email: OTHER_EMAIL },
    displayName: 'Other Notices User',
    birthYear: 1995,
  });
  otherProfileId = otherProfile.id;
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL, OTHER_EMAIL],
    clerkUserIds: [AUTH_USER_ID, OTHER_USER_ID],
  });
  restoreFetch();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/notices/:id/seen', () => {
  it('returns 200 { seen: true } and marks the DB row seen when notice belongs to requesting profile', async () => {
    const noticeId = await seedNotice(profileId);

    const res = await app.request(
      `/v1/notices/${noticeId}/seen`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ seen: true });

    // Verify DB row has seenAt set
    const row = await loadNotice(noticeId);
    expect(row).not.toBeNull();
    expect(row!.seenAt).not.toBeNull();
  });

  it('returns 404 "Notice not found" when the notice ID does not exist', async () => {
    const nonExistentId = '00000000-0000-7000-8000-000000000001';

    const res = await app.request(
      `/v1/notices/${nonExistentId}/seen`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(body.message).toBe('Notice not found');
  });

  it('returns 404 when the notice belongs to a different profile (scoped — must not leak existence)', async () => {
    // Seed notice under the OTHER profile
    const otherNoticeId = await seedNotice(otherProfileId);

    // Request it as the primary user → markPendingNoticeSeen will find no rows
    // because ownerProfileId does not match → 404, not 403.
    const res = await app.request(
      `/v1/notices/${otherNoticeId}/seen`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe(ERROR_CODES.NOT_FOUND);

    // DB row must remain unseenAt — the cross-profile request must not modify it
    const row = await loadNotice(otherNoticeId);
    expect(row!.seenAt).toBeNull();
  });

  it('returns 400 when the :id param is not a valid UUID', async () => {
    const res = await app.request(
      '/v1/notices/not-a-uuid/seen',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it('returns 200 { seen: true } on a retry (idempotent — already-seen notice must not 404)', async () => {
    const noticeId = await seedNotice(profileId);

    // First call — marks seen.
    const res1 = await app.request(
      `/v1/notices/${noticeId}/seen`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );
    expect(res1.status).toBe(200);

    // Second call (simulates client retry after lost response) — must also succeed.
    const res2 = await app.request(
      `/v1/notices/${noticeId}/seen`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as Record<string, unknown>;
    expect(body2).toMatchObject({ seen: true });
  });

  it('returns 401 when the request has no JWT', async () => {
    const noticeId = await seedNotice(profileId);

    const res = await app.request(
      `/v1/notices/${noticeId}/seen`,
      {
        method: 'POST',
        // No Authorization header
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});
