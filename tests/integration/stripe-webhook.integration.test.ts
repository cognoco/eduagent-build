/**
 * Integration: Stripe Webhook
 *
 * Exercises the public Stripe webhook route via the real app + real database.
 * Billing, quota, and KV-refresh behavior stay real.
 *
 * Mocked boundaries:
 * - Stripe signature verification
 * - Inngest event HTTP API — via fetch interceptor
 */

import { eq } from 'drizzle-orm';
import { accounts, subscriptions, quotaPools } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

const mockVerifyWebhookSignature = jest.fn();

jest.mock('../../apps/api/src/services/stripe', () => ({
  verifyWebhookSignature: mockVerifyWebhookSignature,
}));

import { app } from '../../apps/api/src/index';
import { getTierConfig } from '../../apps/api/src/services/subscription';

const mockKvPut = jest.fn().mockResolvedValue(undefined);
const mockKvGet = jest.fn().mockResolvedValue(null);
const mockKv = {
  put: mockKvPut,
  get: mockKvGet,
} as unknown as KVNamespace;

const TEST_ENV = {
  ...buildIntegrationEnv(),
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  SUBSCRIPTION_KV: mockKv,
};

const seededEmails = new Set<string>();
const seededClerkUserIds = new Set<string>();
let seedCounter = 0;

beforeAll(() => {
  mockInngestEvents();
});

function nextSeed(prefix: string) {
  seedCounter += 1;
  const suffix = `${prefix}-${seedCounter}`;
  const email = `integration-${suffix}@integration.test`;
  const clerkUserId = `integration-${suffix}`;

  seededEmails.add(email);
  seededClerkUserIds.add(clerkUserId);

  return {
    email,
    clerkUserId,
    stripeSubscriptionId: `sub_${suffix}`,
  };
}

async function cleanupSeededAccounts(): Promise<void> {
  if (seededEmails.size === 0 && seededClerkUserIds.size === 0) {
    return;
  }

  await cleanupAccounts({
    emails: [...seededEmails],
    clerkUserIds: [...seededClerkUserIds],
  });

  seededEmails.clear();
  seededClerkUserIds.clear();
}

async function seedAccount(prefix: string) {
  const db = createIntegrationDb();
  const identity = nextSeed(prefix);

  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: identity.clerkUserId,
      email: identity.email,
    })
    .returning();

  return {
    db,
    account: account!,
    ...identity,
  };
}

async function seedSubscriptionState(input: {
  prefix: string;
  tier?: 'free' | 'plus' | 'family' | 'pro';
  status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  stripeSubscriptionId?: string;
  usedThisMonth?: number;
  usedToday?: number;
  lastStripeEventTimestamp?: string | null;
}) {
  const {
    db,
    account,
    stripeSubscriptionId: generatedStripeSubscriptionId,
  } = await seedAccount(input.prefix);
  const tier = input.tier ?? 'plus';
  const status = input.status ?? 'active';
  const tierConfig = getTierConfig(tier);

  const [subscription] = await db
    .insert(subscriptions)
    .values({
      accountId: account.id,
      stripeSubscriptionId:
        input.stripeSubscriptionId ?? generatedStripeSubscriptionId,
      tier,
      status,
      lastStripeEventTimestamp:
        input.lastStripeEventTimestamp === undefined
          ? null
          : input.lastStripeEventTimestamp
            ? new Date(input.lastStripeEventTimestamp)
            : null,
    })
    .returning();

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: subscription!.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: input.usedThisMonth ?? 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: input.usedToday ?? 0,
      cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();

  return {
    db,
    account,
    subscription: subscription!,
    quotaPool: quotaPool!,
  };
}

function buildStripeEvent(
  type: string,
  dataObject: Record<string, unknown>,
  overrides?: { created?: number },
) {
  return {
    id: `evt_${type.replace(/\W+/g, '_')}_${Date.now()}`,
    type,
    created: overrides?.created ?? Math.floor(Date.now() / 1000),
    data: { object: dataObject },
  };
}

function buildWebhookRequest(event: Record<string, unknown>) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': 'sig_test',
    },
    body: JSON.stringify(event),
  };
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

function readKvPayload() {
  expect(mockKvPut).toHaveBeenCalled();

  const [key, raw, options] = mockKvPut.mock.calls.at(-1)!;
  return {
    key,
    value: JSON.parse(raw as string) as {
      subscriptionId: string;
      tier: string;
      status: string;
      monthlyLimit: number;
      usedThisMonth: number;
      dailyLimit: number | null;
      usedToday: number;
    },
    options,
  };
}

beforeEach(async () => {
  mockVerifyWebhookSignature.mockReset();
  clearFetchCalls();
  mockKvPut.mockClear();
  mockKvGet.mockClear();
  await cleanupSeededAccounts();
});

