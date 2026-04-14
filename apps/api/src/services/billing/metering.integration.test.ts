/**
 * Integration: Quota Metering (STAB-3.2)
 *
 * Exercises decrementQuota / incrementQuota against a real database.
 * No mocks of internal services or database — external boundaries only
 * (Stripe / RevenueCat are not touched by these functions).
 *
 * Each test seeds its own data and cleans up in beforeEach / afterAll.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  quotaPools,
  subscriptions,
  topUpCredits,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { decrementQuota, incrementQuota } from '../billing';
import { getTierConfig } from '../subscription';

// ---------------------------------------------------------------------------
// DB setup — real connection, same pattern as tests/integration/helpers.ts
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.'
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Unique e-mail / clerkUserId prefixes so parallel test runs don't collide
// ---------------------------------------------------------------------------

const PREFIX = 'integration-metering';
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-01`, email: `${PREFIX}-01@integration.test` },
  { clerkUserId: `${PREFIX}-02`, email: `${PREFIX}-02@integration.test` },
  { clerkUserId: `${PREFIX}-03`, email: `${PREFIX}-03@integration.test` },
  { clerkUserId: `${PREFIX}-04`, email: `${PREFIX}-04@integration.test` },
  { clerkUserId: `${PREFIX}-05`, email: `${PREFIX}-05@integration.test` },
];

const ALL_EMAILS = TEST_ACCOUNTS.map((a) => a.email);
const ALL_CLERK_IDS = TEST_ACCOUNTS.map((a) => a.clerkUserId);

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

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
  monthlyLimit?: number;
  usedThisMonth?: number;
  dailyLimit?: number | null;
  usedToday?: number;
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

  return { subscription: subscription!, quotaPool: quotaPool! };
}

async function seedTopUpCredit(input: {
  subscriptionId: string;
  amount: number;
  remaining?: number;
  expiresAt?: Date;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(topUpCredits)
    .values({
      subscriptionId: input.subscriptionId,
      amount: input.amount,
      remaining: input.remaining ?? input.amount,
      purchasedAt: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: input.expiresAt ?? new Date('2027-04-01T00:00:00.000Z'),
    })
    .returning();
  return row!;
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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Quota metering (integration)', () => {
  it('decrements monthly quota atomically', async () => {
    const account = await seedAccount(0);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 10,
      usedThisMonth: 5,
      dailyLimit: null,
      usedToday: 0,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id
    );
    const pool = await loadQuotaPool(seeded.subscription.id);

    expect(result.success).toBe(true);
    expect(result.source).toBe('monthly');
    expect(pool!.usedThisMonth).toBe(6);
    expect(pool!.usedToday).toBe(1);
  });

  it('enforces daily cap', async () => {
    const freeTier = getTierConfig('free');
    const account = await seedAccount(1);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'free',
      monthlyLimit: freeTier.monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: freeTier.dailyLimit,
      usedToday: freeTier.dailyLimit!,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id
    );
    const pool = await loadQuotaPool(seeded.subscription.id);

    expect(result.success).toBe(false);
    expect(result.source).toBe('daily_exceeded');
    expect(result.remainingDaily).toBe(0);
    // Usage counters must NOT have changed
    expect(pool!.usedToday).toBe(freeTier.dailyLimit);
  });

  it('falls back to top-up credits when monthly quota exhausted', async () => {
    const account = await seedAccount(2);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 10,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 3,
    });
    await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id
    );
    const topUps = await loadTopUps(seeded.subscription.id);

    expect(result.success).toBe(true);
    expect(result.source).toBe('top_up');
    expect(topUps[0]!.remaining).toBe(4);
    // Monthly counter must NOT have changed
    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(10);
  });

  it('increments quota back on LLM failure (no underflow)', async () => {
    const account = await seedAccount(3);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 10,
      usedThisMonth: 0,
      usedToday: 0,
    });

    // incrementQuota when usedThisMonth=0 must not go below 0 (GREATEST guard)
    await incrementQuota(createIntegrationDb(), seeded.subscription.id);

    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
  });

  it('concurrent decrements do not over-consume', async () => {
    // Set remaining=1 → fire 5 concurrent decrementQuota calls
    // Exactly 1 should succeed, 4 should get quota_exceeded
    const account = await seedAccount(4);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 1,
      usedThisMonth: 0,
      dailyLimit: null,
      usedToday: 0,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        decrementQuota(createIntegrationDb(), seeded.subscription.id)
      )
    );

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Exactly 1 of the 5 concurrent calls should succeed
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);

    // Verify the quota pool was only decremented once
    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(1);
  });
});
