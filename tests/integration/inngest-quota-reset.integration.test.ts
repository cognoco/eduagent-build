/**
 * Integration: Inngest quota-reset function
 *
 * Exercises the real quota-reset function against a real database.
 * Daily and monthly reset logic stays real.
 */

import { eq } from 'drizzle-orm';
import { accounts, quotaPools, subscriptions } from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { quotaReset } from '../../apps/api/src/inngest/functions/quota-reset';
import { getTierConfig } from '../../apps/api/src/services/subscription';

const FREE_USER_ID = 'integration-quota-reset-free';
const FREE_EMAIL = 'integration-quota-reset-free@integration.test';
const PLUS_USER_ID = 'integration-quota-reset-plus';
const PLUS_EMAIL = 'integration-quota-reset-plus@integration.test';
const FAMILY_USER_ID = 'integration-quota-reset-family';
const FAMILY_EMAIL = 'integration-quota-reset-family@integration.test';

async function seedAccount(clerkUserId: string, email: string) {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning();

  return account!;
}

async function seedSubscriptionWithQuota(input: {
  accountId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
  cycleResetAt: Date;
}) {
  const db = createIntegrationDb();
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      accountId: input.accountId,
      tier: input.tier,
      status: 'active',
      currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: subscription!.id,
      monthlyLimit: input.monthlyLimit,
      usedThisMonth: input.usedThisMonth,
      dailyLimit: input.dailyLimit,
      usedToday: input.usedToday,
      cycleResetAt: input.cycleResetAt,
    })
    .returning();

  return {
    subscription: subscription!,
    quotaPool: quotaPool!,
  };
}

async function loadQuotaPool(id: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.id, id),
  });
}

async function executeQuotaReset() {
  const executionOrder: string[] = [];
  const step = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      executionOrder.push(name);
      return fn();
    }),
  };

  const result = await (
    quotaReset as { fn: (input: unknown) => Promise<any> }
  ).fn({ step });

  return {
    result,
    executionOrder,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [FREE_EMAIL, PLUS_EMAIL, FAMILY_EMAIL],
    clerkUserIds: [FREE_USER_ID, PLUS_USER_ID, FAMILY_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [FREE_EMAIL, PLUS_EMAIL, FAMILY_EMAIL],
    clerkUserIds: [FREE_USER_ID, PLUS_USER_ID, FAMILY_USER_ID],
  });
});

describe('Integration: quota-reset Inngest function', () => {
  it('resets daily counters and expired monthly cycles against the real database', async () => {
    const freeTier = getTierConfig('free');
    const plusTier = getTierConfig('plus');
    const familyTier = getTierConfig('family');

    const freeAccount = await seedAccount(FREE_USER_ID, FREE_EMAIL);
    const plusAccount = await seedAccount(PLUS_USER_ID, PLUS_EMAIL);
    const familyAccount = await seedAccount(FAMILY_USER_ID, FAMILY_EMAIL);

    const freePool = await seedSubscriptionWithQuota({
      accountId: freeAccount.id,
      tier: 'free',
      monthlyLimit: freeTier.monthlyQuota,
      usedThisMonth: 20,
      dailyLimit: freeTier.dailyLimit,
      usedToday: 4,
      cycleResetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const plusPool = await seedSubscriptionWithQuota({
      accountId: plusAccount.id,
      tier: 'plus',
      monthlyLimit: 123,
      usedThisMonth: 120,
      dailyLimit: null,
      usedToday: 6,
      cycleResetAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const familyPool = await seedSubscriptionWithQuota({
      accountId: familyAccount.id,
      tier: 'family',
      monthlyLimit: familyTier.monthlyQuota,
      usedThisMonth: 33,
      dailyLimit: null,
      usedToday: 0,
      cycleResetAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const { result, executionOrder } = await executeQuotaReset();

    expect(executionOrder).toEqual([
      'reset-daily-quotas',
      'reset-expired-cycles',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        dailyResetCount: 2,
        monthlyResetCount: 1,
        timestamp: expect.any(String),
      })
    );

    const reloadedFreePool = await loadQuotaPool(freePool.quotaPool.id);
    expect(reloadedFreePool!.usedToday).toBe(0);
    expect(reloadedFreePool!.usedThisMonth).toBe(20);
    expect(reloadedFreePool!.monthlyLimit).toBe(freeTier.monthlyQuota);

    const reloadedPlusPool = await loadQuotaPool(plusPool.quotaPool.id);
    expect(reloadedPlusPool!.usedToday).toBe(0);
    expect(reloadedPlusPool!.usedThisMonth).toBe(0);
    expect(reloadedPlusPool!.monthlyLimit).toBe(plusTier.monthlyQuota);
    expect(reloadedPlusPool!.dailyLimit).toBeNull();
    expect(reloadedPlusPool!.cycleResetAt.getTime()).toBeGreaterThan(
      plusPool.quotaPool.cycleResetAt.getTime()
    );

    const reloadedFamilyPool = await loadQuotaPool(familyPool.quotaPool.id);
    expect(reloadedFamilyPool!.usedToday).toBe(0);
    expect(reloadedFamilyPool!.usedThisMonth).toBe(33);
    expect(reloadedFamilyPool!.monthlyLimit).toBe(familyTier.monthlyQuota);
  });
});
