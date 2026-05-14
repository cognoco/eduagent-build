// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

const mockDbInsert = jest.fn().mockReturnValue({
  values: jest.fn().mockReturnValue({
    onConflictDoNothing: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    }),
  }),
});
const mockProfileFindFirst = jest.fn().mockResolvedValue(undefined);
const mockConsentStateFindFirst = jest.fn().mockResolvedValue(undefined);

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
    query: {
      profiles: {
        findFirst: (...args: unknown[]) => mockProfileFindFirst(...args),
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

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/account'),
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock billing service
// ---------------------------------------------------------------------------

const mockGetSubscriptionByAccountId = jest.fn();
const mockEnsureFreeSubscription = jest.fn();
const mockGetQuotaPool = jest.fn();
const mockLinkStripeCustomer = jest.fn();
const mockAddToByokWaitlist = jest.fn().mockResolvedValue(undefined);
const mockMarkSubscriptionCancelled = jest.fn().mockResolvedValue(undefined);
const mockGetTopUpCreditsRemaining = jest.fn().mockResolvedValue(0);
const mockGetTopUpPriceCents = jest.fn().mockReturnValue(499);
const mockListFamilyMembers = jest.fn();
const mockAddProfileToSubscription = jest.fn();
const mockRemoveProfileFromSubscription = jest.fn();
class MockProfileRemovalNotImplementedError extends Error {
  constructor() {
    super('Profile removal requires an invite/claim flow');
    this.name = 'ProfileRemovalNotImplementedError';
  }
}
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

jest.mock('../services/billing' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/billing'),
  getSubscriptionByAccountId: (...args: unknown[]) =>
    mockGetSubscriptionByAccountId(...args),
  ensureFreeSubscription: (...args: unknown[]) =>
    mockEnsureFreeSubscription(...args),
  getQuotaPool: (...args: unknown[]) => mockGetQuotaPool(...args),
  linkStripeCustomer: (...args: unknown[]) => mockLinkStripeCustomer(...args),
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
  ProfileRemovalNotImplementedError: MockProfileRemovalNotImplementedError,
  getFamilyPoolStatus: (...args: unknown[]) => mockGetFamilyPoolStatus(...args),
  getUsageBreakdownForProfile: (...args: unknown[]) =>
    mockGetUsageBreakdownForProfile(...args),
  getUsageEventsAvailableSince: (...args: unknown[]) =>
    mockGetUsageEventsAvailableSince(...args),
  buildUsageDateLabels: (input: unknown) => mockBuildUsageDateLabels(input),
}));

// ---------------------------------------------------------------------------
// Mock KV service
// ---------------------------------------------------------------------------

const mockReadSubscriptionStatus = jest.fn();

jest.mock('../services/kv' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/kv'),
  readSubscriptionStatus: (...args: unknown[]) =>
    mockReadSubscriptionStatus(...args),
}));

// ---------------------------------------------------------------------------
// Mock Stripe SDK
// ---------------------------------------------------------------------------

const mockCheckoutCreate = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockCustomersCreate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();
const mockPortalCreate = jest.fn();

jest.mock('../services/stripe' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/stripe'),
  createStripeClient: jest.fn().mockReturnValue({
    checkout: {
      sessions: { create: (...args: unknown[]) => mockCheckoutCreate(...args) },
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
}));

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const AUTH_HEADERS = makeAuthHeaders();

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
  mockGetQuotaPool.mockResolvedValue(null);
  mockLinkStripeCustomer.mockResolvedValue(null);
  mockReadSubscriptionStatus.mockResolvedValue(null);
  mockListFamilyMembers.mockResolvedValue([]);
  mockAddProfileToSubscription.mockResolvedValue(null);
  mockRemoveProfileFromSubscription.mockResolvedValue(null);
  mockGetFamilyPoolStatus.mockResolvedValue(null);
  mockGetUsageBreakdownForProfile.mockResolvedValue(null);
  mockProfileFindFirst.mockResolvedValue(undefined);
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
        { headers: AUTH_HEADERS },
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
        { headers: AUTH_HEADERS },
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
        { headers: AUTH_HEADERS },
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
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/checkout
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/checkout', () => {
    it('creates Stripe checkout session and returns URL', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeCustomerId: 'cus_existing' }),
      );
      mockCheckoutCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/session_123',
        id: 'cs_test_123',
      });

      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.checkoutUrl).toBe('https://checkout.stripe.com/session_123');
      expect(body.sessionId).toBe('cs_test_123');
    });

    it('creates a new Stripe customer if none exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeCustomerId: null }),
      );
      mockCustomersCreate.mockResolvedValue({ id: 'cus_new' });
      mockCheckoutCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/new_session',
        id: 'cs_test_new',
      });

      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ tier: 'plus', interval: 'yearly' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
      );
      expect(mockLinkStripeCustomer).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
        'cus_new',
      );
    });

    it('returns 400 with invalid tier', async () => {
      const res = await app.request(
        '/v1/subscription/checkout',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
        expect.anything(),
        'sub-1',
      );
    });

    it('returns 404 when no subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/cancel',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/top-up
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/top-up', () => {
    it('creates a Stripe payment intent for top-up', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockPaymentIntentsCreate.mockResolvedValue({
        client_secret: 'pi_secret_test',
        id: 'pi_test_123',
      });

      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ amount: 500 }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topUp.amount).toBe(500);
      expect(body.topUp.clientSecret).toBe('pi_secret_test');
      expect(body.topUp.paymentIntentId).toBe('pi_test_123');
    });

    it('returns 400 with invalid amount', async () => {
      const res = await app.request(
        '/v1/subscription/top-up',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
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
  });

  // -------------------------------------------------------------------------
  // GET /v1/usage
  // -------------------------------------------------------------------------

  describe('GET /v1/usage', () => {
    it('returns free-tier defaults when no subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/usage',
        { headers: AUTH_HEADERS },
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
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool({ usedThisMonth: 450 }));

      const res = await app.request(
        '/v1/usage',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.usage.monthlyLimit).toBe(500);
      expect(body.usage.usedThisMonth).toBe(450);
      expect(body.usage.remainingQuestions).toBe(50);
      expect(body.usage.warningLevel).toBe('soft');
    });

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
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool({ usedThisMonth: 450 }));
      mockGetUsageBreakdownForProfile.mockResolvedValue({
        byProfile: [],
        familyAggregate: null,
        isOwnerBreakdownViewer: false,
        selfUsedToday: 3,
        selfUsedThisMonth: 12,
      });

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
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
  });

  // -------------------------------------------------------------------------
  // GET /v1/subscription/status (KV-backed)
  // -------------------------------------------------------------------------

  describe('GET /v1/subscription/status', () => {
    it('returns free-tier defaults when no subscription exists and no KV', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/status',
        { headers: AUTH_HEADERS },
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
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());

      const res = await app.request(
        '/v1/subscription/status',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status.tier).toBe('plus');
      expect(body.status.status).toBe('active');
      expect(body.status.monthlyLimit).toBe(500);
      expect(body.status.usedThisMonth).toBe(42);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subscription/status', {}, TEST_ENV);
      expect(res.status).toBe(401);
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
          headers: AUTH_HEADERS,
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
        { headers: AUTH_HEADERS },
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
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 when no quota pool found', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetFamilyPoolStatus.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subscription/family', {}, TEST_ENV);

      expect(res.status).toBe(401);
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
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockRemoveProfileFromSubscription).toHaveBeenCalledWith(
        expect.anything(),
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
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
          headers: AUTH_HEADERS,
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
