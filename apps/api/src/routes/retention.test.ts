// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../test-utils/database-module';

// WI-867 (ic-240): seed the SEEDABLE v2 billing reads so the metering middleware
// runs the REAL getEffectiveAccessForSubscriptionV2 (db.query.subscription.findFirst)
// and getOrProvisionProfileQuotaUsageV2 (db.query.profileQuotaUsage.findFirst).
// Rows are DB-shaped (v2 column names, Date/null timestamps — the real fns call
// .toISOString() on them). The profileQuotaUsage row matches the free-owner tier
// limits (monthly 100 / daily 10) so getOrProvisionProfileQuotaUsageV2 returns it
// on the read path and never fires the .update()/insert provision path. id matches
// the subscription returned by the (kept-mocked, unseedable-write) ensureFreeSubscriptionV2.
const seededRetentionDb = createTransactionalMockDb({
  query: {
    subscription: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'test-subscription-id',
        organizationId: 'test-account-id',
        planTier: 'free',
        status: 'active',
        payerPersonId: 'test-profile-id',
        storeProductId: null,
        storePlatform: null,
        periodStartAt: null,
        periodEndAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        lastStripeEventId: null,
        lastStripeEventTimestamp: null,
        revenuecatOriginalAppUserId: null,
        lastRevenuecatEventId: null,
        lastRevenuecatEventTimestampMs: null,
        trialEndsAt: null,
        cancelledAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    profileQuotaUsage: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'pqu-v2-1',
        subscriptionId: 'test-subscription-id',
        profileId: 'test-profile-id',
        role: 'owner',
        monthlyLimit: 100,
        usedThisMonth: 10,
        dailyLimit: 10,
        usedToday: 0,
        cycleResetAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
});

// WI-867: includeActual required so resolveIdentityV2 (now unconditional) can
// import Drizzle table schemas (login.clerkUserId etc.) from @eduagent/database.
const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: seededRetentionDb,
});

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

// WI-867 flag-collapse: profile-scope middleware now calls findOwnerPersonScope /
// getPersonScope from identity-v2/profile-v2 (db.select() join chains,
// unrunnable on unit mock DB). services/profile seam removed.
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(null);
const mockGetPersonScope = jest.fn().mockResolvedValue(personScope());
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — post-collapse profile-scope middleware calls findOwnerPersonScope/getPersonScope (db.select() join chains, unrunnable on unit mock DB); real path covered by identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

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
    getAssessmentEligibleTopics: jest.fn(),
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

// [WI-867] billing-v2 seam — metering middleware calls ensureFreeSubscriptionV2
// unconditionally post-collapse; account middleware calls ensureInitialTrialSubscriptionV2.
// Both use db.execute()/db.transaction() paths the unit mock DB cannot satisfy.
const mockSubscriptionRowRetention = {
  id: 'test-subscription-id',
  accountId: 'test-account-id',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  tier: 'free' as const,
  status: 'active' as const,
  trialEndsAt: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelledAt: null,
  lastStripeEventTimestamp: null,
  lastStripeEventId: null,
  revenuecatOriginalAppUserId: null,
  lastRevenuecatEventId: null,
  lastRevenuecatEventTimestampMs: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
// WI-867 (ic-240): only the genuinely UNSEEDABLE writes are mocked here.
// ensureFreeSubscriptionV2 / ensureInitialTrialSubscriptionV2 use
// db.execute()/db.transaction() insert paths the unit mock DB cannot satisfy.
// getEffectiveAccessForSubscriptionV2 + getOrProvisionProfileQuotaUsageV2 are
// SEEDABLE reads — they run REAL against the seeded db.query.subscription /
// db.query.profileQuotaUsage rows above (no override).
jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: continuity — ensureFreeSubscriptionV2/ensureInitialTrialSubscriptionV2 use db.execute()/db.transaction() insert paths the unit mock DB cannot satisfy; real paths covered by apps/api/src/services/billing/billing-v2/subscription-core-v2.integration.test.ts */,
  () => ({
    ...jest.requireActual('../services/billing/billing-v2'),
    ensureFreeSubscriptionV2: jest
      .fn()
      .mockResolvedValue(mockSubscriptionRowRetention),
    ensureInitialTrialSubscriptionV2: jest.fn().mockResolvedValue(undefined),
  }),
);

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
// [WI-2398] assertNotProxyMode now also calls assertCanWriteProfile, which
// calls verifyPersonOwnershipV2 — a raw db.select() membership query the
// fully-mocked DB module cannot satisfy. Every scenario in this file that
// reaches assertNotProxyMode's allow path is a caller-self write (the header
// profile equals the authenticated caller's own person id, both
// 'test-profile-id', via the seeded v2 identity graph); the cross-account
// write attack this guard exists to close is covered by the real-DB break
// test in tests/integration/wi2398-write-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's mock DB environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

