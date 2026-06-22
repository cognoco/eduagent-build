// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

jest.mock('../services/account', () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

jest.mock('../services/profile', () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue(null),
    getProfile: jest.fn().mockResolvedValue({
      id: 'test-profile-id',
      birthYear: null,
      location: null,
      consentStatus: 'CONSENTED',
    }),
  };
});

jest.mock('../services/retention-data', () => {
  const actual = jest.requireActual(
    '../services/retention-data',
  ) as typeof import('../services/retention-data');
  return {
    ...actual,
    getSubjectRetention: jest.fn(),
    getAllSubjectsRetention: jest.fn(),
    getTopicRetention: jest.fn(),
    processRecallTest: jest.fn(),
    startRelearn: jest.fn(),
    getSubjectNeedsDeepening: jest.fn(),
    getTeachingPreference: jest.fn(),
    setTeachingPreference: jest.fn(),
    deleteTeachingPreference: jest.fn(),
    getStableTopics: jest.fn(),
  };
});

// Billing mock — required by metering middleware now that
// POST /v1/retention/recall-test is metered [WI-168 / WI-77 allowlist sweep].
jest.mock('../services/billing', () => {
  const actual = jest.requireActual(
    '../services/billing',
  ) as typeof import('../services/billing');
  return {
    ...actual,
    ensureFreeSubscription: jest.fn().mockResolvedValue({
      id: 'sub-1',
      accountId: 'test-account-id',
      tier: 'free',
      status: 'active',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date().toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getEffectiveAccessForSubscription: jest.fn().mockResolvedValue({
      subscription: {
        id: 'sub-1',
        accountId: 'test-account-id',
        tier: 'free',
        status: 'active',
      },
      effectiveAccessTier: 'free',
      billingAccess: 'current',
    }),
    getQuotaPool: jest.fn().mockResolvedValue({
      id: 'qp-1',
      subscriptionId: 'sub-1',
      monthlyLimit: 500,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getOrProvisionProfileQuotaUsage: jest.fn().mockResolvedValue({
      id: 'pqu-1',
      subscriptionId: 'sub-1',
      profileId: 'test-profile-id',
      role: 'owner',
      monthlyLimit: 100,
      usedThisMonth: 10,
      dailyLimit: 10,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
    }),
    decrementQuota: jest.fn().mockResolvedValue({
      success: true,
      source: 'monthly',
      remainingMonthly: 489,
      remainingTopUp: 0,
      remainingDaily: null,
    }),
    getTopUpCreditsRemaining: jest.fn().mockResolvedValue(0),
    safeRefundQuota: jest.fn().mockResolvedValue({ refunded: true }),
  };
});

import { Hono } from 'hono';
import { app } from '../index';
import { retentionRoutes } from './retention';
import {
  getSubjectRetention,
  getAllSubjectsRetention,
  getTopicRetention,
  processRecallTest,
  startRelearn,
  getSubjectNeedsDeepening,
  getTeachingPreference,
  setTeachingPreference,
  deleteTeachingPreference,
  getStableTopics,
} from '../services/retention-data';
import { NotFoundError } from '../errors';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOPIC_ID = '660e8400-e29b-41d4-a716-446655440000';

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();
});

describe('retention routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/retention
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/retention', () => {
    it('returns 200 with retention status', async () => {
      (getSubjectRetention as jest.Mock).mockResolvedValue({
        topics: [
          {
            topicId: TOPIC_ID,
            easeFactor: 2.5,
            intervalDays: 7,
            repetitions: 3,
            nextReviewAt: '2026-02-22T10:00:00.000Z',
            lastReviewedAt: null,
            daysSinceLastReview: null,
            xpStatus: 'pending',
            failureCount: 0,
            topicTitle: 'Limits',
            bookId: '',
          },
        ],
        reviewDueCount: 0,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/retention`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topics).toHaveLength(1);
      expect(body.reviewDueCount).toBe(0);
    });

    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/retention`,
        {
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(getSubjectRetention).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/retention`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/topics/:topicId/retention', () => {
    it('returns 400 with invalid topicId', async () => {
      const res = await app.request(
        '/v1/topics/not-a-uuid/retention',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(getTopicRetention).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // [BUG-732 / PERF-2] GET /v1/library/retention — aggregate across subjects
  // -------------------------------------------------------------------------

  describe('GET /v1/library/retention', () => {
    it('returns 200 with aggregated retention across subjects', async () => {
      (getAllSubjectsRetention as jest.Mock).mockResolvedValue({
        subjects: [
          {
            subjectId: SUBJECT_ID,
            topics: [
              {
                topicId: TOPIC_ID,
                easeFactor: 2.5,
                intervalDays: 7,
                repetitions: 3,
                nextReviewAt: '2026-02-22T10:00:00.000Z',
                lastReviewedAt: null,
                daysSinceLastReview: null,
                xpStatus: 'pending',
                failureCount: 0,
                evaluateDifficultyRung: null,
                topicTitle: 'Limits',
                bookId: 'book-1',
              },
            ],
            reviewDueCount: 0,
          },
        ],
      });

      const res = await app.request(
        '/v1/library/retention',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.subjects).toHaveLength(1);
      expect(body.subjects[0].subjectId).toBe(SUBJECT_ID);
      expect(body.subjects[0].topics).toHaveLength(1);
      expect(getAllSubjectsRetention).toHaveBeenCalledTimes(1);
      // Second arg must be the profile ID — proves the route passes scope.
      expect((getAllSubjectsRetention as jest.Mock).mock.calls[0]?.[1]).toBe(
        'test-profile-id',
      );
    });

    // Break test: aggregate route MUST require X-Profile-Id, otherwise it
    // would leak retention rows across profiles. [Verified-by: 400 status]
    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        '/v1/library/retention',
        {
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(getAllSubjectsRetention).not.toHaveBeenCalled();
    });

    // Break test: aggregate route MUST require auth.
    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/library/retention', {}, TEST_ENV);
      expect(res.status).toBe(401);
      expect(getAllSubjectsRetention).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/topics/:topicId/retention
  // -------------------------------------------------------------------------

  describe('GET /v1/topics/:topicId/retention', () => {
    it('returns 200 with retention card', async () => {
      (getTopicRetention as jest.Mock).mockResolvedValue({
        topicId: TOPIC_ID,
        easeFactor: 2.5,
        intervalDays: 7,
        repetitions: 3,
        nextReviewAt: '2026-02-22T10:00:00.000Z',
        lastReviewedAt: null,
        daysSinceLastReview: null,
        xpStatus: 'pending',
        failureCount: 0,
      });

      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/retention`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.card).not.toBeNull();
      expect(body.card.topicId).toBe(TOPIC_ID);
    });

    it('returns 200 with null card when not found', async () => {
      (getTopicRetention as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/retention`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.card).toBeNull();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/retention`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/retention/recall-test
  // -------------------------------------------------------------------------

  describe('POST /v1/retention/recall-test', () => {
    it('returns 200 with valid body', async () => {
      (processRecallTest as jest.Mock).mockResolvedValue({
        passed: true,
        masteryScore: 0.75,
        xpChange: 'verified',
        nextReviewAt: '2026-02-22T10:00:00.000Z',
        failureCount: 0,
      });

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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.result).toEqual(expect.objectContaining({}));
      expect(body.result.passed).toBe(true);
      expect(body.result.masteryScore).toBe(0.75);
      expect(body.result.xpChange).toBe('verified');
      expect(typeof body.result.nextReviewAt).toBe('string');
    });

    it('accepts dont_remember submissions without an answer body', async () => {
      (processRecallTest as jest.Mock).mockResolvedValue({
        passed: false,
        masteryScore: 0.4,
        xpChange: 'decayed',
        nextReviewAt: '2026-02-22T10:00:00.000Z',
        failureCount: 1,
        hint: "That's okay — let's see what you do remember.",
      });

      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            attemptMode: 'dont_remember',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.result.failureCount).toBe(1);
      expect(body.result.hint).toContain("That's okay");
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
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when standard recall answer is blank', async () => {
      const res = await app.request(
        '/v1/retention/recall-test',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            answer: '',
          }),
        },
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/retention/relearn
  // -------------------------------------------------------------------------

  describe('POST /v1/retention/relearn', () => {
    it('returns 200 with valid body', async () => {
      (startRelearn as jest.Mock).mockResolvedValue({
        message: 'Relearn started',
        topicId: TOPIC_ID,
        method: 'different',
        sessionId: null,
        recap: null,
      });

      const res = await app.request(
        '/v1/retention/relearn',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            topicId: TOPIC_ID,
            method: 'different',
            preferredMethod: 'Use a visual explanation',
          }),
        },
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/needs-deepening
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/needs-deepening', () => {
    it('returns 200 with needs-deepening list', async () => {
      (getSubjectNeedsDeepening as jest.Mock).mockResolvedValue({
        topics: [],
        count: 0,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/needs-deepening`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/teaching-preference
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/teaching-preference', () => {
    it('returns 200 with preference', async () => {
      (getTeachingPreference as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        method: 'visual_diagrams',
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.preference).toEqual(expect.objectContaining({}));
      expect(body.preference.method).toBe('visual_diagrams');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /v1/subjects/:subjectId/teaching-preference
  // -------------------------------------------------------------------------

  describe('PUT /v1/subjects/:subjectId/teaching-preference', () => {
    it('returns 200 with valid method', async () => {
      (setTeachingPreference as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        method: 'visual_diagrams',
      });

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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.preference).toEqual(expect.objectContaining({}));
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
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid subjectId', async () => {
      const res = await app.request(
        '/v1/subjects/not-a-uuid/teaching-preference',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            method: 'visual_diagrams',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(setTeachingPreference).not.toHaveBeenCalled();
    });

    it('returns 404 when the subject is not owned by the caller', async () => {
      (setTeachingPreference as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('Subject'),
      );

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
        TEST_ENV,
      );

      expect(res.status).toBe(404);
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
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with analogyDomain (FR134-137)', async () => {
      (setTeachingPreference as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        method: 'step_by_step',
        analogyDomain: 'cooking',
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            method: 'step_by_step',
            analogyDomain: 'cooking',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.preference.analogyDomain).toBe('cooking');
    });

    it('accepts null analogyDomain to clear preference', async () => {
      (setTeachingPreference as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        method: 'step_by_step',
        analogyDomain: null,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            subjectId: SUBJECT_ID,
            method: 'step_by_step',
            analogyDomain: null,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.preference.analogyDomain).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /v1/subjects/:subjectId/teaching-preference
  // -------------------------------------------------------------------------

  describe('DELETE /v1/subjects/:subjectId/teaching-preference', () => {
    it('returns 200 with reset confirmation', async () => {
      (deleteTeachingPreference as jest.Mock).mockResolvedValue(undefined);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Teaching preference reset');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/teaching-preference`,
        { method: 'DELETE' },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/retention/stability  [BUG-831]
  // -------------------------------------------------------------------------

  describe('GET /v1/retention/stability', () => {
    it('returns 200 and forwards parsed UUID to service', async () => {
      (getStableTopics as jest.Mock).mockResolvedValue([
        { topicId: TOPIC_ID, isStable: true, consecutiveSuccesses: 5 },
      ]);

      const res = await app.request(
        `/v1/retention/stability?subjectId=${SUBJECT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(1);
      // Service receives the parsed (valid) UUID, not raw query string.
      expect(getStableTopics).toHaveBeenCalledTimes(1);
      const args = (getStableTopics as jest.Mock).mock.calls[0];
      expect(args[1]).toBe('test-profile-id');
      expect(args[2]).toBe(SUBJECT_ID);
    });

    it('returns 200 when subjectId is omitted (optional)', async () => {
      (getStableTopics as jest.Mock).mockResolvedValue([]);

      const res = await app.request(
        '/v1/retention/stability',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // undefined when omitted — service may apply its own scope.
      expect(getStableTopics).toHaveBeenCalledTimes(1);
      const args = (getStableTopics as jest.Mock).mock.calls[0];
      expect(args[1]).toBe('test-profile-id');
      expect(args[2]).toBeUndefined();
    });

    // [BREAK / BUG-831] A malformed subjectId must be rejected at the boundary
    // (400) — never forwarded to the service. Pre-fix the route accepted any
    // string, allowing untrusted input to reach downstream queries.
    it('[BREAK] returns 400 when subjectId is not a UUID', async () => {
      const res = await app.request(
        '/v1/retention/stability?subjectId=not-a-uuid',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(getStableTopics).not.toHaveBeenCalled();
    });

    it('[BREAK] returns 400 on SQL-shaped subjectId payload', async () => {
      const res = await app.request(
        `/v1/retention/stability?subjectId=${encodeURIComponent(
          "' OR 1=1 --",
        )}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(getStableTopics).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/retention/stability?subjectId=${SUBJECT_ID}`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-165 / DS-076] Proxy-mode write guard — teaching-preference PUT + DELETE
// (other write handlers in retention.ts were already guarded pre-PR)
// ---------------------------------------------------------------------------
describe('[WI-165 / DS-076] retention proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', retentionRoutes);
    return proxyApp;
  }

  const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => jest.clearAllMocks());

  it('PUT /subjects/:subjectId/teaching-preference returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/teaching-preference`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: SUBJECT_ID,
          method: 'visual_diagrams',
        }),
      },
    );
    expect(res.status).toBe(403);
  });

  it('DELETE /subjects/:subjectId/teaching-preference returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/teaching-preference`,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(403);
  });
});
