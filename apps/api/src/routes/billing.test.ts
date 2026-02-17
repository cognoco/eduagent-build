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

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

describe('billing routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/subscription
  // -------------------------------------------------------------------------

  describe('GET /v1/subscription', () => {
    it('returns 200 with subscription status', async () => {
      const res = await app.request(
        '/v1/subscription',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subscription).toBeDefined();
      expect(body.subscription.tier).toBe('free');
      expect(body.subscription.status).toBe('trial');
      expect(body.subscription.monthlyLimit).toBe(50);
      expect(body.subscription.usedThisMonth).toBe(0);
      expect(body.subscription.remainingQuestions).toBe(50);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subscription', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/checkout
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/checkout', () => {
    it('returns 200 with valid body', async () => {
      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.checkoutUrl).toBeDefined();
      expect(body.sessionId).toBeDefined();
    });

    it('returns 400 with invalid tier', async () => {
      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ tier: 'invalid', interval: 'monthly' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid interval', async () => {
      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ tier: 'plus', interval: 'weekly' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/cancel
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/cancel', () => {
    it('returns 200 with cancellation confirmation', async () => {
      const res = await app.request(
        '/v1/subscription/cancel',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toContain('Subscription cancelled');
      expect(body.currentPeriodEnd).toBeDefined();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/cancel',
        { method: 'POST' },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/top-up
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/top-up', () => {
    it('returns 200 with valid amount', async () => {
      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ amount: 500 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topUp).toBeDefined();
      expect(body.topUp.amount).toBe(500);
      expect(body.topUp.remainingCredits).toBe(500);
      expect(body.topUp.expiresAt).toBeDefined();
    });

    it('returns 400 with invalid amount', async () => {
      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ amount: 999 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          body: JSON.stringify({ amount: 500 }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/usage
  // -------------------------------------------------------------------------

  describe('GET /v1/usage', () => {
    it('returns 200 with usage data', async () => {
      const res = await app.request(
        '/v1/usage',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.usage).toBeDefined();
      expect(body.usage.monthlyLimit).toBe(50);
      expect(body.usage.usedThisMonth).toBe(0);
      expect(body.usage.remainingQuestions).toBe(50);
      expect(body.usage.topUpCreditsRemaining).toBe(0);
      expect(body.usage.warningLevel).toBe('none');
      expect(body.usage.cycleResetAt).toBeDefined();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/usage', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/byok-waitlist
  // -------------------------------------------------------------------------

  describe('POST /v1/byok-waitlist', () => {
    it('returns 201 with valid email', async () => {
      const res = await app.request(
        '/v1/byok-waitlist',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ email: 'test@example.com' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.message).toBe('Added to BYOK waitlist');
      expect(body.email).toBe('test@example.com');
    });

    it('returns 400 with invalid email', async () => {
      const res = await app.request(
        '/v1/byok-waitlist',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ email: 'not-an-email' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/byok-waitlist',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
