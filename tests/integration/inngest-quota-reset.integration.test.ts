/**
 * Integration: Inngest quota-reset function
 *
 * Exercises the real quota-reset function against a real database.
 * Daily and monthly reset logic stays real.
 */

import { and, eq } from 'drizzle-orm';
import {
  accounts,
  generateUUIDv7,
  membership,
  person,
  profileQuotaUsage,
  quotaPools,
  subscription as subscriptionV2,
  subscriptions,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { quotaReset } from '../../apps/api/src/inngest/functions/quota-reset';
import {
  ensureV2IdentityForLegacyProfileTest,
  legacyIdentityTableExistsForTest,
} from '../../apps/api/src/test-utils/legacy-identity-anchors';
import { getTierConfig } from '../../apps/api/src/services/subscription';

const FREE_USER_ID = 'integration-quota-reset-free';
const FREE_EMAIL = 'integration-quota-reset-free@integration.test';
const PLUS_USER_ID = 'integration-quota-reset-plus';
const PLUS_EMAIL = 'integration-quota-reset-plus@integration.test';
const FAMILY_USER_ID = 'integration-quota-reset-family';
const FAMILY_EMAIL = 'integration-quota-reset-family@integration.test';

async function seedAccount(clerkUserId: string, email: string) {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();

  // [WI-1128] `accounts` is dropped (post-M-DROP); gate the raw legacy
  // insert on table existence — the v2 identity graph below is the real
  // anchor post-drop.
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.insert(accounts).values({ id: accountId, clerkUserId, email });
  }

  // [WI-867] v2 identity always seeded (flag collapsed to v2-only).
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId: generateUUIDv7(),
    displayName: 'Quota Reset Owner',
    birthYear: 1990,
    clerkUserId,
    email,
    isOwner: true,
    seedBaselineSubscription: false,
  });

  return { id: accountId };
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

  // [WI-867] v2 subscription always seeded (flag collapsed to v2-only).
  const ownerMembership = await db.query.membership.findFirst({
    where: eq(membership.organizationId, input.accountId),
    columns: { personId: true },
  });
  if (!ownerMembership) {
    throw new Error('Owner membership not found for v2 quota reset seed');
  }

  await db.insert(subscriptionV2).values({
    id: subscription!.id,
    organizationId: input.accountId,
    planTier: input.tier,
    status: 'active',
    payerPersonId: ownerMembership.personId,
    periodStartAt: new Date('2026-04-01T00:00:00.000Z'),
    periodEndAt: new Date('2026-05-01T00:00:00.000Z'),
  });

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

async function seedProfile(input: {
  accountId: string;
  displayName: string;
  isOwner: boolean;
}) {
  const db = createIntegrationDb();
  const profileId = generateUUIDv7();
  const birthYear = input.isOwner ? 1990 : 2016;

  // [WI-1128] `profiles` is dropped (post-M-DROP); seed the v2 person +
  // membership rows directly. `profile_quota_usage.profile_id` FKs to
  // `person.id` (repointed by 0129_m_repoint.sql).
  await db.insert(person).values({
    id: profileId,
    displayName: input.displayName,
    birthDate: `${birthYear}-01-01`,
    residenceJurisdiction: 'EU',
  });

  await db.insert(membership).values({
    personId: profileId,
    organizationId: input.accountId,
    roles: input.isOwner ? ['admin', 'learner'] : ['learner'],
  });

  return { id: profileId };
}

async function seedProfileQuotaUsage(input: {
  subscriptionId: string;
  profileId: string;
  role: 'owner' | 'child';
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
  cycleResetAt: Date;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(profileQuotaUsage)
    .values({
      subscriptionId: input.subscriptionId,
      profileId: input.profileId,
      role: input.role,
      monthlyLimit: input.monthlyLimit,
      usedThisMonth: input.usedThisMonth,
      dailyLimit: input.dailyLimit,
      usedToday: input.usedToday,
      cycleResetAt: input.cycleResetAt,
    })
    .returning();

  return row!;
}

async function loadQuotaPool(id: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.id, id),
  });
}

