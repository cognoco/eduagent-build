import { Hono } from 'hono';
import { authMiddleware } from './auth';
import type { AuthEnv } from './auth';
import { BASE_AUTH_ENV } from '../test-utils/test-env';

// ---------------------------------------------------------------------------
// Mock jwt.ts — avoids real Web Crypto / JWKS calls in unit tests
// ---------------------------------------------------------------------------

jest.mock('./jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  }),
  // Default: successful verification; individual tests override with
  // mockResolvedValueOnce for specific payloads or mockRejectedValueOnce for
  // failure scenarios. Using mockResolvedValue (persistent) ensures the mock
  // always resolves even when clearAllMocks() clears the Once-queue between tests.
  verifyJWT: jest.fn().mockResolvedValue({
    sub: 'user_default',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
}));

const jwtMock = require('./jwt') as {
  verifyJWT: jest.Mock;
  decodeJWTHeader: jest.Mock;
  fetchJWKS: jest.Mock;
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const TEST_ENV = { ...BASE_AUTH_ENV };

function createTestApp() {
  const app = new Hono<AuthEnv>().basePath('/v1');

  app.use('*', authMiddleware);

  // Public route
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Protected route
  app.get('/me', (c) => {
    const user = c.get('user');
    return c.json({ userId: user.userId, email: user.email });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore persistent mock implementations that clearAllMocks() resets in Jest 30.
    jwtMock.decodeJWTHeader.mockReturnValue({ alg: 'RS256', kid: 'test-kid' });
    jwtMock.fetchJWKS.mockResolvedValue({
      keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
    });
    // Default verifyJWT resolution; individual tests override with mockResolvedValueOnce
    jwtMock.verifyJWT.mockResolvedValue({
      sub: 'user_default',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  describe('public paths', () => {
    it('bypasses auth for /v1/health', async () => {
      const app = createTestApp();
      const res = await app.request('/v1/health', {}, TEST_ENV);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      // verifyJWT should never be called for public routes
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
    });

    it('bypasses auth for /v1/inngest sub-paths', async () => {
      const app = createTestApp();
      app.post('/inngest/webhook', (c) => c.json({ ok: true }));

      const res = await app.request(
        '/v1/inngest/webhook',
        { method: 'POST' },
        TEST_ENV
      );

      // Route exists and middleware did not block it
      expect(res.status).toBe(200);
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
    });
  });

  describe('missing or malformed Authorization header', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const app = createTestApp();
      const res = await app.request('/v1/me', {}, TEST_ENV);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.message).toBe('Missing or invalid authorization header');
    });

    it('returns 401 when Authorization header is not Bearer', async () => {
      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('invalid token', () => {
    it('returns 401 when JWT verification fails', async () => {
      jwtMock.verifyJWT.mockRejectedValueOnce(new Error('signature mismatch'));

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer invalid.jwt.token' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.message).toBe('Invalid or expired token');
    });
  });

  // [SEC-1 / BUG-717] Break test: missing CLERK_AUDIENCE must reject requests.
  // Pre-fix: audience=undefined silently skipped aud claim validation.
  // Post-fix: verifyClerkJWT throws immediately → returns 401.
  describe('[SEC-1 / BUG-717] JWT audience validation', () => {
    it('returns 401 when CLERK_AUDIENCE is not configured', async () => {
      // Do NOT queue a mockResolvedValueOnce here — the guard fires BEFORE
      // verifyJWT is called when audience is absent, so queuing a value would
      // leave it unconsumed and bleed into subsequent tests.
      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
        // No CLERK_AUDIENCE — audience validation must reject
        { CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json' }
      );

      expect(res.status).toBe(401);
      // verifyJWT is never reached — guard fires before JWKS fetch
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
      // decodeJWTHeader and fetchJWKS also must not be called
      expect(jwtMock.decodeJWTHeader).not.toHaveBeenCalled();
      expect(jwtMock.fetchJWKS).not.toHaveBeenCalled();
    });

    it('accepts valid token when CLERK_AUDIENCE is present', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_sec1',
        email: 'user@test.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
    });
  });

  describe('valid token', () => {
    it('sets user context and proceeds to handler', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_abc123',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe('user_abc123');
      expect(body.email).toBe('test@example.com');
    });

    it('handles token with no email claim', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_no_email',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe('user_no_email');
      expect(body.email).toBeUndefined();
    });
  });
});
