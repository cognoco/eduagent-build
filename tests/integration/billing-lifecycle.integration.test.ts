/**
 * Integration: Billing Lifecycle Endpoints
 *
 * Exercises the real billing routes through the full app + real database.
 * Billing services and metering calculations stay real.
 *
 * Mocked boundaries:
 * - JWT verification — intercepted via global fetch mock in setup.ts
 * - Stripe SDK wrapper
 */

import { eq } from 'drizzle-orm';
import { accounts, quotaPools, subscriptions } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';

const mockCustomersCreate = jest.fn();
const mockCheckoutCreate = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();
const mockPortalCreate = jest.fn();

jest.mock(
  '../../apps/api/src/services/stripe' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../apps/api/src/services/stripe',
    ) as typeof import('../../apps/api/src/services/stripe');
    return {
      ...actual,
      createStripeClient: jest.fn().mockImplementation(() => ({
        customers: {
          create: (...args: unknown[]) => mockCustomersCreate(...args),
        },
        checkout: {
          sessions: {
            create: (...args: unknown[]) => mockCheckoutCreate(...args),
          },
        },
        subscriptions: {
          update: (...args: unknown[]) => mockSubscriptionsUpdate(...args),
        },
        paymentIntents: {
          create: (...args: unknown[]) => mockPaymentIntentsCreate(...args),
        },
        billingPortal: {
          sessions: {
            create: (...args: unknown[]) => mockPortalCreate(...args),
          },
        },
      })),
    };
  },
);

import { app } from '../../apps/api/src/index';
import { getTierConfig } from '../../apps/api/src/services/subscription';

const TEST_ENV = {
  ...buildIntegrationEnv(),
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_monthly',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_yearly',
  STRIPE_PRICE_FAMILY_MONTHLY: 'price_family_monthly',
  STRIPE_PRICE_FAMILY_YEARLY: 'price_family_yearly',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
  STRIPE_PRICE_PRO_YEARLY: 'price_pro_yearly',
  APP_URL: 'https://app.mentomate.test',
};

const AUTH_USER_ID = 'integration-billing-user';
const AUTH_EMAIL = 'integration-billing@integration.test';
const STRIPE_CURRENT_PERIOD_END = 1_777_680_000;

async function seedAccount() {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: AUTH_USER_ID,
      email: AUTH_EMAIL,
    })
    .returning();

  return account!;
}

async function seedSubscription(
  accountId: string,
  overrides?: Partial<{
    tier: 'free' | 'plus' | 'family' | 'pro';
    status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    monthlyLimit: number;
    usedThisMonth: number;
    dailyLimit: number | null;
    usedToday: number;
    currentPeriodEnd: Date | null;
    cycleResetAt: Date;
  }>,
) {
  const db = createIntegrationDb();
  const tier = overrides?.tier ?? 'plus';
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      accountId,
      tier,
      status: overrides?.status ?? 'active',
      stripeCustomerId: overrides?.stripeCustomerId ?? 'cus_existing',
      stripeSubscriptionId: overrides?.stripeSubscriptionId ?? 'sub_existing',
      currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      currentPeriodEnd:
        overrides?.currentPeriodEnd ?? new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: subscription!.id,
      monthlyLimit: overrides?.monthlyLimit ?? getTierConfig(tier).monthlyQuota,
      usedThisMonth: overrides?.usedThisMonth ?? 0,
      dailyLimit:
        overrides?.dailyLimit ?? getTierConfig(tier).dailyLimit ?? null,
      usedToday: overrides?.usedToday ?? 0,
      cycleResetAt:
        overrides?.cycleResetAt ?? new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  return {
    subscription: subscription!,
    quotaPool: quotaPool!,
  };
}

async function loadAccount() {
  const db = createIntegrationDb();
  return db.query.accounts.findFirst({
    where: eq(accounts.clerkUserId, AUTH_USER_ID),
  });
}

async function loadSubscription(accountId: string) {
  const db = createIntegrationDb();
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });
}

