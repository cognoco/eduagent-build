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

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
    createFunction: jest.fn().mockReturnValue(jest.fn()),
  },
}));

jest.mock('../services/sentry', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

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

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock account, deletion, and export services — no DB interaction
// ---------------------------------------------------------------------------

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

jest.mock('../services/deletion', () => ({
  scheduleDeletion: jest.fn().mockResolvedValue({
    gracePeriodEnds: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  }),
  cancelDeletion: jest.fn().mockResolvedValue(undefined),
  getProfileIdsForAccount: jest.fn().mockResolvedValue(['profile-1']),
}));

jest.mock('../services/export', () => ({
  generateExport: jest.fn().mockResolvedValue({
    account: {
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    },
    profiles: [],
    consentStates: [],
    exportedAt: new Date().toISOString(),
  }),
}));

import { app } from '../index';
import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
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

    // [CR-SILENT-RECOVERY-2] Break test: deletion-event dispatch failure must
    // be escalated via BOTH a structured log AND a Sentry capture. A
    // GDPR-relevant action cannot recover silently — on-call needs aggregate
    // spike alerting (mirrors consent.ts:142,270 [A-23]). Escalation runs
    // through safeSend (services/safe-non-core.ts), which logs via
    // logger.error → console.error.
    it('still returns 200 and escalates via logger.error + captureException when dispatch fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (captureException as jest.Mock).mockClear();

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

      expect(res.status).toBe(200);
      expect(body.message).toBe('Deletion scheduled');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[safe-send] non-core Inngest dispatch failed'),
      );

      // Sentry escalation: assert the deliberate call from safeSend happened
      // with the raw error and a queryable surface tag. (Other middleware in
      // the request path may also call captureException — e.g. profile-scope
      // middleware itself escalates if findOwnerProfile fails against the
      // stubbed DB. We only care that our specific call is one of them.)
      expect(captureException).toHaveBeenCalledWith(dispatchError, {
        extra: {
          surface: 'account.deletion',
          kind: 'non-core-send',
          accountId: 'test-account-id',
        },
      });

      errorSpy.mockRestore();
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
});
