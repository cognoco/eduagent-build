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

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOPIC_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('retention routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/retention
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/retention', () => {
    it('returns 200 with retention status', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/retention`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topics).toEqual([]);
      expect(body.reviewDueCount).toBe(0);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/retention`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/topics/:topicId/retention
  // -------------------------------------------------------------------------

  describe('GET /v1/topics/:topicId/retention', () => {
    it('returns 200 with retention card', async () => {
      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/retention`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('card');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/retention`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/retention/recall-test
  // -------------------------------------------------------------------------

  describe('POST /v1/retention/recall-test', () => {
    it('returns 200 with valid body', async () => {
      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            answer:
              'Photosynthesis converts light energy into chemical energy.',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.result).toBeDefined();
      expect(body.result.passed).toBe(true);
      expect(body.result.masteryScore).toBe(0.75);
      expect(body.result.xpChange).toBe('verified');
      expect(body.result.nextReviewAt).toBeDefined();
    });

    it('returns 400 with missing topicId', async () => {
      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            answer: 'Some answer without topicId',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          body: JSON.stringify({
            topicId: TOPIC_ID,
            answer: 'Some answer',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/retention/relearn
  // -------------------------------------------------------------------------

  describe('POST /v1/retention/relearn', () => {
    it('returns 200 with valid body', async () => {
      const res = await app.request(
        '/v1/retention/relearn',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            method: 'different',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Relearn started');
      expect(body.topicId).toBe(TOPIC_ID);
      expect(body.method).toBe('different');
    });

    it('returns 400 with invalid method', async () => {
      const res = await app.request(
        '/v1/retention/relearn',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            method: 'invalid_method',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/retention/relearn',
        {
          method: 'POST',
          body: JSON.stringify({
            topicId: TOPIC_ID,
            method: 'same',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/needs-deepening
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/needs-deepening', () => {
    it('returns 200 with needs-deepening list', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/needs-deepening`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topics).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/needs-deepening`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/teaching-preference
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/teaching-preference', () => {
    it('returns 200 with preference', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('preference');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /v1/subjects/:subjectId/teaching-preference
  // -------------------------------------------------------------------------

  describe('PUT /v1/subjects/:subjectId/teaching-preference', () => {
    it('returns 200 with valid method', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            method: 'visual_diagrams',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.preference).toBeDefined();
      expect(body.preference.subjectId).toBe(SUBJECT_ID);
      expect(body.preference.method).toBe('visual_diagrams');
    });

    it('returns 400 with invalid method', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            method: 'invalid_method',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'PUT',
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            method: 'visual_diagrams',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /v1/subjects/:subjectId/teaching-preference
  // -------------------------------------------------------------------------

  describe('DELETE /v1/subjects/:subjectId/teaching-preference', () => {
    it('returns 200 with reset confirmation', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Teaching preference reset');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        { method: 'DELETE' },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
