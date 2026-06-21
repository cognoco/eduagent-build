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
    captureMessage: jest.fn(),
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

// Shared owner profile id. Owner-gated route tests send this as an explicit
// X-Profile-Id (see OWNER_AUTH_HEADERS) so profileScopeMiddleware resolves it
// via the verified `getProfile` path (resolvedVia:'explicit-header'). The
// auto-resolve (no-header) path is deliberately NOT used for owner-gated routes
// — after the Issue 901 fix, an auto-synthesized owner is rejected by the owner
// gates (a non-owner can omit X-Profile-Id; auto-resolution must not confer
// owner privileges).
const OWNER_PROFILE_ID = 'a0000000-0000-4000-a000-000000000001';

// [CR-2026-05-19-H1] Mock findOwnerProfile (auto-resolve path) and getProfile
// (explicit-header path) so owner-gated routes resolve an owner profile.
// NOTE: the OWNER_PROFILE_ID literal is duplicated inside this factory because
// jest hoists jest.mock() above the const declaration above; referencing the
// const here would throw "Cannot access before initialization". The two must
// stay in sync — enforced implicitly: the success-path tests fail
// (getProfile/findOwnerProfile returns null → 403) if the literals diverge.
jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  const ownerProfileId = 'a0000000-0000-4000-a000-000000000001';
  const ownerProfile = {
    id: ownerProfileId,
    accountId: 'test-account-id',
    displayName: 'Owner',
    birthYear: 1990,
    location: null,
    consentStatus: null,
    isOwner: true,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
  };
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue(ownerProfile),
    getProfile: jest.fn().mockImplementation((_db, profileId, accountId) => {
      if (profileId === ownerProfileId && accountId === 'test-account-id') {
        return Promise.resolve(ownerProfile);
      }
      return Promise.resolve(null);
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
      profileId: 'a0000000-0000-4000-a000-000000000001',
      meta: {
        birthYear: 1990,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    }),
    // [Issue 901] Resolve the explicit owner X-Profile-Id to the owner scope so
    // v2 owner-gated route tests exercise the verified explicit-header path.
    getPersonScope: jest
      .fn()
      .mockImplementation((_db, profileId, organizationId) => {
        if (
          profileId === 'a0000000-0000-4000-a000-000000000001' &&
          organizationId === 'test-account-id'
        ) {
          return Promise.resolve({
            profileId: 'a0000000-0000-4000-a000-000000000001',
            meta: {
              birthYear: 1990,
              location: null,
              consentStatus: null,
              hasPremiumLlm: false,
              conversationLanguage: 'en',
              isOwner: true,
            },
          });
        }
        return Promise.resolve(null);
      }),
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
import { captureException, captureMessage } from '../services/sentry';
import {
  cancelDeletion,
  getProfileIdsForAccount,
  getDeletionStatus,
  scheduleDeletion,
} from '../services/deletion';
import { generateExport } from '../services/export';
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

// [Issue 901] Owner-gated route success-path tests must send an explicit owner
// X-Profile-Id. After the fix, an auto-synthesized owner (no X-Profile-Id) is
// rejected by the owner gates, so the no-header path no longer confers owner
// privileges. These headers exercise the verified explicit-header path.
const ownerAuthHeaders = (extra?: Record<string, string>) =>
  makeAuthHeaders({ 'X-Profile-Id': OWNER_PROFILE_ID, ...extra });

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
        { headers: ownerAuthHeaders() },
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
        { headers: ownerAuthHeaders() },
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
          headers: ownerAuthHeaders(),
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
          headers: ownerAuthHeaders(),
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
          headers: ownerAuthHeaders(),
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
          headers: ownerAuthHeaders(),
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
          headers: ownerAuthHeaders(),
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
          // [CUT-B2] mode pinned at schedule time — legacy path stamps 'v1'.
          identityVersion: 'v1',
          timestamp: expect.any(String),
        }),
      });
    });

    it('[orphan-schedule] surfaces orphan-recovery telemetry when re-dispatching for an already-scheduled deletion', async () => {
      (scheduleDeletion as jest.Mock).mockResolvedValueOnce({
        gracePeriodEnds: '2026-02-24T00:00:00.000Z',
        scheduledNow: false,
      });

      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: ownerAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // The core durable handoff is re-dispatched (orphan recovery)...
      expect(inngest.send).toHaveBeenCalledWith({
        name: 'app/account.deletion-scheduled',
        data: expect.objectContaining({ accountId: 'test-account-id' }),
      });
      // ...and the orphan condition is surfaced as a tracked Sentry signal so a
      // prior orphaned schedule (DB write succeeded, durable handoff lost) is
      // observable rather than recovered silently. It is captureMessage, not a
      // new Inngest event, because the signal has no consumer (a producer-only
      // event would trip the orphan-dispatcher guard).
      expect(captureMessage).toHaveBeenCalledWith(
        'account.deletion orphan schedule re-dispatched',
        expect.objectContaining({
          level: 'warning',
          extra: expect.objectContaining({
            surface: 'account.deletion.orphan_recovered',
            accountId: 'test-account-id',
            identityVersion: 'v1',
          }),
        }),
      );
    });

    it('[orphan-schedule] does not surface orphan-recovery telemetry on the normal first-schedule path', async () => {
      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: ownerAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(captureMessage).not.toHaveBeenCalled();
    });

    it('[orphan-schedule] still returns 200 when the orphan-recovery telemetry throws', async () => {
      (scheduleDeletion as jest.Mock).mockResolvedValueOnce({
        gracePeriodEnds: '2026-02-24T00:00:00.000Z',
        scheduledNow: false,
      });
      // A Sentry SDK throw on the observability signal must never propagate to
      // the outer catch and convert the successfully re-dispatched schedule
      // into a 503 — the captureMessage call is fault-isolated.
      (captureMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('sentry transport down');
      });

      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: ownerAuthHeaders(),
        },
        TEST_ENV,
      );

      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.message).toBe('Deletion scheduled');
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
          headers: ownerAuthHeaders(),
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
          headers: ownerAuthHeaders(),
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
        { headers: ownerAuthHeaders() },
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
          headers: ownerAuthHeaders(),
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
          headers: ownerAuthHeaders(),
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
          headers: ownerAuthHeaders(),
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
        { headers: ownerAuthHeaders() },
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
          headers: ownerAuthHeaders(),
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
          headers: ownerAuthHeaders(),
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
  // [Issue 901] BREAK — owner-gated routes must NOT be reachable by simply
  // omitting X-Profile-Id. profileScopeMiddleware auto-resolves the account
  // OWNER profile (isOwner:true) on the no-header path; before the fix an
  // authenticated NON-OWNER caller could exploit this to pass the owner gates
  // (privilege escalation). These tests send a valid auth token but NO
  // X-Profile-Id and NO X-Proxy-Mode header — the exact attack — and assert a
  // 403 plus that the side-effecting service was never invoked.
  //
  // The findOwnerProfile mock (top of file) still returns isOwner:true, so the
  // auto-resolve succeeds; the rejection comes purely from resolvedVia:'auto'
  // being refused by assertOwnerProfile / assertNotProxyMode.
  // -------------------------------------------------------------------------

  describe('[Issue 901] no-header auto-resolve must not confer owner privileges', () => {
    // [Issue 901 / CONSIDER] makeAuthHeaders() here represents ANY account-level
    // JWT (owner OR child) — the vulnerability is header ABSENCE, not caller
    // identity: any authenticated caller who omits X-Profile-Id is auto-resolved
    // to the owner. The non-owner-CALLER path (a child's own JWT omitting the
    // header) is covered by the account-deletion integration negative test.
    beforeEach(() => {
      jest.clearAllMocks();
      mockUpdateAccountEmailFromClerk.mockClear();
      // Reproduce the EXACT attack: findOwnerProfile DOES succeed and returns
      // the OWNER (isOwner:true) — the no-header auto-resolve path. The prior
      // describe block leaves findOwnerProfile resolving null, so restore the
      // owner here. The rejection must therefore come from resolvedVia:'auto',
      // not from an absent profileMeta.
      (findOwnerProfile as jest.Mock).mockResolvedValue({
        id: OWNER_PROFILE_ID,
        accountId: 'test-account-id',
        displayName: 'Owner',
        birthYear: 1990,
        location: null,
        consentStatus: null,
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
      });
    });

    it('[BREAK] POST /v1/account/delete returns 403 when X-Profile-Id is omitted', async () => {
      const res = await app.request(
        '/v1/account/delete',
        { method: 'POST', headers: makeAuthHeaders() },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can delete the account.',
      });
      // The destructive side effect must never have been scheduled.
      expect(scheduleDeletion).not.toHaveBeenCalled();
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it('[BREAK] GET /v1/account/export returns 403 when X-Profile-Id is omitted', async () => {
      const res = await app.request(
        '/v1/account/export',
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can export account data.',
      });
      expect(generateExport).not.toHaveBeenCalled();
    });

    it('[BREAK] POST /v1/account/cancel-deletion returns 403 when X-Profile-Id is omitted', async () => {
      const res = await app.request(
        '/v1/account/cancel-deletion',
        { method: 'POST', headers: makeAuthHeaders() },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can cancel account deletion.',
      });
      expect(cancelDeletion).not.toHaveBeenCalled();
    });

    it('[BREAK] PATCH /v1/account/email returns 403 when X-Profile-Id is omitted', async () => {
      const res = await app.request(
        '/v1/account/email',
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
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

    it('[BREAK] POST /v1/account/security-event returns 403 when X-Profile-Id is omitted', async () => {
      const res = await app.request(
        '/v1/account/security-event',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
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
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it('[BREAK] GET /v1/account/deletion-status returns 403 when X-Profile-Id is omitted', async () => {
      const res = await app.request(
        '/v1/account/deletion-status',
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can view deletion status.',
      });
      expect(getDeletionStatus).not.toHaveBeenCalled();
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
        { headers: ownerAuthHeaders() },
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
        { method: 'POST', headers: ownerAuthHeaders() },
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
      // [CUT-B2] mode pinned at schedule time — v2 path stamps 'v2' on the
      // event so the 7-day-later resume runs against the org store even if the
      // flag flips mid-grace-period (the CODEX-P1 GDPR-skip guard).
      expect(inngest.send).toHaveBeenCalledWith({
        name: 'app/account.deletion-scheduled',
        data: expect.objectContaining({
          accountId: 'test-account-id',
          identityVersion: 'v2',
        }),
      });
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
        { method: 'POST', headers: ownerAuthHeaders() },
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
        { method: 'POST', headers: ownerAuthHeaders() },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(cancelDeletionV2).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
      );
    });

    // [BUG-412 parity] The 409 "nothing to cancel" branch must hold on the v2
    // path too: cancelDeletionV2 returning 'no_active_deletion' must produce a
    // 409 CONFLICT, not a 200. Mirrors the v1 [BUG-412] test above.
    it('[CUT-B2] POST /v1/account/cancel-deletion returns 409 when cancelDeletionV2 finds no active deletion', async () => {
      (cancelDeletionV2 as jest.Mock).mockResolvedValueOnce(
        'no_active_deletion',
      );

      const res = await app.request(
        '/v1/account/cancel-deletion',
        { method: 'POST', headers: ownerAuthHeaders() },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe(ERROR_CODES.CONFLICT);
    });

    it('[CUT-B2] GET /v1/account/export calls generateExportV2 when flag on', async () => {
      const res = await app.request(
        '/v1/account/export',
        { headers: ownerAuthHeaders() },
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
            ...ownerAuthHeaders(),
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
            ...ownerAuthHeaders(),
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
