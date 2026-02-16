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

describe('stripe webhook route', () => {
  // -------------------------------------------------------------------------
  // POST /v1/stripe/webhook
  // -------------------------------------------------------------------------

  describe('POST /v1/stripe/webhook', () => {
    it('returns 200', async () => {
      const res = await app.request(
        '/v1/stripe/webhook',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
    });

    it('works without auth header (public route)', async () => {
      const res = await app.request(
        '/v1/stripe/webhook',
        {
          method: 'POST',
        },
        TEST_ENV
      );

      // Should not return 401 since this is a public route
      expect(res.status).not.toBe(401);
    });

    it('returns { received: true }', async () => {
      const res = await app.request(
        '/v1/stripe/webhook',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      const body = await res.json();
      expect(body).toEqual({ received: true });
    });
  });
});
