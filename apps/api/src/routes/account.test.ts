// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// JWKS endpoint is intercepted via globalThis.fetch in beforeAll.
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
      createFunction: jest.fn().mockReturnValue(jest.fn()),
    },
  };
});

jest.mock('../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  db: {
    query: {
      profiles: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  },
  exports: {
    profiles: { accountId: 'accountId' },
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Mock account, deletion, and export services — no DB interaction
// ---------------------------------------------------------------------------

const mockUpdateAccountEmailFromClerk = jest.fn().mockResolvedValue({
  id: 'test-account-id',
  clerkUserId: 'user_test',
  email: 'new@example.com',
  timezone: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    updateAccountEmailFromClerk: (...args: unknown[]) =>
      mockUpdateAccountEmailFromClerk(...args),
  };
});

// [CR-2026-05-19-H1] Mock findOwnerProfile so profileScopeMiddleware auto-resolve
// path sets isOwner:true on profileMeta, allowing owner-gated routes to pass.
jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue({
      id: 'owner-profile-id',
      accountId: 'test-account-id',
      displayName: 'Owner',
      birthYear: 1990,
      location: null,
      consentStatus: null,
      isOwner: true,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
    }),
  };
});

jest.mock('../services/deletion' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/deletion',
  ) as typeof import('../services/deletion');
  return {
    ...actual,
    scheduleDeletion: jest.fn().mockResolvedValue({
      gracePeriodEnds: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      scheduledNow: true,
    }),
    cancelDeletion: jest.fn().mockResolvedValue('cancelled'),
    getDeletionStatus: jest.fn().mockResolvedValue({
      scheduled: true,
      deletionScheduledAt: '2026-02-17T00:00:00.000Z',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    }),
    getProfileIdsForAccount: jest.fn().mockResolvedValue(['profile-1']),
  };
});

jest.mock('../services/export' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/export',
  ) as typeof import('../services/export');
  return {
    ...actual,
    generateExport: jest.fn().mockResolvedValue({
      account: {
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      },
      profiles: [],
      consentStates: [],
      exportedAt: new Date().toISOString(),
    }),
  };
});

// [CUT-B2] v2 identity resolver — returns the same account as the v1 path so
// account-middleware resolveIdentityV2 does not hit the unmocked DB.
jest.mock(
  '../services/identity-v2/identity-resolve' /* gc1-allow: route unit test — DB mocked; resolver covered by identity integration tests */,
  () => ({
    resolveIdentityV2: jest.fn().mockResolvedValue({
      account: {
        id: 'test-account-id',
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      personId: 'person-test-id',
      organizationId: 'test-account-id',
      isOwner: true,
      roles: ['admin'],
    }),
  }),
);

// [CUT-B2] v2 profile-scope resolver — returns the owner profile-meta so
// profile-scope middleware findOwnerPersonScope does not hit the unmocked DB.
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: route unit test — DB mocked; profile scope covered by identity integration tests */,
  () => ({
    findOwnerPersonScope: jest.fn().mockResolvedValue({
      profileId: 'owner-profile-id',
      meta: {
        birthYear: 1990,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    }),
    getPersonScope: jest.fn().mockResolvedValue(null),
  }),
);

// [CUT-B2] v2 twins — mocked so route unit tests can assert dispatch without
// a real DB. External-DB tests live in integration suites.
jest.mock(
  '../services/identity-v2/deletion-v2' /* gc1-allow: route unit test — DB mocked; v2 covered by integration tests */,
  () => ({
    scheduleDeletionV2: jest.fn().mockResolvedValue({
      gracePeriodEnds: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      scheduledNow: true,
    }),
    cancelDeletionV2: jest.fn().mockResolvedValue('cancelled'),
    getDeletionStatusV2: jest.fn().mockResolvedValue({
      scheduled: true,
      deletionScheduledAt: '2026-02-17T00:00:00.000Z',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    }),
    getPersonIdsForOrganizationV2: jest.fn().mockResolvedValue(['person-1']),
  }),
);

jest.mock(
  '../services/identity-v2/export-v2' /* gc1-allow: route unit test — DB mocked; v2 covered by integration tests */,
  () => ({
    generateExportV2: jest.fn().mockResolvedValue({
      account: {
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      },
      profiles: [],
      consentStates: [],
      exportedAt: new Date().toISOString(),
    }),
  }),
);

import { app } from '../index';
import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import {
  cancelDeletion,
  getProfileIdsForAccount,
  getDeletionStatus,
  scheduleDeletion,
} from '../services/deletion';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { NotFoundError } from '../errors';
import { findOwnerProfile } from '../services/profile';
import { ERROR_CODES } from '@eduagent/schemas';
import {
  scheduleDeletionV2,
  cancelDeletionV2,
  getDeletionStatusV2,
  getPersonIdsForOrganizationV2,
} from '../services/identity-v2/deletion-v2';
import { generateExportV2 } from '../services/identity-v2/export-v2';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  CLERK_SECRET_KEY: 'sk_test',
};

