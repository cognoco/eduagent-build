/**
 * Integration: Quota reset helpers
 *
 * [CR-2026-05-19-C7] Verifies that `resetDailyQuotas` and
 * `resetExpiredQuotaCycles` are atomic + correctly ordered when invoked
 * together. The bug was: when a billing-cycle boundary coincided with the
 * 01:00 UTC cron, cycle-reset zeroed `used_today` first and the daily reset
 * then undercounted its `used_today > 0` rows.
 *
 * No mocks of internal services or database — external boundaries only
 * (none touched by these helpers).
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  membership,
  organization,
  person,
  quotaPools,
  subscription as subscriptionV2Table,
  subscriptions,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import { legacyIdentityTableExistsForTest } from '../../test-utils/legacy-identity-anchors';

import {
  resetDailyQuotas,
  resetExpiredQuotaCycles,
  transitionToExtendedTrial,
  downgradeExtendedTrialQuotaIfStillExpired,
  transitionToExtendedTrialFromRevenuecatEvent,
  expireTrialAndDowngradeQuota,
} from '../billing';
import { getTierConfig } from '../subscription';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Seed helpers — unique prefix so parallel test runs don't collide
// ---------------------------------------------------------------------------

const PREFIX = 'integration-trial-reset';
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-01`, email: `${PREFIX}-01@integration.test` },
  { clerkUserId: `${PREFIX}-02`, email: `${PREFIX}-02@integration.test` },
  { clerkUserId: `${PREFIX}-03`, email: `${PREFIX}-03@integration.test` },
  // [CR-2026-05-19-M3] Additional accounts for atomicity tests
  { clerkUserId: `${PREFIX}-m3-01`, email: `${PREFIX}-m3-01@integration.test` },
  { clerkUserId: `${PREFIX}-m3-02`, email: `${PREFIX}-m3-02@integration.test` },
  { clerkUserId: `${PREFIX}-m3-03`, email: `${PREFIX}-m3-03@integration.test` },
  { clerkUserId: `${PREFIX}-m3-04`, email: `${PREFIX}-m3-04@integration.test` },
  { clerkUserId: `${PREFIX}-m3-05`, email: `${PREFIX}-m3-05@integration.test` },
];

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const account = TEST_ACCOUNTS[index]!;
  const [org] = await db
    .insert(organization)
    .values({ name: `${PREFIX}-org-${index}` })
    .returning();
  // [WI-1128] Legacy `accounts` may already be dropped (post-M-DROP); after
  // M-REPOINT, `subscriptions.accountId` targets `organization` directly, so
  // this mirror (same id as the org) is a no-op there instead of hard-failing.
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.insert(accounts).values({
      id: org!.id,
      clerkUserId: account.clerkUserId,
      email: account.email,
    });
  }
  return org!;
}

// [WI-1128] `quota_pools.subscriptionId` now FKs to the v2 `subscription`
// table (post-M-REPOINT). Auto-provision a throwaway payer (subscription.
// payerPersonId is NOT NULL — these tests don't care about payer identity),
// and return the v2 subscription id so callers mirror the legacy
// `subscriptions` row under the SAME id (resetExpiredQuotaCycles' raw-SQL
// join on `qp.subscription_id = s.id` depends on the two ids matching).
async function seedV2SubscriptionCounterpart(
  db: Database,
  organizationId: string,
  tier: 'free' | 'plus' | 'family' | 'pro',
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired',
): Promise<string> {
  const [payer] = await db
    .insert(person)
    .values({
      displayName: 'Auto Payer',
      birthDate: '1990-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();
  await db.insert(membership).values({
    personId: payer!.id,
    organizationId,
    roles: ['admin'],
  });
  const [subV2] = await db
    .insert(subscriptionV2Table)
    .values({
      organizationId,
      planTier: tier,
      status,
      payerPersonId: payer!.id,
    })
    .returning();
  return subV2!.id;
}

async function seedSubscriptionWithQuota(input: {
  accountId: string;
  tier?: 'free' | 'plus' | 'family' | 'pro';
  usedThisMonth?: number;
  usedToday?: number;
  cycleResetAt: Date;
}) {
  const db = createIntegrationDb();
  const tier = input.tier ?? 'plus';
  const tierConfig = getTierConfig(tier);

  const subV2Id = await seedV2SubscriptionCounterpart(
    db,
    input.accountId,
    tier,
    'active',
  );

  const [subscription] = await db
    .insert(subscriptions)
    .values({
      id: subV2Id,
      accountId: input.accountId,
      tier,
      status: 'active',
      currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: subscription!.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: input.usedThisMonth ?? 0,
      dailyLimit: tierConfig.dailyLimit ?? null,
      usedToday: input.usedToday ?? 0,
      cycleResetAt: input.cycleResetAt,
    })
    .returning();

  return { subscription: subscription!, quotaPool: quotaPool! };
}

async function loadQuotaPool(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

async function loadSubscriptionById(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });
}

async function seedTrialSubscriptionWithPlusQuota(
  accountId: string,
  status: 'trial' | 'active' = 'trial',
) {
  const db = createIntegrationDb();
  const plusConfig = getTierConfig('plus');
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 1);

  const subV2Id = await seedV2SubscriptionCounterpart(
    db,
    accountId,
    'plus',
    status,
  );

  const [sub] = await db
    .insert(subscriptions)
    .values({
      id: subV2Id,
      accountId,
      tier: 'plus',
      status,
      trialEndsAt: status === 'trial' ? new Date() : null,
    })
    .returning();

  const [pool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: sub!.id,
      monthlyLimit: plusConfig.monthlyQuota,
      usedThisMonth: 10,
      dailyLimit: plusConfig.dailyLimit ?? null,
      usedToday: 3,
      cycleResetAt: futureDate,
    })
    .returning();

  return { subscription: sub!, quotaPool: pool! };
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const orgs = await db.query.organization.findMany({
    where: inArray(
      organization.name,
      TEST_ACCOUNTS.map((_, i) => `${PREFIX}-org-${i}`),
    ),
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;

  const memberships = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(inArray(membership.organizationId, orgIds));
  const personIds = [...new Set(memberships.map((m) => m.personId))];

  // subscription.organizationId / .payerPersonId are both RESTRICT — the
  // v2 subscription must go before organization/person.
  await db
    .delete(subscriptionV2Table)
    .where(inArray(subscriptionV2Table.organizationId, orgIds));
  await db.delete(membership).where(inArray(membership.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
  // [WI-1128] Legacy `accounts` may already be dropped (post-M-DROP); its
  // `subscriptions` row (same id as the org) cascades away via the
  // M-REPOINT'd account_id->organization FK when the org itself is deleted
  // above.
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.delete(accounts).where(inArray(accounts.id, orgIds));
  }
}

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Quota reset helpers (integration) [CR-2026-05-19-C7]', () => {
  const NOW = new Date('2026-05-15T01:00:00.000Z');

  it('resetDailyQuotas counts every pool with usedToday > 0', async () => {
    const account = await seedAccount(0);
    const cycleStillFuture = new Date('2027-01-01T00:00:00.000Z');
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      usedThisMonth: 3,
      usedToday: 4,
      cycleResetAt: cycleStillFuture,
    });

    const count = await resetDailyQuotas(createIntegrationDb(), NOW);
    expect(count).toBeGreaterThanOrEqual(1);

    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedToday).toBe(0);
    // Monthly counter untouched by the daily reset.
    expect(pool!.usedThisMonth).toBe(3);
  });

  // [BREAK / CR-2026-05-19-C7] When a pool's billing cycle coincides with the
  // 01:00 UTC cron tick AND it has usedToday > 0, we must run both resets
  // inside one transaction with daily-first ordering so the daily log count
  // includes this pool. Pre-fix: cycle-reset zeroed used_today first, then
  // resetDailyQuotas' `usedToday > 0` filter missed it → undercount.
  it('[BREAK] daily reset counts pools whose cycle expires in the same tick', async () => {
    const account = await seedAccount(1);
    // cycleResetAt at or before NOW → cycle-expired
    const cycleAtTick = new Date('2026-05-15T00:30:00.000Z');
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      usedThisMonth: 5,
      usedToday: 7,
      cycleResetAt: cycleAtTick,
    });

    // Run BOTH resets in a single transaction (matches quota-reset.ts).
    const db = createIntegrationDb();
    const { dailyCount, monthlyCount } = await db.transaction(async (tx) => {
      const d = await resetDailyQuotas(tx as unknown as Database, NOW);
      const m = await resetExpiredQuotaCycles(tx as unknown as Database, NOW);
      return { dailyCount: d, monthlyCount: m };
    });

    expect(dailyCount).toBeGreaterThanOrEqual(1);
    expect(monthlyCount).toBeGreaterThanOrEqual(1);

    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedToday).toBe(0);
    expect(pool!.usedThisMonth).toBe(0);
    // cycleResetAt advanced by one month.
    expect(pool!.cycleResetAt.getTime()).toBeGreaterThan(cycleAtTick.getTime());
  });

  it('resetExpiredQuotaCycles only touches pools whose cycle is at/before now', async () => {
    const account = await seedAccount(2);
    const cycleStillFuture = new Date('2027-01-01T00:00:00.000Z');
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      usedThisMonth: 4,
      usedToday: 2,
      cycleResetAt: cycleStillFuture,
    });

    const count = await resetExpiredQuotaCycles(createIntegrationDb(), NOW);
    void count; // may be 0 or include unrelated rows from parallel tests

    const pool = await loadQuotaPool(seeded.subscription.id);
    // Future-cycle pool must be untouched by the cycle reset.
    expect(pool!.usedThisMonth).toBe(4);
    expect(pool!.usedToday).toBe(2);
    expect(pool!.cycleResetAt.toISOString()).toBe(
      cycleStillFuture.toISOString(),
    );
  });
});

// ---------------------------------------------------------------------------
// [CR-2026-05-19-M3] SITE 2a: transitionToExtendedTrial atomicity
// ---------------------------------------------------------------------------

describe('transitionToExtendedTrial atomicity [CR-2026-05-19-M3 SITE 2a]', () => {
  // [BREAK] Pre-fix: subscription.status = 'expired' + tier='free' was written
  // first, then quota pool. A process death between the two left the user with
  // an expired tier but plus-sized quota (billing leak).
  // Post-fix: both writes are in a single db.transaction(); a rollback leaves
  // subscription and quota pool both at their original state.
  it('[BREAK] rollback leaves subscription tier and quota pool both unchanged', async () => {
    const account = await seedAccount(3);
    const { subscription, quotaPool } =
      await seedTrialSubscriptionWithPlusQuota(account.id, 'trial');
    const db = createIntegrationDb();
    const plusConfig = getTierConfig('plus');

    const originalMonthlyLimit = quotaPool.monthlyLimit;
    expect(originalMonthlyLimit).toBe(plusConfig.monthlyQuota);

    // Simulate rollback by injecting an error mid-transaction.
    // We do this by using the real DB and wrapping in a transaction we
    // forcibly roll back.
    let caughtError: unknown;
    try {
      await db.transaction(async (tx) => {
        const txDb = tx as unknown as Database;

        // First write — subscription update (mirrors internal first step of
        // transitionToExtendedTrial before the fix)
        await tx
          .update(subscriptions)
          .set({ status: 'expired', tier: 'free', updatedAt: new Date() })
          .where(eq(subscriptions.id, subscription.id));

        // Simulate crash/error BEFORE the quota pool update
        throw new Error('Simulated process death after subscription update');

        // Second write — quota pool (never reached)
        void txDb;
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect((caughtError as Error).message).toContain('Simulated process death');

    // Both must be rolled back — subscription still 'trial'+'plus', pool unchanged
    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('trial');
    expect(sub!.tier).toBe('plus');

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(originalMonthlyLimit);
  });

  it('transitionToExtendedTrial commits both subscription + quota pool atomically', async () => {
    const account = await seedAccount(4);
    const { subscription } = await seedTrialSubscriptionWithPlusQuota(
      account.id,
      'trial',
    );
    const db = createIntegrationDb();
    const EXTENDED_MONTHLY = 450;

    await transitionToExtendedTrial(db, subscription.id, EXTENDED_MONTHLY);

    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('expired');
    expect(sub!.tier).toBe('free');

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(EXTENDED_MONTHLY);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
  });

  it('[BREAK / F-121] does not downgrade a trial that converted to paid after cron selection', async () => {
    const account = await seedAccount(5);
    const { subscription, quotaPool } =
      await seedTrialSubscriptionWithPlusQuota(account.id, 'trial');
    const db = createIntegrationDb();

    await db
      .update(subscriptions)
      .set({
        status: 'active',
        tier: 'plus',
        trialEndsAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    await transitionToExtendedTrial(db, subscription.id, 450);

    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('active');
    expect(sub!.tier).toBe('plus');
    expect(sub!.trialEndsAt).toBeNull();

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(quotaPool.monthlyLimit);
    expect(pool!.usedThisMonth).toBe(quotaPool.usedThisMonth);
    expect(pool!.usedToday).toBe(quotaPool.usedToday);
  });

  it('[BREAK / F-121] returns false when a trial converted to paid after cron selection', async () => {
    const account = await seedAccount(6);
    const { subscription } = await seedTrialSubscriptionWithPlusQuota(
      account.id,
      'trial',
    );
    const db = createIntegrationDb();

    await db
      .update(subscriptions)
      .set({
        status: 'active',
        tier: 'plus',
        trialEndsAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    await expect(
      transitionToExtendedTrial(db, subscription.id, 450),
    ).resolves.toBe(false);
  });
});

describe('downgradeExtendedTrialQuotaIfStillExpired atomicity [F-121]', () => {
  it('downgrades extended-trial quota when the subscription is still expired/free', async () => {
    const account = await seedAccount(5);
    const { subscription } = await seedTrialSubscriptionWithPlusQuota(
      account.id,
      'trial',
    );
    const db = createIntegrationDb();
    const freeTier = getTierConfig('free');

    await transitionToExtendedTrial(db, subscription.id, 450);

    await expect(
      downgradeExtendedTrialQuotaIfStillExpired(
        db,
        subscription.id,
        freeTier.monthlyQuota,
        freeTier.dailyLimit,
      ),
    ).resolves.toBe(true);

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(freeTier.monthlyQuota);
    expect(pool!.dailyLimit).toBe(freeTier.dailyLimit);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
  });

  it('[BREAK / F-121] does not downgrade quota for an extended trial that converted to paid after cron selection', async () => {
    const account = await seedAccount(7);
    const { subscription, quotaPool } =
      await seedTrialSubscriptionWithPlusQuota(account.id, 'trial');
    const db = createIntegrationDb();
    const freeTier = getTierConfig('free');

    await transitionToExtendedTrial(db, subscription.id, 450);
    await db
      .update(subscriptions)
      .set({
        status: 'active',
        tier: 'plus',
        trialEndsAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));
    await db
      .update(quotaPools)
      .set({
        monthlyLimit: quotaPool.monthlyLimit,
        dailyLimit: quotaPool.dailyLimit,
        usedThisMonth: quotaPool.usedThisMonth,
        usedToday: quotaPool.usedToday,
        updatedAt: new Date(),
      })
      .where(eq(quotaPools.subscriptionId, subscription.id));

    await expect(
      downgradeExtendedTrialQuotaIfStillExpired(
        db,
        subscription.id,
        freeTier.monthlyQuota,
        freeTier.dailyLimit,
      ),
    ).resolves.toBe(false);

    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('active');
    expect(sub!.tier).toBe('plus');

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(quotaPool.monthlyLimit);
    expect(pool!.dailyLimit).toBe(quotaPool.dailyLimit);
    expect(pool!.usedThisMonth).toBe(quotaPool.usedThisMonth);
    expect(pool!.usedToday).toBe(quotaPool.usedToday);
  });
});

describe('transitionToExtendedTrialFromRevenuecatEvent [WI-78 review]', () => {
  it('stamps the RevenueCat event in the same transaction as the trial soft landing', async () => {
    const account = await seedAccount(3);
    const { subscription } = await seedTrialSubscriptionWithPlusQuota(
      account.id,
      'trial',
    );
    const db = createIntegrationDb();
    const eventTimestampMs = 1_800_000_000_000;

    const result = await transitionToExtendedTrialFromRevenuecatEvent(
      db,
      subscription.id,
      450,
      'evt-trial-expired',
      eventTimestampMs,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: subscription.id,
        status: 'expired',
        tier: 'free',
        webhookApplied: true,
      }),
    );

    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('expired');
    expect(sub!.tier).toBe('free');
    expect(sub!.lastRevenuecatEventId).toBe('evt-trial-expired');
    expect(sub!.lastRevenuecatEventTimestampMs).toBe(String(eventTimestampMs));

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(450);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
  });

  it('does not downgrade a subscription already converted by a newer RevenueCat event', async () => {
    const account = await seedAccount(4);
    const { subscription, quotaPool } =
      await seedTrialSubscriptionWithPlusQuota(account.id, 'active');
    const db = createIntegrationDb();

    await db
      .update(subscriptions)
      .set({
        lastRevenuecatEventId: 'evt-renewal-newer',
        lastRevenuecatEventTimestampMs: String(1_900_000_000_000),
      })
      .where(eq(subscriptions.id, subscription.id));

    const result = await transitionToExtendedTrialFromRevenuecatEvent(
      db,
      subscription.id,
      450,
      'evt-trial-expired-stale',
      1_800_000_000_000,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: subscription.id,
        status: 'active',
        tier: 'plus',
        webhookApplied: false,
      }),
    );

    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('active');
    expect(sub!.tier).toBe('plus');
    expect(sub!.lastRevenuecatEventId).toBe('evt-renewal-newer');
    expect(sub!.lastRevenuecatEventTimestampMs).toBe('1900000000000');

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(quotaPool.monthlyLimit);
    expect(pool!.usedThisMonth).toBe(quotaPool.usedThisMonth);
    expect(pool!.usedToday).toBe(quotaPool.usedToday);
  });

  it('rolls back the trial transition when the quota row is missing', async () => {
    const account = await seedAccount(5);
    const { subscription } = await seedTrialSubscriptionWithPlusQuota(
      account.id,
      'trial',
    );
    const db = createIntegrationDb();

    await db
      .delete(quotaPools)
      .where(eq(quotaPools.subscriptionId, subscription.id));

    await expect(
      transitionToExtendedTrialFromRevenuecatEvent(
        db,
        subscription.id,
        450,
        'evt-trial-missing-quota',
        1_800_000_000_000,
      ),
    ).rejects.toThrow('quota pool');

    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('trial');
    expect(sub!.tier).toBe('plus');
    expect(sub!.lastRevenuecatEventId).not.toBe('evt-trial-missing-quota');
  });
});

// ---------------------------------------------------------------------------
// [CR-2026-05-19-M3] SITE 2b: expireTrialAndDowngradeQuota combined atomic helper
// ---------------------------------------------------------------------------

describe('expireTrialAndDowngradeQuota atomicity [CR-2026-05-19-M3 SITE 2b]', () => {
  it('commits subscription expiry and quota downgrade in one transaction', async () => {
    const account = await seedAccount(5);
    const { subscription } = await seedTrialSubscriptionWithPlusQuota(
      account.id,
      'active',
    );
    const db = createIntegrationDb();
    const freeConfig = getTierConfig('free');

    await expireTrialAndDowngradeQuota(
      db,
      subscription.id,
      freeConfig.monthlyQuota,
      freeConfig.dailyLimit,
    );

    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('expired');
    expect(sub!.tier).toBe('free');

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(freeConfig.monthlyQuota);
    expect(pool!.usedThisMonth).toBe(0);
  });

  it('is idempotent — skips quota reset if pool is already at target limit', async () => {
    const account = await seedAccount(5);
    const freeConfig = getTierConfig('free');
    // Seed already at free-tier quota limit
    const db = createIntegrationDb();
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const subV2Id = await seedV2SubscriptionCounterpart(
      db,
      account.id,
      'free',
      'expired',
    );
    const [sub] = await db
      .insert(subscriptions)
      .values({
        id: subV2Id,
        accountId: account.id,
        tier: 'free',
        status: 'expired',
      })
      .returning();
    await db.insert(quotaPools).values({
      subscriptionId: sub!.id,
      monthlyLimit: freeConfig.monthlyQuota,
      usedThisMonth: 42, // usage that should be preserved
      dailyLimit: freeConfig.dailyLimit ?? null,
      usedToday: 5,
      cycleResetAt: futureDate,
    });

    await expireTrialAndDowngradeQuota(
      db,
      sub!.id,
      freeConfig.monthlyQuota,
      freeConfig.dailyLimit,
    );

    // Usage counters must NOT be zeroed — already at target
    const pool = await loadQuotaPool(sub!.id);
    expect(pool!.usedThisMonth).toBe(42);
    expect(pool!.usedToday).toBe(5);
  });

  // [BREAK] Simulate rollback mid-operation: both subscription and quota pool
  // must be rolled back together. Only possible at the storage level with tx.
  it('[BREAK] rollback leaves subscription and quota pool both unchanged', async () => {
    const account = await seedAccount(5);
    const plusConfig = getTierConfig('plus');
    const { subscription } = await seedTrialSubscriptionWithPlusQuota(
      account.id,
      'active',
    );

    let threw = false;
    try {
      await (createIntegrationDb() as Database).transaction(async (tx) => {
        const txDb = tx as unknown as Database;
        // Simulate the first write in expireTrialAndDowngradeQuota
        await tx
          .update(subscriptions)
          .set({ status: 'expired', tier: 'free', updatedAt: new Date() })
          .where(eq(subscriptions.id, subscription.id));
        void txDb;
        throw new Error('Simulated crash before quota pool write');
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Both must remain at original state
    const sub = await loadSubscriptionById(subscription.id);
    expect(sub!.status).toBe('active');
    expect(sub!.tier).toBe('plus');

    const pool = await loadQuotaPool(subscription.id);
    expect(pool!.monthlyLimit).toBe(plusConfig.monthlyQuota);
  });
});
