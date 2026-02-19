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

const mockDbInsert = jest.fn().mockReturnValue({
  values: jest.fn().mockReturnValue({
    onConflictDoNothing: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    }),
  }),
});

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({
    insert: (...args: unknown[]) => mockDbInsert(...args),
  }),
  byokWaitlist: { email: 'email' },
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
const mockGetFamilyPoolStatus = jest.fn();

jest.mock('../services/billing', () => ({
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
  getFamilyPoolStatus: (...args: unknown[]) => mockGetFamilyPoolStatus(...args),
}));

// ---------------------------------------------------------------------------
// Mock KV service
// ---------------------------------------------------------------------------

const mockReadSubscriptionStatus = jest.fn();

jest.mock('../services/kv', () => ({
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

jest.mock('../services/stripe', () => ({
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

import app from '../index';

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_monthly',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_yearly',
  STRIPE_PRICE_FAMILY_MONTHLY: 'price_family_monthly',
  STRIPE_PRICE_FAMILY_YEARLY: 'price_family_yearly',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
  STRIPE_PRICE_PRO_YEARLY: 'price_pro_yearly',
  APP_URL: 'https://app.eduagent.com',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
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
    cycleResetAt: '2025-02-15T00:00:00.000Z',
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSubscriptionByAccountId.mockResolvedValue(null);
  mockGetQuotaPool.mockResolvedValue(null);
  mockLinkStripeCustomer.mockResolvedValue(null);
  mockReadSubscriptionStatus.mockResolvedValue(null);
  mockListFamilyMembers.mockResolvedValue([]);
  mockAddProfileToSubscription.mockResolvedValue(null);
  mockRemoveProfileFromSubscription.mockResolvedValue(null);
  mockGetFamilyPoolStatus.mockResolvedValue(null);
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
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subscription.tier).toBe('free');
      expect(body.subscription.status).toBe('trial');
      expect(body.subscription.cancelAtPeriodEnd).toBe(false);
      expect(body.subscription.monthlyLimit).toBe(50);
      expect(body.subscription.usedThisMonth).toBe(0);
      expect(body.subscription.remainingQuestions).toBe(50);
    });

    it('returns real subscription data when subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());

      const res = await app.request(
        '/v1/subscription',
        { headers: AUTH_HEADERS },
        TEST_ENV
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
        })
      );
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());

      const res = await app.request(
        '/v1/subscription',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subscription.cancelAtPeriodEnd).toBe(true);
      expect(body.subscription.currentPeriodEnd).toBe(
        '2025-02-15T00:00:00.000Z'
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
        mockSubscription({ stripeCustomerId: 'cus_existing' })
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
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.checkoutUrl).toBe('https://checkout.stripe.com/session_123');
      expect(body.sessionId).toBe('cs_test_123');
    });

    it('creates a new Stripe customer if none exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeCustomerId: null })
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' })
      );
      expect(mockLinkStripeCustomer).toHaveBeenCalledWith(
        expect.anything(),
        'test-account-id',
        'cus_new'
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
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
        current_period_end: 1739577600, // 2025-02-15T00:00:00Z
      });

      const res = await app.request(
        '/v1/subscription/cancel',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toContain('Subscription cancelled');
      expect(body.currentPeriodEnd).toBeDefined();
      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_test123', {
        cancel_at_period_end: true,
      });
      expect(mockMarkSubscriptionCancelled).toHaveBeenCalledWith(
        expect.anything(),
        'sub-1'
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
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 when subscription has no Stripe ID', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeSubscriptionId: null })
      );

      const res = await app.request(
        '/v1/subscription/cancel',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/cancel',
        { method: 'POST' },
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.usage.monthlyLimit).toBe(50);
      expect(body.usage.usedThisMonth).toBe(0);
      expect(body.usage.remainingQuestions).toBe(50);
      expect(body.usage.topUpCreditsRemaining).toBe(0);
      expect(body.usage.warningLevel).toBe('none');
      expect(body.usage.cycleResetAt).toBeDefined();
    });

    it('returns real usage data when subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool({ usedThisMonth: 450 }));

      const res = await app.request(
        '/v1/usage',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.usage.monthlyLimit).toBe(500);
      expect(body.usage.usedThisMonth).toBe(450);
      expect(body.usage.remainingQuestions).toBe(50);
      expect(body.usage.warningLevel).toBe('soft');
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
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.portalUrl).toBe(
        'https://billing.stripe.com/portal_session_123'
      );
    });

    it('returns 404 when no Stripe customer exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ stripeCustomerId: null })
      );

      const res = await app.request(
        '/v1/subscription/portal',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subscription/portal',
        { method: 'POST' },
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status.tier).toBe('free');
      expect(body.status.status).toBe('trial');
      expect(body.status.monthlyLimit).toBe(50);
      expect(body.status.usedThisMonth).toBe(0);
    });

    it('returns DB-backed status when no KV namespace', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetQuotaPool.mockResolvedValue(mockQuotaPool());

      const res = await app.request(
        '/v1/subscription/status',
        { headers: AUTH_HEADERS },
        TEST_ENV
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
    it('returns 201 with valid email', async () => {
      const res = await app.request(
        '/v1/byok-waitlist',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ email: 'test@example.com' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.message).toBe('Added to BYOK waitlist');
      expect(body.email).toBe('test@example.com');
    });

    it('returns 400 with invalid email', async () => {
      const res = await app.request(
        '/v1/byok-waitlist',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ email: 'not-an-email' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/byok-waitlist',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
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
        mockSubscription({ tier: 'family' })
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
        { profileId: 'p-1', displayName: 'Parent', isOwner: true },
        { profileId: 'p-2', displayName: 'Child 1', isOwner: false },
        { profileId: 'p-3', displayName: 'Child 2', isOwner: false },
      ]);

      const res = await app.request(
        '/v1/subscription/family',
        { headers: AUTH_HEADERS },
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 when no quota pool found', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockGetFamilyPoolStatus.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family',
        { headers: AUTH_HEADERS },
        TEST_ENV
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
        mockSubscription({ tier: 'family' })
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subscription/family/remove
  // -------------------------------------------------------------------------

  describe('POST /v1/subscription/family/remove', () => {
    it('removes a profile from the family subscription', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(
        mockSubscription({ tier: 'family' })
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
            newAccountId: '660e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toContain('removed from family');
      expect(body.removedProfileId).toBe(
        '550e8400-e29b-41d4-a716-446655440000'
      );
    });

    it('returns 403 when profile cannot be removed', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(mockSubscription());
      mockRemoveProfileFromSubscription.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
            newAccountId: '660e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(403);
    });

    it('returns 404 when no subscription exists', async () => {
      mockGetSubscriptionByAccountId.mockResolvedValue(null);

      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            profileId: '550e8400-e29b-41d4-a716-446655440000',
            newAccountId: '660e8400-e29b-41d4-a716-446655440000',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 with invalid body', async () => {
      const res = await app.request(
        '/v1/subscription/family/remove',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ profileId: 'not-uuid' }),
        },
        TEST_ENV
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
            newAccountId: '660e8400-e29b-41d4-a716-446655440000',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
