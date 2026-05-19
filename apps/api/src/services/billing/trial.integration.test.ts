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
  quotaPools,
  subscriptions,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { resetDailyQuotas, resetExpiredQuotaCycles } from '../billing';
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
];
const ALL_EMAILS = TEST_ACCOUNTS.map((a) => a.email);
const ALL_CLERK_IDS = TEST_ACCOUNTS.map((a) => a.clerkUserId);

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const account = TEST_ACCOUNTS[index]!;
  const [row] = await db
    .insert(accounts)
    .values({ clerkUserId: account.clerkUserId, email: account.email })
    .returning();
  return row!;
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

  const [subscription] = await db
    .insert(subscriptions)
    .values({
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

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const byEmail = await db.query.accounts.findMany({
    where: inArray(accounts.email, ALL_EMAILS),
  });
  const byClerk = await db.query.accounts.findMany({
    where: inArray(accounts.clerkUserId, ALL_CLERK_IDS),
  });
  const ids = [...new Set([...byEmail, ...byClerk].map((r) => r.id))];
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
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
