// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import { ERROR_CODES } from '@eduagent/schemas';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockDbInsert = jest.fn().mockReturnValue({
  values: jest.fn().mockReturnValue({
    onConflictDoNothing: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    }),
  }),
});
const mockProfileFindFirst = jest.fn().mockResolvedValue(undefined);
const mockFamilyLinksFindFirst = jest.fn().mockResolvedValue(undefined);
const mockConsentStateFindFirst = jest.fn().mockResolvedValue(undefined);
// [WI-867] v2 profile-scope seam continuity mock.
const mockFindOwnerPersonScope = jest
  .fn()
  .mockResolvedValue(personScope({ birthYear: 1985 }));
const mockGetPersonScope = jest
  .fn()
  .mockResolvedValue(personScope({ birthYear: 1985 }));
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — replaces the pre-collapse findOwnerProfile/getProfile mock; db.select() join chain unrunnable on the unit mock DB; real path covered by the identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

// [WI-1301] assertCallerIsAccountOwner calls verifyPersonIsOrgAdminV2, which
// runs a raw membership db.select() chain the unit mock DB cannot satisfy.
// Every scenario in this file that currently reaches assertCallerIsAccountOwner
// is a caller-owner scenario (the non-owner break tests are rejected earlier by
// assertOwnerProfile's X-Profile-Id-resolved isOwner check, before this guard
// runs) — the caller-vs-X-Profile-Id-spoof distinction this guard exists to
// enforce is covered by the real-DB break test in
// tests/integration/account-billing-owner-idor.integration.test.ts.
jest.mock('../services/identity-v2/ownership-v2', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/ownership-v2',
  ) as typeof import('../services/identity-v2/ownership-v2');
  return {
    ...actual,
    verifyPersonIsOrgAdminV2: jest.fn().mockResolvedValue(true),
  };
});

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
    query: {
      profiles: {
        findFirst: (...args: unknown[]) => mockProfileFindFirst(...args),
      },
      familyLinks: {
        findFirst: (...args: unknown[]) => mockFamilyLinksFindFirst(...args),
      },
      consentStates: {
        findFirst: (...args: unknown[]) => mockConsentStateFindFirst(...args),
      },
    },
  },
  exports: {
    byokWaitlist: { email: 'email' },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module); // gc1-allow: external boundary — unit test, real Neon DB unavailable; db injected via middleware

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

// [BUG-94 / A1-HIGH] family/add gates on isOwner.
//
// [Issue 901] After the no-header auto-resolve fix, owner privileges require an
// EXPLICITLY selected, verified owner profile (resolvedVia:'explicit-header').
// Owner-gated success tests send OWNER_AUTH_HEADERS (an explicit
// X-Profile-Id = OWNER_PROFILE_ID); the v2 explicit-header path
// (mockGetPersonScope) resolves that id to the owner. The no-header
// auto-resolve path is driven by the v2 mockFindOwnerPersonScope mock above
// (both mocked on ../services/identity-v2/profile-v2). ../services/profile is
// used only for its live types/exports and is no longer mocked here.

// ---------------------------------------------------------------------------
// Mock billing service
// ---------------------------------------------------------------------------

const mockGetSubscriptionByAccountId = jest.fn();
const mockEnsureFreeSubscription = jest.fn();
const mockGetEffectiveAccessForSubscription = jest.fn();
const mockGetOrProvisionProfileQuotaUsage = jest.fn();
const mockGetQuotaPool = jest.fn();
const mockLinkStripeCustomer = jest.fn();
// [BUG-827] Race-safe customer resolver — the new mocked service boundary.
const mockGetOrCreateStripeCustomer = jest.fn();
const mockAddToByokWaitlist = jest.fn().mockResolvedValue(undefined);
const mockMarkSubscriptionCancelled = jest.fn().mockResolvedValue(undefined);
const mockGetTopUpCreditsRemaining = jest.fn().mockResolvedValue(0);
const mockGetTopUpPriceCents = jest.fn().mockReturnValue(499);
const mockListFamilyMembers = jest.fn();
const mockAddProfileToSubscription = jest.fn();
const mockRemoveProfileFromSubscription = jest.fn();
const mockGetFamilyPoolStatus = jest.fn();
const mockGetUsageBreakdownForProfile = jest.fn();
const mockGetUsageEventsAvailableSince = jest
  .fn()
  .mockReturnValue('2026-05-06T00:00:00.000Z');
const mockBuildUsageDateLabels = jest.fn((input) => ({
  resetsAt: input.resetsAt,
  renewsAt: input.renewsAt,
  resetsAtLabel: 'February 15, 2025',
  renewsAtLabel: input.renewsAt ? 'February 15, 2025' : null,
}));

jest.mock('../services/billing', () => {
  const actual = jest.requireActual(
    '../services/billing',
  ) as typeof import('../services/billing');
  return {
    ...actual,
    // Use real ProfileRemovalNotImplementedError so instanceof checks in the
    // route handler match production behaviour.
    getSubscriptionByAccountId: (...args: unknown[]) =>
      mockGetSubscriptionByAccountId(...args),
    ensureFreeSubscription: (...args: unknown[]) =>
      mockEnsureFreeSubscription(...args),
    getEffectiveAccessForSubscription: (...args: unknown[]) =>
      mockGetEffectiveAccessForSubscription(...args),
    getOrProvisionProfileQuotaUsage: (...args: unknown[]) =>
      mockGetOrProvisionProfileQuotaUsage(...args),
    getQuotaPool: (...args: unknown[]) => mockGetQuotaPool(...args),
    linkStripeCustomer: (...args: unknown[]) => mockLinkStripeCustomer(...args),
    getOrCreateStripeCustomer: (...args: unknown[]) =>
      mockGetOrCreateStripeCustomer(...args),
    addToByokWaitlist: (...args: unknown[]) => mockAddToByokWaitlist(...args),
    markSubscriptionCancelled: (...args: unknown[]) =>
      mockMarkSubscriptionCancelled(...args),
    getTopUpCreditsRemaining: (...args: unknown[]) =>
      mockGetTopUpCreditsRemaining(...args),
    getTopUpPriceCents: (...args: unknown[]) => mockGetTopUpPriceCents(...args),
    listFamilyMembers: (...args: unknown[]) => mockListFamilyMembers(...args),
    addProfileToSubscription: (...args: unknown[]) =>
      mockAddProfileToSubscription(...args),
    removeProfileFromSubscription: (...args: unknown[]) =>
      mockRemoveProfileFromSubscription(...args),
    getFamilyPoolStatus: (...args: unknown[]) =>
      mockGetFamilyPoolStatus(...args),
    getUsageBreakdownForProfile: (...args: unknown[]) =>
      mockGetUsageBreakdownForProfile(...args),
    getUsageEventsAvailableSince: (...args: unknown[]) =>
      mockGetUsageEventsAvailableSince(...args),
    buildUsageDateLabels: (input: unknown) => mockBuildUsageDateLabels(input),
  };
});

