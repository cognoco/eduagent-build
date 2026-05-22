/**
 * Integration: RevenueCat webhook helpers
 *
 * Covers:
 *   - isRevenuecatEventProcessed: exact-duplicate, stale timestamp, fresh event
 *   - updateSubscriptionFromRevenuecatWebhook: BD-01 event stamp; invalid
 *     status transition (logged + no throw)
 *   - activateSubscriptionFromRevenuecat: creates sub + quota pool; trial with
 *     trialEndsAt (BD-03); graceful fallback when isTrial=true but trialEndsAt
 *     is missing; updates existing quota pool to new tier
 *
 * No mocks of internal services or database — external boundaries only (Sentry
 * and logger are genuine external I/O boundaries and are not exercised by these
 * tests).
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

import {
  isRevenuecatEventProcessed,
  updateSubscriptionFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
} from './revenuecat';
import { getTierConfig } from '../subscription';

// ---------------------------------------------------------------------------
// DB setup — real connection, same pattern as trial.integration.test.ts
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

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Seed helpers — unique prefix so parallel test runs don't collide
// ---------------------------------------------------------------------------

const PREFIX = 'integration-revenuecat';
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-01`, email: `${PREFIX}-01@integration.test` },
  { clerkUserId: `${PREFIX}-02`, email: `${PREFIX}-02@integration.test` },
  { clerkUserId: `${PREFIX}-03`, email: `${PREFIX}-03@integration.test` },
  { clerkUserId: `${PREFIX}-04`, email: `${PREFIX}-04@integration.test` },
  { clerkUserId: `${PREFIX}-05`, email: `${PREFIX}-05@integration.test` },
  { clerkUserId: `${PREFIX}-06`, email: `${PREFIX}-06@integration.test` },
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

async function seedSubscription(
  accountId: string,
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(subscriptions)
    .values({
      accountId,
      tier: 'plus',
      status: 'active',
      ...overrides,
    })
    .returning();
  return row!;
}

async function seedSubscriptionWithQuota(
  accountId: string,
  tier: 'free' | 'plus' | 'family' | 'pro' = 'plus',
  subscriptionOverrides: Partial<typeof subscriptions.$inferInsert> = {},
) {
  const db = createIntegrationDb();
  const tierConfig = getTierConfig(tier);
  const [sub] = await db
    .insert(subscriptions)
    .values({ accountId, tier, status: 'active', ...subscriptionOverrides })
    .returning();
  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
  const [pool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: sub!.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit ?? null,
      usedToday: 0,
      cycleResetAt,
    })
    .returning();
  return { subscription: sub!, quotaPool: pool! };
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
// isRevenuecatEventProcessed
// ---------------------------------------------------------------------------

describe('isRevenuecatEventProcessed (integration)', () => {
  it('returns false when no subscription exists', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    const result = await isRevenuecatEventProcessed(
      db,
      account.id,
      'evt-fresh-001',
      Date.now(),
    );
    expect(result).toBe(false);
  });

  it('returns true for exact same eventId (duplicate delivery)', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    const eventId = 'evt-dup-001';
    await seedSubscription(account.id, { lastRevenuecatEventId: eventId });

    const result = await isRevenuecatEventProcessed(db, account.id, eventId);
    expect(result).toBe(true);
  });

  it('returns true when eventTimestampMs is older than persisted timestamp (stale retry)', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    const persistedTs = 1_700_000_000_000; // newer
    const staleTs = persistedTs - 10_000; // older
    await seedSubscription(account.id, {
      lastRevenuecatEventId: 'evt-newer',
      lastRevenuecatEventTimestampMs: String(persistedTs),
    });

    const result = await isRevenuecatEventProcessed(
      db,
      account.id,
      'evt-stale',
      staleTs,
    );
    expect(result).toBe(true);
  });

  it('returns false for a fresh event with a newer timestamp', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    const persistedTs = 1_700_000_000_000;
    const freshTs = persistedTs + 10_000; // newer than persisted
    await seedSubscription(account.id, {
      lastRevenuecatEventId: 'evt-old',
      lastRevenuecatEventTimestampMs: String(persistedTs),
    });

    const result = await isRevenuecatEventProcessed(
      db,
      account.id,
      'evt-new',
      freshTs,
    );
    expect(result).toBe(false);
  });

  it('returns false when eventTimestampMs is omitted even if eventId differs', async () => {
    const account = await seedAccount(0);
    const db = createIntegrationDb();
    await seedSubscription(account.id, {
      lastRevenuecatEventId: 'evt-previous',
      lastRevenuecatEventTimestampMs: String(1_700_000_000_000),
    });

    // No timestamp provided — only ID check applies; different ID → not processed
    const result = await isRevenuecatEventProcessed(
      db,
      account.id,
      'evt-new-no-ts',
    );
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSubscriptionFromRevenuecatWebhook
// ---------------------------------------------------------------------------

describe('updateSubscriptionFromRevenuecatWebhook (integration) [BD-01]', () => {
  it('returns null when no subscription exists', async () => {
    const account = await seedAccount(1);
    const db = createIntegrationDb();
    const result = await updateSubscriptionFromRevenuecatWebhook(
      db,
      account.id,
      { eventId: 'evt-no-sub', eventTimestampMs: Date.now() },
    );
    expect(result).toBeNull();
  });

  it('writes lastRevenuecatEventId and lastRevenuecatEventTimestampMs (BD-01)', async () => {
    const account = await seedAccount(1);
    await seedSubscription(account.id);
    const db = createIntegrationDb();
    const eventId = 'evt-bd01-write';
    const eventTimestampMs = 1_710_000_000_000;

    const result = await updateSubscriptionFromRevenuecatWebhook(
      db,
      account.id,
      { eventId, eventTimestampMs },
    );

    expect(result).not.toBeNull();

    const row = await loadSubscription(account.id);
    expect(row!.lastRevenuecatEventId).toBe(eventId);
    expect(row!.lastRevenuecatEventTimestampMs).toBe(String(eventTimestampMs));
  });

  it('updates tier and status fields when provided', async () => {
    const account = await seedAccount(1);
    await seedSubscription(account.id, { tier: 'plus', status: 'active' });
    const db = createIntegrationDb();

    const result = await updateSubscriptionFromRevenuecatWebhook(
      db,
      account.id,
      {
        eventId: 'evt-update-fields',
        tier: 'family',
        currentPeriodStart: '2026-05-01T00:00:00.000Z',
        currentPeriodEnd: '2026-06-01T00:00:00.000Z',
      },
    );

    expect(result!.tier).toBe('family');
    expect(result!.currentPeriodStart).toBe('2026-05-01T00:00:00.000Z');
    expect(result!.currentPeriodEnd).toBe('2026-06-01T00:00:00.000Z');
  });

  it('writes without eventTimestampMs when it is omitted', async () => {
    const account = await seedAccount(1);
    await seedSubscription(account.id);
    const db = createIntegrationDb();
    const eventId = 'evt-no-ts';

    const result = await updateSubscriptionFromRevenuecatWebhook(
      db,
      account.id,
      { eventId },
    );

    expect(result).not.toBeNull();
    const row = await loadSubscription(account.id);
    expect(row!.lastRevenuecatEventId).toBe(eventId);
    // Timestamp column should remain null (not set when omitted)
    expect(row!.lastRevenuecatEventTimestampMs).toBeNull();
  });

  // [BUG-447] BREAK TEST: invalid status transition must throw so callers
  // (handleRenewal, handleProductChange) do NOT proceed to updateQuotaPoolLimit.
  // Pre-fix, the function returned the existing row (callers treated it as
  // success). Post-fix, it throws — callers catch the error via their own
  // error boundary or the webhook 500 path, and quota pool is never updated.
  it('[BUG-447] throws on invalid status transition so quota pool stays coherent', async () => {
    const account = await seedAccount(1);
    // 'expired' → 'active' is invalid per the state machine
    const { subscription } = await seedSubscriptionWithQuota(
      account.id,
      'plus',
      {
        status: 'expired',
      },
    );
    const db = createIntegrationDb();

    const poolBefore = await loadQuotaPool(subscription.id);
    const limitBefore = poolBefore!.monthlyLimit;

    // Must throw — callers must NOT proceed to updateQuotaPoolLimit
    await expect(
      updateSubscriptionFromRevenuecatWebhook(db, account.id, {
        eventId: 'evt-bad-transition',
        tier: 'family', // attempting tier+status change
        status: 'active', // expired -> active is invalid
      }),
    ).rejects.toThrow(/Invalid subscription transition/);

    // Status must remain 'expired' — the invalid transition was refused
    const row = await loadSubscription(account.id);
    expect(row!.status).toBe('expired');

    // Quota pool must remain at the original limit — the throw prevented any
    // updateQuotaPoolLimit call that a caller would have made for 'family' tier
    const poolAfter = await loadQuotaPool(subscription.id);
    expect(poolAfter!.monthlyLimit).toBe(limitBefore);
  });

  it('sets cancelledAt when cancelledAt is provided', async () => {
    const account = await seedAccount(1);
    await seedSubscription(account.id, { status: 'active' });
    const db = createIntegrationDb();
    const cancelledAt = '2026-06-01T12:00:00.000Z';

    await updateSubscriptionFromRevenuecatWebhook(db, account.id, {
      eventId: 'evt-cancel',
      cancelledAt,
    });

    const row = await loadSubscription(account.id);
    expect(row!.cancelledAt?.toISOString()).toBe(cancelledAt);
  });

  it('clears cancelledAt when cancelledAt is null', async () => {
    const account = await seedAccount(1);
    const cancelledDate = new Date('2026-05-01T00:00:00.000Z');
    await seedSubscription(account.id, { cancelledAt: cancelledDate });
    const db = createIntegrationDb();

    await updateSubscriptionFromRevenuecatWebhook(db, account.id, {
      eventId: 'evt-uncancel',
      cancelledAt: null,
    });

    const row = await loadSubscription(account.id);
    expect(row!.cancelledAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// activateSubscriptionFromRevenuecat
// ---------------------------------------------------------------------------

describe('activateSubscriptionFromRevenuecat (integration)', () => {
  it('creates a new subscription + quota pool when none exists', async () => {
    const account = await seedAccount(2);
    const db = createIntegrationDb();
    const eventId = 'evt-create-001';

    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      eventId,
    );

    expect(result.tier).toBe('plus');
    expect(result.status).toBe('active');
    expect(result.accountId).toBe(account.id);

    // Verify quota pool was created
    const row = await loadSubscription(account.id);
    const pool = await loadQuotaPool(row!.id);
    expect(pool).not.toBeNull();

    const tierConfig = getTierConfig('plus');
    expect(pool!.monthlyLimit).toBe(tierConfig.monthlyQuota);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
  });

  it('writes lastRevenuecatEventId on new subscription', async () => {
    const account = await seedAccount(2);
    const db = createIntegrationDb();
    const eventId = 'evt-new-event-id';

    await activateSubscriptionFromRevenuecat(db, account.id, 'plus', eventId);

    const row = await loadSubscription(account.id);
    expect(row!.lastRevenuecatEventId).toBe(eventId);
  });

  it('writes lastRevenuecatEventTimestampMs on new subscription when provided', async () => {
    const account = await seedAccount(2);
    const db = createIntegrationDb();
    const eventTimestampMs = 1_720_000_000_000;

    await activateSubscriptionFromRevenuecat(db, account.id, 'plus', 'evt-ts', {
      eventTimestampMs,
    });

    const row = await loadSubscription(account.id);
    expect(row!.lastRevenuecatEventTimestampMs).toBe(String(eventTimestampMs));
  });

  it('[BD-03] sets status to trial and persists trialEndsAt when isTrial=true', async () => {
    const account = await seedAccount(3);
    const db = createIntegrationDb();
    const trialEndsAt = '2026-07-01T00:00:00.000Z';

    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-trial',
      { isTrial: true, trialEndsAt },
    );

    expect(result.status).toBe('trial');
    expect(result.trialEndsAt).toBe(trialEndsAt);

    const row = await loadSubscription(account.id);
    expect(row!.status).toBe('trial');
    expect(row!.trialEndsAt?.toISOString()).toBe(trialEndsAt);
  });

  it('[BD-03] gracefully falls back to non-trial when isTrial=true but trialEndsAt is missing', async () => {
    const account = await seedAccount(3);
    const db = createIntegrationDb();

    // Should not throw — falls back to active
    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-trial-no-ends',
      { isTrial: true, trialEndsAt: undefined },
    );

    expect(result.status).toBe('active');
    expect(result.trialEndsAt).toBeNull();
  });

  it('updates existing subscription tier and writes event stamp', async () => {
    const account = await seedAccount(4);
    await seedSubscriptionWithQuota(account.id, 'plus');
    const db = createIntegrationDb();
    const eventId = 'evt-upgrade';

    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'family',
      eventId,
    );

    expect(result.tier).toBe('family');
    expect(result.status).toBe('active');

    const row = await loadSubscription(account.id);
    expect(row!.lastRevenuecatEventId).toBe(eventId);
    expect(row!.tier).toBe('family');
  });

  it('updates quota pool to new tier limits when subscription already exists', async () => {
    const account = await seedAccount(4);
    const { subscription } = await seedSubscriptionWithQuota(
      account.id,
      'plus',
    );
    const db = createIntegrationDb();

    await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'family',
      'evt-upgrade-quota',
    );

    const pool = await loadQuotaPool(subscription.id);
    const familyConfig = getTierConfig('family');
    expect(pool!.monthlyLimit).toBe(familyConfig.monthlyQuota);
  });

  it('existing subscription: clears trialEndsAt on non-trial activation (BD-02)', async () => {
    const account = await seedAccount(5);
    const trialEndDate = new Date('2026-07-01T00:00:00.000Z');
    await seedSubscriptionWithQuota(account.id, 'plus', {
      status: 'trial',
      trialEndsAt: trialEndDate,
    });
    const db = createIntegrationDb();

    // Non-trial activation should clear trialEndsAt
    const result = await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-non-trial',
      { isTrial: false },
    );

    expect(result.status).toBe('active');
    expect(result.trialEndsAt).toBeNull();

    const row = await loadSubscription(account.id);
    expect(row!.trialEndsAt).toBeNull();
  });

  it('stores revenuecatOriginalAppUserId on new subscription when provided', async () => {
    const account = await seedAccount(5);
    const db = createIntegrationDb();
    const revenuecatOriginalAppUserId = 'rc-user-abc123';

    await activateSubscriptionFromRevenuecat(
      db,
      account.id,
      'plus',
      'evt-rc-uid',
      {
        revenuecatOriginalAppUserId,
      },
    );

    const row = await loadSubscription(account.id);
    expect(row!.revenuecatOriginalAppUserId).toBe(revenuecatOriginalAppUserId);
  });
});
