/**
 * Integration: Retention Lifecycle
 *
 * Tests the SM-2 retention + recall flow via app.request() through the
 * middleware chain. Validates route-level behavior: subject retention,
 * topic retention, recall test (success/failure/remediation), relearn,
 * needs-deepening, teaching preferences CRUD, and stability endpoint.
 *
 * Services are mocked at module level — these tests verify middleware chain,
 * route wiring, request validation, and response shapes, not business logic.
 */

// ---------------------------------------------------------------------------
// Test UUIDs
// ---------------------------------------------------------------------------

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '00000000-0000-4000-8000-000000000002';
const TOPIC_ID = '00000000-0000-4000-8000-000000000003';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  billingMock,
  settingsMock,
  llmMock,
  configureValidJWT,
  configureInvalidJWT,
} from './mocks';

const jwtMocks = jwtMock();
configureValidJWT(jwtMocks, {
  sub: 'user_retention_test',
  email: 'retention@test.com',
});
jest.mock('../../apps/api/src/middleware/jwt', () => jwtMocks);
jest.mock('@eduagent/database', () => databaseMock());
jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock());
jest.mock('../../apps/api/src/services/account', () =>
  accountMock({
    id: ACCOUNT_ID,
    clerkUserId: 'user_retention_test',
    email: 'retention@test.com',
  })
);
jest.mock('../../apps/api/src/services/billing', () => billingMock(ACCOUNT_ID));
jest.mock('../../apps/api/src/services/settings', () => settingsMock());
jest.mock('../../apps/api/src/services/llm', () => llmMock());
jest.mock('../../apps/api/src/services/session', () =>
  jest.createMockFromModule('../../apps/api/src/services/session')
);

// Retention-data service — all functions controllable
const mockGetSubjectRetention = jest.fn();
const mockGetTopicRetention = jest.fn();
const mockProcessRecallTest = jest.fn();
const mockStartRelearn = jest.fn();
const mockGetSubjectNeedsDeepening = jest.fn();
const mockGetTeachingPreference = jest.fn();
const mockSetTeachingPreference = jest.fn();
const mockDeleteTeachingPreference = jest.fn();
const mockGetStableTopics = jest.fn();

jest.mock('../../apps/api/src/services/retention-data', () => ({
  getSubjectRetention: (...args: unknown[]) => mockGetSubjectRetention(...args),
  getTopicRetention: (...args: unknown[]) => mockGetTopicRetention(...args),
  processRecallTest: (...args: unknown[]) => mockProcessRecallTest(...args),
  startRelearn: (...args: unknown[]) => mockStartRelearn(...args),
  getSubjectNeedsDeepening: (...args: unknown[]) =>
    mockGetSubjectNeedsDeepening(...args),
  getTeachingPreference: (...args: unknown[]) =>
    mockGetTeachingPreference(...args),
  setTeachingPreference: (...args: unknown[]) =>
    mockSetTeachingPreference(...args),
  deleteTeachingPreference: (...args: unknown[]) =>
    mockDeleteTeachingPreference(...args),
  getStableTopics: (...args: unknown[]) => mockGetStableTopics(...args),
}));