// [WI-867] billing/billing-v2 continuity mock — billing.ts now imports v2 twins
// directly. Route delegates to the same mock fns the legacy billing mock uses,
// so existing toHaveBeenCalled() assertions stay valid and the real DB join chain
// is not exercised in this unit test. Real behaviour covered by billing-v2
// integration suites.
jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: continuity — route now calls v2 twins directly; DB join chain unrunnable on unit mock DB; real path covered by billing-v2 integration suites */,
  () => {
    const actual = jest.requireActual(
      '../services/billing/billing-v2',
    ) as typeof import('../services/billing/billing-v2');
    return {
      ...actual,
      // account middleware calls ensureInitialTrialSubscriptionV2 on every
      // authenticated request — must be a no-op stub so the mock DB isn't hit.
      ensureInitialTrialSubscriptionV2: jest.fn().mockResolvedValue(undefined),
      getSubscriptionByAccountIdV2: (...args: unknown[]) =>
        mockGetSubscriptionByAccountId(...args),
      // [WI-867] checkout/top-up now resolve the Stripe customer via the
      // BUG-827 race-safe v2 helper (main de-gated the v0/v2 ternary to the
      // v2 arm). Delegate to the same mock the legacy seam used so the
      // existing toHaveBeenCalled() assertions stay valid.
      getOrCreateStripeCustomerV2: (...args: unknown[]) =>
        mockGetOrCreateStripeCustomer(...args),
      getQuotaPoolV2: (...args: unknown[]) => mockGetQuotaPool(...args),
      linkStripeCustomerV2: (...args: unknown[]) =>
        mockLinkStripeCustomer(...args),
      ensureFreeSubscriptionV2: (...args: unknown[]) =>
        mockEnsureFreeSubscription(...args),
      markSubscriptionCancelledV2: (...args: unknown[]) =>
        mockMarkSubscriptionCancelled(...args),
      getEffectiveAccessForSubscriptionV2: (...args: unknown[]) =>
        mockGetEffectiveAccessForSubscription(...args),
      getOrProvisionProfileQuotaUsageV2: (...args: unknown[]) =>
        mockGetOrProvisionProfileQuotaUsage(...args),
      listFamilyMembersV2: (...args: unknown[]) =>
        mockListFamilyMembers(...args),
      addProfileToSubscriptionV2: (...args: unknown[]) =>
        mockAddProfileToSubscription(...args),
      removeProfileFromSubscriptionV2: (...args: unknown[]) =>
        mockRemoveProfileFromSubscription(...args),
      getFamilyPoolStatusV2: (...args: unknown[]) =>
        mockGetFamilyPoolStatus(...args),
      getUsageBreakdownForProfileV2: (...args: unknown[]) =>
        mockGetUsageBreakdownForProfile(...args),
    };
  },
);

// ---------------------------------------------------------------------------
// Mock KV service
// ---------------------------------------------------------------------------

const mockReadSubscriptionStatus = jest.fn();

jest.mock('../services/kv', () => {
  const actual = jest.requireActual(
    '../services/kv',
  ) as typeof import('../services/kv');
  return {
    ...actual,
    readSubscriptionStatus: (...args: unknown[]) =>
      mockReadSubscriptionStatus(...args),
  };
});

// ---------------------------------------------------------------------------
// Mock Sentry — [BUG-97] verifies KV failures are captured, not swallowed
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
const mockInngestSend = jest.fn().mockResolvedValue(undefined);

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      send: (...args: unknown[]) => mockInngestSend(...args),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock Stripe SDK
// ---------------------------------------------------------------------------

const mockCheckoutCreate = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockCustomersCreate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();
const mockPortalCreate = jest.fn();

jest.mock('../services/stripe', () => {
  const actual = jest.requireActual(
    '../services/stripe',
  ) as typeof import('../services/stripe');
  return {
    ...actual,
    createStripeClient: jest.fn().mockReturnValue({
      checkout: {
        sessions: {
          create: (...args: unknown[]) => mockCheckoutCreate(...args),
        },
      },
      subscriptions: {
        update: (...args: unknown[]) => mockSubscriptionsUpdate(...args),
      },
      customers: {
        create: (...args: unknown[]) => mockCustomersCreate(...args),
      },
      paymentIntents: {
        create: (...args: unknown[]) => mockPaymentIntentsCreate(...args),
      },
      billingPortal: {
        sessions: { create: (...args: unknown[]) => mockPortalCreate(...args) },
      },
    }),
  };
});

import { Hono } from 'hono';
import { app } from '../index';
import { billingRoutes } from './billing';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const AUTH_HEADERS = makeAuthHeaders();

// [Issue 901] Owner profile id resolved by the getProfile mock above. Owner-
// gated success tests must send this as an explicit X-Profile-Id so the owner
// gate sees a verified (explicit-header) owner, not an auto-synthesized one.
const OWNER_PROFILE_ID = 'test-profile-id';
const OWNER_AUTH_HEADERS = makeAuthHeaders({
  'X-Profile-Id': OWNER_PROFILE_ID,
});

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ...BASE_AUTH_ENV,
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_monthly',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_yearly',
  STRIPE_PRICE_FAMILY_MONTHLY: 'price_family_monthly',
  STRIPE_PRICE_FAMILY_YEARLY: 'price_family_yearly',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
  STRIPE_PRICE_PRO_YEARLY: 'price_pro_yearly',
  APP_URL: 'https://www.mentomate.com',
};

