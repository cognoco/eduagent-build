import { Hono } from 'hono';
import { authMiddleware } from './auth';
import type { AuthEnv } from './auth';

// ---------------------------------------------------------------------------
// Mock jwt.ts — avoids real Web Crypto / JWKS calls in unit tests
// ---------------------------------------------------------------------------

jest.mock('./jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  }),
  verifyJWT: jest.fn(),
}));

const jwtMock = require('./jwt') as {
  verifyJWT: jest.Mock;
  decodeJWTHeader: jest.Mock;
  fetchJWKS: jest.Mock;
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

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