// Global consent middleware and the pre-fix route assertion both resolve the
// identity-v2 consent decision through DB reads this route harness cannot run.
// Keep the boundary allowed here; service-level tests own ordering/refusal,
// while the structural guard proves the route itself has no assertion.
jest.mock(
  '../services/identity-v2/consent-status-v2' /* gc1-allow: route unit test — service regressions cover the controlled consent decision; this harness covers HTTP delegation/mapping */,
  () => ({
    ...jest.requireActual('../services/identity-v2/consent-status-v2'),
    assertLlmConsent: jest.fn().mockResolvedValue(undefined),
  }),
);

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
  getAssessmentEligibleTopics,
} from '../services/retention-data';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { NotFoundError, ForbiddenError } from '../errors';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { ERROR_CODES } from '@eduagent/schemas';
import { ConsentWithdrawnError } from '../services/session';

// WI-867: DATABASE_URL required so databaseMiddleware sets db on context;
// resolveIdentityV2 (now unconditional) reads db.query.login.
const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

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

    it('[WI-2128] auto-resolves the authenticated caller when X-Profile-Id is absent', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/retention`,
        {
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(getSubjectRetention).toHaveBeenCalled();
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

    // Headerless reads are scoped to the login-bound caller Person, never the
    // family owner or a shared organization aggregate.
    it('[WI-2128] scopes a headerless aggregate read to the authenticated caller', async () => {
      const res = await app.request(
        '/v1/library/retention',
        {
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(getAllSubjectsRetention).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
      );
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

    describe('[WI-2989] service-owned consent boundary', () => {
      it('maps a service consent denial to 403 CONSENT_WITHDRAWN', async () => {
        (processRecallTest as jest.Mock).mockRejectedValueOnce(
          new ConsentWithdrawnError(),
        );

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

        expect(res.status).toBe(403);
        const body = (await res.json()) as { code?: string };
        expect(body.code).toBe(ERROR_CODES.CONSENT_WITHDRAWN);
        expect(processRecallTest).toHaveBeenCalledTimes(1);
      });

      it('delegates an omitted attemptMode to the service-owned boundary', async () => {
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
        expect(processRecallTest).toHaveBeenCalledTimes(1);
        expect(processRecallTest).toHaveBeenCalledWith(
          expect.anything(),
          'test-profile-id',
          expect.objectContaining({
            topicId: TOPIC_ID,
            answer:
              'Photosynthesis converts light energy into chemical energy.',
          }),
          'en',
        );
      });

      it('delegates the deterministic dont_remember attempt unchanged', async () => {
        (processRecallTest as jest.Mock).mockResolvedValue({
          passed: false,
          masteryScore: 0,
          xpChange: 'none',
          nextReviewAt: '2026-02-22T10:00:00.000Z',
          failureCount: 1,
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
        expect(processRecallTest).toHaveBeenCalledTimes(1);
      });
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
        analogyDomain: null,
        nativeLanguage: null,
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
        analogyDomain: null,
        nativeLanguage: null,
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
        nativeLanguage: null,
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
        nativeLanguage: null,
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

// ---------------------------------------------------------------------------
// [WI-2879] read-authority guard (G22a-G22h)
// The harness middleware installs profileId ONLY from the request's
// X-Profile-Id header — the same client-controlled input the real
// profileScopeMiddleware resolves — so each attack below is a credentialed
// non-owner request traversing header → middleware → route.
// profileAuthorityVerifiedFor is deliberately never set (no central proof),
// which keeps the cases mutation-sensitive to the route guard's own
// fail-closed fallback (verifyPersonOwnershipV2); mounting the real
// profileScopeMiddleware would reject centrally (WI-2128) before the route
// and lose that sensitivity (middleware behavior: profile-scope.test.ts).
// ---------------------------------------------------------------------------
describe('[WI-2879] read-authority guard', () => {
  const VICTIM_PROFILE_ID = 'victim-profile-id';
  const ATTACKER_PERSON_ID = 'attacker-person-id';

  function makeUnprovenApp() {
    const direct = new Hono();
    direct.use('*', async (c, next) => {
      c.set('db' as never, {});
      // profileId derives strictly from the spoofed header; a request that
      // forgets to send it fails loudly (500) instead of silently passing.
      const spoofedProfileId = c.req.header('X-Profile-Id');
      if (!spoofedProfileId) {
        throw new Error('harness requires an X-Profile-Id header');
      }
      c.set('profileId' as never, spoofedProfileId);
      c.set('user' as never, { id: 'test-user' });
      c.set('account' as never, { id: 'test-account-id' });
      c.set('callerPersonId' as never, ATTACKER_PERSON_ID);
      // profileAuthorityVerifiedFor deliberately NOT set — no central proof.
      await next();
    });
    direct.onError((err, c) => {
      if (err instanceof ForbiddenError) {
        return c.json(
          { code: ERROR_CODES.FORBIDDEN, message: err.message },
          403,
        );
      }
      // [G22b] assertNotProxyMode throws HTTPException with a prebuilt 403
      // response — surface it as the real app would.
      if (err instanceof HTTPException) {
        return err.getResponse();
      }
      return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
    });
    direct.route('/', retentionRoutes);
    return direct;
  }

  function denyNextOwnershipCheck() {
    jest
      .mocked(verifyPersonOwnershipV2)
      .mockRejectedValueOnce(new Error('caller cannot read selected profile'));
  }

  async function expectForbidden(res: Response) {
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(jest.mocked(verifyPersonOwnershipV2)).toHaveBeenCalledWith(
      expect.anything(),
      VICTIM_PROFILE_ID,
      'test-account-id',
      ATTACKER_PERSON_ID,
    );
  }

  const SPOOF_HEADERS = { 'X-Profile-Id': VICTIM_PROFILE_ID };

  it('[G22a] GET /library/retention rejects a cross-profile X-Profile-Id spoof with 403 before the aggregate read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request('/library/retention', {
      headers: SPOOF_HEADERS,
    });

    await expectForbidden(res);
    expect(getAllSubjectsRetention).not.toHaveBeenCalled();
  });

  // [G22b] GET /retention/assessment-eligible carries assertNotProxyMode
  // BEFORE the read guard: a cross-profile request (callerPersonId !==
  // profileId) is rejected by that orthogonal write-shape gate first, so this
  // case cannot flip on removal of assertCanReadProfile alone — the read
  // guard's regression protection for this handler is carried by the
  // profile-read-authority ratchet (baseline entry removed in this WI). The
  // case still proves the spoof never reaches the service read.
  it('[G22b] GET /retention/assessment-eligible rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    const res = await makeUnprovenApp().request(
      '/retention/assessment-eligible',
      { headers: SPOOF_HEADERS },
    );

    expect(res.status).toBe(403);
    expect(getAssessmentEligibleTopics).not.toHaveBeenCalled();
  });

  it('[G22c] GET /subjects/:subjectId/retention rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request(
      `/subjects/${SUBJECT_ID}/retention`,
      { headers: SPOOF_HEADERS },
    );

    await expectForbidden(res);
    expect(getSubjectRetention).not.toHaveBeenCalled();
  });

  it('[G22d] GET /topics/:topicId/retention rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request(
      `/topics/${TOPIC_ID}/retention`,
      {
        headers: SPOOF_HEADERS,
      },
    );

    await expectForbidden(res);
    expect(getTopicRetention).not.toHaveBeenCalled();
  });

  it('[G22e] GET /subjects/:subjectId/needs-deepening rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request(
      `/subjects/${SUBJECT_ID}/needs-deepening`,
      { headers: SPOOF_HEADERS },
    );

    await expectForbidden(res);
    expect(getSubjectNeedsDeepening).not.toHaveBeenCalled();
  });

  it('[G22f] GET /subjects/:subjectId/teaching-preference rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request(
      `/subjects/${SUBJECT_ID}/teaching-preference`,
      { headers: SPOOF_HEADERS },
    );

    await expectForbidden(res);
    expect(getTeachingPreference).not.toHaveBeenCalled();
  });

  it('[G22g] GET /retention/stability rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request(
      `/retention/stability?subjectId=${SUBJECT_ID}`,
      { headers: SPOOF_HEADERS },
    );

    await expectForbidden(res);
    expect(getStableTopics).not.toHaveBeenCalled();
  });

  // [G22h] checkEvaluateEligibility (services/evaluate-data) is deliberately
  // NOT module-mocked in this file — the 403 must land before the service
  // read, so the guard rejecting is itself the proof the real service is
  // never invoked (an unguarded handler would hit the empty mock DB and 500).
  it('[G22h] GET /topics/:topicId/evaluate-eligibility rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request(
      `/topics/${TOPIC_ID}/evaluate-eligibility`,
      { headers: SPOOF_HEADERS },
    );

    await expectForbidden(res);
  });
});
