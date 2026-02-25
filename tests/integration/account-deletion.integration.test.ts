/**
 * Integration: Account Deletion (P0-004)
 *
 * Exercises POST /v1/account/delete and POST /v1/account/cancel-deletion
 * via Hono's app.request(). Validates:
 *
 * 1. POST /account/delete returns 200 with gracePeriodEnds
 * 2. POST /account/delete emits app/account.deletion-scheduled Inngest event
 * 3. POST /account/cancel-deletion returns 200
 * 4. Both endpoints require authentication (return 401 without token)
 * 5. Deletion service functions called with correct account ID
 *
 * The actual 7-day grace period and cascade deletion are handled by the
 * Inngest function (tested separately). This test validates the route
 * handlers trigger the correct service calls and events.
 */

// --- Controllable JWT mock ---

import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  billingMock,
  settingsMock,
  sessionMock,
  llmMock,
  configureValidJWT as configureValidJWTHelper,
} from './mocks';

const jwtMocks = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwtMocks);

// --- Deletion service mock ---
const mockScheduleDeletion = jest.fn();
const mockCancelDeletion = jest.fn();
const mockGetProfileIdsForAccount = jest.fn();

jest.mock('../../apps/api/src/services/deletion', () => ({
  scheduleDeletion: mockScheduleDeletion,
  cancelDeletion: mockCancelDeletion,
  getProfileIdsForAccount: mockGetProfileIdsForAccount,
  isDeletionCancelled: jest.fn(),
  executeDeletion: jest.fn(),
  deleteProfile: jest.fn(),
}));

// --- Export service mock (account routes also mount /account/export) ---
jest.mock('../../apps/api/src/services/export', () => ({
  generateExport: jest.fn().mockResolvedValue({ profiles: [], subjects: [] }),
}));

// --- Base mocks (middleware chain requires these) ---

const MOCK_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const mockInngestSend = jest.fn().mockResolvedValue({ ids: [] });

jest.mock('@eduagent/database', () => databaseMock());
jest.mock('../../apps/api/src/inngest/client', () =>
  inngestClientMock(mockInngestSend)
);
jest.mock('../../apps/api/src/services/account', () =>
  accountMock({
    id: MOCK_ACCOUNT_ID,
    clerkUserId: 'user_deletion_test',
    email: 'deletion-test@test.com',
  })
);
jest.mock('../../apps/api/src/services/billing', () =>
  billingMock(MOCK_ACCOUNT_ID)
);
jest.mock('../../apps/api/src/services/settings', () => settingsMock());
jest.mock('../../apps/api/src/services/session', () => sessionMock());
jest.mock('../../apps/api/src/services/llm', () => llmMock());

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

function configureValidJWT(): void {
  configureValidJWTHelper(jwtMocks, {
    sub: 'user_deletion_test',
    email: 'deletion-test@test.com',
  });
}

// ---------------------------------------------------------------------------
// Schedule deletion
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/account/delete (P0-004)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT();
  });

  it('returns 200 with gracePeriodEnds', async () => {
    const gracePeriodEnds = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    mockScheduleDeletion.mockResolvedValue({ gracePeriodEnds });
    mockGetProfileIdsForAccount.mockResolvedValue(['prof-1', 'prof-2']);

    const res = await app.request(
      '/v1/account/delete',
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Deletion scheduled');
    expect(body.gracePeriodEnds).toBe(gracePeriodEnds);
  });

  it('calls scheduleDeletion with the correct account ID', async () => {
    mockScheduleDeletion.mockResolvedValue({
      gracePeriodEnds: new Date().toISOString(),
    });
    mockGetProfileIdsForAccount.mockResolvedValue([]);

    await app.request(
      '/v1/account/delete',
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(mockScheduleDeletion).toHaveBeenCalledWith(
      expect.anything(), // db
      MOCK_ACCOUNT_ID
    );
  });

  it('emits app/account.deletion-scheduled Inngest event with profileIds', async () => {
    const profileIds = ['prof-a', 'prof-b', 'prof-c'];

    mockScheduleDeletion.mockResolvedValue({
      gracePeriodEnds: new Date().toISOString(),
    });
    mockGetProfileIdsForAccount.mockResolvedValue(profileIds);

    await app.request(
      '/v1/account/delete',
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/account.deletion-scheduled',
        data: expect.objectContaining({
          accountId: MOCK_ACCOUNT_ID,
          profileIds,
        }),
      })
    );

    // Verify timestamp is included in event data
    const eventData = mockInngestSend.mock.calls[0][0].data;
    expect(eventData.timestamp).toBeDefined();
  });

  it('returns 401 without authentication', async () => {
    const res = await app.request(
      '/v1/account/delete',
      { method: 'POST' }, // no auth header
      TEST_ENV
    );

    expect(res.status).toBe(401);
    expect(mockScheduleDeletion).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cancel deletion
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/account/cancel-deletion (P0-004)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT();
  });

  it('returns 200 with cancellation message', async () => {
    mockCancelDeletion.mockResolvedValue(undefined);

    const res = await app.request(
      '/v1/account/cancel-deletion',
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Deletion cancelled');
  });

  it('calls cancelDeletion with the correct account ID', async () => {
    mockCancelDeletion.mockResolvedValue(undefined);

    await app.request(
      '/v1/account/cancel-deletion',
      { method: 'POST', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(mockCancelDeletion).toHaveBeenCalledWith(
      expect.anything(), // db
      MOCK_ACCOUNT_ID
    );
  });

  it('returns 401 without authentication', async () => {
    const res = await app.request(
      '/v1/account/cancel-deletion',
      { method: 'POST' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
    expect(mockCancelDeletion).not.toHaveBeenCalled();
  });
});
