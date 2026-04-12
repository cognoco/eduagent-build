/**
 * Integration: Billing service
 *
 * Exercises the real billing service functions against a real database.
 * This suite targets the mock-heavy quota, top-up, and RevenueCat paths.
 */

import { asc, eq } from 'drizzle-orm';
import {
  accounts,
  quotaPools,
  subscriptions,
  topUpCredits,
} from '@eduagent/database';

import {
  activateSubscriptionFromRevenuecat,
  createSubscription,
  decrementQuota,
  ensureFreeSubscription,
  getTopUpCreditsRemaining,
  handleTierChange,
  isRevenuecatEventProcessed,
  purchaseTopUpCredits,
  updateSubscriptionFromRevenuecatWebhook,
} from '../../apps/api/src/services/billing';
import { getTierConfig } from '../../apps/api/src/services/subscription';
import { cleanupAccounts, createIntegrationDb } from './helpers';

const TEST_ACCOUNTS = [
  {
    clerkUserId: 'integration-billing-service-01',
    email: 'integration-billing-service-01@integration.test',
  },
  {
    clerkUserId: 'integration-billing-service-02',
    email: 'integration-billing-service-02@integration.test',
  },
  {
    clerkUserId: 'integration-billing-service-03',
    email: 'integration-billing-service-03@integration.test',
  },
  {
    clerkUserId: 'integration-billing-service-04',
    email: 'integration-billing-service-04@integration.test',
  },
  {
    clerkUserId: 'integration-billing-service-05',
    email: 'integration-billing-service-05@integration.test',
  },
  {
    clerkUserId: 'integration-billing-service-06',
    email: 'integration-billing-service-06@integration.test',
  },
  {
    clerkUserId: 'integration-billing-service-07',
    email: 'integration-billing-service-07@integration.test',
  },
];

const ALL_EMAILS = TEST_ACCOUNTS.map((account) => account.email);
const ALL_CLERK_USER_IDS = TEST_ACCOUNTS.map((account) => account.clerkUserId);

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const account = TEST_ACCOUNTS[index]!;
  const [row] = await db
    .insert(accounts)
    .values({
      clerkUserId: account.clerkUserId,
      email: account.email,
    })
    .returning();

  return row!;
}

async function seedSubscriptionWithQuota(input: {
  accountId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
  status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  monthlyLimit?: number;
  usedThisMonth?: number;
  dailyLimit?: number | null;
  usedToday?: number;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  lastRevenuecatEventId?: string | null;
  lastRevenuecatEventTimestampMs?: string | null;
}) {
  const db = createIntegrationDb();
  const tierConfig = getTierConfig(input.tier);
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      accountId: input.accountId,
      tier: input.tier,
      status: input.status ?? 'active',
      currentPeriodStart:
        input.currentPeriodStart ?? new Date('2026-04-01T00:00:00.000Z'),
      currentPeriodEnd:
        input.currentPeriodEnd ?? new Date('2026-05-01T00:00:00.000Z'),
      trialEndsAt: input.trialEndsAt ?? null,
      lastRevenuecatEventId: input.lastRevenuecatEventId ?? null,
      lastRevenuecatEventTimestampMs:
        input.lastRevenuecatEventTimestampMs ?? null,
    })
    .returning();

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: subscription!.id,
      monthlyLimit: input.monthlyLimit ?? tierConfig.monthlyQuota,
      usedThisMonth: input.usedThisMonth ?? 0,
      dailyLimit:
        input.dailyLimit === undefined
          ? tierConfig.dailyLimit ?? null
          : input.dailyLimit,
      usedToday: input.usedToday ?? 0,
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  return {
    subscription: subscription!,
    quotaPool: quotaPool!,
  };
}

async function seedTopUpCredit(input: {
  subscriptionId: string;
  amount: number;
  remaining?: number;
  purchasedAt: Date;
  expiresAt: Date;
  revenuecatTransactionId?: string | null;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(topUpCredits)
    .values({
      subscriptionId: input.subscriptionId,
      amount: input.amount,
      remaining: input.remaining ?? input.amount,
      purchasedAt: input.purchasedAt,
      expiresAt: input.expiresAt,
      revenuecatTransactionId: input.revenuecatTransactionId ?? null,
    })
    .returning();

  return row!;
}

async function loadSubscriptionByAccountId(accountId: string) {
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

async function loadTopUps(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.topUpCredits.findMany({
    where: eq(topUpCredits.subscriptionId, subscriptionId),
    orderBy: asc(topUpCredits.purchasedAt),
  });
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: ALL_EMAILS,
    clerkUserIds: ALL_CLERK_USER_IDS,
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: ALL_EMAILS,
    clerkUserIds: ALL_CLERK_USER_IDS,
  });
});

