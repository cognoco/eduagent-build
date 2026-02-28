/**
 * Integration: Billing Lifecycle Endpoints
 *
 * Exercises the billing/subscription routes via Hono's app.request(). Validates:
 *
 * 1. GET /v1/subscription — 200 returns free defaults when no subscription
 * 2. GET /v1/subscription — 200 returns existing subscription details
 * 3. POST /v1/subscription/checkout — 200 returns checkoutUrl
 * 4. POST /v1/subscription/cancel — 200 cancels subscription
 * 5. POST /v1/subscription/cancel — 404 with no active subscription
 * 6. GET /v1/usage — 200 returns usage data
 * 7. POST /v1/subscription/portal — 200 returns portalUrl
 * 8. GET /v1/subscription — 401 without auth
 */

// --- Billing & Stripe service mocks ---

const mockGetSubscriptionByAccountId = jest.fn();
const mockGetQuotaPool = jest.fn();
const mockMarkSubscriptionCancelled = jest.fn();
const mockGetTopUpCreditsRemaining = jest.fn();
const mockGetTopUpPriceCents = jest.fn();
const mockLinkStripeCustomer = jest.fn();
const mockEnsureFreeSubscription = jest.fn().mockResolvedValue(undefined);

jest.mock('../../apps/api/src/services/billing', () => ({
  ...jest.createMockFromModule<Record<string, jest.Mock>>(
    '../../apps/api/src/services/billing'
  ),
  getSubscriptionByAccountId: mockGetSubscriptionByAccountId,
  getQuotaPool: mockGetQuotaPool,
  linkStripeCustomer: mockLinkStripeCustomer,
  ensureFreeSubscription: mockEnsureFreeSubscription,
  markSubscriptionCancelled: mockMarkSubscriptionCancelled,
  getTopUpCreditsRemaining: mockGetTopUpCreditsRemaining,
  getTopUpPriceCents: mockGetTopUpPriceCents,
  decrementQuota: jest
    .fn()
    .mockResolvedValue({
      success: true,
      remainingMonthly: 49,
      remainingTopUp: 0,
    }),
}));

jest.mock('../../apps/api/src/services/stripe', () => ({
  createStripeClient: jest.fn().mockReturnValue({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          url: 'https://stripe.com/checkout',
          id: 'cs_test',
        }),
      },
    },
    subscriptions: {
      update: jest.fn().mockResolvedValue({
        current_period_end: Math.floor(Date.now() / 1000) + 86400,
      }),
    },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        client_secret: 'pi_secret',
        id: 'pi_test',
      }),
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          url: 'https://stripe.com/portal',
        }),
      },
    },
  }),
}));

jest.mock('../../apps/api/src/services/kv', () => ({
  readSubscriptionStatus: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../apps/api/src/services/metering', () => ({
  getWarningLevel: jest.fn().mockReturnValue('none'),
  calculateRemainingQuestions: jest.fn().mockReturnValue(50),
}));

// --- Base mocks (middleware chain requires these) ---

import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  settingsMock,
  sessionMock,
  llmMock,
  configureValidJWT,
  configureInvalidJWT,
} from './mocks';

const jwt = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwt);
jest.mock('@eduagent/database', () => databaseMock());
jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock());
jest.mock('../../apps/api/src/services/account', () => accountMock());
jest.mock('../../apps/api/src/services/settings', () => settingsMock());
jest.mock('../../apps/api/src/services/session', () => sessionMock());
jest.mock('../../apps/api/src/services/llm', () => llmMock());

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  ENVIRONMENT: 'development',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_monthly',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_yearly',
  APP_URL: 'https://app.test.com',
};

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const SUBSCRIPTION_ID = '00000000-0000-4000-8000-000000000030';

const AUTH_HEADERS = {
  Authorization: 'Bearer test-token',
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------------
// GET /v1/subscription
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/subscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with free defaults when no subscription exists', async () => {
    mockGetSubscriptionByAccountId.mockResolvedValue(null);

    const res = await app.request(
      '/v1/subscription',
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.tier).toBe('free');
    expect(body.subscription.status).toBe('trial');
    expect(body.subscription.monthlyLimit).toBe(50);
    expect(body.subscription.remainingQuestions).toBe(50);
  });

  it('returns 200 with existing subscription details', async () => {
    mockGetSubscriptionByAccountId.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      accountId: ACCOUNT_ID,
      tier: 'plus',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: '2025-02-15T00:00:00.000Z',
      cancelledAt: null,
      stripeSubscriptionId: 'sub_stripe_test',
      stripeCustomerId: 'cus_test',
    });
    mockGetQuotaPool.mockResolvedValue({
      id: 'quota-1',
      subscriptionId: SUBSCRIPTION_ID,
      monthlyLimit: 500,
      usedThisMonth: 42,
    });

    const res = await app.request(
      '/v1/subscription',
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.tier).toBe('plus');
    expect(body.subscription.status).toBe('active');
    expect(body.subscription.monthlyLimit).toBe(500);
    expect(body.subscription.usedThisMonth).toBe(42);
    expect(body.subscription.remainingQuestions).toBe(458);
    expect(body.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it('returns 401 without auth', async () => {
    configureInvalidJWT(jwt);

    const res = await app.request(
      '/v1/subscription',
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subscription/checkout
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subscription/checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
    // Checkout flow calls getSubscriptionByAccountId to find customerId
    mockGetSubscriptionByAccountId.mockResolvedValue(null);
  });

  it('returns 200 with checkoutUrl', async () => {
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
    expect(body.checkoutUrl).toBe('https://stripe.com/checkout');
    expect(body.sessionId).toBe('cs_test');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subscription/cancel
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subscription/cancel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 and cancels subscription', async () => {
    mockGetSubscriptionByAccountId.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      accountId: ACCOUNT_ID,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_stripe_test',
      stripeCustomerId: 'cus_test',
    });
    mockMarkSubscriptionCancelled.mockResolvedValue(undefined);

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
    expect(body.message).toContain('cancelled');
    expect(body.currentPeriodEnd).toBeDefined();
    expect(mockMarkSubscriptionCancelled).toHaveBeenCalledWith(
      expect.anything(),
      SUBSCRIPTION_ID
    );
  });

  it('returns 404 with no active subscription', async () => {
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
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/usage
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/usage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with usage data', async () => {
    mockGetSubscriptionByAccountId.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      accountId: ACCOUNT_ID,
      tier: 'plus',
      status: 'active',
    });
    mockGetQuotaPool.mockResolvedValue({
      id: 'quota-1',
      subscriptionId: SUBSCRIPTION_ID,
      monthlyLimit: 500,
      usedThisMonth: 120,
      cycleResetAt: '2025-02-01T00:00:00.000Z',
    });
    mockGetTopUpCreditsRemaining.mockResolvedValue(0);

    const res = await app.request(
      '/v1/usage',
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage).toBeDefined();
    expect(body.usage.monthlyLimit).toBe(500);
    expect(body.usage.usedThisMonth).toBe(120);
    expect(body.usage.warningLevel).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subscription/portal
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subscription/portal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with portalUrl', async () => {
    mockGetSubscriptionByAccountId.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      accountId: ACCOUNT_ID,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_stripe_test',
      stripeCustomerId: 'cus_test',
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
    expect(body.portalUrl).toBe('https://stripe.com/portal');
  });
});
