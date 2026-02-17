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

jest.mock('../services/assessments', () => ({
  generateQuickCheck: jest.fn().mockResolvedValue({
    questions: ['Q1?', 'Q2?'],
    checkType: 'concept_boundary',
  }),
  evaluateAssessmentAnswer: jest.fn().mockResolvedValue({
    feedback: 'Good reasoning!',
    passed: true,
    shouldEscalateDepth: false,
    masteryScore: 0.45,
    qualityRating: 4,
  }),
  getNextVerificationDepth: jest.fn().mockReturnValue(null),
  calculateMasteryScore: jest.fn().mockReturnValue(0.45),
  createAssessment: jest.fn().mockResolvedValue({
    id: 'assessment-1',
    profileId: 'test-profile-id',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    topicId: '660e8400-e29b-41d4-a716-446655440000',
    sessionId: null,
    verificationDepth: 'recall',
    status: 'in_progress',
    masteryScore: null,
    qualityRating: null,
    exchangeHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  getAssessment: jest.fn().mockResolvedValue({
    id: '770e8400-e29b-41d4-a716-446655440000',
    profileId: 'test-profile-id',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    topicId: '660e8400-e29b-41d4-a716-446655440000',
    sessionId: null,
    verificationDepth: 'recall',
    status: 'in_progress',
    masteryScore: null,
    qualityRating: null,
    exchangeHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  updateAssessment: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/session', () => ({
  getSession: jest.fn().mockResolvedValue({
    id: '880e8400-e29b-41d4-a716-446655440000',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    topicId: '660e8400-e29b-41d4-a716-446655440000',
    sessionType: 'learning',
    status: 'active',
    escalationRung: 1,
    exchangeCount: 5,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
  }),
  startSession: jest.fn(),
  processMessage: jest.fn(),
  streamMessage: jest.fn(),
  closeSession: jest.fn(),
  flagContent: jest.fn(),
  getSessionSummary: jest.fn(),
  submitSummary: jest.fn(),
}));

import app from '../index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOPIC_ID = '660e8400-e29b-41d4-a716-446655440000';
const ASSESSMENT_ID = '770e8400-e29b-41d4-a716-446655440000';
const SESSION_ID = '880e8400-e29b-41d4-a716-446655440000';

describe('assessment routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/topics/:topicId/assessments
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/topics/:topicId/assessments', () => {
    it('returns 201 with assessment', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/assessments`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.assessment).toBeDefined();
      expect(body.assessment.id).toBe('assessment-1');
      expect(body.assessment.topicId).toBe(TOPIC_ID);
      expect(body.assessment.verificationDepth).toBe('recall');
      expect(body.assessment.status).toBe('in_progress');
      expect(body.assessment.masteryScore).toBeNull();
      expect(body.assessment.createdAt).toBeDefined();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/assessments`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/assessments/:assessmentId/answer
  // -------------------------------------------------------------------------

  describe('POST /v1/assessments/:assessmentId/answer', () => {
    it('returns 200 with evaluation', async () => {
      const res = await app.request(
        `/v1/assessments/${ASSESSMENT_ID}/answer`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            answer:
              'Photosynthesis is the process by which plants convert light energy.',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.evaluation).toBeDefined();
      expect(body.evaluation.feedback).toBe('Good reasoning!');
      expect(body.evaluation.passed).toBe(true);
      expect(body.evaluation.shouldEscalateDepth).toBe(false);
      expect(body.evaluation.masteryScore).toBe(0.45);
      expect(body.evaluation.qualityRating).toBe(4);
    });

    it('returns 400 with empty answer', async () => {
      const res = await app.request(
        `/v1/assessments/${ASSESSMENT_ID}/answer`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ answer: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 404 when assessment not found', async () => {
      const { getAssessment } = jest.requireMock('../services/assessments');
      getAssessment.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/assessments/${ASSESSMENT_ID}/answer`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ answer: 'Some answer' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/assessments/${ASSESSMENT_ID}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ answer: 'Some answer' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/assessments/:assessmentId
  // -------------------------------------------------------------------------

  describe('GET /v1/assessments/:assessmentId', () => {
    it('returns 200 with assessment object', async () => {
      const res = await app.request(
        `/v1/assessments/${ASSESSMENT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('assessment');
      expect(body.assessment).not.toBeNull();
      expect(body.assessment.id).toBe(ASSESSMENT_ID);
      expect(body.assessment.verificationDepth).toBe('recall');
      expect(body.assessment.status).toBe('in_progress');
    });

    it('returns 404 when assessment not found', async () => {
      const { getAssessment } = jest.requireMock('../services/assessments');
      getAssessment.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/assessments/${ASSESSMENT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.message).toBe('Assessment not found');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/assessments/${ASSESSMENT_ID}`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/quick-check
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/quick-check', () => {
    it('returns 200 with feedback and isCorrect', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/quick-check`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            answer: 'The mitochondria is the powerhouse of the cell.',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.feedback).toBe('Good reasoning!');
      expect(body.isCorrect).toBe(true);
    });

    it('returns 404 when session not found', async () => {
      const { getSession } = jest.requireMock('../services/session');
      getSession.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/quick-check`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ answer: 'Some answer' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 with empty answer', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/quick-check`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ answer: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/quick-check`,
        {
          method: 'POST',
          body: JSON.stringify({ answer: 'Some answer' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
