/**
 * Integration: Billing service
 *
 * Exercises the real billing service functions against a real database.
 * This suite targets the mock-heavy quota, top-up, and RevenueCat paths.
 */

import { asc, eq, inArray } from 'drizzle-orm';
import {
  accounts,
  membership,
  organization,
  person,
  profileQuotaUsage,
  profiles,
  quotaPools,
  subscription as subscriptionV2Table,
  subscriptions,
  topUpCredits,
} from '@eduagent/database';

import {
  createSubscription,
  decrementQuota,
  ensureFreeSubscription,
  getTopUpCreditsRemaining,
} from '../../apps/api/src/services/billing';
// [WI-1239 / 779-strip] purchaseTopUpCredits, activateSubscriptionFromRevenuecat,
// isRevenuecatEventProcessed, updateSubscriptionFromRevenuecatWebhook, and
// handleTierChange were removed from the legacy barrel — decrementQuota and the
// RevenueCat/top-up write paths now resolve ownership/tier exclusively via the
// v2 (organization/person/membership/subscription) store. Pull the v2 twins
// directly from billing-v2 for the cases that still need real DB coverage; see
// the per-test-case comments below for why each case converts, deletes, or is
// left untouched.
import {
  activateSubscriptionFromRevenuecatV2,
  isRevenuecatEventProcessedV2,
  purchaseTopUpCreditsV2,
  updateSubscriptionFromRevenuecatWebhookV2,
} from '../../apps/api/src/services/billing/billing-v2';
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

// [WI-1239 / 779-strip] v2 dual-store seeding. decrementQuota /
// purchaseTopUpCreditsV2 / activateSubscriptionFromRevenuecatV2 resolve tier
// and ownership via the v2 (organization/person/membership/subscription)
// store unconditionally, but quota_pools/profile_quota_usage/top_up_credits
// still FK to the legacy subscriptions/profiles tables (pre-M-REPOINT). Seed
// BOTH stores with the SAME id for the shared subscription/profile rows (the
// "reseed identity contract" used throughout billing-v2/*.integration.test.ts)
// so the legacy-table FKs are satisfiable and the v2 ownership/tier reads
// actually resolve.
const V2_ORG_NAMES = [
  'integration-billing-service-v2-daily-exceeded',
  'integration-billing-service-v2-topup',
  'integration-billing-service-v2-revenuecat',
];

async function seedV2Counterpart(input: {
  organizationName: string;
  ownerProfileId: string;
  legacySubscriptionId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
}) {
  const db = createIntegrationDb();
  const [org] = await db
    .insert(organization)
    .values({ name: input.organizationName })
    .returning();
  await db.insert(person).values({
    id: input.ownerProfileId,
    displayName: 'V2 Owner',
    birthDate: '1990-01-01',
    residenceJurisdiction: 'EU',
  });
  await db.insert(membership).values({
    personId: input.ownerProfileId,
    organizationId: org!.id,
    roles: ['admin'],
  });
  await db.insert(subscriptionV2Table).values({
    id: input.legacySubscriptionId,
    organizationId: org!.id,
    planTier: input.tier,
    status: 'active',
    payerPersonId: input.ownerProfileId,
  });
  return org!;
}

async function cleanupV2() {
  const db = createIntegrationDb();
  const orgs = await db.query.organization.findMany({
    where: inArray(organization.name, V2_ORG_NAMES),
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;
  const subs = await db.query.subscription.findMany({
    where: inArray(subscriptionV2Table.organizationId, orgIds),
    columns: { payerPersonId: true },
  });
  const personIds = [...new Set(subs.map((s) => s.payerPersonId))];
  await db
    .delete(subscriptionV2Table)
    .where(inArray(subscriptionV2Table.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
}

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

async function seedOwnerProfile(accountId: string, displayName: string) {
  const db = createIntegrationDb();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName,
      birthYear: 1990,
      isOwner: true,
    })
    .returning();

  return profile!;
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
          ? (tierConfig.dailyLimit ?? null)
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
  profileId?: string | null;
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
      profileId: input.profileId ?? null,
      amount: input.amount,
      remaining: input.remaining ?? input.amount,
      purchasedAt: input.purchasedAt,
      expiresAt: input.expiresAt,
      revenuecatTransactionId: input.revenuecatTransactionId ?? null,
    })
    .returning();

  return row!;
}