async function loadQuotaPool(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

beforeEach(async () => {
  jest.clearAllMocks();

  mockCustomersCreate.mockResolvedValue({ id: 'cus_checkout' });
  mockCheckoutCreate.mockResolvedValue({
    url: 'https://stripe.test/checkout',
    id: 'cs_checkout',
  });
  mockSubscriptionsUpdate.mockResolvedValue({
    items: {
      data: [{ current_period_end: STRIPE_CURRENT_PERIOD_END }],
    },
  });
  mockPaymentIntentsCreate.mockResolvedValue({
    client_secret: 'pi_secret',
    id: 'pi_test',
  });
  mockPortalCreate.mockResolvedValue({
    url: 'https://stripe.test/portal',
  });

  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

describe('Integration: billing lifecycle routes', () => {
  it('returns free defaults when the account exists without a subscription row', async () => {
    await seedAccount();

    const res = await app.request(
      '/v1/subscription',
      {
        method: 'GET',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription).toEqual({
      tier: 'free',
      status: 'trial',
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      monthlyLimit: 100,
      usedThisMonth: 0,
      remainingQuestions: 100,
      dailyLimit: 10,
      usedToday: 0,
      dailyRemainingQuestions: 10,
    });
  });

  it('returns subscription details from the real subscription and quota rows', async () => {
    const account = await seedAccount();
    await seedSubscription(account.id, {
      tier: 'plus',
      status: 'active',
      monthlyLimit: 500,
      usedThisMonth: 42,
      dailyLimit: null,
      usedToday: 15,
      currentPeriodEnd: new Date('2026-05-15T00:00:00.000Z'),
    });

    const res = await app.request(
      '/v1/subscription',
      {
        method: 'GET',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.tier).toBe('plus');
    expect(body.subscription.status).toBe('active');
    expect(body.subscription.monthlyLimit).toBe(500);
    expect(body.subscription.usedThisMonth).toBe(42);
    expect(body.subscription.remainingQuestions).toBe(458);
    expect(body.subscription.dailyLimit).toBeNull();
    expect(body.subscription.usedToday).toBe(15);
    expect(body.subscription.dailyRemainingQuestions).toBeNull();
  });

  it('creates a checkout session and links the stripe customer on first checkout', async () => {
    const account = await seedAccount();

    const res = await app.request(
      '/v1/subscription/checkout',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
        body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutUrl).toBe('https://stripe.test/checkout');
    expect(body.sessionId).toBe('cs_checkout');

    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: AUTH_EMAIL,
      metadata: { accountId: account.id },
    });
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_checkout',
        mode: 'subscription',
        metadata: expect.objectContaining({
          accountId: account.id,
          tier: 'plus',
          interval: 'monthly',
        }),
      }),
    );

    const subscription = await loadSubscription(account.id);
    expect(subscription).not.toBeUndefined();
    expect(subscription!.tier).toBe('free');
    expect(subscription!.status).toBe('active');
    expect(subscription!.stripeCustomerId).toBe('cus_checkout');

    const quotaPool = await loadQuotaPool(subscription!.id);
    expect(quotaPool).not.toBeUndefined();
    expect(quotaPool!.monthlyLimit).toBe(100);
  });

  it('cancels a subscription and marks the local row immediately', async () => {
    const account = await seedAccount();
    const seeded = await seedSubscription(account.id, {
      tier: 'plus',
      status: 'active',
      stripeCustomerId: 'cus_cancel',
      stripeSubscriptionId: 'sub_cancel',
    });

    const res = await app.request(
      '/v1/subscription/cancel',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain('cancelled');
    expect(body.currentPeriodEnd).toBe(
      new Date(STRIPE_CURRENT_PERIOD_END * 1000).toISOString(),
    );

    const updated = await loadSubscription(account.id);
    expect(updated!.cancelledAt).not.toBeNull();
    expect(updated!.stripeSubscriptionId).toBe('sub_cancel');

    const quotaPool = await loadQuotaPool(seeded.subscription.id);
    expect(quotaPool).not.toBeUndefined();
  });

  it('returns 404 when there is no active Stripe subscription to cancel', async () => {
    await seedAccount();

    const res = await app.request(
      '/v1/subscription/cancel',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns usage data from the real quota pool', async () => {
    const account = await seedAccount();
    await seedSubscription(account.id, {
      tier: 'plus',
      status: 'active',
      monthlyLimit: 500,
      usedThisMonth: 120,
      dailyLimit: null,
      usedToday: 8,
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    const res = await app.request(
      '/v1/usage',
      {
        method: 'GET',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage.monthlyLimit).toBe(500);
    expect(body.usage.usedThisMonth).toBe(120);
    expect(body.usage.remainingQuestions).toBe(380);
    expect(body.usage.topUpCreditsRemaining).toBe(0);
    expect(body.usage.warningLevel).toBe('none');
    expect(body.usage.dailyLimit).toBeNull();
    expect(body.usage.usedToday).toBe(8);
    expect(body.usage.dailyRemainingQuestions).toBeNull();
  });

  it('returns a customer portal url for an existing billing account', async () => {
    const account = await seedAccount();
    await seedSubscription(account.id, {
      stripeCustomerId: 'cus_portal',
    });

    const res = await app.request(
      '/v1/subscription/portal',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.portalUrl).toBe('https://stripe.test/portal');

    const saved = await loadAccount();
    expect(saved).not.toBeUndefined();
  });

  it('returns 401 without authentication', async () => {
    const res = await app.request(
      '/v1/subscription',
      {
        method: 'GET',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});
