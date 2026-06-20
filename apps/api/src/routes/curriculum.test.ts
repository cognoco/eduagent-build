// ---------------------------------------------------------------------------
// curriculum.test.ts — negative-path coverage for routes/curriculum.ts
// Phase 3 of test-coverage-hardening-plan.md
//
// Pattern: real JWT + real auth middleware, service layer mocked via
// gc1-allow pattern-a (requireActual + targeted overrides), database module
// mock so no DB connection required.
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import { personScope } from '../test-utils/identity-v2-scope-mock';

// ---------------------------------------------------------------------------
// Database mock
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Account + profile service mocks
// ---------------------------------------------------------------------------

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
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

jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue(null),
    getProfile: jest.fn().mockResolvedValue({
      id: 'test-profile-id',
      birthYear: 2008,
      location: null,
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      isOwner: true,
    }),
  };
});

// [WI-867] Post-collapse, profile-scope middleware resolves the caller via the
// v2 `findOwnerPersonScope` (auto-resolve) / `getPersonScope` (X-Profile-Id)
// seam, which uses db.select() join chains the unit mock DB can't satisfy.
// Continuity mock — the v2 rename of the legacy `findOwnerProfile`/`getProfile`
// mocks above. Owner by default.
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(null);
const mockGetPersonScope = jest.fn().mockResolvedValue(personScope());
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — findOwnerPersonScope/getPersonScope use db.select() join chains (persons→memberships→org) that return [] on the Proxy unit-mock; real path covered by apps/api/src/services/identity-v2/profile-v2.integration.test.ts */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

// [WI-867] billing-v2 seam — metering middleware calls ensureFreeSubscriptionV2
// on LLM routes (challenge/topics/explain); accountMiddleware calls
// ensureInitialTrialSubscriptionV2. Both use db.execute()/db.transaction()
// paths the unit mock DB cannot satisfy. Continuity mock.
const mockSubscriptionRow = {
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
jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: continuity — ensureFreeSubscriptionV2/ensureInitialTrialSubscriptionV2 use db.execute()/db.transaction(); getOrProvisionProfileQuotaUsageV2 uses db.insert(...).returning() (returns [] on mock → undefined → throws); real paths covered by apps/api/src/services/billing/billing-v2/subscription-core-v2.integration.test.ts */,
  () => ({
    ...jest.requireActual('../services/billing/billing-v2'),
    ensureFreeSubscriptionV2: jest.fn().mockResolvedValue(mockSubscriptionRow),
    ensureInitialTrialSubscriptionV2: jest.fn().mockResolvedValue(undefined),
    getOrProvisionProfileQuotaUsageV2: jest.fn().mockResolvedValue({
      id: 'pqu-v2-1',
      subscriptionId: 'test-subscription-id',
      profileId: 'test-profile-id',
      role: 'owner',
      monthlyLimit: 100,
      usedThisMonth: 10,
      dailyLimit: 10,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
    }),
  }),
);

// ---------------------------------------------------------------------------
// Curriculum service mock
// ---------------------------------------------------------------------------

const mockGetCurriculum = jest.fn();
const mockSkipTopic = jest.fn();
const mockUnskipTopic = jest.fn();
const mockChallengeCurriculum = jest.fn();
const mockExplainTopicOrdering = jest.fn();
const mockAddCurriculumTopic = jest.fn();
const mockAdaptCurriculumFromPerformance = jest.fn();
const mockCloneTopicFromChild = jest.fn();
const mockUndoCloneFromChild = jest.fn();

jest.mock(
  '../services/curriculum' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/curriculum',
    ) as typeof import('../services/curriculum');
    return {
      ...actual,
      getCurriculum: (...args: unknown[]) => mockGetCurriculum(...args),
      skipTopic: (...args: unknown[]) => mockSkipTopic(...args),
      unskipTopic: (...args: unknown[]) => mockUnskipTopic(...args),
      challengeCurriculum: (...args: unknown[]) =>
        mockChallengeCurriculum(...args),
      explainTopicOrdering: (...args: unknown[]) =>
        mockExplainTopicOrdering(...args),
      addCurriculumTopic: (...args: unknown[]) =>
        mockAddCurriculumTopic(...args),
      adaptCurriculumFromPerformance: (...args: unknown[]) =>
        mockAdaptCurriculumFromPerformance(...args),
    };
  },
);

