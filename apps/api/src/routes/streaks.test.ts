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

describe('streak routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/streaks
  // -------------------------------------------------------------------------

  describe('GET /v1/streaks', () => {
    it('returns 200 with streak object', async () => {
      const res = await app.request(
        '/v1/streaks',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.streak).toBeDefined();
      expect(body.streak.currentStreak).toBe(0);
      expect(body.streak.longestStreak).toBe(0);
      expect(body.streak.lastActivityDate).toBeNull();
      expect(body.streak.isOnGracePeriod).toBe(false);
      expect(body.streak.graceDaysRemaining).toBe(0);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/streaks', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/xp
  // -------------------------------------------------------------------------

  describe('GET /v1/xp', () => {
    it('returns 200 with xp object', async () => {
      const res = await app.request(
        '/v1/xp',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.xp).toBeDefined();
      expect(body.xp.totalXp).toBe(0);
      expect(body.xp.verifiedXp).toBe(0);
      expect(body.xp.pendingXp).toBe(0);
      expect(body.xp.decayedXp).toBe(0);
      expect(body.xp.topicsCompleted).toBe(0);
      expect(body.xp.topicsVerified).toBe(0);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/xp', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });
});
