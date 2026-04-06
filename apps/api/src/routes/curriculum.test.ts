import { NotFoundError } from '../errors';

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
  unskipTopic: jest.fn().mockResolvedValue(undefined),
  challengeCurriculum: jest.fn().mockResolvedValue({
    id: 'curr-1',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    version: 2,
    topics: [],
    generatedAt: new Date().toISOString(),
  }),
  addCurriculumTopic: jest
    .fn()
    .mockImplementation((_db, _profileId, _subjectId, input) =>
      input.mode === 'preview'
        ? {
            mode: 'preview',
            preview: {
              title: 'Trigonometry Basics',
              description: 'Angles and triangle relationships',
              estimatedMinutes: 35,
            },
          }
        : {
            mode: 'create',
            topic: {
              id: 'topic-added',
              title: input.title,
              description: input.description,
              sortOrder: 5,
              relevance: 'recommended',
              estimatedMinutes: input.estimatedMinutes,
              skipped: false,
            },
          }
    ),
  explainTopicOrdering: jest
    .fn()
    .mockResolvedValue('This topic builds on fundamentals.'),
  adaptCurriculumFromPerformance: jest.fn().mockResolvedValue({
    adapted: true,
    topicOrder: ['660e8400-e29b-41d4-a716-446655440001'],
    explanation: 'Moved topic later to give you more preparation time.',
  }),
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
  // POST /v1/subjects/:subjectId/curriculum/unskip
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/curriculum/unskip', () => {
    it('returns 200 with valid topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Topic restored');
      expect(body.topicId).toBe(TOPIC_ID);
    });

    it('returns 400 with invalid UUID', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
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
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
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
  // POST /v1/subjects/:subjectId/curriculum/topics
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/curriculum/topics', () => {
    it('returns 200 with preview payload', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            mode: 'preview',
            title: 'trig',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.mode).toBe('preview');
      expect(body.preview.title).toBe('Trigonometry Basics');
    });

    it('returns 200 with created topic payload', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            mode: 'create',
            title: 'Trigonometry Basics',
            description: 'Angles and triangle relationships',
            estimatedMinutes: 35,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.mode).toBe('create');
      expect(body.topic.title).toBe('Trigonometry Basics');
      expect(body.topic.sortOrder).toBe(5);
    });

    it('returns 404 when subject not found', async () => {
      const { addCurriculumTopic } = jest.requireMock<
        typeof import('../services/curriculum')
      >('../services/curriculum');
      (addCurriculumTopic as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('Subject')
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            mode: 'create',
            title: 'Test',
            description: 'Desc',
            estimatedMinutes: 30,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 when curriculum not found', async () => {
      const { addCurriculumTopic } = jest.requireMock<
        typeof import('../services/curriculum')
      >('../services/curriculum');
      (addCurriculumTopic as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('Curriculum')
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            mode: 'create',
            title: 'Test',
            description: 'Desc',
            estimatedMinutes: 30,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 when create payload is incomplete', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            mode: 'create',
            title: 'Trigonometry Basics',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
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
  // POST /v1/subjects/:subjectId/curriculum/adapt (FR21)
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/curriculum/adapt', () => {
    beforeEach(() => {
      const { adaptCurriculumFromPerformance } = jest.requireMock<
        typeof import('../services/curriculum')
      >('../services/curriculum');
      (adaptCurriculumFromPerformance as jest.Mock).mockResolvedValue({
        adapted: true,
        topicOrder: [TOPIC_ID],
        explanation: 'Moved topic later to give you more preparation time.',
      });
    });

    it('returns 200 with adaptation result', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            signal: 'struggling',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.adapted).toBe(true);
      expect(body.topicOrder).toEqual([TOPIC_ID]);
      expect(body.explanation).toContain('preparation time');
    });

    it('accepts optional context field', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            signal: 'mastered',
            context: 'The learner scored 100% on the quiz',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
    });

    it('returns 400 with invalid signal value', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            signal: 'invalid_signal',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: 'not-a-uuid',
            signal: 'struggling',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is missing required fields', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          body: JSON.stringify({
            topicId: TOPIC_ID,
            signal: 'struggling',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    it('returns 404 when service throws NotFoundError', async () => {
      const { adaptCurriculumFromPerformance } = jest.requireMock<
        typeof import('../services/curriculum')
      >('../services/curriculum');
      (adaptCurriculumFromPerformance as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('Subject')
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            signal: 'struggling',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('accepts all valid signal values', async () => {
      for (const signal of ['struggling', 'mastered', 'too_easy', 'too_hard']) {
        const res = await app.request(
          `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
          {
            method: 'POST',
            headers: AUTH_HEADERS,
            body: JSON.stringify({
              topicId: TOPIC_ID,
              signal,
            }),
          },
          TEST_ENV
        );

        expect(res.status).toBe(200);
      }
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
