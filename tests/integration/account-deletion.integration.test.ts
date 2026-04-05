/**
 * Integration: Account Deletion (P0-004)
 *
 * Exercises POST /v1/account/delete, POST /v1/account/cancel-deletion, and
 * GET /v1/account/export via the real app + real database.
 *
 * Mocked boundaries:
 * - JWT verification (Clerk JWKS)
 * - Inngest transport (external event dispatch — asserted but not delivered)
 *
 * Validates:
 * 1. POST /account/delete returns 200 with gracePeriodEnds
 * 2. POST /account/delete sets deletionScheduledAt on the account row
 * 3. POST /account/delete emits app/account.deletion-scheduled Inngest event
 * 4. POST /account/cancel-deletion returns 200 and sets deletionCancelledAt
 * 5. GET /account/export returns profile data for the account
 * 6. Both mutation endpoints require authentication (401 without token)
 */

import { eq } from 'drizzle-orm';
import { accounts } from '@eduagent/database';

import { jwtMock, configureValidJWT, configureInvalidJWT } from './mocks';
import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';

// --- JWT mock (external boundary) ---
const jwt = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwt);

// --- Inngest transport mock (external boundary) ---
const mockInngestSend = jest.fn().mockResolvedValue({ ids: [] });
const mockInngestCreateFunction = jest.fn().mockImplementation((config) => {
  const id = config?.id ?? 'mock-inngest-function';
  const fn = jest.fn();
  (fn as { getConfig: () => unknown[] }).getConfig = () => [
    { id, name: id, triggers: [], steps: {} },
  ];
  return fn;
});

jest.mock('../../apps/api/src/inngest/client', () => ({
  inngest: {
    send: mockInngestSend,
    createFunction: mockInngestCreateFunction,
  },
}));

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const AUTH_USER_ID = 'integration-deletion-user';
const AUTH_EMAIL = 'integration-deletion@integration.test';

function buildAuthHeaders(profileId?: string): HeadersInit {
  return {
    Authorization: 'Bearer valid.jwt.token',
    'Content-Type': 'application/json',
    ...(profileId ? { 'X-Profile-Id': profileId } : {}),
  };
}

async function createOwnerProfile(): Promise<string> {
  configureValidJWT(jwt, { sub: AUTH_USER_ID, email: AUTH_EMAIL });

  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        displayName: 'Deletion Test User',
        birthYear: 2000,
      }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

beforeEach(async () => {
  jest.clearAllMocks();
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

// ---------------------------------------------------------------------------
// Schedule deletion
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/account/delete (P0-004)', () => {
  it('returns 200 with gracePeriodEnds', async () => {
    await createOwnerProfile();
    configureValidJWT(jwt, { sub: AUTH_USER_ID, email: AUTH_EMAIL });

    const res = await app.request(
      '/v1/account/delete',
      { method: 'POST', headers: buildAuthHeaders() },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Deletion scheduled');
    expect(body.gracePeriodEnds).toBeDefined();

    // Grace period should be ~7 days from now
    const grace = new Date(body.gracePeriodEnds);
    const now = new Date();
    const diffDays = (grace.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('sets deletionScheduledAt on the account row', async () => {
    await createOwnerProfile();
    configureValidJWT(jwt, { sub: AUTH_USER_ID, email: AUTH_EMAIL });

    const db = createIntegrationDb();

    // Before deletion: no scheduledAt
    const before = await db.query.accounts.findFirst({
      where: eq(accounts.clerkUserId, AUTH_USER_ID),
    });
    expect(before).toBeDefined();
    expect(before!.deletionScheduledAt).toBeNull();

    await app.request(
      '/v1/account/delete',
      { method: 'POST', headers: buildAuthHeaders() },
      TEST_ENV
    );

    // After deletion: scheduledAt is set
    const after = await db.query.accounts.findFirst({
      where: eq(accounts.clerkUserId, AUTH_USER_ID),
    });
    expect(after!.deletionScheduledAt).not.toBeNull();
  });

  it('emits app/account.deletion-scheduled Inngest event with profileIds', async () => {
    const profileId = await createOwnerProfile();
    configureValidJWT(jwt, { sub: AUTH_USER_ID, email: AUTH_EMAIL });

    await app.request(
      '/v1/account/delete',
      { method: 'POST', headers: buildAuthHeaders() },
      TEST_ENV
    );

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/account.deletion-scheduled',
        data: expect.objectContaining({
          profileIds: expect.arrayContaining([profileId]),
          timestamp: expect.any(String),
        }),
      })
    );
  });

  it('returns 401 without authentication', async () => {
    configureInvalidJWT(jwt);

    const res = await app.request(
      '/v1/account/delete',
      { method: 'POST' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cancel deletion
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/account/cancel-deletion (P0-004)', () => {
  it('returns 200 with cancellation message', async () => {
    await createOwnerProfile();
    configureValidJWT(jwt, { sub: AUTH_USER_ID, email: AUTH_EMAIL });

    // Schedule first, then cancel
    await app.request(
      '/v1/account/delete',
      { method: 'POST', headers: buildAuthHeaders() },
      TEST_ENV
    );

    const res = await app.request(
      '/v1/account/cancel-deletion',
      { method: 'POST', headers: buildAuthHeaders() },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Deletion cancelled');
  });

  it('sets deletionCancelledAt on the account row', async () => {
    await createOwnerProfile();
    configureValidJWT(jwt, { sub: AUTH_USER_ID, email: AUTH_EMAIL });

    // Schedule then cancel
    await app.request(
      '/v1/account/delete',
      { method: 'POST', headers: buildAuthHeaders() },
      TEST_ENV
    );
    await app.request(
      '/v1/account/cancel-deletion',
      { method: 'POST', headers: buildAuthHeaders() },
      TEST_ENV
    );

    const db = createIntegrationDb();
    const row = await db.query.accounts.findFirst({
      where: eq(accounts.clerkUserId, AUTH_USER_ID),
    });
    expect(row!.deletionScheduledAt).not.toBeNull();
    expect(row!.deletionCancelledAt).not.toBeNull();
    // Cancelled timestamp should be after scheduled timestamp
    expect(row!.deletionCancelledAt!.getTime()).toBeGreaterThan(
      row!.deletionScheduledAt!.getTime()
    );
  });

  it('returns 401 without authentication', async () => {
    configureInvalidJWT(jwt);

    const res = await app.request(
      '/v1/account/cancel-deletion',
      { method: 'POST' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Data export
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/account/export', () => {
  it('returns exported data including profiles', async () => {
    const profileId = await createOwnerProfile();
    configureValidJWT(jwt, { sub: AUTH_USER_ID, email: AUTH_EMAIL });

    const res = await app.request(
      '/v1/account/export',
      { method: 'GET', headers: buildAuthHeaders() },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account).toBeDefined();
    expect(body.profiles).toBeDefined();
    expect(body.profiles.length).toBeGreaterThanOrEqual(1);
    expect(body.profiles.some((p: { id: string }) => p.id === profileId)).toBe(
      true
    );
  });
});
