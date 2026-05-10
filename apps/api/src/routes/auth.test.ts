// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock.
// JWKS endpoint is intercepted via globalThis.fetch in beforeAll.
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Mocks — required now that /v1/auth/* routes require auth [BUG-1007].
// Authenticated requests proceed through account/database middleware.
// ---------------------------------------------------------------------------

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock(
  '../inngest/client' /* gc1-allow: route-level test isolates Inngest event bus */,
  () => ({
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
      createFunction: jest.fn().mockReturnValue(jest.fn()),
    },
  }),
);

jest.mock(
  '../services/sentry' /* gc1-allow: route-level test suppresses Sentry */,
  () => ({ captureException: jest.fn(), addBreadcrumb: jest.fn() }),
);

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock(
  '../services/account' /* gc1-allow: route-level test stubs account lookup */,
  () => ({
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  }),
);

// ---------------------------------------------------------------------------

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const AUTH_HEADERS = makeAuthHeaders();
const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

beforeAll(() => {
  installTestJwksInterceptor();
});
afterAll(() => {
  restoreTestFetch();
});
beforeEach(() => {
  clearJWKSCache();
});

describe('auth routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/auth/register
  // -------------------------------------------------------------------------

  describe('POST /v1/auth/register', () => {
    it('returns 501 with valid registration data (Clerk handles registration)', async () => {
      const res = await app.request(
        '/v1/auth/register',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            email: 'new@example.com',
            password: 'securePass123',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(501);

      const body = await res.json();
      expect(body.code).toBe('NOT_IMPLEMENTED');
      expect(body.message).toMatch(/Clerk/i);
    });

    it('returns 501 with optional fields (Clerk handles registration)', async () => {
      const res = await app.request(
        '/v1/auth/register',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            email: 'new@example.com',
            password: 'securePass123',
            birthYear: 2010,
            location: 'EU',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(501);
    });

    it('returns 401 without auth header [BUG-1007]', async () => {
      const res = await app.request(
        '/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'public@example.com',
            password: 'securePass123',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid email', async () => {
      const res = await app.request(
        '/v1/auth/register',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            email: 'not-an-email',
            password: 'securePass123',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for password too short', async () => {
      const res = await app.request(
        '/v1/auth/register',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'short',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when email is missing', async () => {
      const res = await app.request(
        '/v1/auth/register',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ password: 'securePass123' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/password-reset-request
  // -------------------------------------------------------------------------

  describe('POST /v1/auth/password-reset-request', () => {
    it('returns 501 with valid email (Clerk handles password reset)', async () => {
      const res = await app.request(
        '/v1/auth/password-reset-request',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ email: 'user@example.com' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(501);

      const body = await res.json();
      expect(body.code).toBe('NOT_IMPLEMENTED');
      expect(body.message).toMatch(/Clerk/i);
    });

    it('returns 400 for invalid email', async () => {
      const res = await app.request(
        '/v1/auth/password-reset-request',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ email: 'bad' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/password-reset
  // -------------------------------------------------------------------------

  describe('POST /v1/auth/password-reset', () => {
    it('returns 501 with valid token and new password (Clerk handles reset)', async () => {
      const res = await app.request(
        '/v1/auth/password-reset',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            token: 'reset-token-abc',
            newPassword: 'newSecurePass456',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(501);

      const body = await res.json();
      expect(body.code).toBe('NOT_IMPLEMENTED');
      expect(body.message).toMatch(/Clerk/i);
    });

    it('returns 400 when new password is too short', async () => {
      const res = await app.request(
        '/v1/auth/password-reset',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            token: 'reset-token-abc',
            newPassword: 'short',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when token is missing', async () => {
      const res = await app.request(
        '/v1/auth/password-reset',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ newPassword: 'newSecurePass456' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });
});