async function loadProfileQuotaUsage(
  subscriptionId: string,
  profileId: string,
) {
  const db = createIntegrationDb();
  return db.query.profileQuotaUsage.findFirst({
    where: and(
      eq(profileQuotaUsage.subscriptionId, subscriptionId),
      eq(profileQuotaUsage.profileId, profileId),
    ),
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

    const freeOwnerProfile = await seedProfile({
      accountId: freeAccount.id,
      displayName: 'Free Owner',
      isOwner: true,
    });
    const freeChildProfile = await seedProfile({
      accountId: freeAccount.id,
      displayName: 'Free Child',
      isOwner: false,
    });
    await seedProfileQuotaUsage({
      subscriptionId: freePool.subscription.id,
      profileId: freeOwnerProfile.id,
      role: 'owner',
      monthlyLimit: freeTier.ownerMonthlyQuota!,
      usedThisMonth: 20,
      dailyLimit: freeTier.ownerDailyQuota,
      usedToday: 4,
      cycleResetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await seedProfileQuotaUsage({
      subscriptionId: freePool.subscription.id,
      profileId: freeChildProfile.id,
      role: 'child',
      monthlyLimit: freeTier.childMonthlyQuota!,
      usedThisMonth: 7,
      dailyLimit: freeTier.childDailyQuota,
      usedToday: 5,
      cycleResetAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const plusOwnerProfile = await seedProfile({
      accountId: plusAccount.id,
      displayName: 'Plus Owner',
      isOwner: true,
    });
    const plusChildProfile = await seedProfile({
      accountId: plusAccount.id,
      displayName: 'Plus Child',
      isOwner: false,
    });
    await seedProfileQuotaUsage({
      subscriptionId: plusPool.subscription.id,
      profileId: plusOwnerProfile.id,
      role: 'owner',
      monthlyLimit: plusTier.ownerMonthlyQuota!,
      usedThisMonth: 120,
      dailyLimit: plusTier.ownerDailyQuota,
      usedToday: 6,
      cycleResetAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await seedProfileQuotaUsage({
      subscriptionId: plusPool.subscription.id,
      profileId: plusChildProfile.id,
      role: 'child',
      monthlyLimit: plusTier.childMonthlyQuota!,
      usedThisMonth: 50,
      dailyLimit: plusTier.childDailyQuota,
      usedToday: 8,
      cycleResetAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const { result, executionOrder } = await executeQuotaReset();

    expect(executionOrder).toEqual(['reset-daily-and-cycles']);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        timestamp: expect.any(String),
      }),
    );
    // resetDailyQuotas/resetExpiredQuotaCycles operate on ALL pools in the DB
    // (they're daily crons, not scoped to our seed). With parallel Jest workers,
    // concurrent test files may have pools contributing to these counts too.
    // We must see AT LEAST our seeded pools reset; downstream per-pool
    // assertions below prove correctness for the seeded rows.
    expect(result.dailyResetCount).toBeGreaterThanOrEqual(2);
    expect(result.monthlyResetCount).toBeGreaterThanOrEqual(1);

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
      plusPool.quotaPool.cycleResetAt.getTime(),
    );

    const reloadedFamilyPool = await loadQuotaPool(familyPool.quotaPool.id);
    expect(reloadedFamilyPool!.usedToday).toBe(0);
    expect(reloadedFamilyPool!.usedThisMonth).toBe(33);
    expect(reloadedFamilyPool!.monthlyLimit).toBe(familyTier.monthlyQuota);

    const reloadedFreeOwner = await loadProfileQuotaUsage(
      freePool.subscription.id,
      freeOwnerProfile.id,
    );
    expect(reloadedFreeOwner!.usedToday).toBe(0);
    expect(reloadedFreeOwner!.usedThisMonth).toBe(20);
    expect(reloadedFreeOwner!.monthlyLimit).toBe(freeTier.ownerMonthlyQuota);
    expect(reloadedFreeOwner!.dailyLimit).toBe(freeTier.ownerDailyQuota);

    const reloadedFreeChild = await loadProfileQuotaUsage(
      freePool.subscription.id,
      freeChildProfile.id,
    );
    expect(reloadedFreeChild!.usedToday).toBe(0);
    expect(reloadedFreeChild!.usedThisMonth).toBe(7);
    expect(reloadedFreeChild!.monthlyLimit).toBe(freeTier.childMonthlyQuota);
    expect(reloadedFreeChild!.dailyLimit).toBe(freeTier.childDailyQuota);

    const reloadedPlusOwner = await loadProfileQuotaUsage(
      plusPool.subscription.id,
      plusOwnerProfile.id,
    );
    expect(reloadedPlusOwner!.usedToday).toBe(0);
    expect(reloadedPlusOwner!.usedThisMonth).toBe(0);
    expect(reloadedPlusOwner!.monthlyLimit).toBe(plusTier.ownerMonthlyQuota);
    expect(reloadedPlusOwner!.dailyLimit).toBe(plusTier.ownerDailyQuota);
    expect(reloadedPlusOwner!.cycleResetAt.getTime()).toBeGreaterThan(
      plusPool.quotaPool.cycleResetAt.getTime(),
    );

    const reloadedPlusChild = await loadProfileQuotaUsage(
      plusPool.subscription.id,
      plusChildProfile.id,
    );
    expect(reloadedPlusChild!.usedToday).toBe(0);
    expect(reloadedPlusChild!.usedThisMonth).toBe(50);
    expect(reloadedPlusChild!.monthlyLimit).toBe(plusTier.childMonthlyQuota);
    expect(reloadedPlusChild!.dailyLimit).toBe(plusTier.childDailyQuota);
  });
});
