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

describe('progress routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/progress
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/progress', () => {
    it('returns 200 with subject progress', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.progress).toBeDefined();
      expect(body.progress.subjectId).toBe(SUBJECT_ID);
      expect(body.progress.topicsTotal).toBe(10);
      expect(body.progress.topicsCompleted).toBe(3);
      expect(body.progress.topicsVerified).toBe(1);
      expect(body.progress.retentionStatus).toBe('strong');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/topics/:topicId/progress
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/topics/:topicId/progress', () => {
    it('returns 200 with topic progress', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topic).toBeDefined();
      expect(body.topic.topicId).toBe(TOPIC_ID);
      expect(body.topic.title).toBe('Mock Topic');
      expect(body.topic.completionStatus).toBe('not_started');
      expect(body.topic.struggleStatus).toBe('normal');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/progress`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/progress/overview
  // -------------------------------------------------------------------------

  describe('GET /v1/progress/overview', () => {
    it('returns 200 with progress overview', async () => {
      const res = await app.request(
        '/v1/progress/overview',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subjects).toEqual([]);
      expect(body.totalTopicsCompleted).toBe(0);
      expect(body.totalTopicsVerified).toBe(0);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/progress/overview', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/progress/continue
  // -------------------------------------------------------------------------

  describe('GET /v1/progress/continue', () => {
    it('returns 200 with continue suggestion', async () => {
      const res = await app.request(
        '/v1/progress/continue',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.suggestion).toBeNull();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/progress/continue', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });
});
