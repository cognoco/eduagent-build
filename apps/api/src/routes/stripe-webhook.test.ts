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
    it('rejects requests without stripe-signature header', async () => {
      const res = await app.request(
        '/v1/stripe/webhook',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({
        code: 'MISSING_SIGNATURE',
        message: 'Missing Stripe-Signature header',
      });
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

    it('returns { received: true } with valid stripe-signature', async () => {
      const res = await app.request(
        '/v1/stripe/webhook',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'stripe-signature': 't=1234,v1=abc',
          },
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ received: true });
    });
  });
});
