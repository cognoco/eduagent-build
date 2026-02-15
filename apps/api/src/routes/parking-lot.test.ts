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

const SESSION_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('parking lot routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/sessions/:sessionId/parking-lot
  // -------------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId/parking-lot', () => {
    it('returns 200 with items array', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/parking-lot
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/parking-lot', () => {
    it('returns 201 with valid question', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ question: 'Why does the sky appear blue?' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.item).toBeDefined();
      expect(body.item.question).toBe('Why does the sky appear blue?');
      expect(body.item.explored).toBe(false);
      expect(body.item.createdAt).toBeDefined();
    });

    it('returns 400 with empty question', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ question: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {
          method: 'POST',
          body: JSON.stringify({ question: 'A question' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