async function seedProfileQuotaUsage(input: {
  subscriptionId: string;
  profileId: string;
  monthlyLimit: number;
  usedThisMonth?: number;
  dailyLimit?: number | null;
  usedToday?: number;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(profileQuotaUsage)
    .values({
      subscriptionId: input.subscriptionId,
      profileId: input.profileId,
      role: 'owner',
      monthlyLimit: input.monthlyLimit,
      usedThisMonth: input.usedThisMonth ?? 0,
      dailyLimit: input.dailyLimit ?? null,
      usedToday: input.usedToday ?? 0,
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  return row!;
}

async function loadProfileQuotaUsage(
  subscriptionId: string,
  profileId: string,
) {
  const db = createIntegrationDb();
  return db.query.profileQuotaUsage.findFirst({
    where: (row, { and, eq }) =>
      and(eq(row.subscriptionId, subscriptionId), eq(row.profileId, profileId)),
  });
}

async function loadSubscriptionByAccountId(accountId: string) {
  const db = createIntegrationDb();
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });
}

async function loadV2SubscriptionById(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.subscription.findFirst({
    where: eq(subscriptionV2Table.id, subscriptionId),
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
  await cleanupV2();
});

afterAll(async () => {
  await cleanupAccounts({
    emails: ALL_EMAILS,
    clerkUserIds: ALL_CLERK_USER_IDS,
  });
  await cleanupV2();
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
      },
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
      getTierConfig('free').monthlyQuota,
    );
    expect(savedQuotaPool!.dailyLimit).toBe(getTierConfig('free').dailyLimit);
    expect(allSubscriptions).toHaveLength(1);
  });

  it('decrements monthly quota against the real quota pool row', async () => {
    const account = await seedAccount(2);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'family',
      monthlyLimit: 1500,
      usedThisMonth: 12,
      dailyLimit: null,
      usedToday: 3,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );

    const updatedQuotaPool = await loadQuotaPool(seeded.subscription.id);

    expect(result).toEqual({
      success: true,
      source: 'monthly',
      quotaModel: 'shared-pool',
      remainingMonthly: 1487,
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
      tier: 'family',
      monthlyLimit: 1500,
      usedThisMonth: 1500,
      dailyLimit: null,
      usedToday: 4,
    });

    const oldestTopUp = await seedTopUpCredit({
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
      seeded.subscription.id,
    );

    const updatedQuotaPool = await loadQuotaPool(seeded.subscription.id);
    const topUps = await loadTopUps(seeded.subscription.id);
    const remainingTopUps = await getTopUpCreditsRemaining(
      createIntegrationDb(),
      seeded.subscription.id,
      new Date('2026-06-01T00:00:00.000Z'),
    );

    expect(result).toEqual({
      success: true,
      source: 'top_up',
      quotaModel: 'shared-pool',
      remainingMonthly: 0,
      remainingTopUp: 4,
      remainingDaily: null,
      topUpCreditId: oldestTopUp.id,
    });
    expect(updatedQuotaPool!.usedThisMonth).toBe(1500);
    expect(updatedQuotaPool!.usedToday).toBe(5);
    expect(topUps.map((row) => row.remaining)).toEqual([4, 8]);
    expect(remainingTopUps).toBe(12);
  });

  it('returns daily_exceeded on the real free-tier guard path', async () => {
    const freeTier = getTierConfig('free');
    const account = await seedAccount(4);
    const profile = await seedOwnerProfile(account.id, 'Free Owner');
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'free',
      monthlyLimit: freeTier.monthlyQuota,
      usedThisMonth: freeTier.monthlyQuota,
      dailyLimit: freeTier.dailyLimit,
      usedToday: freeTier.dailyLimit!,
    });
    // [WI-1239 / 779-strip] decrementQuota's ownership guard
    // (verifyProfileOwnsSubscription) resolves exclusively via the v2 store
    // now — a profile that exists only in the legacy `profiles` table reads as
    // a stale/unowned profileId and short-circuits to `profile_mismatch`
    // before the free-tier daily-limit guard below is ever reached. Seed the
    // v2 counterpart so the ownership check passes and the guard path this
    // test targets is the one actually exercised.
    await seedV2Counterpart({
      organizationName: 'integration-billing-service-v2-daily-exceeded',
      ownerProfileId: profile.id,
      legacySubscriptionId: seeded.subscription.id,
      tier: 'free',
    });
    await seedProfileQuotaUsage({
      subscriptionId: seeded.subscription.id,
      profileId: profile.id,
      monthlyLimit: freeTier.ownerMonthlyQuota!,
      usedThisMonth: freeTier.ownerMonthlyQuota!,
      dailyLimit: freeTier.ownerDailyQuota,
      usedToday: freeTier.ownerDailyQuota!,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
      profile.id,
    );

    const updatedProfileQuota = await loadProfileQuotaUsage(
      seeded.subscription.id,
      profile.id,
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        source: 'daily_exceeded',
        quotaModel: 'per-profile',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: 0,
        profileRole: 'owner',
        monthlyLimit: freeTier.ownerMonthlyQuota,
        dailyLimit: freeTier.ownerDailyQuota,
      }),
    );
    expect(updatedProfileQuota!.usedThisMonth).toBe(freeTier.ownerMonthlyQuota);
    expect(updatedProfileQuota!.usedToday).toBe(freeTier.ownerDailyQuota);
  });

  it('grants a top-up pack once and rejects a duplicate RevenueCat transaction', async () => {
    const account = await seedAccount(5);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
    });
    const ownerProfile = await seedOwnerProfile(account.id, 'Top Up Owner');
    // [WI-1239 / 779-strip] purchaseTopUpCredits was removed — the RevenueCat
    // webhook handler dispatches exclusively to purchaseTopUpCreditsV2, which
    // resolves the tier (free-tier rejection) and the per-profile buyer
    // (findOwnerPersonId) via the v2 store. No integration test exercises its
    // real DB behavior directly (revenuecat-webhook-handler-v2.test.ts mocks
    // it out), so convert rather than drop this coverage.
    await seedV2Counterpart({
      organizationName: 'integration-billing-service-v2-topup',
      ownerProfileId: ownerProfile.id,
      legacySubscriptionId: seeded.subscription.id,
      tier: 'plus',
    });
    const now = new Date('2026-04-12T12:00:00.000Z');

    const first = await purchaseTopUpCreditsV2(
      createIntegrationDb(),
      seeded.subscription.id,
      500,
      now,
      'rc_txn_real_001',
      ownerProfile.id,
    );
    const duplicate = await purchaseTopUpCreditsV2(
      createIntegrationDb(),
      seeded.subscription.id,
      500,
      now,
      'rc_txn_real_001',
      ownerProfile.id,
    );

    const topUps = await loadTopUps(seeded.subscription.id);
    const remainingCredits = await getTopUpCreditsRemaining(
      createIntegrationDb(),
      seeded.subscription.id,
      new Date('2026-04-13T00:00:00.000Z'),
      ownerProfile.id,
    );

    expect(first).not.toBeNull();
    expect(first!.remaining).toBe(500);
    expect(duplicate).toBeNull();
    expect(topUps).toHaveLength(1);
    expect(topUps[0]!.profileId).toBe(ownerProfile.id);
    expect(topUps[0]!.revenuecatTransactionId).toBe('rc_txn_real_001');
    expect(remainingCredits).toBe(500);
  });

  it('persists RevenueCat activation, webhook ordering, and partial updates against real rows', async () => {
    const account = await seedAccount(6);
    const ownerProfile = await seedOwnerProfile(account.id, 'RC Owner');
    // [WI-1239 / 779-strip] activateSubscriptionFromRevenuecat,
    // isRevenuecatEventProcessed, and updateSubscriptionFromRevenuecatWebhook
    // were removed — the RevenueCat webhook route dispatches exclusively to
    // the v2 twins now. Pre-seed a subscription in BOTH stores (id-aligned) so
    // activateSubscriptionFromRevenuecatV2 takes its UPDATE branch rather than
    // its fresh-INSERT branch: the insert branch writes a brand-new v2
    // subscription id into quota_pools, whose FK still points at the legacy
    // `subscriptions` table (pre-M-REPOINT) — a fresh v2 id has no matching
    // legacy row and the insert would violate that FK. This also matches how
    // production actually calls it ("the org's subscription is created at
    // onboarding" — see activateSubscriptionFromRevenuecatV2's own comment),
    // so the UPDATE branch is the realistic path to test anyway.
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'free',
    });
    const org = await seedV2Counterpart({
      organizationName: 'integration-billing-service-v2-revenuecat',
      ownerProfileId: ownerProfile.id,
      legacySubscriptionId: seeded.subscription.id,
      tier: 'free',
    });

    const activated = await activateSubscriptionFromRevenuecatV2(
      createIntegrationDb(),
      org.id,
      'family',
      'evt_1000',
      {
        isTrial: true,
        trialEndsAt: '2026-05-01T00:00:00.000Z',
        currentPeriodStart: '2026-04-01T00:00:00.000Z',
        currentPeriodEnd: '2026-05-01T00:00:00.000Z',
        eventTimestampMs: 1000,
      },
    );

    const activatedSubscription = await loadV2SubscriptionById(activated.id);
    const activatedQuotaPool = await loadQuotaPool(activated.id);

    expect(activated.status).toBe('trial');
    expect(activated.tier).toBe('family');
    expect(activatedSubscription!.lastRevenuecatEventId).toBe('evt_1000');
    expect(activatedSubscription!.lastRevenuecatEventTimestampMs).toBe('1000');
    expect(activatedQuotaPool!.monthlyLimit).toBe(
      getTierConfig('family').monthlyQuota,
    );

    expect(
      await isRevenuecatEventProcessedV2(
        createIntegrationDb(),
        org.id,
        'evt_1000',
        1000,
      ),
    ).toBe(true);
    expect(
      await isRevenuecatEventProcessedV2(
        createIntegrationDb(),
        org.id,
        'evt_0999',
        999,
      ),
    ).toBe(true);
    expect(
      await isRevenuecatEventProcessedV2(
        createIntegrationDb(),
        org.id,
        'evt_1001',
        1001,
      ),
    ).toBe(false);

    const updated = await updateSubscriptionFromRevenuecatWebhookV2(
      createIntegrationDb(),
      org.id,
      {
        status: 'active',
        currentPeriodEnd: '2026-06-01T00:00:00.000Z',
        cancelledAt: null,
        eventId: 'evt_2000',
        eventTimestampMs: 2000,
      },
    );

    const updatedSubscription = await loadV2SubscriptionById(activated.id);

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('active');
    expect(updated!.currentPeriodEnd).toBe('2026-06-01T00:00:00.000Z');
    expect(updatedSubscription!.lastRevenuecatEventId).toBe('evt_2000');
    expect(updatedSubscription!.lastRevenuecatEventTimestampMs).toBe('2000');
    expect(updatedSubscription!.cancelledAt).toBeNull();
    expect(
      await isRevenuecatEventProcessedV2(
        createIntegrationDb(),
        org.id,
        'evt_1500',
        1500,
      ),
    ).toBe(true);
  });

  // [WI-1239 / 779-strip] handleTierChange was removed — the billing.test.ts
  // removal comment confirms it "had zero production callers even before this
  // WI" (routes/billing.ts, stripe-webhook.ts, revenuecat-webhook.ts already
  // dispatched exclusively to the -V2 twins). The mid-cycle recompute behavior
  // this test targeted (tier changes update quota-pool limits while preserving
  // in-cycle usage) is the shared-pool branch of reconcileQuotaStateForEffectiveTier
  // — the actual mechanism webhooks use on a tier change (both legacy and
  // reconcileQuotaStateForEffectiveTierV2 delegate to it verbatim for
  // shared-pool tiers) — and is covered by
  // apps/api/src/services/billing/quota-reconcile.integration.test.ts →
  // "preserves mid-cycle usage when the cycle is still active". No replacement
  // test added here; the case is dropped, not converted.
});