jest.mock(
  '../services/family-bridge' /* gc1-allow: route unit test — bridge service has DB transaction logic covered separately */,
  () => {
    const actual = jest.requireActual(
      '../services/family-bridge',
    ) as typeof import('../services/family-bridge');
    return {
      ...actual,
      cloneTopicFromChild: (...args: unknown[]) =>
        mockCloneTopicFromChild(...args),
      undoCloneFromChild: (...args: unknown[]) =>
        mockUndoCloneFromChild(...args),
    };
  },
);

// ---------------------------------------------------------------------------
// Billing mock — required by metering middleware now that curriculum routes
// (POST /topics, POST /challenge, GET /topics/:id/explain) are metered
// [WI-149, WI-149, WI-149 in the WI-77 allowlist sweep].
// ---------------------------------------------------------------------------

jest.mock('../services/billing' /* gc1-allow: pattern-a conversion */, () => {
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

// ---------------------------------------------------------------------------
// Inngest framework boundary mock (required by index.ts import chain)
// ---------------------------------------------------------------------------

jest.mock('inngest/hono', () => ({
  // gc1-allow: Inngest framework boundary
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
      createFunction: jest.fn().mockReturnValue(jest.fn()),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { app } from '../index';
import { curriculumRoutes } from './curriculum';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { NotFoundError, TopicNotSkippedError } from '../errors';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};
const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOPIC_ID = '550e8400-e29b-41d4-a716-446655440001';
const CHILD_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440002';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440003';

// getCurriculum returns a Curriculum object (not an array of topics)
const MOCK_CURRICULUM_OBJECT = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  subjectId: SUBJECT_ID,
  version: 1,
  topics: [
    {
      id: TOPIC_ID,
      title: 'World War I',
      description: 'The Great War',
      chapter: 'Modern History',
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: '550e8400-e29b-41d4-a716-446655440010',
      skipped: false,
      source: 'generated',
    },
  ],
  generatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('curriculum routes', () => {
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

  // ---- POST /v1/curriculum/clone-from-child --------------------------------

  describe('POST /v1/curriculum/clone-from-child', () => {
    it('[PARENT-14] clones a child topic into the active adult profile', async () => {
      mockCloneTopicFromChild.mockResolvedValueOnce({
        topicId: TOPIC_ID,
        subjectId: SUBJECT_ID,
        alreadyExisted: false,
        descriptionDivergent: false,
        descriptionRefreshed: false,
        topicState: 'unstarted',
        createdIds: { topicId: TOPIC_ID, subjectId: SUBJECT_ID },
      });

      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            topicId: TOPIC_ID,
            requestId: REQUEST_ID,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockCloneTopicFromChild).toHaveBeenCalledTimes(1);
      const [, profileIdArg, inputArg] = mockCloneTopicFromChild.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(inputArg).toMatchObject({
        childProfileId: CHILD_PROFILE_ID,
        topicId: TOPIC_ID,
        requestId: REQUEST_ID,
      });
    });

    it('passes forceCopy through to the bridge service', async () => {
      mockCloneTopicFromChild.mockResolvedValueOnce({
        topicId: TOPIC_ID,
        subjectId: SUBJECT_ID,
        alreadyExisted: false,
        descriptionDivergent: false,
        descriptionRefreshed: false,
        topicState: 'unstarted',
        createdIds: { topicId: TOPIC_ID, subjectId: SUBJECT_ID },
      });

      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            topicId: TOPIC_ID,
            requestId: REQUEST_ID,
            forceCopy: true,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const [, , inputArg] = mockCloneTopicFromChild.mock.calls[0];
      expect(inputArg).toMatchObject({
        childProfileId: CHILD_PROFILE_ID,
        topicId: TOPIC_ID,
        requestId: REQUEST_ID,
        forceCopy: true,
      });
    });

    it.each([
      [
        'missing requestId',
        { childProfileId: CHILD_PROFILE_ID, topicId: TOPIC_ID },
      ],
      [
        'invalid requestId',
        {
          childProfileId: CHILD_PROFILE_ID,
          topicId: TOPIC_ID,
          requestId: 'not-a-uuid',
        },
      ],
    ])('rejects %s before calling the bridge service', async (_name, body) => {
      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockCloneTopicFromChild).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            topicId: TOPIC_ID,
            requestId: REQUEST_ID,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
      expect(mockCloneTopicFromChild).not.toHaveBeenCalled();
    });

    it('returns 404 for missing or inaccessible source topics', async () => {
      mockCloneTopicFromChild.mockRejectedValueOnce(new NotFoundError('Topic'));

      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            topicId: TOPIC_ID,
            requestId: REQUEST_ID,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('[BREAK] returns 403 when the caller is not the account owner', async () => {
      // [WI-867] v2: isOwner comes from getPersonScope (profile-v2), not getProfile.
      // Override for this single request so profile-scope middleware sets isOwner=false.
      mockGetPersonScope.mockResolvedValueOnce(personScope({ isOwner: false }));

      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            topicId: TOPIC_ID,
            requestId: REQUEST_ID,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockCloneTopicFromChild).not.toHaveBeenCalled();
    });
  });

  // ---- DELETE /v1/curriculum/clone-from-child/undo -------------------------

  describe('DELETE /v1/curriculum/clone-from-child/undo', () => {
    it('undoes only the created bridge topic', async () => {
      mockUndoCloneFromChild.mockResolvedValueOnce({
        deleted: { topic: true },
      });

      const res = await app.request(
        '/v1/curriculum/clone-from-child/undo',
        {
          method: 'DELETE',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            createdIds: { topicId: TOPIC_ID },
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const [, profileIdArg, createdIdsArg] =
        mockUndoCloneFromChild.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(createdIdsArg).toEqual({ topicId: TOPIC_ID });
      expect(await res.json()).toEqual({ deleted: { topic: true } });
    });

    it('returns the session-started reason when undo is no longer allowed', async () => {
      mockUndoCloneFromChild.mockResolvedValueOnce({
        deleted: { topic: false },
        reason: 'session_started',
      });

      const res = await app.request(
        '/v1/curriculum/clone-from-child/undo',
        {
          method: 'DELETE',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            createdIds: { topicId: TOPIC_ID },
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const [, profileIdArg, createdIdsArg] =
        mockUndoCloneFromChild.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(createdIdsArg).toEqual({ topicId: TOPIC_ID });
      expect(await res.json()).toEqual({
        deleted: { topic: false },
        reason: 'session_started',
      });
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/v1/curriculum/clone-from-child/undo',
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            createdIds: { topicId: TOPIC_ID },
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
      expect(mockUndoCloneFromChild).not.toHaveBeenCalled();
    });

    it('rejects invalid createdIds before calling the bridge service', async () => {
      const res = await app.request(
        '/v1/curriculum/clone-from-child/undo',
        {
          method: 'DELETE',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            createdIds: { topicId: 'not-a-uuid' },
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUndoCloneFromChild).not.toHaveBeenCalled();
    });

    it('[BREAK] returns 403 when the caller is not the account owner', async () => {
      // [WI-867] v2: isOwner comes from getPersonScope (profile-v2), not getProfile.
      mockGetPersonScope.mockResolvedValueOnce(personScope({ isOwner: false }));

      const res = await app.request(
        '/v1/curriculum/clone-from-child/undo',
        {
          method: 'DELETE',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            createdIds: { topicId: TOPIC_ID },
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUndoCloneFromChild).not.toHaveBeenCalled();
    });
  });

  // ---- GET /v1/subjects/:subjectId/curriculum ------------------------------

  describe('GET /v1/subjects/:subjectId/curriculum', () => {
    it('returns 200 with curriculum for subject', async () => {
      mockGetCurriculum.mockResolvedValueOnce(MOCK_CURRICULUM_OBJECT);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockGetCurriculum).toHaveBeenCalledTimes(1);
      const [, profileIdArg, subjectIdArg] = mockGetCurriculum.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(subjectIdArg).toBe(SUBJECT_ID);
    });

    it('returns 200 with null curriculum when no curriculum exists (not 404)', async () => {
      // getCurriculum returns null when no curriculum has been generated yet
      mockGetCurriculum.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.curriculum).toBeNull();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
      expect(mockGetCurriculum).not.toHaveBeenCalled();
    });

    it('returns 400 when profile cannot be resolved (no X-Profile-Id and no owner)', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockGetCurriculum).not.toHaveBeenCalled();
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/skip ------------------------

  describe('POST /v1/subjects/:subjectId/curriculum/skip', () => {
    it('returns 200 on successful skip', async () => {
      mockSkipTopic.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topicId).toBe(TOPIC_ID);
      expect(mockSkipTopic).toHaveBeenCalledTimes(1);
      const [, skipProfileId, skipSubjectId, skipTopicId] =
        mockSkipTopic.mock.calls[0];
      expect(skipProfileId).toBe('test-profile-id');
      expect(skipSubjectId).toBe(SUBJECT_ID);
      expect(skipTopicId).toBe(TOPIC_ID);
    });

    it('returns 404 when topic not found', async () => {
      mockSkipTopic.mockRejectedValueOnce(new NotFoundError('Topic not found'));

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockSkipTopic).not.toHaveBeenCalled();
    });

    it('returns 400 for non-UUID topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: 'not-a-uuid' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockSkipTopic).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          body: JSON.stringify({ topicId: TOPIC_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/unskip ----------------------

  describe('POST /v1/subjects/:subjectId/curriculum/unskip', () => {
    it('returns 200 on successful unskip', async () => {
      mockUnskipTopic.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topicId).toBe(TOPIC_ID);
    });

    it('returns 404 when topic not found', async () => {
      mockUnskipTopic.mockRejectedValueOnce(
        new NotFoundError('Topic not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 422 when topic is not skipped (FIX-API-6)', async () => {
      mockUnskipTopic.mockRejectedValueOnce(new TopicNotSkippedError());

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUnskipTopic).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          body: JSON.stringify({ topicId: TOPIC_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/challenge -------------------

  describe('POST /v1/subjects/:subjectId/curriculum/challenge', () => {
    it('returns 200 on successful challenge', async () => {
      // challengeCurriculumResponseSchema expects { curriculum: curriculumSchema }
      // where curriculumSchema is { id, subjectId, version, topics, generatedAt }
      mockChallengeCurriculum.mockResolvedValueOnce({
        id: '550e8400-e29b-41d4-a716-446655440020',
        subjectId: SUBJECT_ID,
        version: 1,
        topics: [],
        generatedAt: new Date().toISOString(),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ feedback: 'Make it harder' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('returns 404 when subject not found', async () => {
      mockChallengeCurriculum.mockRejectedValueOnce(
        new NotFoundError('Subject not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ feedback: 'Make it harder' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing feedback', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockChallengeCurriculum).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          body: JSON.stringify({ feedback: 'Make it harder' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/topics ----------------------

  describe('POST /v1/subjects/:subjectId/curriculum/topics', () => {
    it('returns 200 on successful topic preview', async () => {
      // curriculumTopicAddSchema is a discriminated union requiring `mode`
      mockAddCurriculumTopic.mockResolvedValueOnce({
        mode: 'preview',
        preview: {
          title: 'New topic',
          description: 'A preview description',
          estimatedMinutes: 30,
          sortOrder: 5,
          chapter: 'Chapter 1',
          relevance: 'core',
          connections: [],
        },
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ mode: 'preview', title: 'New topic' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockAddCurriculumTopic).toHaveBeenCalledTimes(1);
      const [, profileIdArg, subjectIdArg] =
        mockAddCurriculumTopic.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(subjectIdArg).toBe(SUBJECT_ID);
    });

    it('returns 404 when subject not found', async () => {
      mockAddCurriculumTopic.mockRejectedValueOnce(
        new NotFoundError('Subject not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ mode: 'preview', title: 'New topic' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing mode (discriminated union)', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ title: 'No mode given' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockAddCurriculumTopic).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          body: JSON.stringify({ mode: 'preview', title: 'New topic' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/adapt -----------------------

  describe('POST /v1/subjects/:subjectId/curriculum/adapt', () => {
    // curriculumAdaptRequestSchema requires: { topicId: uuid, signal: enum }
    const validAdaptBody = {
      topicId: TOPIC_ID,
      signal: 'struggling' as const,
    };

    it('returns 404 when subject not found', async () => {
      mockAdaptCurriculumFromPerformance.mockRejectedValueOnce(
        new NotFoundError('Subject not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify(validAdaptBody),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing required fields (topicId)', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ signal: 'mastered' }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockAdaptCurriculumFromPerformance).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid signal value', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID, signal: 'invalid_signal' }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockAdaptCurriculumFromPerformance).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          body: JSON.stringify(validAdaptBody),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/subjects/:subjectId/curriculum/topics/:topicId/explain ------

  describe('GET /v1/subjects/:subjectId/curriculum/topics/:topicId/explain', () => {
    it('returns 200 with explanation', async () => {
      mockExplainTopicOrdering.mockResolvedValueOnce(
        'This topic comes first because...',
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics/${TOPIC_ID}/explain`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockExplainTopicOrdering).toHaveBeenCalledTimes(1);
      const [, explainProfileId, explainSubjectId, explainTopicId] =
        mockExplainTopicOrdering.mock.calls[0];
      expect(explainProfileId).toBe('test-profile-id');
      expect(explainSubjectId).toBe(SUBJECT_ID);
      expect(explainTopicId).toBe(TOPIC_ID);
    });

    it('returns 404 when topic not found', async () => {
      mockExplainTopicOrdering.mockRejectedValueOnce(
        new NotFoundError('Topic not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics/${TOPIC_ID}/explain`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics/${TOPIC_ID}/explain`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-147 / DS-058] Proxy-mode write guard
//
// Mini-Hono mount of curriculumRoutes with profileMeta.isOwner=false so
// assertNotProxyMode rejects every write before the service is touched.
// Mirrors proxy-guard.test.ts + assessments.test.ts.
//
// Note: clone-from-child and undo-clone-from-child handlers already enforce
// assertOwnerProfile (stronger guard); they're not covered here.
// ---------------------------------------------------------------------------
describe('[WI-147 / DS-058] curriculum proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'test-profile-id');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', curriculumRoutes);
    return proxyApp;
  }

  beforeEach(() => jest.clearAllMocks());

  it('POST /subjects/:subjectId/curriculum/skip returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/curriculum/skip`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: TOPIC_ID }),
      },
    );
    expect(res.status).toBe(403);
    expect(mockSkipTopic).not.toHaveBeenCalled();
  });

  it('POST /subjects/:subjectId/curriculum/unskip returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/curriculum/unskip`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: TOPIC_ID }),
      },
    );
    expect(res.status).toBe(403);
    expect(mockUnskipTopic).not.toHaveBeenCalled();
  });

  it('POST /subjects/:subjectId/curriculum/challenge returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/curriculum/challenge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: 'too easy' }),
      },
    );
    expect(res.status).toBe(403);
    expect(mockChallengeCurriculum).not.toHaveBeenCalled();
  });

  it('POST /subjects/:subjectId/curriculum/topics returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/curriculum/topics`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', title: 'New topic' }),
      },
    );
    expect(res.status).toBe(403);
    expect(mockAddCurriculumTopic).not.toHaveBeenCalled();
  });

  it('POST /subjects/:subjectId/curriculum/adapt returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/curriculum/adapt`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: TOPIC_ID, signal: 'struggling' }),
      },
    );
    expect(res.status).toBe(403);
    expect(mockAdaptCurriculumFromPerformance).not.toHaveBeenCalled();
  });
});
