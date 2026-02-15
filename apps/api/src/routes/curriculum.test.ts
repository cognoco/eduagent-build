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
const TOPIC_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('curriculum routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/curriculum
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/curriculum', () => {
    it('returns 200 with curriculum', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('curriculum');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/curriculum/skip
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/curriculum/skip', () => {
    it('returns 200 with valid topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Topic skipped');
      expect(body.topicId).toBe(TOPIC_ID);
    });

    it('returns 400 with invalid UUID', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: 'not-a-uuid' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          body: JSON.stringify({ topicId: TOPIC_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/curriculum/challenge
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/curriculum/challenge', () => {
    it('returns 200 with feedback', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            feedback: 'I already know the basics, skip intro topics',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Curriculum regeneration started');
    });

    it('returns 400 with empty feedback', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ feedback: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          body: JSON.stringify({ feedback: 'Some feedback' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/curriculum/topics/:topicId/explain
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/curriculum/topics/:topicId/explain', () => {
    it('returns 200 with explanation', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics/${TOPIC_ID}/explain`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.explanation).toBe('Mock explanation for topic ordering');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics/${TOPIC_ID}/explain`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
