/**
 * Integration: subscription-core.ts — full public surface coverage
 *
 * Covers: getSubscriptionByAccountId, createSubscription,
 * updateSubscriptionFromWebhook, linkStripeCustomer, getQuotaPool,
 * resetMonthlyQuota, ensureFreeSubscription, markSubscriptionCancelled,
 * updateQuotaPoolLimit, activateSubscriptionFromCheckout
 *
 * No mocks of internal services or database — real DB only.
 * External-boundary Sentry calls are left real (no-op without DSN).
 * safeSend / Inngest dispatch errors are swallowed by safeSend itself
 * (no DSN / event key in test env → non-fatal).
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
  getSubscriptionByAccountId,
  createSubscription,
  updateSubscriptionFromWebhook,
  linkStripeCustomer,
  getQuotaPool,
  resetMonthlyQuota,
  ensureFreeSubscription,
  markSubscriptionCancelled,
  updateQuotaPoolLimit,
  activateSubscriptionFromCheckout,
} from './subscription-core';
import { getTierConfig } from '../subscription';

// ---------------------------------------------------------------------------
// DB setup — matches canonical pattern in trial.integration.test.ts
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
// Seed helpers — unique prefix to avoid parallel-test collisions
// ---------------------------------------------------------------------------

const PREFIX = 'integration-subcore';

// Keep a registry so cleanupTestAccounts() can sweep everything this file
// inserted, regardless of test order or failure mid-test.
const ALL_EMAILS: string[] = [];
const ALL_CLERK_IDS: string[] = [];

function makeAccount(tag: string) {
  const clerkUserId = `${PREFIX}-${tag}`;
  const email = `${PREFIX}-${tag}@integration.test`;
  ALL_EMAILS.push(email);
  ALL_CLERK_IDS.push(clerkUserId);
  return { clerkUserId, email };
}

async function seedAccount(tag: string) {
  const db = createIntegrationDb();
  const acct = makeAccount(tag);
  const [row] = await db
    .insert(accounts)
    .values({ clerkUserId: acct.clerkUserId, email: acct.email })
    .returning();
  return row!;
}

async function cleanupTestAccounts() {
  if (ALL_EMAILS.length === 0) return;
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
// getSubscriptionByAccountId
// ---------------------------------------------------------------------------

describe('getSubscriptionByAccountId', () => {
  it('returns null when no subscription exists', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('get-missing');
    const result = await getSubscriptionByAccountId(db, acct.id);
    expect(result).toBeNull();
  });

  it('returns the subscription row when one exists', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('get-happy');
    // seed subscription directly
    const tierConfig = getTierConfig('free');
    await db.insert(subscriptions).values({
      accountId: acct.id,
      tier: 'free',
      status: 'active',
    });
    await db.insert(quotaPools).values({
      subscriptionId: (await db.query.subscriptions.findFirst({
        where: eq(subscriptions.accountId, acct.id),
      }))!.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: 0,
      cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const result = await getSubscriptionByAccountId(db, acct.id);
    expect(result).not.toBeNull();
    expect(result!.accountId).toBe(acct.id);
    expect(result!.tier).toBe('free');
    expect(result!.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// ensureFreeSubscription
// ---------------------------------------------------------------------------

describe('ensureFreeSubscription', () => {
  it('creates a free subscription + quota pool for a new account', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('ensure-new');

    const sub = await ensureFreeSubscription(db, acct.id);

    expect(sub.tier).toBe('free');
    expect(sub.status).toBe('active');
    expect(sub.accountId).toBe(acct.id);

    // Quota pool created
    const pool = await db.query.quotaPools.findFirst({
      where: eq(quotaPools.subscriptionId, sub.id),
    });
    expect(pool).not.toBeNull();
    expect(pool!.monthlyLimit).toBe(getTierConfig('free').monthlyQuota);
    expect(pool!.usedThisMonth).toBe(0);
  });

  it('is idempotent — sequential calls return the same subscription ID', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('ensure-idempotent');

    const first = await ensureFreeSubscription(db, acct.id);
    const second = await ensureFreeSubscription(db, acct.id);

    expect(second.id).toBe(first.id);
    expect(second.tier).toBe('free');

    // Only one subscription row must exist
    const rows = await db.query.subscriptions.findMany({
      where: eq(subscriptions.accountId, acct.id),
    });
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createSubscription
// ---------------------------------------------------------------------------

describe('createSubscription', () => {
  it('creates a subscription row and quota pool atomically', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('create-happy');
    const tierConfig = getTierConfig('plus');

    const sub = await createSubscription(
      db,
      acct.id,
      'plus',
      tierConfig.monthlyQuota,
    );

    expect(sub.accountId).toBe(acct.id);
    expect(sub.tier).toBe('plus');
    expect(sub.status).toBe('trial'); // default when no options provided

    const pool = await db.query.quotaPools.findFirst({
      where: eq(quotaPools.subscriptionId, sub.id),
    });
    expect(pool).not.toBeNull();
    expect(pool!.monthlyLimit).toBe(tierConfig.monthlyQuota);
    expect(pool!.dailyLimit).toBe(tierConfig.dailyLimit);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
  });

  it('applies optional status, stripeCustomerId, stripeSubscriptionId', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('create-options');

    const sub = await createSubscription(
      db,
      acct.id,
      'plus',
      getTierConfig('plus').monthlyQuota,
      {
        status: 'active',
        stripeCustomerId: 'cus_test_001',
        stripeSubscriptionId: 'sub_test_001',
      },
    );

    expect(sub.status).toBe('active');
    expect(sub.stripeCustomerId).toBe('cus_test_001');
    expect(sub.stripeSubscriptionId).toBe('sub_test_001');
  });

  it('applies correct tier config for family tier', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('create-family');
    const tierConfig = getTierConfig('family');

    const sub = await createSubscription(
      db,
      acct.id,
      'family',
      tierConfig.monthlyQuota,
    );

    const pool = await db.query.quotaPools.findFirst({
      where: eq(quotaPools.subscriptionId, sub.id),
    });
    expect(pool!.monthlyLimit).toBe(1500);
    expect(pool!.dailyLimit).toBeNull(); // family has no daily limit
  });
});

// ---------------------------------------------------------------------------
// updateSubscriptionFromWebhook
// ---------------------------------------------------------------------------

describe('updateSubscriptionFromWebhook', () => {
  it('returns null when no subscription with the given Stripe ID exists', async () => {
    const db = createIntegrationDb();
    const result = await updateSubscriptionFromWebhook(
      db,
      'sub_nonexistent_xyz',
      {
        lastStripeEventTimestamp: new Date().toISOString(),
        status: 'active',
      },
    );
    expect(result).toBeNull();
  });

  it('updates a subscription from a valid webhook event', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('webhook-update');
    const sub = await createSubscription(
      db,
      acct.id,
      'plus',
      getTierConfig('plus').monthlyQuota,
      { status: 'trial', stripeSubscriptionId: 'sub_webhook_001' },
    );

    const ts = new Date('2026-06-01T10:00:00.000Z').toISOString();
    const updated = await updateSubscriptionFromWebhook(db, 'sub_webhook_001', {
      status: 'active',
      lastStripeEventTimestamp: ts,
      currentPeriodStart: new Date('2026-06-01T00:00:00.000Z').toISOString(),
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z').toISOString(),
    });

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(sub.id);
    expect(updated!.status).toBe('active');
    expect(updated!.lastStripeEventTimestamp).toBe(ts);
  });

  it('skips update when incoming event timestamp is older (idempotency)', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('webhook-stale');

    // Seed with a recent timestamp already stored
    const newerTs = new Date('2026-06-10T10:00:00.000Z');
    await db.insert(subscriptions).values({
      accountId: acct.id,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_stale_001',
      lastStripeEventTimestamp: newerTs,
    });
    const existing = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, acct.id),
    });
    expect(existing).not.toBeNull();

    // Attempt to update with an OLDER event timestamp
    const staleTs = new Date('2026-06-01T00:00:00.000Z').toISOString();
    const result = await updateSubscriptionFromWebhook(db, 'sub_stale_001', {
      status: 'cancelled',
      lastStripeEventTimestamp: staleTs,
    });

    // Should return the existing row unchanged (stale event skipped)
    expect(result).not.toBeNull();
    expect(result!.status).toBe('active'); // not changed to 'cancelled'
    expect(result!.lastStripeEventTimestamp).toBe(newerTs.toISOString());
  });

  it('[WI-78 DS-176] applies distinct Stripe events created in the same second', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('webhook-same-second-distinct');

    const ts = new Date('2026-06-10T10:00:00.000Z');
    await db.insert(subscriptions).values({
      accountId: acct.id,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_same_second_001',
      lastStripeEventTimestamp: ts,
      lastStripeEventId: 'evt_same_second_first',
    });

    const result = await updateSubscriptionFromWebhook(
      db,
      'sub_same_second_001',
      {
        status: 'cancelled',
        lastStripeEventTimestamp: ts.toISOString(),
        stripeEventId: 'evt_same_second_second',
      },
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe('cancelled');
    expect(result!.lastStripeEventTimestamp).toBe(ts.toISOString());

    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, acct.id),
    });
    expect(row!.status).toBe('cancelled');
    expect(row!.lastStripeEventId).toBe('evt_same_second_second');
  });

  it('[WI-78 review] rejects same-second payment_failed after active recovery', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('webhook-same-second-past-due-stale');

    const ts = new Date('2026-06-10T10:00:00.000Z');
    await db.insert(subscriptions).values({
      accountId: acct.id,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_same_second_past_due_001',
      lastStripeEventTimestamp: ts,
      lastStripeEventId: 'evt_payment_succeeded_same_second',
    });

    const result = await updateSubscriptionFromWebhook(
      db,
      'sub_same_second_past_due_001',
      {
        status: 'past_due',
        lastStripeEventTimestamp: ts.toISOString(),
        stripeEventId: 'evt_payment_failed_same_second',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'active',
        lastStripeEventId: 'evt_payment_succeeded_same_second',
        webhookApplied: false,
      }),
    );

    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, acct.id),
    });
    expect(row!.status).toBe('active');
    expect(row!.lastStripeEventId).toBe('evt_payment_succeeded_same_second');
  });

  it('[WI-78 review] applies a distinct same-second active recovery after payment_failed', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('webhook-same-second-active-recovery');

    const ts = new Date('2026-06-10T10:00:00.000Z');
    await db.insert(subscriptions).values({
      accountId: acct.id,
      tier: 'plus',
      status: 'past_due',
      stripeSubscriptionId: 'sub_same_second_active_recovery_001',
      lastStripeEventTimestamp: ts,
      lastStripeEventId: 'evt_payment_failed_same_second',
    });

    const result = await updateSubscriptionFromWebhook(
      db,
      'sub_same_second_active_recovery_001',
      {
        status: 'active',
        lastStripeEventTimestamp: ts.toISOString(),
        stripeEventId: 'evt_payment_succeeded_same_second',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'active',
        lastStripeEventId: 'evt_payment_succeeded_same_second',
        webhookApplied: true,
      }),
    );

    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, acct.id),
    });
    expect(row!.status).toBe('active');
    expect(row!.lastStripeEventId).toBe('evt_payment_succeeded_same_second');
  });

  // [BREAK CR-2026-05-19-M11] Two concurrent deliveries of the same Stripe event
  // ID must result in exactly ONE write. Pre-fix: both calls saw "not yet processed"
  // (timestamp ordering check outside tx) and both wrote — divergent billing state.
  // Post-fix: the event-ID check + UPDATE are inside a single db.transaction(), and
  // the partial unique index on (accountId, lastStripeEventId) provides the
  // storage-layer guarantee. The second writer's UPDATE is a no-op (idempotent return).
  it('[BREAK CR-2026-05-19-M11] concurrent same-event-ID deliveries write only once', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('webhook-concurrent-dedup');
    await createSubscription(
      db,
      acct.id,
      'plus',
      getTierConfig('plus').monthlyQuota,
      { status: 'trial', stripeSubscriptionId: 'sub_concurrent_dedup_001' },
    );

    const stripeEventId = 'evt_concurrent_dedup_001';
    const ts = new Date('2026-07-01T10:00:00.000Z').toISOString();

    // Fire two identical event deliveries concurrently
    const [r1, r2] = await Promise.all([
      updateSubscriptionFromWebhook(
        createIntegrationDb(),
        'sub_concurrent_dedup_001',
        {
          status: 'active',
          lastStripeEventTimestamp: ts,
          stripeEventId,
        },
      ),
      updateSubscriptionFromWebhook(
        createIntegrationDb(),
        'sub_concurrent_dedup_001',
        {
          status: 'active',
          lastStripeEventTimestamp: ts,
          stripeEventId,
        },
      ),
    ]);

    // Both return non-null (idempotent — second is a safe no-op return)
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    // Exactly one write happened — event ID stamped on the row
    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, acct.id),
    });
    expect(row!.lastStripeEventId).toBe(stripeEventId);
    expect(row!.status).toBe('active');

    // Only one subscription row for this account
    const rows = await db.query.subscriptions.findMany({
      where: eq(subscriptions.accountId, acct.id),
    });
    expect(rows).toHaveLength(1);
  });

  it('throws on invalid transition so callers do not continue quota updates', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('webhook-invalid-transition');
    await db.insert(subscriptions).values({
      accountId: acct.id,
      tier: 'plus',
      status: 'expired',
      stripeSubscriptionId: 'sub_invalid_001',
      lastStripeEventTimestamp: new Date('2026-01-01T00:00:00.000Z'),
    });

    // expired -> active is not a valid transition in the state machine
    const ts = new Date('2026-06-20T00:00:00.000Z').toISOString();
    await expect(
      updateSubscriptionFromWebhook(db, 'sub_invalid_001', {
        status: 'active',
        lastStripeEventTimestamp: ts,
      }),
    ).rejects.toThrow(/Invalid Stripe subscription transition/);

    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, acct.id),
    });
    expect(row!.status).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// linkStripeCustomer
// ---------------------------------------------------------------------------

describe('linkStripeCustomer', () => {
  it('links a Stripe customer ID to an existing subscription', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('link-stripe');
    await createSubscription(
      db,
      acct.id,
      'plus',
      getTierConfig('plus').monthlyQuota,
    );

    const result = await linkStripeCustomer(db, acct.id, 'cus_linked_001');

    expect(result).not.toBeNull();
    expect(result!.stripeCustomerId).toBe('cus_linked_001');
  });

  it('returns null when account has no subscription', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('link-stripe-missing');

    const result = await linkStripeCustomer(db, acct.id, 'cus_nomatch');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getQuotaPool
// ---------------------------------------------------------------------------

describe('getQuotaPool', () => {
  it('returns the quota pool for an existing subscription', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('get-quota');
    const sub = await createSubscription(
      db,
      acct.id,
      'plus',
      getTierConfig('plus').monthlyQuota,
    );

    const pool = await getQuotaPool(db, sub.id);

    expect(pool).not.toBeNull();
    expect(pool!.subscriptionId).toBe(sub.id);
    expect(pool!.monthlyLimit).toBe(getTierConfig('plus').monthlyQuota);
  });

  it('returns null when subscription has no quota pool', async () => {
    const db = createIntegrationDb();
    const result = await getQuotaPool(
      db,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resetMonthlyQuota
// ---------------------------------------------------------------------------

describe('resetMonthlyQuota', () => {
  it('resets usedThisMonth to 0 and sets a new limit', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('reset-quota');
    const sub = await createSubscription(
      db,
      acct.id,
      'plus',
      getTierConfig('plus').monthlyQuota,
    );

    // Manually bump usedThisMonth to simulate prior usage
    await db
      .update(quotaPools)
      .set({ usedThisMonth: 150, usedToday: 5 })
      .where(eq(quotaPools.subscriptionId, sub.id));

    const newLimit = 800;
    const result = await resetMonthlyQuota(db, sub.id, newLimit);

    expect(result).not.toBeNull();
    expect(result!.usedThisMonth).toBe(0);
    expect(result!.usedToday).toBe(0);
    expect(result!.monthlyLimit).toBe(newLimit);
    // cycleResetAt should be advanced ~1 month
    const resetAt = new Date(result!.cycleResetAt);
    expect(resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns null when quota pool does not exist', async () => {
    const db = createIntegrationDb();
    const result = await resetMonthlyQuota(
      db,
      '00000000-0000-0000-0000-000000000000',
      700,
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// markSubscriptionCancelled
// ---------------------------------------------------------------------------

describe('markSubscriptionCancelled', () => {
  it('sets cancelledAt on a subscription', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('cancel-sub');
    const sub = await createSubscription(
      db,
      acct.id,
      'plus',
      getTierConfig('plus').monthlyQuota,
      { status: 'active' },
    );

    const before = new Date();
    await markSubscriptionCancelled(db, sub.id);

    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, sub.id),
    });
    expect(row).not.toBeNull();
    expect(row!.cancelledAt).not.toBeNull();
    expect(row!.cancelledAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });
});

// ---------------------------------------------------------------------------
// updateQuotaPoolLimit
// ---------------------------------------------------------------------------

describe('updateQuotaPoolLimit', () => {
  it('updates monthlyLimit and dailyLimit without resetting usedThisMonth', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('update-pool-limit');
    const sub = await createSubscription(
      db,
      acct.id,
      'free',
      getTierConfig('free').monthlyQuota,
    );

    // Simulate prior usage
    await db
      .update(quotaPools)
      .set({ usedThisMonth: 50, usedToday: 3 })
      .where(eq(quotaPools.subscriptionId, sub.id));

    const newMonthlyLimit = 700;
    await updateQuotaPoolLimit(db, sub.id, newMonthlyLimit, null);

    const pool = await db.query.quotaPools.findFirst({
      where: eq(quotaPools.subscriptionId, sub.id),
    });
    expect(pool!.monthlyLimit).toBe(newMonthlyLimit);
    expect(pool!.dailyLimit).toBeNull();
    // Usage counts preserved (mid-cycle change)
    expect(pool!.usedThisMonth).toBe(50);
    expect(pool!.usedToday).toBe(3);
  });

  it('[WI-78 review] rejects when quota pool is missing', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('update-pool-limit-missing');
    const sub = await createSubscription(
      db,
      acct.id,
      'free',
      getTierConfig('free').monthlyQuota,
    );
    await db.delete(quotaPools).where(eq(quotaPools.subscriptionId, sub.id));

    await expect(updateQuotaPoolLimit(db, sub.id, 700, null)).rejects.toThrow(
      'quota pool',
    );
  });
});

// ---------------------------------------------------------------------------
// activateSubscriptionFromCheckout
// ---------------------------------------------------------------------------

describe('activateSubscriptionFromCheckout', () => {
  it('rejects malformed metadata — missing sub_ prefix', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('activate-bad-sub-id');

    await expect(
      activateSubscriptionFromCheckout(
        db,
        acct.id,
        'INVALID_sub_no_prefix',
        'plus',
        new Date().toISOString(),
      ),
    ).rejects.toThrow(/invalid input/i);
  });

  it('rejects malformed metadata — unknown tier', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('activate-bad-tier');

    await expect(
      activateSubscriptionFromCheckout(
        db,
        acct.id,
        'sub_valid_001',
        'free' as 'plus', // free is not allowed (not a paid tier)
        new Date().toISOString(),
      ),
    ).rejects.toThrow(/invalid input/i);
  });

  it('rejects malformed metadata — empty accountId', async () => {
    const db = createIntegrationDb();

    await expect(
      activateSubscriptionFromCheckout(
        db,
        '',
        'sub_valid_001',
        'plus',
        new Date().toISOString(),
      ),
    ).rejects.toThrow(/invalid input/i);
  });

  it('creates a new subscription when none exists', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('activate-new');

    const result = await activateSubscriptionFromCheckout(
      db,
      acct.id,
      'sub_activate_new_001',
      'plus',
      new Date('2026-06-01T10:00:00.000Z').toISOString(),
    );

    expect(result).not.toBeNull();
    expect(result!.tier).toBe('plus');
    expect(result!.status).toBe('active');
    expect(result!.stripeSubscriptionId).toBe('sub_activate_new_001');

    // Quota pool created with plus tier limits
    const pool = await getQuotaPool(db, result!.id);
    expect(pool!.monthlyLimit).toBe(getTierConfig('plus').monthlyQuota);
  });

  it('bridges an existing subscription (null stripeSubscriptionId) to the Stripe sub', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('activate-bridge');
    const sub = await createSubscription(
      db,
      acct.id,
      'plus',
      getTierConfig('plus').monthlyQuota,
      { status: 'active' },
    );
    expect(sub.stripeSubscriptionId).toBeNull();

    const ts = new Date('2026-06-01T10:00:00.000Z').toISOString();
    const result = await activateSubscriptionFromCheckout(
      db,
      acct.id,
      'sub_bridge_001',
      'plus',
      ts,
    );

    expect(result!.id).toBe(sub.id);
    expect(result!.stripeSubscriptionId).toBe('sub_bridge_001');
    expect(result!.tier).toBe('plus');
    expect(result!.status).toBe('active');
    expect(result!.lastStripeEventTimestamp).toBe(ts);
  });

  it('is idempotent for same Stripe sub ID retry', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('activate-idempotent');
    const ts = new Date('2026-06-01T10:00:00.000Z').toISOString();

    const first = await activateSubscriptionFromCheckout(
      db,
      acct.id,
      'sub_idempotent_001',
      'plus',
      ts,
    );

    const second = await activateSubscriptionFromCheckout(
      db,
      acct.id,
      'sub_idempotent_001',
      'plus',
      ts,
    );

    expect(second!.id).toBe(first!.id);
    expect(second!.stripeSubscriptionId).toBe('sub_idempotent_001');
  });

  it('applies newer incoming Stripe sub when existing lastStripeEventTimestamp is older', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('activate-divergent-newer');

    const olderTs = new Date('2026-05-01T00:00:00.000Z').toISOString();
    const newerTs = new Date('2026-06-01T00:00:00.000Z').toISOString();

    // Seed subscription with an older event timestamp already linked
    await db.insert(subscriptions).values({
      accountId: acct.id,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_old_diverge_001',
      lastStripeEventTimestamp: new Date(olderTs),
    });
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, acct.id),
    });
    // Seed quota pool
    await db.insert(quotaPools).values({
      subscriptionId: sub!.id,
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: null,
      usedToday: 0,
      cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Incoming event with newer timestamp + different sub ID
    const result = await activateSubscriptionFromCheckout(
      db,
      acct.id,
      'sub_new_diverge_002',
      'pro',
      newerTs,
    );

    // Newer incoming should override
    expect(result).not.toBeNull();
    expect(result!.stripeSubscriptionId).toBe('sub_new_diverge_002');
    expect(result!.tier).toBe('pro');

    // Quota pool limit synced to new tier
    const pool = await getQuotaPool(db, result!.id);
    expect(pool!.monthlyLimit).toBe(getTierConfig('pro').monthlyQuota);
  });

  it('keeps existing subscription when incoming Stripe sub event is older', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('activate-divergent-older');

    const newerTs = new Date('2026-06-10T00:00:00.000Z').toISOString();
    const olderTs = new Date('2026-05-01T00:00:00.000Z').toISOString();

    // Seed subscription with a newer event timestamp already linked
    await db.insert(subscriptions).values({
      accountId: acct.id,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_keep_existing_001',
      lastStripeEventTimestamp: new Date(newerTs),
    });
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, acct.id),
    });
    await db.insert(quotaPools).values({
      subscriptionId: sub!.id,
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 2,
      cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Incoming event with older timestamp → stale replay, should be dropped
    const result = await activateSubscriptionFromCheckout(
      db,
      acct.id,
      'sub_stale_replay_002',
      'family',
      olderTs,
    );

    // Should keep the existing subscription unchanged
    expect(result).not.toBeNull();
    expect(result!.stripeSubscriptionId).toBe('sub_keep_existing_001');
    expect(result!.tier).toBe('plus');
  });
});