// ---------------------------------------------------------------------------
// App import (after all mocks)
// ---------------------------------------------------------------------------

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRetentionCard(overrides: Record<string, unknown> = {}) {
  return {
    topicId: TOPIC_ID,
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    nextReviewAt: null,
    lastReviewedAt: null,
    xpStatus: 'pending',
    failureCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Retention Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockGetSubjectRetention.mockResolvedValue({
      topics: [
        {
          ...buildRetentionCard(),
          topicTitle: 'Introduction to Calculus',
        },
      ],
      reviewDueCount: 1,
    });
    mockGetTopicRetention.mockResolvedValue(buildRetentionCard());
    mockProcessRecallTest.mockResolvedValue({
      passed: true,
      masteryScore: 0.75,
      xpChange: '+10 XP',
      nextReviewAt: '2026-03-01T10:00:00.000Z',
      failureCount: 0,
    });
    mockStartRelearn.mockResolvedValue({
      message: 'Relearn started',
      topicId: TOPIC_ID,
      method: 'same',
      sessionId: '00000000-0000-4000-8000-000000000009',
      resetPerformed: true,
    });
    mockGetSubjectNeedsDeepening.mockResolvedValue({
      topics: [],
      count: 0,
    });
    mockGetTeachingPreference.mockResolvedValue(null);
    mockSetTeachingPreference.mockResolvedValue({
      subjectId: SUBJECT_ID,
      method: 'step_by_step',
      analogyDomain: null,
    });
    mockDeleteTeachingPreference.mockResolvedValue(undefined);
    mockGetStableTopics.mockResolvedValue([]);
  });

  // -----------------------------------------------------------------------
  // Subject Retention
  // -----------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/retention', () => {
    it('returns retention cards for subject', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/retention`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].topicId).toBe(TOPIC_ID);
      expect(body.topics[0].topicTitle).toBe('Introduction to Calculus');
      expect(body.reviewDueCount).toBe(1);
    });

    it('returns empty when no retention cards exist', async () => {
      mockGetSubjectRetention.mockResolvedValue({
        topics: [],
        reviewDueCount: 0,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/retention`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(0);
      expect(body.reviewDueCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Topic Retention
  // -----------------------------------------------------------------------

  describe('GET /v1/topics/:topicId/retention', () => {
    it('returns retention card for topic', async () => {
      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/retention`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.card.topicId).toBe(TOPIC_ID);
      expect(body.card.easeFactor).toBe(2.5);
      expect(body.card.xpStatus).toBe('pending');
    });

    it('returns null card when no retention record exists', async () => {
      mockGetTopicRetention.mockResolvedValue(null);

      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/retention`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.card).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Recall Test
  // -----------------------------------------------------------------------

  describe('POST /v1/retention/recall-test', () => {
    it('submits successful recall test (quality >= 3)', async () => {
      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            answer:
              'Calculus is the mathematical study of continuous change, using derivatives and integrals',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.passed).toBe(true);
      expect(body.result.nextReviewAt).toBeDefined();
      expect(body.result.failureCount).toBe(0);
    });

    it('submits failed recall test (quality < 3)', async () => {
      mockProcessRecallTest.mockResolvedValue({
        passed: false,
        masteryScore: 0.4,
        xpChange: '0 XP',
        nextReviewAt: '2026-02-26T10:00:00.000Z',
        failureCount: 1,
        failureAction: 'feedback_only',
      });

      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            answer: 'Something about math',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.passed).toBe(false);
      expect(body.result.failureCount).toBe(1);
      expect(body.result.failureAction).toBe('feedback_only');
    });

    it('returns remediation after 3+ failures (FR52-58)', async () => {
      mockProcessRecallTest.mockResolvedValue({
        passed: false,
        masteryScore: 0.4,
        xpChange: '0 XP',
        nextReviewAt: '2026-02-26T10:00:00.000Z',
        failureCount: 3,
        failureAction: 'redirect_to_learning_book',
        remediation: {
          action: 'redirect_to_learning_book',
          topicId: TOPIC_ID,
          topicTitle: 'Introduction to Calculus',
          retentionStatus: 'fading',
          failureCount: 3,
          cooldownEndsAt: '2026-02-27T10:00:00.000Z',
          options: ['review_and_retest', 'relearn_topic'],
        },
      });

      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            answer: 'I dont remember',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.failureAction).toBe('redirect_to_learning_book');
      expect(body.result.remediation).toBeDefined();
      expect(body.result.remediation.options).toContain('relearn_topic');
    });

    it('rejects missing topicId', async () => {
      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ answer: 'Something' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      configureInvalidJWT(jwtMocks);

      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicId: TOPIC_ID,
            answer: 'Something',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);

      // Restore valid JWT
      configureValidJWT(jwtMocks, {
        sub: 'user_retention_test',
        email: 'retention@test.com',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Relearn Topic
  // -----------------------------------------------------------------------

  describe('POST /v1/retention/relearn', () => {
    it('starts relearning with same method', async () => {
      const res = await app.request(
        '/v1/retention/relearn',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            method: 'same',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Relearn started');
      expect(body.topicId).toBe(TOPIC_ID);
      expect(body.resetPerformed).toBe(true);
      expect(body.sessionId).toBeDefined();
    });

    it('starts relearning with different method', async () => {
      mockStartRelearn.mockResolvedValue({
        message: 'Relearn started',
        topicId: TOPIC_ID,
        method: 'different',
        preferredMethod: 'Use visual diagrams instead',
        sessionId: '00000000-0000-4000-8000-000000000009',
        resetPerformed: true,
      });

      const res = await app.request(
        '/v1/retention/relearn',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            method: 'different',
            preferredMethod: 'Use visual diagrams instead',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.method).toBe('different');
      expect(body.preferredMethod).toBe('Use visual diagrams instead');
    });
  });

  // -----------------------------------------------------------------------
  // Needs-Deepening
  // -----------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/needs-deepening', () => {
    it('returns empty when no topics need deepening', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/needs-deepening`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(0);
      expect(body.count).toBe(0);
    });

    it('returns topics needing deepening', async () => {
      mockGetSubjectNeedsDeepening.mockResolvedValue({
        topics: [
          {
            topicId: TOPIC_ID,
            status: 'active',
            consecutiveSuccessCount: 1,
          },
        ],
        count: 1,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/needs-deepening`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].status).toBe('active');
      expect(body.count).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Teaching Preferences
  // -----------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/teaching-preference', () => {
    it('returns null when no preference set', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preference).toBeNull();
    });

    it('returns existing preference', async () => {
      mockGetTeachingPreference.mockResolvedValue({
        subjectId: SUBJECT_ID,
        method: 'visual_diagrams',
        analogyDomain: 'cooking',
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preference.method).toBe('visual_diagrams');
      expect(body.preference.analogyDomain).toBe('cooking');
    });
  });

  describe('PUT /v1/subjects/:subjectId/teaching-preference', () => {
    it('sets teaching preference', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            method: 'step_by_step',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preference.method).toBe('step_by_step');
    });

    it('sets preference with analogy domain (FR134-FR137)', async () => {
      mockSetTeachingPreference.mockResolvedValue({
        subjectId: SUBJECT_ID,
        method: 'real_world_examples',
        analogyDomain: 'sports',
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            method: 'real_world_examples',
            analogyDomain: 'sports',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preference.method).toBe('real_world_examples');
      expect(body.preference.analogyDomain).toBe('sports');
    });
  });

  describe('DELETE /v1/subjects/:subjectId/teaching-preference', () => {
    it('resets teaching preference', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        { method: 'DELETE', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain('reset');
    });
  });

  // -----------------------------------------------------------------------
  // Stability (FR93)
  // -----------------------------------------------------------------------

  describe('GET /v1/retention/stability', () => {
    it('returns stable topics with 5+ consecutive successes', async () => {
      mockGetStableTopics.mockResolvedValue([
        { topicId: TOPIC_ID, isStable: true, consecutiveSuccesses: 6 },
        {
          topicId: '00000000-0000-4000-8000-000000000020',
          isStable: false,
          consecutiveSuccesses: 2,
        },
      ]);

      const res = await app.request(
        '/v1/retention/stability',
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(2);
      expect(body.topics[0].isStable).toBe(true);
      expect(body.topics[0].consecutiveSuccesses).toBe(6);
      expect(body.topics[1].isStable).toBe(false);
    });

    it('filters by subjectId query parameter', async () => {
      mockGetStableTopics.mockResolvedValue([]);

      const res = await app.request(
        `/v1/retention/stability?subjectId=${SUBJECT_ID}`,
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(0);
      expect(mockGetStableTopics).toHaveBeenCalledWith(
        undefined, // db
        ACCOUNT_ID, // profileId
        SUBJECT_ID // subjectId from query
      );
    });

    it('returns all topics when no subjectId provided', async () => {
      mockGetStableTopics.mockResolvedValue([]);

      const res = await app.request(
        '/v1/retention/stability',
        { method: 'GET', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockGetStableTopics).toHaveBeenCalledWith(
        undefined, // db
        ACCOUNT_ID, // profileId
        undefined // no subjectId
      );
    });
  });
});
