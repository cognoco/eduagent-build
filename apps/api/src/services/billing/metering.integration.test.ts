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

import {
  decrementQuota,
  incrementQuota,
  type DecrementResult,
} from '../billing';
import { getTierConfig } from '../subscription';

// ---------------------------------------------------------------------------
// DB setup — real connection, same pattern as tests/integration/helpers.ts
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
// Unique e-mail / clerkUserId prefixes so parallel test runs don't collide
// ---------------------------------------------------------------------------

const PREFIX = 'integration-metering';
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-01`, email: `${PREFIX}-01@integration.test` },
  { clerkUserId: `${PREFIX}-02`, email: `${PREFIX}-02@integration.test` },
  { clerkUserId: `${PREFIX}-03`, email: `${PREFIX}-03@integration.test` },
  { clerkUserId: `${PREFIX}-04`, email: `${PREFIX}-04@integration.test` },
  { clerkUserId: `${PREFIX}-05`, email: `${PREFIX}-05@integration.test` },
  { clerkUserId: `${PREFIX}-06`, email: `${PREFIX}-06@integration.test` },
  { clerkUserId: `${PREFIX}-07`, email: `${PREFIX}-07@integration.test` },
  { clerkUserId: `${PREFIX}-08`, email: `${PREFIX}-08@integration.test` },
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
          ? (tierConfig.dailyLimit ?? null)
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
      seeded.subscription.id,
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
      seeded.subscription.id,
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
      seeded.subscription.id,
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

  // [BREAK / S-2 / BUG-627] Concurrent top-up decrements MUST NOT bypass the
  // daily cap. Pre-fix: two concurrent calls both passed the snapshot check
  // at usedToday=dailyLimit-1, both consumed a top-up credit, both unguarded-
  // updated usedToday +1 — ending at dailyLimit+1 (silent cap bypass).
  // Post-fix: only one succeeds; the others get daily_exceeded and their
  // top-up decrements are rolled back.
  it('[BREAK] concurrent top-up consumers do not bypass daily cap', async () => {
    const account = await seedAccount(5);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 10,
      usedThisMonth: 10, // monthly exhausted — forces top-up path
      dailyLimit: 2,
      usedToday: 1, // one slot left under daily cap
    });
    await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    // Fire 3 concurrent decrements. With usedToday=1 / dailyLimit=2 only
    // ONE should be admitted before the cap is hit.
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        decrementQuota(createIntegrationDb(), seeded.subscription.id),
      ),
    );

    const successes = results.filter((r: DecrementResult) => r.success);
    const dailyExceeded = results.filter(
      (r: DecrementResult) => r.source === 'daily_exceeded',
    );

    expect(successes).toHaveLength(1);
    expect(dailyExceeded).toHaveLength(2);

    // usedToday must be exactly dailyLimit (2), not dailyLimit+N.
    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedToday).toBe(2);

    // Top-up was rolled back for the 2 losers — only 1 credit consumed.
    const topUps = await loadTopUps(seeded.subscription.id);
    expect(topUps[0]!.remaining).toBe(4);
  });

  // [BREAK / CR-2026-05-19-C6] Top-up consumption followed by LLM-failure refund
  // MUST credit the top-up batch, not decrement the monthly pool. Pre-fix:
  // incrementQuota unconditionally ran `usedThisMonth = GREATEST(usedThisMonth - 1, 0)`
  // — so every LLM failure on a top-up consumption inflated the monthly pool by 1.
  it('[BREAK CR-2026-05-19-C6] LLM-failure refund after top-up consumption credits top-up, not monthly', async () => {
    const account = await seedAccount(6);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 10,
      usedThisMonth: 10, // monthly exhausted — forces top-up path
      dailyLimit: null,
      usedToday: 3,
    });
    const topUp = await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    // Consume one top-up credit
    const decrement = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );
    expect(decrement.success).toBe(true);
    expect(decrement.source).toBe('top_up');
    expect(decrement.topUpCreditId).toBe(topUp.id);

    let pool = await loadQuotaPool(seeded.subscription.id);
    let topUps = await loadTopUps(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(10); // unchanged
    expect(pool!.usedToday).toBe(4);
    expect(topUps[0]!.remaining).toBe(4);

    // Simulate LLM failure → refund. Caller threads source + id back.
    await incrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
      undefined,
      { source: decrement.source, topUpCreditId: decrement.topUpCreditId },
    );

    pool = await loadQuotaPool(seeded.subscription.id);
    topUps = await loadTopUps(seeded.subscription.id);

    // Monthly pool MUST NOT have been inflated.
    expect(pool!.usedThisMonth).toBe(10);
    // Daily counter rolled back (the slot is freed).
    expect(pool!.usedToday).toBe(3);
    // Top-up batch was credited back.
    expect(topUps[0]!.remaining).toBe(5);
  });

  // [REGRESSION / CR-2026-05-19-C6] Legacy callers that omit `source` still
  // refund the monthly pool (back-compat) — they were the only refund path
  // before the fix and shouldn't break.
  it('[CR-2026-05-19-C6] legacy refund without source falls back to monthly pool', async () => {
    const account = await seedAccount(7);
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      monthlyLimit: 10,
      usedThisMonth: 5,
      usedToday: 2,
    });

    await incrementQuota(createIntegrationDb(), seeded.subscription.id);

    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(4);
    expect(pool!.usedToday).toBe(1);
  });

  // [BREAK CR-2026-05-19-M11] Daily-cap discrimination must use the in-transaction
  // pool snapshot, not a second out-of-transaction read. Pre-fix: if a daily-reset
  // cron fired between the monthly UPDATE (which fails) and the separate re-read,
  // usedToday would flip to 0, making the caller fall through to the top-up path
  // even though the daily cap was hit. Post-fix: the re-read is inside the same
  // transaction as the UPDATE attempt, so it sees the same consistent snapshot —
  // daily cap = hit → daily_exceeded, not top_up.
  //
  // This test covers the state that WOULD have been misread pre-fix:
  // usedToday >= dailyLimit (cap hit) AND usedThisMonth >= monthlyLimit (monthly
  // exhausted) AND a top-up is available. If the pool snapshot were re-read
  // outside the tx with usedToday=0 the test would instead return top_up.
  it('[BREAK CR-2026-05-19-M11] daily-cap discrimination uses in-transaction pool snapshot (cron-race safety)', async () => {
    const freeTier = getTierConfig('free');
    const dailyLimit = freeTier.dailyLimit!;
    const monthlyLimit = freeTier.monthlyQuota;

    const account = await seedAccount(0); // reuse slot 0 — cleaned in beforeEach
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'free',
      monthlyLimit,
      usedThisMonth: monthlyLimit, // monthly exhausted
      dailyLimit,
      usedToday: dailyLimit, // daily cap already hit
    });
    // A top-up is available — if the re-read race fires, this would be consumed
    await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );

    // Must be daily_exceeded — NOT top_up (which would happen if usedToday were
    // misread as 0 by an out-of-transaction re-read racing with the daily-reset cron).
    expect(result.success).toBe(false);
    expect(result.source).toBe('daily_exceeded');

    // Top-up credit must be untouched (not consumed by the wrong branch).
    const topUps = await loadTopUps(seeded.subscription.id);
    expect(topUps[0]!.remaining).toBe(5);
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
        decrementQuota(createIntegrationDb(), seeded.subscription.id),
      ),
    );

    const successes = results.filter((r: DecrementResult) => r.success);
    const failures = results.filter((r: DecrementResult) => !r.success);

    // Exactly 1 of the 5 concurrent calls should succeed
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);

    // Verify the quota pool was only decremented once
    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(1);
  });
});