afterAll(async () => {
  await cleanupSeededAccounts();
});

describe('Integration: Stripe Webhook guards', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await app.request(
      '/v1/stripe/webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_SIGNATURE');
    expect(mockVerifyWebhookSignature).not.toHaveBeenCalled();
  });

  it('returns 500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const res = await app.request(
      '/v1/stripe/webhook',
      buildWebhookRequest({}),
      buildIntegrationEnv(),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('returns 400 when webhook signature verification fails', async () => {
    mockVerifyWebhookSignature.mockRejectedValueOnce(
      new Error('Invalid signature'),
    );

    const res = await app.request(
      '/v1/stripe/webhook',
      buildWebhookRequest({ invalid: true }),
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_SIGNATURE');
  });

  it('rejects stale events older than 48 hours', async () => {
    const staleEvent = buildStripeEvent(
      'customer.subscription.updated',
      {
        id: 'sub_stale',
        status: 'active',
        metadata: {},
        items: {
          data: [{ current_period_start: 1700000000, current_period_end: 1 }],
        },
      },
      { created: Math.floor(Date.now() / 1000) - 49 * 60 * 60 },
    );

    mockVerifyWebhookSignature.mockResolvedValueOnce(staleEvent);

    const res = await app.request(
      '/v1/stripe/webhook',
      buildWebhookRequest(staleEvent),
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('STALE_EVENT');
    expect(mockKvPut).not.toHaveBeenCalled();
  });
});

describe('Integration: Stripe Webhook event handling', () => {
  it('checkout.session.completed creates and activates a paid subscription', async () => {
    const { account, stripeSubscriptionId } =
      await seedAccount('stripe-checkout');

    const event = buildStripeEvent('checkout.session.completed', {
      id: 'cs_checkout_completed',
      subscription: stripeSubscriptionId,
      metadata: { accountId: account.id, tier: 'plus' },
    });

    mockVerifyWebhookSignature.mockResolvedValueOnce(event);

    const res = await app.request(
      '/v1/stripe/webhook',
      buildWebhookRequest(event),
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const subscription = await loadSubscription(account.id);
    expect(subscription).not.toBeNull();
    expect(subscription!.stripeSubscriptionId).toBe(stripeSubscriptionId);
    expect(subscription!.tier).toBe('plus');
    expect(subscription!.status).toBe('active');

    const quotaPool = await loadQuotaPool(subscription!.id);
    expect(quotaPool).not.toBeNull();
    expect(quotaPool!.monthlyLimit).toBe(getTierConfig('plus').monthlyQuota);
    expect(quotaPool!.dailyLimit).toBeNull();

    const kvWrite = readKvPayload();
    expect(kvWrite.key).toBe(`sub:${account.id}`);
    expect(kvWrite.value).toMatchObject({
      subscriptionId: subscription!.id,
      tier: 'plus',
      status: 'active',
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: null,
      usedToday: 0,
    });
    expect(kvWrite.options).toEqual({ expirationTtl: 86400 });
  });

  it('customer.subscription.updated applies real tier and quota changes', async () => {
    const { account, subscription } = await seedSubscriptionState({
      prefix: 'stripe-updated',
      tier: 'plus',
      status: 'active',
      usedThisMonth: 42,
      usedToday: 3,
    });

    const periodStart = Math.floor(Date.now() / 1000) - 3600;
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const event = buildStripeEvent('customer.subscription.updated', {
      id: subscription.stripeSubscriptionId,
      status: 'active',
      metadata: { tier: 'family' },
      canceled_at: null,
      items: {
        data: [
          {
            current_period_start: periodStart,
            current_period_end: periodEnd,
          },
        ],
      },
    });

    mockVerifyWebhookSignature.mockResolvedValueOnce(event);

    const res = await app.request(
      '/v1/stripe/webhook',
      buildWebhookRequest(event),
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const updatedSubscription = await loadSubscription(account.id);
    expect(updatedSubscription).not.toBeNull();
    expect(updatedSubscription!.tier).toBe('family');
    expect(updatedSubscription!.status).toBe('active');
    expect(updatedSubscription!.currentPeriodStart?.toISOString()).toBe(
      new Date(periodStart * 1000).toISOString(),
    );
    expect(updatedSubscription!.currentPeriodEnd?.toISOString()).toBe(
      new Date(periodEnd * 1000).toISOString(),
    );

    const quotaPool = await loadQuotaPool(subscription.id);
    expect(quotaPool).not.toBeNull();
    expect(quotaPool!.monthlyLimit).toBe(getTierConfig('family').monthlyQuota);
    expect(quotaPool!.dailyLimit).toBeNull();
    expect(quotaPool!.usedThisMonth).toBe(42);
    expect(quotaPool!.usedToday).toBe(3);

    const kvWrite = readKvPayload();
    expect(kvWrite.value).toMatchObject({
      subscriptionId: subscription.id,
      tier: 'family',
      status: 'active',
      monthlyLimit: getTierConfig('family').monthlyQuota,
      usedThisMonth: 42,
      dailyLimit: null,
      usedToday: 3,
    });
  });

  it('customer.subscription.deleted downgrades the subscription to free tier', async () => {
    const { account, subscription } = await seedSubscriptionState({
      prefix: 'stripe-deleted',
      tier: 'family',
      status: 'active',
      usedThisMonth: 17,
      usedToday: 4,
    });

    const event = buildStripeEvent('customer.subscription.deleted', {
      id: subscription.stripeSubscriptionId,
      status: 'canceled',
      metadata: {},
      items: { data: [] },
    });

    mockVerifyWebhookSignature.mockResolvedValueOnce(event);

    const res = await app.request(
      '/v1/stripe/webhook',
      buildWebhookRequest(event),
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const updatedSubscription = await loadSubscription(account.id);
    expect(updatedSubscription).not.toBeNull();
    expect(updatedSubscription!.tier).toBe('free');
    expect(updatedSubscription!.status).toBe('expired');
    expect(updatedSubscription!.cancelledAt).not.toBeNull();

    const quotaPool = await loadQuotaPool(subscription.id);
    expect(quotaPool).not.toBeNull();
    expect(quotaPool!.monthlyLimit).toBe(getTierConfig('free').monthlyQuota);
    expect(quotaPool!.dailyLimit).toBe(getTierConfig('free').dailyLimit);
    expect(quotaPool!.usedThisMonth).toBe(17);
    expect(quotaPool!.usedToday).toBe(4);

    const kvWrite = readKvPayload();
    expect(kvWrite.value).toMatchObject({
      subscriptionId: subscription.id,
      tier: 'free',
      status: 'expired',
      monthlyLimit: getTierConfig('free').monthlyQuota,
      usedThisMonth: 17,
      dailyLimit: getTierConfig('free').dailyLimit,
      usedToday: 4,
    });
  });

  it('invoice.payment_failed marks the subscription past_due and emits an Inngest event', async () => {
    const { account, subscription } = await seedSubscriptionState({
      prefix: 'stripe-payment-failed',
      tier: 'plus',
      status: 'active',
      usedThisMonth: 5,
    });

    const event = buildStripeEvent('invoice.payment_failed', {
      id: 'in_payment_failed',
      attempt_count: 2,
      parent: {
        subscription_details: {
          subscription: subscription.stripeSubscriptionId,
        },
      },
    });

    mockVerifyWebhookSignature.mockResolvedValueOnce(event);

    const res = await app.request(
      '/v1/stripe/webhook',
      buildWebhookRequest(event),
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const updatedSubscription = await loadSubscription(account.id);
    expect(updatedSubscription).not.toBeNull();
    expect(updatedSubscription!.status).toBe('past_due');

    const kvWrite = readKvPayload();
    expect(kvWrite.value).toMatchObject({
      subscriptionId: subscription.id,
      tier: 'plus',
      status: 'past_due',
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      usedThisMonth: 5,
    });

    expect(getCapturedInngestEvents()).toEqual([
      expect.objectContaining({
        name: 'app/payment.failed',
        data: expect.objectContaining({
          subscriptionId: subscription.id,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          accountId: account.id,
          attempt: 2,
        }),
      }),
    ]);
  });

  it('invoice.payment_succeeded restores the subscription to active', async () => {
    const { account, subscription } = await seedSubscriptionState({
      prefix: 'stripe-payment-succeeded',
      tier: 'plus',
      status: 'past_due',
      usedThisMonth: 8,
    });

    const event = buildStripeEvent('invoice.payment_succeeded', {
      id: 'in_payment_succeeded',
      parent: {
        subscription_details: {
          subscription: subscription.stripeSubscriptionId,
        },
      },
    });

    mockVerifyWebhookSignature.mockResolvedValueOnce(event);

    const res = await app.request(
      '/v1/stripe/webhook',
      buildWebhookRequest(event),
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const updatedSubscription = await loadSubscription(account.id);
    expect(updatedSubscription).not.toBeNull();
    expect(updatedSubscription!.status).toBe('active');

    const kvWrite = readKvPayload();
    expect(kvWrite.value).toMatchObject({
      subscriptionId: subscription.id,
      tier: 'plus',
      status: 'active',
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      usedThisMonth: 8,
    });
  });
});
