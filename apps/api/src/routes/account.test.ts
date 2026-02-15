// ---------------------------------------------------------------------------
// Mock JWT module so auth middleware passes with a valid token
// ---------------------------------------------------------------------------

jest.mock('../middleware/jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  }),
  verifyJWT: jest.fn().mockResolvedValue({
    sub: 'user_test',
    email: 'test@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
}));

import app from '../index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

describe('account routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/account/delete
  // -------------------------------------------------------------------------

  describe('POST /v1/account/delete', () => {
    it('returns 200 with deletion schedule', async () => {
      const res = await app.request(
        '/v1/account/delete',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Deletion scheduled');
      expect(body.gracePeriodEnds).toBeDefined();
      expect(() => new Date(body.gracePeriodEnds)).not.toThrow();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/account/delete',
        { method: 'POST' },
        TEST_ENV
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
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Deletion cancelled');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/account/cancel-deletion',
        { method: 'POST' },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/account/export
  // -------------------------------------------------------------------------

  describe('GET /v1/account/export', () => {
    it('returns 200 with export status', async () => {
      const res = await app.request(
        '/v1/account/export',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Export started');
      expect(body.status).toBe('processing');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/account/export', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });
});