describe('account routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
  });

  // -------------------------------------------------------------------------
  // GET /v1/account/deletion-status
  // -------------------------------------------------------------------------

  describe('GET /v1/account/deletion-status', () => {
    it('returns the authenticated account deletion status', async () => {
      const res = await app.request(
        '/v1/account/deletion-status',
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        scheduled: true,
        deletionScheduledAt: '2026-02-17T00:00:00.000Z',
        gracePeriodEnds: '2026-02-24T00:00:00.000Z',
      });
    });

    it('returns 404 when the authenticated account disappears before status lookup', async () => {
      (getDeletionStatus as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('Account'),
      );

      const res = await app.request(
        '/v1/account/deletion-status',
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        code: 'NOT_FOUND',
        message: 'Account not found',
      });
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/account/deletion-status',
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/account/delete
  // -------------------------------------------------------------------------

  describe('POST /v1/account/delete', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns 200 with deletion schedule', async () => {
      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Deletion scheduled');
      expect(typeof body.gracePeriodEnds).toBe('string');
      expect(() => new Date(body.gracePeriodEnds)).not.toThrow();
    });

    it('[WI-84 DS-045] returns 503 and does not claim deletion scheduled when Inngest dispatch fails', async () => {
      const dispatchError = new Error('Inngest unavailable');
      (inngest.send as jest.Mock).mockRejectedValueOnce(dispatchError);

      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toMatchObject({
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
      });
      expect(cancelDeletion).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
      expect(captureException).toHaveBeenCalledWith(dispatchError, {
        extra: {
          surface: 'account.deletion',
          kind: 'core-send',
          accountId: 'test-account-id',
        },
      });
    });

    it('[WI-84 review] reports rollback failure when dispatch compensation fails', async () => {
      const dispatchError = new Error('Inngest unavailable');
      const rollbackError = new Error('rollback unavailable');
      (inngest.send as jest.Mock).mockRejectedValueOnce(dispatchError);
      (cancelDeletion as jest.Mock).mockRejectedValueOnce(rollbackError);

      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toMatchObject({
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
      });
      expect(captureException).toHaveBeenCalledWith(dispatchError, {
        extra: {
          surface: 'account.deletion',
          kind: 'core-send',
          accountId: 'test-account-id',
        },
      });
      expect(captureException).toHaveBeenCalledWith(rollbackError, {
        extra: {
          surface: 'account.deletion',
          kind: 'core-send-rollback',
          accountId: 'test-account-id',
        },
      });
    });

    it('[WI-84 review] rolls back and returns 503 if profile lookup fails after scheduling', async () => {
      const lookupError = new Error('profile lookup unavailable');
      (getProfileIdsForAccount as jest.Mock).mockRejectedValueOnce(lookupError);

      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toMatchObject({
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
      });
      expect(cancelDeletion).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
      expect(captureException).toHaveBeenCalledWith(lookupError, {
        extra: {
          surface: 'account.deletion',
          kind: 'core-send',
          accountId: 'test-account-id',
        },
      });
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it('[WI-84 review] dispatches an idempotent deletion event when deletion was already scheduled', async () => {
      (scheduleDeletion as jest.Mock).mockResolvedValueOnce({
        gracePeriodEnds: '2026-02-24T00:00:00.000Z',
        scheduledNow: false,
      });

      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        message: 'Deletion scheduled',
        gracePeriodEnds: '2026-02-24T00:00:00.000Z',
      });
      expect(inngest.send).toHaveBeenCalledWith({
        name: 'app/account.deletion-scheduled',
        data: expect.objectContaining({
          accountId: 'test-account-id',
          profileIds: ['profile-1'],
          timestamp: expect.any(String),
        }),
      });
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/account/delete',
        { method: 'POST' },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/account/cancel-deletion
  // -------------------------------------------------------------------------

  describe('POST /v1/account/cancel-deletion', () => {
    it('returns 200 with cancellation confirmation', async () => {
      const res = await app.request(
        '/v1/account/cancel-deletion',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Deletion cancelled');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/account/cancel-deletion',
        { method: 'POST' },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    // [BUG-412] Break test: service returns 'no_active_deletion' → route must
    // respond 409 CONFLICT, not 200. Before the fix, cancelDeletion returned
    // void so the route always returned 200 regardless.
    it('[BUG-412] returns 409 when there is no active deletion to cancel', async () => {
      (cancelDeletion as jest.Mock).mockResolvedValueOnce('no_active_deletion');

      const res = await app.request(
        '/v1/account/cancel-deletion',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.CONFLICT });
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/account/export
  // -------------------------------------------------------------------------

  describe('GET /v1/account/export', () => {
    it('returns 200 with data export', async () => {
      const res = await app.request(
        '/v1/account/export',
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.account).toEqual(expect.objectContaining({}));
      expect(typeof body.exportedAt).toBe('string');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/account/export', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /v1/account/email
  // -------------------------------------------------------------------------

  describe('PATCH /v1/account/email', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockUpdateAccountEmailFromClerk.mockResolvedValue({
        id: 'test-account-id',
        clerkUserId: 'user_test',
        email: 'new@example.com',
        timezone: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('syncs the authenticated account email after Clerk primary email changes', async () => {
      const res = await app.request(
        '/v1/account/email',
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ email: 'new@example.com' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        email: 'new@example.com',
      });
      expect(mockUpdateAccountEmailFromClerk).toHaveBeenCalledWith(
        expect.anything(),
        {
          clerkSecretKey: 'sk_test',
          clerkUserId: 'user_test',
          requestedEmail: 'new@example.com',
        },
      );
    });

    it('returns 400 for invalid email input', async () => {
      const res = await app.request(
        '/v1/account/email',
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ email: 'not-an-email' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdateAccountEmailFromClerk).not.toHaveBeenCalled();
    });

    it('returns 409 when the service reports an email conflict', async () => {
      const { ConflictError } = jest.requireActual('@eduagent/schemas') as {
        ConflictError: new (message: string) => Error;
      };
      mockUpdateAccountEmailFromClerk.mockRejectedValueOnce(
        new ConflictError('An account with this email already exists.'),
      );

      const res = await app.request(
        '/v1/account/email',
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ email: 'new@example.com' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.CONFLICT });
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/account/email  — [CRITICAL-1] reconciler source
  // -------------------------------------------------------------------------

  describe('GET /v1/account/email', () => {
    it('returns the persisted account email for the owner', async () => {
      const res = await app.request(
        '/v1/account/email',
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ email: 'test@example.com' });
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/account/email', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/account/security-event  — [CRITICAL-2a] password-change ping
  // -------------------------------------------------------------------------

  describe('POST /v1/account/security-event', () => {
    const inngestMock = jest.requireMock('../inngest/client') as {
      inngest: { send: jest.Mock };
    };

    beforeEach(() => {
      inngestMock.inngest.send.mockClear();
      inngestMock.inngest.send.mockResolvedValue(undefined);
    });

    it('dispatches a security-event to the current account email for the owner', async () => {
      const res = await app.request(
        '/v1/account/security-event',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ event: 'password_added' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
      expect(inngestMock.inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/account.security-event',
          data: expect.objectContaining({
            type: 'password_added',
            to: 'test@example.com',
          }),
        }),
      );
    });

    it('returns 400 for an unknown event type', async () => {
      const res = await app.request(
        '/v1/account/security-event',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ event: 'email_changed' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(inngestMock.inngest.send).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/account/security-event',
        { method: 'POST', body: JSON.stringify({ event: 'password_added' }) },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // [CR-2026-05-19-H1] Break tests — non-owner profile must be rejected from
  // all owner-gated account routes. Uses X-Profile-Id to exercise the explicit
  // path in profileScopeMiddleware (which reads isOwner from DB / mock).
  // -------------------------------------------------------------------------

  describe('[CR-2026-05-19-H1] non-owner profile is rejected from owner-gated account routes', () => {
    const NON_OWNER_PROFILE_ID = 'b0000000-0000-4000-b000-000000000001';

    beforeEach(() => {
      mockUpdateAccountEmailFromClerk.mockClear();
      // Override getProfile so X-Profile-Id resolves to a non-owner profile.
      (findOwnerProfile as jest.Mock).mockResolvedValue(null);
      // Also override via getProfile path for X-Profile-Id header.
      const profileServiceMock = jest.requireMock(
        '../services/profile',
      ) as Record<string, jest.Mock>;
      profileServiceMock.getProfile = jest.fn().mockResolvedValue({
        id: NON_OWNER_PROFILE_ID,
        accountId: 'test-account-id',
        displayName: 'Child',
        birthYear: 2012,
        location: null,
        consentStatus: null,
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
      });
    });

    const nonOwnerHeaders = makeAuthHeaders({
      'X-Profile-Id': NON_OWNER_PROFILE_ID,
    });

    it('[BREAK] POST /v1/account/delete returns 403 for non-owner profile', async () => {
      const res = await app.request(
        '/v1/account/delete',
        { method: 'POST', headers: nonOwnerHeaders },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      // toEqual (not toMatchObject): assert the exact serialized body so the
      // assertOwnerProfile message-passthrough is proven. The thrown
      // ForbiddenError's apiCode is undefined → dropped by JSON, so the body
      // is exactly { code, message }.
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can delete the account.',
      });
    });

    it('[BREAK] POST /v1/account/cancel-deletion returns 403 for non-owner profile', async () => {
      const res = await app.request(
        '/v1/account/cancel-deletion',
        { method: 'POST', headers: nonOwnerHeaders },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can cancel account deletion.',
      });
    });

    it('[BREAK] GET /v1/account/export returns 403 for non-owner profile', async () => {
      const res = await app.request(
        '/v1/account/export',
        { headers: nonOwnerHeaders },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can export account data.',
      });
    });

    it('[BREAK auth-2] PATCH /v1/account/email returns 403 for non-owner profile', async () => {
      const res = await app.request(
        '/v1/account/email',
        {
          method: 'PATCH',
          headers: nonOwnerHeaders,
          body: JSON.stringify({ email: 'new@example.com' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can change account email.',
      });
      expect(mockUpdateAccountEmailFromClerk).not.toHaveBeenCalled();
    });

    it('[BREAK CRITICAL-1] GET /v1/account/email returns 403 for non-owner profile', async () => {
      const res = await app.request(
        '/v1/account/email',
        { headers: nonOwnerHeaders },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can view the account email.',
      });
    });

    it('[BREAK CRITICAL-2a] POST /v1/account/security-event returns 403 for non-owner profile', async () => {
      const inngestMock = jest.requireMock('../inngest/client') as {
        inngest: { send: jest.Mock };
      };
      inngestMock.inngest.send.mockClear();

      const res = await app.request(
        '/v1/account/security-event',
        {
          method: 'POST',
          headers: nonOwnerHeaders,
          body: JSON.stringify({ event: 'password_added' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can manage account security.',
      });
      // The non-owner must not be able to trigger a notification dispatch.
      expect(inngestMock.inngest.send).not.toHaveBeenCalled();
    });

    it('[BREAK F-125] GET /v1/account/deletion-status returns 403 for non-owner profile', async () => {
      // F-125: GET /account/deletion-status was missing the assertOwnerProfile
      // gate that its three sibling routes (/email, /security-event, /export) all
      // enforce. A child profile on a family account could query the parent's
      // deletion schedule.
      const res = await app.request(
        '/v1/account/deletion-status',
        { headers: nonOwnerHeaders },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can view deletion status.',
      });
    });
  });

  // -------------------------------------------------------------------------
  // [CUT-B2] v2 dispatch — flag=true routes to v2 twins
  // -------------------------------------------------------------------------

  const V2_TEST_ENV = { ...TEST_ENV, IDENTITY_V2_ENABLED: 'true' };

  describe('[CUT-B2] v2 dispatch: deletion + export routes route to v2 twins', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('[CUT-B2] GET /v1/account/deletion-status calls getDeletionStatusV2 when flag on', async () => {
      const res = await app.request(
        '/v1/account/deletion-status',
        { headers: makeAuthHeaders() },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        scheduled: true,
        deletionScheduledAt: '2026-02-17T00:00:00.000Z',
        gracePeriodEnds: '2026-02-24T00:00:00.000Z',
      });
      expect(getDeletionStatusV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
    });

    it('[CUT-B2] POST /v1/account/delete calls scheduleDeletionV2 + getPersonIdsForOrganizationV2 when flag on', async () => {
      const res = await app.request(
        '/v1/account/delete',
        { method: 'POST', headers: makeAuthHeaders() },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(scheduleDeletionV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
      expect(getPersonIdsForOrganizationV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
    });

    it('[CUT-B2] POST /v1/account/delete rolls back via cancelDeletionV2 when Inngest fails + flag on', async () => {
      const { inngest: inngestMock } = jest.requireMock(
        '../inngest/client',
      ) as {
        inngest: { send: jest.Mock };
      };
      inngestMock.send.mockRejectedValueOnce(new Error('Inngest unavailable'));

      const res = await app.request(
        '/v1/account/delete',
        { method: 'POST', headers: makeAuthHeaders() },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(503);
      expect(cancelDeletionV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
    });

    it('[CUT-B2] POST /v1/account/cancel-deletion calls cancelDeletionV2 when flag on', async () => {
      const res = await app.request(
        '/v1/account/cancel-deletion',
        { method: 'POST', headers: makeAuthHeaders() },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(cancelDeletionV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
    });

    it('[CUT-B2] GET /v1/account/export calls generateExportV2 when flag on', async () => {
      const res = await app.request(
        '/v1/account/export',
        { headers: makeAuthHeaders() },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.exportedAt).toBe('string');
      expect(generateExportV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
    });

    // [BREAK] Cross-account export ownership guard — the v2 export must be
    // scoped to the authenticated account's org; a different org's ID must
    // never be passed to generateExportV2. This test verifies that the route
    // passes account.id (the auth-resolved org) and not any attacker-supplied
    // identifier, regardless of flag state.
    //
    // Red-before-green: if the route were to pass an arbitrary org ID from the
    // request body / header instead of account.id, generateExportV2 would be
    // called with the wrong org and cross-org data could leak. This test pins
    // the correct call argument.
    it('[BREAK CUT-B2] GET /v1/account/export passes the authenticated org id to generateExportV2 — not a caller-supplied id', async () => {
      const res = await app.request(
        '/v1/account/export',
        {
          headers: {
            ...makeAuthHeaders(),
            // Attacker supplies a different org id in a custom header —
            // the route must ignore it and use account.id from auth context.
            'X-Org-Id': 'attacker-org-id',
          },
        },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(200);
      // The authenticated account id ('test-account-id') must be used.
      expect(generateExportV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
      // Must never be called with the attacker-supplied id.
      expect(generateExportV2).not.toHaveBeenCalledWith(
        expect.anything(),
        'attacker-org-id',
      );
    });

    // [BREAK] Cross-account deletion ownership guard — similarly, scheduleDeletionV2
    // must be called with the auth-resolved account.id, never a caller-supplied id.
    it('[BREAK CUT-B2] POST /v1/account/delete passes the authenticated org id to scheduleDeletionV2 — not a caller-supplied id', async () => {
      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: {
            ...makeAuthHeaders(),
            'X-Org-Id': 'attacker-org-id',
          },
        },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(scheduleDeletionV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
      expect(scheduleDeletionV2).not.toHaveBeenCalledWith(
        expect.anything(),
        'attacker-org-id',
      );
    });
  });
});
