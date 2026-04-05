/**
 * Integration: Inngest trial-expiry function
 *
 * Exercises the real trial-expiry function against a real database.
 * Trial transitions, quota updates, and owner-profile lookup stay real.
 *
 * Mocked boundary:
 * - Push delivery transport
 */

import { eq } from 'drizzle-orm';
import {
  accounts,
  profiles,
  quotaPools,
  subscriptions,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { trialExpiry } from '../../apps/api/src/inngest/functions/trial-expiry';
import { getTierConfig } from '../../apps/api/src/services/subscription';
import { EXTENDED_TRIAL_MONTHLY_EQUIVALENT } from '../../apps/api/src/services/trial';

const mockSendPushNotification = jest.fn();

jest.mock('../../apps/api/src/services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
}));

const JUST_EXPIRED_USER_ID = 'integration-trial-expired-now';
const JUST_EXPIRED_EMAIL = 'integration-trial-expired-now@integration.test';
const EXTENDED_USER_ID = 'integration-trial-extended';
const EXTENDED_EMAIL = 'integration-trial-extended@integration.test';
const WARNING_USER_ID = 'integration-trial-warning';
const WARNING_EMAIL = 'integration-trial-warning@integration.test';

async function seedAccountWithOwnerProfile(input: {
  clerkUserId: string;
  email: string;
  displayName: string;
}) {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: input.clerkUserId,
      email: input.email,
    })
    .returning();

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: input.displayName,
      birthYear: 1990,
      isOwner: true,
    })
    .returning();

  return {
    account: account!,
    profile: profile!,
  };
}

async function seedSubscriptionWithQuota(input: {
  accountId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  trialEndsAt: Date;
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
}) {
  const db = createIntegrationDb();
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      accountId: input.accountId,
      tier: input.tier,
      status: input.status,
      trialEndsAt: input.trialEndsAt,
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
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  return {
    subscription: subscription!,
    quotaPool: quotaPool!,
  };
}

async function loadSubscription(id: string) {
  const db = createIntegrationDb();
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
  });
}

async function loadQuotaPool(id: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.id, id),
  });
}

async function executeTrialExpiry() {
  const executionOrder: string[] = [];
  const step = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      executionOrder.push(name);
      return fn();
    }),
  };

  const result = await (
    trialExpiry as { fn: (input: unknown) => Promise<any> }
  ).fn({ step });

  return {
    result,
    executionOrder,
  };
}

function dateAtUtcNoon(offsetDays: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockSendPushNotification.mockResolvedValue({ sent: true });

  await cleanupAccounts({
    emails: [JUST_EXPIRED_EMAIL, EXTENDED_EMAIL, WARNING_EMAIL],
    clerkUserIds: [JUST_EXPIRED_USER_ID, EXTENDED_USER_ID, WARNING_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [JUST_EXPIRED_EMAIL, EXTENDED_EMAIL, WARNING_EMAIL],
    clerkUserIds: [JUST_EXPIRED_USER_ID, EXTENDED_USER_ID, WARNING_USER_ID],
  });
});

describe('Integration: trial-expiry Inngest function', () => {
  it('processes real subscription transitions and sends owner notifications', async () => {
    const freeTier = getTierConfig('free');
    const plusTier = getTierConfig('plus');

    const justExpired = await seedAccountWithOwnerProfile({
      clerkUserId: JUST_EXPIRED_USER_ID,
      email: JUST_EXPIRED_EMAIL,
      displayName: 'Just Expired Owner',
    });
    const extended = await seedAccountWithOwnerProfile({
      clerkUserId: EXTENDED_USER_ID,
      email: EXTENDED_EMAIL,
      displayName: 'Extended Owner',
    });
    const warning = await seedAccountWithOwnerProfile({
      clerkUserId: WARNING_USER_ID,
      email: WARNING_EMAIL,
      displayName: 'Warning Owner',
    });

    const justExpiredSeed = await seedSubscriptionWithQuota({
      accountId: justExpired.account.id,
      tier: 'plus',
      status: 'trial',
      trialEndsAt: dateAtUtcNoon(-1),
      monthlyLimit: plusTier.monthlyQuota,
      usedThisMonth: 25,
      dailyLimit: null,
      usedToday: 5,
    });

    const extendedSeed = await seedSubscriptionWithQuota({
      accountId: extended.account.id,
      tier: 'free',
      status: 'expired',
      trialEndsAt: dateAtUtcNoon(-14),
      monthlyLimit: EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
      usedThisMonth: 12,
      dailyLimit: freeTier.dailyLimit,
      usedToday: 2,
    });

    await seedSubscriptionWithQuota({
      accountId: warning.account.id,
      tier: 'plus',
      status: 'trial',
      trialEndsAt: dateAtUtcNoon(3),
      monthlyLimit: plusTier.monthlyQuota,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 1,
    });

    const { result, executionOrder } = await executeTrialExpiry();

    expect(executionOrder).toEqual([
      'process-expired-trials',
      'process-extended-trial-expiry',
      'send-trial-warnings',
      'send-soft-landing-messages',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        date: expect.any(String),
        expiredCount: 1,
        extendedExpiredCount: 1,
        warningsSent: 1,
        softLandingSent: 2,
      })
    );

    const updatedExpiredSubscription = await loadSubscription(
      justExpiredSeed.subscription.id
    );
    expect(updatedExpiredSubscription!.status).toBe('expired');
    expect(updatedExpiredSubscription!.tier).toBe('free');

    const updatedExpiredQuota = await loadQuotaPool(
      justExpiredSeed.quotaPool.id
    );
    expect(updatedExpiredQuota!.monthlyLimit).toBe(
      EXTENDED_TRIAL_MONTHLY_EQUIVALENT
    );
    expect(updatedExpiredQuota!.usedThisMonth).toBe(0);
    expect(updatedExpiredQuota!.usedToday).toBe(0);
    expect(updatedExpiredQuota!.dailyLimit).toBe(freeTier.dailyLimit);

    const updatedExtendedQuota = await loadQuotaPool(extendedSeed.quotaPool.id);
    expect(updatedExtendedQuota!.monthlyLimit).toBe(freeTier.monthlyQuota);
    expect(updatedExtendedQuota!.usedThisMonth).toBe(0);
    expect(updatedExtendedQuota!.usedToday).toBe(0);

    expect(mockSendPushNotification).toHaveBeenCalledTimes(3);
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: warning.profile.id,
        title: 'Trial ending soon',
        type: 'trial_expiry',
      })
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: justExpired.profile.id,
        title: 'Your trial has ended',
        type: 'trial_expiry',
      })
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: extended.profile.id,
        title: 'Your trial has ended',
        type: 'trial_expiry',
      })
    );
  });
});
