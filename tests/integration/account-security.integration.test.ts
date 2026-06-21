/**
 * Integration: Account Security Self-Service ([CRITICAL-1] / [CRITICAL-2a])
 *
 * Exercises the two new account-security endpoints via the real app + real DB:
 *   - GET  /v1/account/email          — reconciler source (CRITICAL-1)
 *   - POST /v1/account/security-event — password-change notification ping
 *                                       (CRITICAL-2a)
 *
 * Mocked boundaries (external only):
 * - JWT verification (Clerk JWKS) — intercepted via global fetch mock in setup
 * - Inngest event HTTP API — intercepted via global fetch mock
 *
 * Validates:
 * 1. GET /account/email returns the persisted account email for the owner.
 * 2. GET /account/email requires authentication (401 without token).
 * 3. POST /account/security-event returns 200 and emits an
 *    app/account.security-event Inngest event to the account email.
 * 4. POST /account/security-event rejects an unknown / server-only event type.
 */

import { eq } from 'drizzle-orm';
import { profiles } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const AUTH_USER_ID = 'integration-security-user';
const AUTH_EMAIL = 'integration-security@integration.test';

beforeAll(() => {
  mockInngestEvents();
});

async function createOwnerProfile(): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      body: JSON.stringify({
        displayName: 'Security Test User',
        birthYear: 2000,
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  const profileId = body.profile.id as string;
  const db = createIntegrationDb();
  const row = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { accountId: true },
  });
  if (!row) throw new Error(`Profile row missing after create: ${profileId}`);
  return profileId;
}

beforeEach(async () => {
  jest.clearAllMocks();
  clearFetchCalls();
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
});

describe('Integration: GET /v1/account/email [CRITICAL-1]', () => {
  it('returns the persisted account email for the owner', async () => {
    const ownerProfileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/account/email',
      {
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ email: AUTH_EMAIL });
  });

  it('returns 401 without authentication', async () => {
    const res = await app.request('/v1/account/email', {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe('Integration: POST /v1/account/security-event [CRITICAL-2a]', () => {
  it('emits app/account.security-event to the account email on password_added', async () => {
    const ownerProfileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/account/security-event',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ event: 'password_added' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(getCapturedInngestEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app/account.security-event',
          data: expect.objectContaining({
            type: 'password_added',
            to: AUTH_EMAIL,
            timestamp: expect.any(String),
          }),
        }),
      ]),
    );
  });

  it('rejects a server-only / unknown event type with 400', async () => {
    const ownerProfileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/account/security-event',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ event: 'email_changed' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without authentication', async () => {
    const res = await app.request(
      '/v1/account/security-event',
      { method: 'POST', body: JSON.stringify({ event: 'password_added' }) },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });
});
