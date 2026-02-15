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

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('interview routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/interview
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/interview', () => {
    it('returns 200 with response', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I want to learn calculus' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.response).toBeDefined();
      expect(body.isComplete).toBe(false);
      expect(body.exchangeCount).toBe(1);
    });

    it('returns 400 with empty message', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          body: JSON.stringify({ message: 'Hello' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/interview
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/interview', () => {
    it('returns 200 with state', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('state');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