describe('Integration: billing service', () => {
  it('creates a real plus subscription and matching quota pool', async () => {
    const account = await seedAccount(0);

    const created = await createSubscription(
      createIntegrationDb(),
      account.id,
      'plus',
      700,
      {
        status: 'trial',
        stripeCustomerId: 'cus_real_suite',
        stripeSubscriptionId: 'sub_real_suite',
      }
    );

    const savedSubscription = await loadSubscriptionByAccountId(account.id);
    const savedQuotaPool = await loadQuotaPool(created.id);

    expect(created.accountId).toBe(account.id);
    expect(created.tier).toBe('plus');
    expect(created.status).toBe('trial');
    expect(savedSubscription!.stripeCustomerId).toBe('cus_real_suite');
    expect(savedSubscription!.stripeSubscriptionId).toBe('sub_real_suite');
    expect(savedQuotaPool!.monthlyLimit).toBe(700);
    expect(savedQuotaPool!.usedThisMonth).toBe(0);
    expect(savedQuotaPool!.dailyLimit).toBeNull();
  });

  it('provisions a free subscription only once with ensureFreeSubscription', async () => {
    const account = await seedAccount(1);
    const db = createIntegrationDb();

    const first = await ensureFreeSubscription(db, account.id);
    const second = await ensureFreeSubscription(db, account.id);

    const savedSubscription = await loadSubscriptionByAccountId(account.id);
    const savedQuotaPool = await loadQuotaPool(first.id);
    const allSubscriptions = await db.query.subscriptions.findMany({
      where: eq(subscriptions.accountId, account.id),
    });

    expect(first.id).toBe(second.id);
    expect(savedSubscription!.tier).toBe('free');
    expect(savedSubscription!.status).toBe('active');
    expect(savedQuotaPool!.monthlyLimit).toBe(
      getTierConfig('free').monthlyQuota
    );
    expect(savedQuotaPool!.dailyLimit).toBe(getTierConfig('free').dailyLimit);
    expect(allSubscriptions).toHaveLength(1);
  });

  it('decrements monthly quota against the real quota pool row', async () => {
    const account = await seedAccount(2);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 700,
      usedThisMonth: 12,
      dailyLimit: null,
      usedToday: 3,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id
    );

    const updatedQuotaPool = await loadQuotaPool(seeded.subscription.id);

    expect(result).toEqual({
      success: true,
      source: 'monthly',
      remainingMonthly: 687,
      remainingTopUp: 0,
      remainingDaily: null,
    });
    expect(updatedQuotaPool!.usedThisMonth).toBe(13);
    expect(updatedQuotaPool!.usedToday).toBe(4);
  });

  it('falls back to the oldest real top-up pack when monthly quota is exhausted', async () => {
    const account = await seedAccount(3);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 700,
      usedThisMonth: 700,
      dailyLimit: null,
      usedToday: 4,
    });

    await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
      purchasedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });
    await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 8,
      remaining: 8,
      purchasedAt: new Date('2026-02-01T00:00:00.000Z'),
      expiresAt: new Date('2027-02-01T00:00:00.000Z'),
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id
    );

    const updatedQuotaPool = await loadQuotaPool(seeded.subscription.id);
    const topUps = await loadTopUps(seeded.subscription.id);
    const remainingTopUps = await getTopUpCreditsRemaining(
      createIntegrationDb(),
      seeded.subscription.id,
      new Date('2026-06-01T00:00:00.000Z')
    );

    expect(result).toEqual({
      success: true,
      source: 'top_up',
      remainingMonthly: 0,
      remainingTopUp: 4,
      remainingDaily: null,
    });
    expect(updatedQuotaPool!.usedThisMonth).toBe(700);
    expect(updatedQuotaPool!.usedToday).toBe(5);
    expect(topUps.map((row) => row.remaining)).toEqual([4, 8]);
    expect(remainingTopUps).toBe(12);
  });

  it('returns daily_exceeded on the real free-tier guard path', async () => {
    const freeTier = getTierConfig('free');
    const account = await seedAccount(4);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'free',
      monthlyLimit: freeTier.monthlyQuota,
      usedThisMonth: freeTier.monthlyQuota,
      dailyLimit: freeTier.dailyLimit,
      usedToday: freeTier.dailyLimit!,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id
    );

    const updatedQuotaPool = await loadQuotaPool(seeded.subscription.id);

    expect(result).toEqual({
      success: false,
      source: 'daily_exceeded',
      remainingMonthly: 0,
      remainingTopUp: 0,
      remainingDaily: 0,
    });
    expect(updatedQuotaPool!.usedThisMonth).toBe(freeTier.monthlyQuota);
    expect(updatedQuotaPool!.usedToday).toBe(freeTier.dailyLimit);
  });

  it('grants a top-up pack once and rejects a duplicate RevenueCat transaction', async () => {
    const account = await seedAccount(5);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
    });
    const now = new Date('2026-04-12T12:00:00.000Z');

    const first = await purchaseTopUpCredits(
      createIntegrationDb(),
      seeded.subscription.id,
      500,
      now,
      'rc_txn_real_001'
    );
    const duplicate = await purchaseTopUpCredits(
      createIntegrationDb(),
      seeded.subscription.id,
      500,
      now,
      'rc_txn_real_001'
    );

    const topUps = await loadTopUps(seeded.subscription.id);
    const remainingCredits = await getTopUpCreditsRemaining(
      createIntegrationDb(),
      seeded.subscription.id,
      new Date('2026-04-13T00:00:00.000Z')
    );

    expect(first).not.toBeNull();
    expect(first!.remaining).toBe(500);
    expect(duplicate).toBeNull();
    expect(topUps).toHaveLength(1);
    expect(topUps[0]!.revenuecatTransactionId).toBe('rc_txn_real_001');
    expect(remainingCredits).toBe(500);
  });

  it('persists RevenueCat activation, webhook ordering, and partial updates against real rows', async () => {
    const account = await seedAccount(6);

    const activated = await activateSubscriptionFromRevenuecat(
      createIntegrationDb(),
      account.id,
      'family',
      'evt_1000',
      {
        isTrial: true,
        trialEndsAt: '2026-05-01T00:00:00.000Z',
        currentPeriodStart: '2026-04-01T00:00:00.000Z',
        currentPeriodEnd: '2026-05-01T00:00:00.000Z',
        eventTimestampMs: 1000,
      }
    );

    const activatedSubscription = await loadSubscriptionByAccountId(account.id);
    const activatedQuotaPool = await loadQuotaPool(activated.id);

    expect(activated.status).toBe('trial');
    expect(activated.tier).toBe('family');
    expect(activatedSubscription!.lastRevenuecatEventId).toBe('evt_1000');
    expect(activatedSubscription!.lastRevenuecatEventTimestampMs).toBe('1000');
    expect(activatedQuotaPool!.monthlyLimit).toBe(
      getTierConfig('family').monthlyQuota
    );

    expect(
      await isRevenuecatEventProcessed(
        createIntegrationDb(),
        account.id,
        'evt_1000',
        1000
      )
    ).toBe(true);
    expect(
      await isRevenuecatEventProcessed(
        createIntegrationDb(),
        account.id,
        'evt_0999',
        999
      )
    ).toBe(true);
    expect(
      await isRevenuecatEventProcessed(
        createIntegrationDb(),
        account.id,
        'evt_1001',
        1001
      )
    ).toBe(false);

    const updated = await updateSubscriptionFromRevenuecatWebhook(
      createIntegrationDb(),
      account.id,
      {
        status: 'active',
        currentPeriodEnd: '2026-06-01T00:00:00.000Z',
        cancelledAt: null,
        eventId: 'evt_2000',
        eventTimestampMs: 2000,
      }
    );

    const updatedSubscription = await loadSubscriptionByAccountId(account.id);

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('active');
    expect(updated!.currentPeriodEnd).toBe('2026-06-01T00:00:00.000Z');
    expect(updatedSubscription!.lastRevenuecatEventId).toBe('evt_2000');
    expect(updatedSubscription!.lastRevenuecatEventTimestampMs).toBe('2000');
    expect(updatedSubscription!.cancelledAt).toBeNull();
    expect(
      await isRevenuecatEventProcessed(
        createIntegrationDb(),
        account.id,
        'evt_1500',
        1500
      )
    ).toBe(true);
  });

  it('recomputes quota pool limits for a mid-cycle tier change without resetting usage', async () => {
    const account = await seedAccount(0);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      usedThisMonth: 123,
      dailyLimit: null,
      usedToday: 7,
    });

    const result = await handleTierChange(
      createIntegrationDb(),
      seeded.subscription.id,
      'family'
    );

    const updatedQuotaPool = await loadQuotaPool(seeded.subscription.id);

    expect(result).toEqual({
      previousTier: 'plus',
      newTier: 'family',
      usedThisCycle: 123,
      newMonthlyLimit: getTierConfig('family').monthlyQuota,
      remainingQuestions: getTierConfig('family').monthlyQuota - 123,
    });
    expect(updatedQuotaPool!.monthlyLimit).toBe(
      getTierConfig('family').monthlyQuota
    );
    expect(updatedQuotaPool!.usedThisMonth).toBe(123);
    expect(updatedQuotaPool!.usedToday).toBe(7);
    expect(updatedQuotaPool!.dailyLimit).toBeNull();
  });
});
