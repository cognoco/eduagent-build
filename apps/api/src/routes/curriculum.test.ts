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

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock account service — no DB interaction
// ---------------------------------------------------------------------------

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock profile service — profile-scope middleware resolves X-Profile-Id
// ---------------------------------------------------------------------------

jest.mock('../services/profile', () => ({
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test User',
    personaType: 'LEARNER',
    isOwner: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock curriculum service — no DB interaction
// ---------------------------------------------------------------------------

jest.mock('../services/curriculum', () => ({
  generateCurriculum: jest.fn().mockResolvedValue([]),
  getCurriculum: jest.fn().mockResolvedValue(null),
  skipTopic: jest.fn().mockResolvedValue(undefined),
  challengeCurriculum: jest.fn().mockResolvedValue({
    id: 'curr-1',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    version: 2,
    topics: [],
    generatedAt: new Date().toISOString(),
  }),
  explainTopicOrdering: jest
    .fn()
    .mockResolvedValue('This topic builds on fundamentals.'),
}));

import { app } from '../index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
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
      expect(body.curriculum).toBeNull();
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
    it('returns 200 with curriculum', async () => {
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
      expect(body).toHaveProperty('curriculum');
      expect(body.curriculum.id).toBe('curr-1');
      expect(body.curriculum.version).toBe(2);
      expect(body.curriculum.generatedAt).toBeDefined();
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
      expect(body.explanation).toBe('This topic builds on fundamentals.');
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