function mockSubscription(overrides?: Record<string, unknown>) {
  return {
    id: 'sub-1',
    accountId: 'test-account-id',
    stripeCustomerId: 'cus_test123',
    stripeSubscriptionId: 'sub_test123',
    tier: 'plus',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: '2025-02-15T00:00:00.000Z',
    currentPeriodStart: '2025-01-15T00:00:00.000Z',
    cancelledAt: null,
    lastStripeEventTimestamp: null,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function mockQuotaPool(overrides?: Record<string, unknown>) {
  return {
    id: 'qp-1',
    subscriptionId: 'sub-1',
    monthlyLimit: 500,
    usedThisMonth: 42,
    dailyLimit: null as number | null,
    usedToday: 0,
    cycleResetAt: '2025-02-15T00:00:00.000Z',
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function mockEffectiveAccess(overrides?: Record<string, unknown>) {
  return {
    subscription: mockSubscription(),
    effectiveAccessTier: 'plus',
    billingAccess: 'current',
    ...overrides,
  };
}

function mockProfileQuota(overrides?: Record<string, unknown>) {
  return {
    id: 'pqu-1',
    subscriptionId: 'sub-1',
    profileId: 'test-profile-id',
    role: 'owner',
    monthlyLimit: 500,
    usedThisMonth: 42,
    dailyLimit: null,
    usedToday: 0,
    cycleResetAt: '2025-02-15T00:00:00.000Z',
    ...overrides,
  };
}

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();
  mockGetSubscriptionByAccountId.mockResolvedValue(null);
  mockGetEffectiveAccessForSubscription.mockResolvedValue(
    mockEffectiveAccess(),
  );
  mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(mockProfileQuota());
  mockGetQuotaPool.mockResolvedValue(null);
  mockLinkStripeCustomer.mockResolvedValue(null);
  // Default: resolve to a freshly-created customer id. Tests asserting the
  // already-linked path override this with the existing id.
  mockGetOrCreateStripeCustomer.mockResolvedValue('cus_new');
  mockReadSubscriptionStatus.mockResolvedValue(null);
  mockCaptureException.mockReset();
  mockInngestSend.mockResolvedValue(undefined);
  mockListFamilyMembers.mockResolvedValue([]);
  mockAddProfileToSubscription.mockResolvedValue(null);
  mockRemoveProfileFromSubscription.mockResolvedValue(null);
  mockGetFamilyPoolStatus.mockResolvedValue(null);
  mockGetUsageBreakdownForProfile.mockResolvedValue(null);
  // [WI-867] re-arm v2 profile-scope mock after clearAllMocks().
  mockFindOwnerPersonScope.mockResolvedValue(personScope({ birthYear: 1985 }));
  mockGetPersonScope.mockResolvedValue(personScope({ birthYear: 1985 }));
  mockProfileFindFirst.mockResolvedValue(undefined);
  mockFamilyLinksFindFirst.mockResolvedValue(undefined);
  mockConsentStateFindFirst.mockResolvedValue(undefined);
});

describe('billing routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/subscription
  // -------------------------------------------------------------------------

  describe('GET /v1/subscription', () => {
    it('returns free-tier defaults when no subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subscription.tier).toBe('free');
      expect(body.subscription.status).toBe('trial');
      expect(body.subscription.cancelAtPeriodEnd).toBe(false);
      expect(body.subscription.monthlyLimit).toBe(100);
      expect(body.subscription.usedThisMonth).toBe(0);
      expect(body.subscription.remainingQuestions).toBe(100);
      expect(body.subscription.dailyLimit).toBe(10);
      expect(body.subscription.usedToday).toBe(0);
      expect(body.subscription.dailyRemainingQuestions).toBe(10);
    });

    it('returns real subscription data when subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());

      const res = await app.request(
        '/v1/subscription',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subscription.tier).toBe('plus');
      expect(body.subscription.status).toBe('active');
      expect(body.subscription.cancelAtPeriodEnd).toBe(false);
      expect(body.subscription.monthlyLimit).toBe(500);
      expect(body.subscription.usedThisMonth).toBe(42);
      expect(body.subscription.remainingQuestions).toBe(458);
    });

    it('returns cancelAtPeriodEnd true when subscription is cancelled but active', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({
          cancelledAt: '2025-01-20T00:00:00.000Z',
          status: 'active',
        }),
      );
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());

      const res = await app.request(
        '/v1/subscription',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subscription.cancelAtPeriodEnd).toBe(true);
      expect(body.subscription.currentPeriodEnd).toBe(
        '2025-02-15T00:00:00.000Z',
      );
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subscription', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });

    // [BREAK FCR-2026-05-23-L2.M2.1] [BUG-644] Non-owner profile must NOT
    // read account-level subscription tier/status/limits. Without the
    // isOwner gate added in billing.ts /subscription handler, a child on
    // the parent's account could read parent's billing data.
    it('[BREAK FCR-2026-05-23-L2.M2.1] returns 403 when caller is a non-owner profile', async () => {
      const childProfileId = '550e8400-e29b-41d4-a716-446655440000';
      mockProfileFindFirst.mockResolvedValue({
        id: childProfileId,
        accountId: 'test-account-id',
        displayName: 'Child',
        avatarUrl: null,
        birthYear: 2012,
        location: 'EU',
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: 'nb',
        pronouns: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());
      // [WI-867] v2: getPersonScope controls profileMeta.isOwner for X-Profile-Id path.
      mockGetPersonScope.mockResolvedValueOnce(personScope({ isOwner: false }));

      const res = await app.request(
        '/v1/subscription',
        { headers: { ...AUTH_HEADERS, 'X-Profile-Id': childProfileId } },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      // Body must not leak any account-level subscription detail.
      const body = await res.json();
      expect(body).not.toHaveProperty('subscription');
      // toEqual asserts the exact serialized body — proves the
      // assertOwnerProfile message-passthrough and that the only keys are
      // { code, message } (thrown ForbiddenError apiCode is undefined → dropped).
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can view subscription details.',
      });
      // Subscription service should never be consulted once gate trips.
      expect(mockGetSubscriptionByAccountId).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/checkout
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/checkout', () => {
    it('creates Stripe checkout session and returns URL', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeCustomerId: 'cus_existing' }),
      );
      // [BUG-827] The route resolves the customer via the race-safe service;
      // here it already exists, so the resolver returns the linked id.
      mockGetOrCreateStripeCustomer.mockResolvedValue('cus_existing');
      mockCheckoutCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/session_123',
        id: 'cs_test_123',
      });

      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.checkoutUrl).toBe('https://checkout.stripe.com/session_123');
      expect(body.sessionId).toBe('cs_test_123');
      // The checkout session is bound to the resolved customer.
      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing' }),
      );
    });

    it('[BUG-827] resolves the Stripe customer race-safely before checkout', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeCustomerId: null }),
      );
      // The race-safe resolver creates+links exactly one customer (asserted at
      // the service level in subscription-core.test.ts) and returns its id.
      mockGetOrCreateStripeCustomer.mockResolvedValue('cus_new');
      mockCheckoutCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/new_session',
        id: 'cs_test_new',
      });

      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({ tier: 'plus', interval: 'yearly' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // The route delegates customer resolution to the race-safe service,
      // passing the account id and the account email — never a raw inline
      // customers.create + link (the TOCTOU race that orphaned customers).
      expect(mockGetOrCreateStripeCustomer).toHaveBeenCalledWith(
        mockDatabaseModule.db,
        'test-account-id',
        expect.anything(),
        expect.objectContaining({ email: 'test@example.com' }),
      );
      // The checkout session binds to the resolved customer.
      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_new' }),
      );
    });

    it('returns 400 with invalid tier', async () => {
      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({ tier: 'invalid', interval: 'monthly' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid interval', async () => {
      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({ tier: 'plus', interval: 'weekly' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    // [Issue 901 / BREAK] An authenticated NON-OWNER caller can simply OMIT
    // X-Profile-Id. profileScopeMiddleware then auto-resolves the account
    // OWNER profile (isOwner:true via the v2 person-scope mocks) — before the fix
    // this synthesized identity passed assertNotProxyMode's isOwner check and
    // the checkout session would have been created (privilege escalation). The
    // fix in assertNotProxyMode also requires resolvedVia:'explicit-header',
    // which an auto-resolved profile lacks, so the request is rejected first.
    it('[BREAK][Issue 901] POST /subscription/checkout returns 403 when X-Profile-Id is omitted (no auto-resolve to owner)', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeCustomerId: 'cus_existing' }),
      );

      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      // The Stripe checkout session must never be created.
      expect(mockCheckoutCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/cancel
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/cancel', () => {
    it('cancels subscription via Stripe and returns confirmation', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockSubscriptionsUpdate.mockResolvedValue({
        cancel_at_period_end: true,
        // Stripe SDK v20: period fields on SubscriptionItem
        items: {
          data: [{ current_period_end: 1739577600 }], // 2025-02-15T00:00:00Z
        },
      });

      const res = await app.request(
        '/v1/subscription/cancel',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toContain('Subscription cancelled');
      expect(typeof body.currentPeriodEnd).toBe('string');
      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_test123', {
        cancel_at_period_end: true,
      });
      expect(mockMarkSubscriptionCancelled).toHaveBeenCalledWith(
        mockDatabaseModule.db,
        'sub-1',
      );
    });

    it('returns 404 when no subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/cancel',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 when subscription has no Stripe ID', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeSubscriptionId: null }),
      );

      const res = await app.request(
        '/v1/subscription/cancel',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/cancel',
        { method: 'POST' },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    // [Issue 901 / BREAK] An authenticated NON-OWNER caller can simply OMIT
    // X-Profile-Id. profileScopeMiddleware then auto-resolves the account
    // OWNER profile (isOwner:true via the v2 person-scope mocks) — before the fix
    // this satisfied assertNotProxyMode + assertOwnerProfile and the
    // subscription was cancelled (privilege escalation). The fix tags
    // auto-resolved identity resolvedVia:'auto', which the owner gates reject.
    it('[BREAK] returns 403 and does not cancel when X-Profile-Id is omitted', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());

      const res = await app.request(
        '/v1/subscription/cancel',
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      // The cancellation side effects must never fire.
      expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
      expect(mockMarkSubscriptionCancelled).not.toHaveBeenCalled();
    });

    // [WI-994] Regression: stripeCancelResponseSchema replaces `as unknown as`.
    // Red-green proof: revert to `updated as unknown as { current_period_end?: number }`
    // and `typeof raw.current_period_end === 'number'` — when subscription level is
    // absent the cast returns undefined (correct), but item-level is still read from
    // `updated.items.data[0]` directly. The schema parses both levels safely.

    it('[WI-994] uses item-level currentPeriodEnd when subscription level is absent', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      // No top-level current_period_end — only item-level (Stripe SDK v20 typical)
      mockSubscriptionsUpdate.mockResolvedValue({
        cancel_at_period_end: true,
        items: {
          data: [{ current_period_end: 1739577600 }], // 2025-02-15T00:00:00Z
        },
      });

      const res = await app.request(
        '/v1/subscription/cancel',
        { method: 'POST', headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.currentPeriodEnd).toBe('2025-02-15T00:00:00.000Z');
    });

    it('[WI-994] falls back to new Date() when neither current_period_end field is present', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      // Neither field — handler logs an error and uses current timestamp
      mockSubscriptionsUpdate.mockResolvedValue({
        cancel_at_period_end: true,
        items: { data: [] },
      });

      const res = await app.request(
        '/v1/subscription/cancel',
        { method: 'POST', headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      // currentPeriodEnd falls back to a current timestamp ISO string
      expect(typeof body.currentPeriodEnd).toBe('string');
      expect(
        new Date(body.currentPeriodEnd).getFullYear(),
      ).toBeGreaterThanOrEqual(2024);

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [capturedErr, capturedCtx] = mockCaptureException.mock.calls[0];
      expect(capturedErr).toEqual(
        expect.objectContaining({
          message: 'Stripe cancel response returned no current_period_end',
        }),
      );
      expect(capturedCtx).toEqual(
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'billing.subscriptionCancel.missingCurrentPeriodEnd',
            accountId: 'test-account-id',
            subscriptionId: 'sub-1',
            stripeSubscriptionId: 'sub_test123',
          }),
        }),
      );
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'app/billing.missing_current_period_end',
        data: expect.objectContaining({
          accountId: 'test-account-id',
          subscriptionId: 'sub-1',
          stripeSubscriptionId: 'sub_test123',
          timestamp: expect.any(String),
        }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/top-up
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/top-up', () => {
    it('creates a Stripe payment intent for top-up', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      // [BUG-827] Customer resolution goes through the race-safe service.
      mockGetOrCreateStripeCustomer.mockResolvedValue('cus_test123');
      mockPaymentIntentsCreate.mockResolvedValue({
        client_secret: 'pi_secret_test',
        id: 'pi_test_123',
      });

      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({ amount: 500 }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topUp.amount).toBe(500);
      expect(body.topUp.clientSecret).toBe('pi_secret_test');
      expect(body.topUp.paymentIntentId).toBe('pi_test_123');
      // The payment intent is charged against the race-safely resolved customer.
      expect(mockGetOrCreateStripeCustomer).toHaveBeenCalled();
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_test123' }),
      );
    });

    it('returns 400 with invalid amount', async () => {
      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({ amount: 999 }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          body: JSON.stringify({ amount: 500 }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    // [Issue 901 / BREAK] An authenticated NON-OWNER caller can simply OMIT
    // X-Profile-Id. profileScopeMiddleware then auto-resolves the account
    // OWNER profile (isOwner:true via the v2 person-scope mocks) — before the fix
    // this auto-resolved identity satisfied assertOwnerProfile and the top-up
    // payment intent would have been created (privilege escalation). The fix
    // tags auto-resolved identity resolvedVia:'auto', which assertOwnerProfile
    // and assertNotProxyMode both reject.
    it('[BREAK][Issue 901] POST /subscription/top-up returns 403 when X-Profile-Id is omitted (no auto-resolve to owner)', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());

      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ amount: 500 }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      // The Stripe payment intent must never be created.
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/usage
  // -------------------------------------------------------------------------

  describe('GET /v1/usage', () => {
    it('returns free-tier defaults when no subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/usage',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.usage.monthlyLimit).toBe(100);
      expect(body.usage.usedThisMonth).toBe(0);
      expect(body.usage.remainingQuestions).toBe(100);
      expect(body.usage.topUpCreditsRemaining).toBe(0);
      expect(body.usage.warningLevel).toBe('none');
      expect(typeof body.usage.cycleResetAt).toBe('string');
      expect(body.usage.dailyLimit).toBe(10);
      expect(body.usage.usedToday).toBe(0);
      expect(body.usage.dailyRemainingQuestions).toBe(10);
    });

    it('returns real usage data when subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({ usedThisMonth: 450 }),
      );
      mockGetUsageBreakdownForProfile.mockResolvedValue({
        byProfile: [],
        familyAggregate: null,
        isOwnerBreakdownViewer: false,
        selfUsedToday: 1,
        selfUsedThisMonth: 12,
      });

      const res = await app.request(
        '/v1/usage',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.usage.monthlyLimit).toBe(500);
      expect(body.usage.usedThisMonth).toBe(450);
      expect(body.usage.remainingQuestions).toBe(50);
      expect(body.usage.warningLevel).toBe('soft');
      expect(mockGetOrProvisionProfileQuotaUsage).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        { tier: 'plus' },
      );
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
      expect(mockGetUsageBreakdownForProfile).not.toHaveBeenCalled();
    });

    it('does not fall back to shared-pool reads when per-profile usage has no active profile', async () => {
      // [WI-867] v2: findOwnerPersonScope null → no profileId set → 400 (profile required for per-profile quota).
      mockFindOwnerPersonScope.mockResolvedValueOnce(null);
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool({ usedThisMonth: 450 }));

      const res = await app.request(
        '/v1/usage',
        // [Issue 901] /usage is intentionally NOT owner-gated; this test
        // exercises the no-X-Profile-Id auto-resolve path (findOwnerPersonScope
        // returns null → no active profile → 400). Must NOT send an explicit
        // owner header or the v2 explicit-header path would resolve one.
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockGetOrProvisionProfileQuotaUsage).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
    });

    // Shared-pool tiers with profile breakdowns need profile context.
    // Otherwise the fallback quota-pool read exposes family-wide aggregates.
    it.each(['family', 'pro'] as const)(
      '%s tier requires active profile and does not leak shared-pool aggregates',
      async (tier) => {
        // [WI-867] v2: findOwnerPersonScope null → no profileId → 400 (profile required).
        mockFindOwnerPersonScope.mockResolvedValueOnce(null);
        mockGetSubscriptionByAccountId.mockResolvedValue(
          mockSubscription({ tier }),
        );
        mockGetEffectiveAccessForSubscription.mockResolvedValue(
          mockEffectiveAccess({
            subscription: mockSubscription({ tier }),
            effectiveAccessTier: tier,
          }),
        );
        mockGetQuotaPool.mockResolvedValue(
          mockQuotaPool({ usedThisMonth: 999 }),
        );

        const res = await app.request(
          '/v1/usage',
          // [Issue 901] /usage not owner-gated; auto-resolve path with no owner
          // (findOwnerPersonScope null) → no active profile → 400. Keep AUTH_HEADERS.
          { headers: AUTH_HEADERS },
          TEST_ENV,
        );

        expect(res.status).toBe(400);
        expect(mockGetQuotaPool).not.toHaveBeenCalled();
        expect(mockGetOrProvisionProfileQuotaUsage).not.toHaveBeenCalled();
      },
    );

    it('returns child-visible usage from their profile breakdown', async () => {
      const childProfileId = '550e8400-e29b-41d4-a716-446655440000';
      mockProfileFindFirst.mockResolvedValue({
        id: childProfileId,
        accountId: 'test-account-id',
        displayName: 'Child',
        avatarUrl: null,
        birthYear: 2012,
        location: 'EU',
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: 'nb',
        pronouns: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );
      mockGetEffectiveAccessForSubscription.mockResolvedValue(
        mockEffectiveAccess({
          subscription: mockSubscription({ tier: 'family' }),
          effectiveAccessTier: 'family',
        }),
      );
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool({ usedThisMonth: 450 }));
      mockGetUsageBreakdownForProfile.mockResolvedValue({
        byProfile: [],
        familyAggregate: null,
        isOwnerBreakdownViewer: false,
        selfUsedToday: 3,
        selfUsedThisMonth: 12,
      });
      // [WI-867] v2: getPersonScope controls profileMeta; conversationLanguage: 'nb'
      // mirrors the legacy mockProfileFindFirst value for the locale assertion.
      mockGetPersonScope.mockResolvedValueOnce(
        personScope({ isOwner: false, conversationLanguage: 'nb' }),
      );

      const res = await app.request(
        '/v1/usage',
        { headers: { ...AUTH_HEADERS, 'X-Profile-Id': childProfileId } },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.usage.usedThisMonth).toBe(12);
      // Non-owner viewers see the family pool's actual remaining (50 = 500-450),
      // NOT a per-child extrapolation (would be 488 = 500-12). Their personal
      // contribution shows in usedThisMonth, without a per-profile breakdown.
      expect(body.usage.remainingQuestions).toBe(50);
      expect(body.usage.byProfile).toEqual([]);
      expect(body.usage.familyAggregate).toBeNull();
      // usedToday must be the viewer's own daily count, not the family
      // aggregate — preventing children from inferring siblings' activity.
      expect(body.usage.usedToday).toBe(3);
      expect(mockBuildUsageDateLabels).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'nb' }),
      );
      // [WI-867] v2 always: route always dispatches to getUsageBreakdownForProfileV2
      // (mock delegates to mockGetUsageBreakdownForProfile). Real DB join chain
      // covered by billing-v2 integration suites.
      expect(mockGetUsageBreakdownForProfile).toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/usage', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/portal
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/portal', () => {
    it('creates a Stripe billing portal session', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockPortalCreate.mockResolvedValue({
        url: 'https://billing.stripe.com/portal_session_123',
      });

      const res = await app.request(
        '/v1/subscription/portal',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.portalUrl).toBe(
        'https://billing.stripe.com/portal_session_123',
      );
    });

    it('returns 404 when no Stripe customer exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeCustomerId: null }),
      );

      const res = await app.request(
        '/v1/subscription/portal',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/portal',
        { method: 'POST' },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    // [Issue 901 / BREAK] An authenticated NON-OWNER caller can simply OMIT
    // X-Profile-Id. profileScopeMiddleware then auto-resolves the account
    // OWNER profile (isOwner:true via the v2 person-scope mocks) — before the fix
    // this auto-resolved identity satisfied assertOwnerProfile and the billing
    // portal session would have been created (privilege escalation). The fix
    // tags auto-resolved identity resolvedVia:'auto', which assertOwnerProfile
    // and assertNotProxyMode both reject.
    it('[BREAK][Issue 901] POST /subscription/portal returns 403 when X-Profile-Id is omitted (no auto-resolve to owner)', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());

      const res = await app.request(
        '/v1/subscription/portal',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      // The Stripe billing portal session must never be created.
      expect(mockPortalCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subscription/status (KV-backed)
  // -------------------------------------------------------------------------

  describe('GET /v1/subscription/status', () => {
    it('returns free-tier defaults when no subscription exists and no KV', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/status',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status.tier).toBe('free');
      expect(body.status.status).toBe('trial');
      expect(body.status.monthlyLimit).toBe(100);
      expect(body.status.usedThisMonth).toBe(0);
      expect(body.status.dailyLimit).toBe(10);
      expect(body.status.usedToday).toBe(0);
    });

    it('returns DB-backed status when no KV namespace', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());

      const res = await app.request(
        '/v1/subscription/status',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status.tier).toBe('plus');
      expect(body.status.status).toBe('active');
      expect(body.status.monthlyLimit).toBe(500);
      expect(body.status.usedThisMonth).toBe(42);
      expect(mockGetOrProvisionProfileQuotaUsage).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        { tier: 'plus' },
      );
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
    });

    it('returns shared-pool cached status without hitting the DB', async () => {
      const fakeKv = {} as unknown;
      mockReadSubscriptionStatus.mockResolvedValueOnce({
        subscriptionId: 'sub-family',
        tier: 'family',
        effectiveAccessTier: 'family',
        billingAccess: 'current',
        status: 'active',
        monthlyLimit: 1500,
        usedThisMonth: 123,
        dailyLimit: null,
        usedToday: 0,
      });

      const res = await app.request(
        '/v1/subscription/status',
        { headers: OWNER_AUTH_HEADERS },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKv },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toMatchObject({
        tier: 'family',
        effectiveAccessTier: 'family',
        billingAccess: 'current',
        monthlyLimit: 1500,
        usedThisMonth: 123,
      });
      expect(mockGetSubscriptionByAccountId).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
      expect(mockGetOrProvisionProfileQuotaUsage).not.toHaveBeenCalled();
    });

    it('ignores per-profile cached status and reads the active profile quota', async () => {
      const fakeKv = {} as unknown;
      mockReadSubscriptionStatus.mockResolvedValueOnce({
        subscriptionId: 'sub-1',
        tier: 'plus',
        effectiveAccessTier: 'plus',
        billingAccess: 'current',
        status: 'active',
        monthlyLimit: 999,
        usedThisMonth: 888,
        dailyLimit: null,
        usedToday: 0,
      });
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetOrProvisionProfileQuotaUsage.mockResolvedValue(
        mockProfileQuota({
          monthlyLimit: 700,
          usedThisMonth: 12,
        }),
      );

      const res = await app.request(
        '/v1/subscription/status',
        { headers: OWNER_AUTH_HEADERS },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKv },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toMatchObject({
        tier: 'plus',
        effectiveAccessTier: 'plus',
        billingAccess: 'current',
        monthlyLimit: 700,
        usedThisMonth: 12,
      });
      expect(mockGetSubscriptionByAccountId).toHaveBeenCalled();
      expect(mockGetOrProvisionProfileQuotaUsage).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        { tier: 'plus' },
      );
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subscription/status', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });

    // [BREAK BUG-825] Non-owner profile must NOT read account-level billing
    // status fields (tier, status, monthlyLimit, dailyLimit, etc.) — mirrors
    // the BUG-644 break test for /v1/subscription. Without the owner gate
    // added in billing.ts:/subscription/status handler, a child profile on
    // the parent's account could read the parent's billing data through this
    // "fast KV-backed" endpoint that bypasses the /subscription gate.
    it('[BREAK BUG-825] returns 403 when caller is a non-owner profile', async () => {
      const childProfileId = '550e8400-e29b-41d4-a716-446655440000';
      mockProfileFindFirst.mockResolvedValue({
        id: childProfileId,
        accountId: 'test-account-id',
        displayName: 'Child',
        avatarUrl: null,
        birthYear: 2012,
        location: 'EU',
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: 'nb',
        pronouns: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      mockReadSubscriptionStatus.mockResolvedValue({
        tier: 'family',
        effectiveAccessTier: 'family',
        billingAccess: 'current',
        status: 'active',
        monthlyLimit: 700,
        usedThisMonth: 100,
        dailyLimit: null,
        usedToday: 0,
      });
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());
      // [WI-867] v2: getPersonScope controls profileMeta.isOwner for X-Profile-Id path.
      mockGetPersonScope.mockResolvedValueOnce(personScope({ isOwner: false }));

      const res = await app.request(
        '/v1/subscription/status',
        { headers: { ...AUTH_HEADERS, 'X-Profile-Id': childProfileId } },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      // Body must not leak any account-level status field.
      expect(body).not.toHaveProperty('status');
      expect(body).toEqual({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Only the account owner can view subscription status.',
      });
      // Neither KV nor DB read should fire once the gate trips.
      expect(mockReadSubscriptionStatus).not.toHaveBeenCalled();
      expect(mockGetSubscriptionByAccountId).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
    });

    // [BUG-97 / A1-MED] KV throws → fallback to DB AND captureException fired.
    // Break test: revert the try/catch in billing.ts and this turns into a 500.
    it('falls back to DB and captures the error when KV read throws', async () => {
      // KVNamespace is a Workers global omitted from tsconfig.spec.json (same
      // reason as kv.test.ts — adding it globally cascades ~430 type errors).
      // We only need the value to flow through the env; cast via unknown.
      const fakeKv = {} as unknown;
      const kvError = new Error('KV namespace unavailable');
      mockReadSubscriptionStatus.mockRejectedValueOnce(kvError);
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());

      const res = await app.request(
        '/v1/subscription/status',
        { headers: OWNER_AUTH_HEADERS },
        { ...TEST_ENV, SUBSCRIPTION_KV: fakeKv },
      );

      // Without the try/catch the unhandled rejection bubbles → 500.
      expect(res.status).toBe(200);
      const body = await res.json();
      // DB fallback wins — values come from the active profile quota row.
      expect(body.status.tier).toBe('plus');
      expect(body.status.status).toBe('active');
      expect(body.status.monthlyLimit).toBe(500);
      expect(body.status.usedThisMonth).toBe(42);
      expect(mockGetOrProvisionProfileQuotaUsage).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1',
        'test-profile-id',
        { tier: 'plus' },
      );
      expect(mockGetQuotaPool).not.toHaveBeenCalled();

      // Silent recovery is banned — the error must be captured.
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [capturedErr, capturedCtx] = mockCaptureException.mock.calls[0];
      expect(capturedErr).toBe(kvError);
      expect(capturedCtx).toEqual(
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'billing.subscriptionStatus.kvRead',
            accountId: 'test-account-id',
          }),
        }),
      );
    });

    it('does not fall back to shared-pool reads when per-profile status has no active profile', async () => {
      // [WI-867] v2: findOwnerPersonScope null → profileMeta stays undefined → assertOwnerProfile → 403.
      mockFindOwnerPersonScope.mockResolvedValueOnce(null);
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());

      const res = await app.request(
        '/v1/subscription/status',
        // [Issue 901] No X-Profile-Id → auto-resolve, and findOwnerPersonScope
        // is null so no owner is resolved → 403. Keep AUTH_HEADERS to exercise the
        // no-owner-resolvable path this test asserts.
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      // [BUG-825] With no owner profile resolvable, profileMeta.isOwner is
      // false → the owner gate at the top of /subscription/status returns 403
      // before any pool/quota read can fire. Original expectation was 400
      // from the "no active profile" branch downstream; the owner gate is
      // now first and prevents that branch from being reached. The core
      // assertion of this test — that shared-pool reads don't fire on this
      // path — is preserved.
      expect(res.status).toBe(403);
      expect(mockGetOrProvisionProfileQuotaUsage).not.toHaveBeenCalled();
      expect(mockGetQuotaPool).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/byok-waitlist
  // -------------------------------------------------------------------------

  describe('POST /v1/byok-waitlist', () => {
    it('returns 201 and uses account email (not caller-supplied email)', async () => {
      const res = await app.request(
        '/v1/byok-waitlist',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.message).toBe('Added to BYOK waitlist');
      // email comes from the authenticated account, not from the request body
      expect(body.email).toBe('test@example.com');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/byok-waitlist',
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subscription/family
  // -------------------------------------------------------------------------

  describe('GET /v1/subscription/family', () => {
    it('returns family pool status and members', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );
      mockGetFamilyPoolStatus.mockResolvedValue({
        tier: 'family',
        monthlyLimit: 1500,
        usedThisMonth: 300,
        remainingQuestions: 1200,
        profileCount: 3,
        maxProfiles: 4,
      });
      mockListFamilyMembers.mockResolvedValue([
        {
          profileId: 'a0000000-0000-4000-a000-000000000001',
          displayName: 'Parent',
          isOwner: true,
        },
        {
          profileId: 'a0000000-0000-4000-a000-000000000002',
          displayName: 'Child 1',
          isOwner: false,
        },
        {
          profileId: 'a0000000-0000-4000-a000-000000000003',
          displayName: 'Child 2',
          isOwner: false,
        },
      ]);

      const res = await app.request(
        '/v1/subscription/family',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.family.tier).toBe('family');
      expect(body.family.monthlyLimit).toBe(1500);
      expect(body.family.remainingQuestions).toBe(1200);
      expect(body.family.profileCount).toBe(3);
      expect(body.family.maxProfiles).toBe(4);
      expect(body.family.members).toHaveLength(3);
    });

    it('returns 404 when no subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 when no quota pool found', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetFamilyPoolStatus.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family',
        { headers: OWNER_AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subscription/family', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });

    // [BREAK FCR-2026-05-23-L2.M2.1] [BUG-645] Non-owner profile must NOT
    // read family pool status or member list. Sibling write routes
    // /family/add and /family/remove gate on isOwner; the read route did
    // not, leaking sibling identities and pool-level billing data.
    it('[BREAK FCR-2026-05-23-L2.M2.1] returns 403 when caller is a non-owner profile', async () => {
      const childProfileId = '550e8400-e29b-41d4-a716-446655440000';
      mockProfileFindFirst.mockResolvedValue({
        id: childProfileId,
        accountId: 'test-account-id',
        displayName: 'Child',
        avatarUrl: null,
        birthYear: 2012,
        location: 'EU',
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: 'nb',
        pronouns: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );
      // [WI-867] v2: getPersonScope controls profileMeta.isOwner for X-Profile-Id path.
      mockGetPersonScope.mockResolvedValueOnce(personScope({ isOwner: false }));

      const res = await app.request(
        '/v1/subscription/family',
        { headers: { ...AUTH_HEADERS, 'X-Profile-Id': childProfileId } },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      // Family services must never be consulted once the gate trips —
      // no pool status, no member list reaches the caller.
      expect(mockListFamilyMembers).not.toHaveBeenCalled();
      expect(mockGetFamilyPoolStatus).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body).not.toHaveProperty('family');
    });

    // [Issue 901 / BREAK] Omitting X-Profile-Id auto-resolves the OWNER profile
    // (isOwner:true). Before the fix, a non-owner caller could omit the header
    // to read the family pool + member list (sibling identities, billing data).
    // The fix rejects auto-resolved owner identity at the owner gate.
    it('[BREAK] returns 403 and reads no family data when X-Profile-Id is omitted', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );

      const res = await app.request(
        '/v1/subscription/family',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockListFamilyMembers).not.toHaveBeenCalled();
      expect(mockGetFamilyPoolStatus).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body).not.toHaveProperty('family');
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/family/add
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/family/add', () => {
    it('adds a profile to the family subscription', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );
      mockAddProfileToSubscription.mockResolvedValue({ profileCount: 3 });

      const res = await app.request(
        '/v1/subscription/family/add',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toContain('Profile added');
      expect(body.profileCount).toBe(3);
    });

    it('returns 403 when profile cannot be added', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockAddProfileToSubscription.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family/add',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
    });

    it('returns 404 when no subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family/add',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 with invalid profileId', async () => {
      const res = await app.request(
        '/v1/subscription/family/add',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({ profileId: 'not-a-uuid' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/family/add',
        {
          method: 'POST',
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/family/remove
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/family/remove', () => {
    function mockOwnerProfile(): void {
      mockProfileFindFirst.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440999',
        accountId: 'test-account-id',
        displayName: 'Parent',
        avatarUrl: null,
        birthYear: 1985,
        location: 'EU',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      });
    }

    it('removes a same-account non-owner profile from the family subscription', async () => {
      mockOwnerProfile();
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );
      mockRemoveProfileFromSubscription.mockResolvedValue({
        removedProfileId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockRemoveProfileFromSubscription).toHaveBeenCalledWith(
        mockDatabaseModule.db,
        'sub-1',
        '550e8400-e29b-41d4-a716-446655440000',
      );
      const body = await res.json();
      expect(body).toEqual({
        message: 'Profile removed from family subscription',
        removedProfileId: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('[BREAK] rejects non-owner active profiles', async () => {
      mockProfileFindFirst.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        accountId: 'test-account-id',
        displayName: 'Child',
        avatarUrl: null,
        birthYear: 2012,
        location: 'EU',
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      // [WI-867] v2: getPersonScope controls profileMeta.isOwner for X-Profile-Id path.
      mockGetPersonScope.mockResolvedValueOnce(personScope({ isOwner: false }));

      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'X-Profile-Id': '550e8400-e29b-41d4-a716-446655440001',
          },
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockRemoveProfileFromSubscription).not.toHaveBeenCalled();
    });

    it('returns 403 when profile cannot be removed', async () => {
      mockOwnerProfile();
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' }),
      );
      mockRemoveProfileFromSubscription.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
    });

    it('returns 404 when no subscription exists', async () => {
      mockOwnerProfile();
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 with invalid profileId', async () => {
      mockOwnerProfile();

      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          headers: OWNER_AUTH_HEADERS,
          body: JSON.stringify({ profileId: 'not-a-uuid' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Post-checkout landing pages [UX-DE-M10]
  // Public HTML pages Stripe redirects to after checkout. These are
  // high-visibility if they break (paying users land on a 500 page) so the
  // tests lock in the contract: 200 OK, HTML content-type, mobile deep link,
  // and brand color interpolation rendered (not the raw template literal).
  // -------------------------------------------------------------------------

  describe('GET /billing/success', () => {
    it('returns 200 with HTML, deep link, and interpolated brand color', async () => {
      const res = await app.request('/v1/billing/success', {}, TEST_ENV);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);

      const body = await res.text();
      expect(body).toContain('mentomate://home');
      expect(body).toContain('Subscription confirmed');
      // Brand colour must be interpolated, not appear as a raw placeholder.
      expect(body).not.toContain('${BRAND_COLOR_PRIMARY}');
      expect(body).toMatch(/background:\s*#[0-9a-f]{6}/i);
    });
  });

  describe('GET /billing/cancel', () => {
    it('returns 200 with HTML and mobile deep link', async () => {
      const res = await app.request('/v1/billing/cancel', {}, TEST_ENV);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);

      const body = await res.text();
      expect(body).toContain('mentomate://home');
      expect(body).not.toContain('${BRAND_COLOR_PRIMARY}');
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-137 / DS-048] Proxy-mode write guard — 7 billing write handlers
//
// Billing is account-level; a parent-proxy session must not initiate billing
// operations on a child-profile context. Mini-Hono mount with isOwner=false.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// [CUT-B1] v2 pre-graph: GET /subscription/status must return free-tier
// defaults (not 401) for a graphless owner (clerkIdentity set, no account yet).
// The mobile client signs out on ANY 401, so a pre-onboarding header/app-load
// fetch that 401s re-triggers the same sign-in loop the GET /profiles fix
// exists to break. Red-green: remove the pre-graph branch in billing.ts
// GET /subscription/status and this flips 200 → 401.
// ---------------------------------------------------------------------------
describe('[CUT-B1] GET /subscription/status v2 pre-graph (graphless owner)', () => {
  // Typed pre-graph env mirrors the profiles.test.ts pattern: the only context
  // vars the GET /subscription/status pre-graph branch reads are db, account
  // (explicitly undefined), and clerkIdentity. Typing them removes the `as never`
  // casts the surrounding legacy proxy-mode tests still use.
  type PreGraphEnv = {
    Bindings: { IDENTITY_V2_ENABLED?: string };
    Variables: {
      db: Record<string, never>;
      account: undefined;
      clerkIdentity: { clerkUserId: string; verifiedEmail: string } | undefined;
    };
  };

  function makePreGraphApp() {
    const app = new Hono<PreGraphEnv>();
    app.use('*', async (c, next) => {
      c.set('db', {});
      // Graphless: account explicitly undefined (mirrors what accountMiddleware
      // sets on the v2 pre-graph path — clerkIdentity set, no account/graph yet).
      c.set('account', undefined);
      c.set('clerkIdentity', {
        clerkUserId: 'user_pre_graph',
        verifiedEmail: 'newuser@example.com',
      });
      await next();
    });
    app.route('/', billingRoutes);
    return app;
  }

  beforeEach(() => jest.clearAllMocks());

  it('[CUT-B1] returns 200 free-tier defaults (not 401) for a graphless v2 owner', async () => {
    const res = await makePreGraphApp().request(
      '/subscription/status',
      {},
      { IDENTITY_V2_ENABLED: 'true' },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status.tier).toBe('free');
    expect(body.status.status).toBe('trial');
    expect(body.status.billingAccess).toBe('current');
    // Must short-circuit before any account-scoped DB/KV read.
    expect(mockGetSubscriptionByAccountId).not.toHaveBeenCalled();
  });

  // [WI-867] Flag-off test deleted — source collapsed to v2-only; branch is unconditional.
});

describe('[WI-137 / DS-048] billing proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('account' as never, {
        id: 'test-account-id',
        email: 'test@example.com',
      });
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', billingRoutes);
    return proxyApp;
  }

  beforeEach(() => jest.clearAllMocks());

  it('POST /subscription/checkout returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /subscription/cancel returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/subscription/cancel', {
      method: 'POST',
    });
    expect(res.status).toBe(403);
  });

  it('POST /subscription/top-up returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/subscription/top-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500 }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /subscription/portal returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/subscription/portal', {
      method: 'POST',
    });
    expect(res.status).toBe(403);
  });

  it('POST /subscription/family/add returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/subscription/family/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'a0000000-0000-4000-a000-000000000099',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /subscription/family/remove returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/subscription/family/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'a0000000-0000-4000-a000-000000000099',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /byok-waitlist returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/byok-waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });
});
