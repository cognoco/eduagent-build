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
  membership,
  organization,
  person,
  profiles,
  quotaPools,
  subscription as subscriptionV2Table,
  subscriptions,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  getSubscriptionByAccountId,
  createSubscription,
  getQuotaPool,
  resetMonthlyQuota,
  ensureFreeSubscription,
  updateQuotaPoolLimit,
} from './subscription-core';
// [WI-1239 / 779-strip] updateSubscriptionFromWebhook, linkStripeCustomer,
// markSubscriptionCancelled, and activateSubscriptionFromCheckout were removed
// from subscription-core.ts — the Stripe webhook route dispatches exclusively
// to the -V2 twins now. updateSubscriptionFromWebhookV2 and
// activateSubscriptionFromCheckoutV2 are only ever *mocked* in
// stripe-webhook-handler-v2.test.ts (no real-DB coverage exists elsewhere), so
// the describe blocks below convert to them rather than dropping the
// coverage. linkStripeCustomerV2 has zero production callers (grepped) — its
// tests are dropped, same rationale as the deleted handleTierChange
// (billing-service.integration.test.ts). markSubscriptionCancelledV2 already
// has real-DB coverage in subscription-core-v2-cancel.integration.test.ts —
// its test is dropped too.
import {
  updateSubscriptionFromWebhookV2,
  activateSubscriptionFromCheckoutV2,
} from './billing-v2';
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

// ---------------------------------------------------------------------------
// [WI-1239 / 779-strip] v2 seed helpers — for updateSubscriptionFromWebhookV2 /
// activateSubscriptionFromCheckoutV2, which resolve tier/ownership via the
// v2 (organization/person/membership/subscription) store, while
// quota_pools/subscriptions(legacy) still FK to the legacy tables
// (pre-M-REPOINT). Dual-store, id-aligned — the "reseed identity contract"
// used throughout billing-v2/*.integration.test.ts.
// ---------------------------------------------------------------------------

const V2_ORG_IDS: string[] = [];

async function seedV2OrgWithOwner(tag: string) {
  const db = createIntegrationDb();
  const [org] = await db
    .insert(organization)
    .values({ name: `${PREFIX}-v2-${tag}` })
    .returning();
  V2_ORG_IDS.push(org!.id);
  // Mirror the org under a legacy account with the SAME id — quota_pools and
  // the legacy `subscriptions` table (dual-written below / by
  // ensureLegacySubscriptionParent) FK to accounts.id.
  await db.insert(accounts).values({
    id: org!.id,
    clerkUserId: `${PREFIX}-v2-${tag}-clerk`,
    email: `${PREFIX}-v2-${tag}@integration.test`,
  });
  const [owner] = await db
    .insert(person)
    .values({
      displayName: 'Owner',
      birthDate: '1985-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();
  await db.insert(membership).values({
    personId: owner!.id,
    organizationId: org!.id,
    roles: ['admin'],
  });
  // profile_quota_usage.profileId still FKs to the legacy `profiles` table
  // (pre-M-REPOINT) — per-profile tiers (plus/pro) provision the owner row
  // there when reconcileQuotaStateForSubscriptionV2 runs.
  await db.insert(profiles).values({
    id: owner!.id,
    accountId: org!.id,
    displayName: 'Owner',
    birthYear: 1985,
    isOwner: true,
  });
  return { organizationId: org!.id, ownerId: owner!.id };
}

/**
 * Directly seeds a v2 subscription row plus its dual-write legacy
 * `subscriptions` counterpart (same id) — for tests that need a subscription
 * pre-existing in a specific state, rather than one created through
 * activateSubscriptionFromCheckoutV2/createSubscriptionV2 (which already
 * dual-write via the production ensureLegacySubscriptionParent helper).
 */
async function seedV2SubscriptionDirect(input: {
  organizationId: string;
  ownerId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  stripeSubscriptionId?: string | null;
  lastStripeEventTimestamp?: Date | null;
  lastStripeEventId?: string | null;
  /** Also seed a quota_pools row — required by activateSubscriptionFromCheckoutV2's
   * bridge/divergent-sub paths, which UPDATE (not upsert) quota_pools and throw
   * if no row matches. */
  withQuotaPool?: { usedThisMonth?: number; usedToday?: number };
}) {
  const db = createIntegrationDb();
  const [subV2] = await db
    .insert(subscriptionV2Table)
    .values({
      organizationId: input.organizationId,
      planTier: input.tier,
      status: input.status,
      payerPersonId: input.ownerId,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      lastStripeEventTimestamp: input.lastStripeEventTimestamp ?? null,
      lastStripeEventId: input.lastStripeEventId ?? null,
    })
    .returning();
  await db.insert(subscriptions).values({
    id: subV2!.id,
    accountId: input.organizationId,
    tier: input.tier,
    status: input.status,
    stripeSubscriptionId: input.stripeSubscriptionId ?? null,
    lastStripeEventTimestamp: input.lastStripeEventTimestamp ?? null,
    lastStripeEventId: input.lastStripeEventId ?? null,
  });
  if (input.withQuotaPool) {
    const tierConfig = getTierConfig(input.tier);
    await db.insert(quotaPools).values({
      subscriptionId: subV2!.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: input.withQuotaPool.usedThisMonth ?? 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: input.withQuotaPool.usedToday ?? 0,
      cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }
  return subV2!;
}

async function cleanupV2() {
  if (V2_ORG_IDS.length === 0) return;
  const db = createIntegrationDb();
  const orgIds = [...new Set(V2_ORG_IDS)];
  const members = await db.query.membership.findMany({
    where: inArray(membership.organizationId, orgIds),
    columns: { personId: true },
  });
  const personIds = [...new Set(members.map((m) => m.personId))];
  await db
    .delete(subscriptionV2Table)
    .where(inArray(subscriptionV2Table.organizationId, orgIds));
  await db.delete(membership).where(inArray(membership.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
  // Legacy account (same id as the org) cascades to subscriptions/quota_pools.
  await db.delete(accounts).where(inArray(accounts.id, orgIds));
  V2_ORG_IDS.length = 0;
}

beforeEach(async () => {
  await cleanupTestAccounts();
  await cleanupV2();
});

afterAll(async () => {
  await cleanupTestAccounts();
  await cleanupV2();
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

describe('updateSubscriptionFromWebhookV2', () => {
  it('returns null when no subscription with the given Stripe ID exists', async () => {
    const db = createIntegrationDb();
    const result = await updateSubscriptionFromWebhookV2(
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
    const { organizationId, ownerId } =
      await seedV2OrgWithOwner('webhook-update');
    const sub = await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'trial',
      stripeSubscriptionId: 'sub_webhook_001',
    });

    const ts = new Date('2026-06-01T10:00:00.000Z').toISOString();
    const updated = await updateSubscriptionFromWebhookV2(
      db,
      'sub_webhook_001',
      {
        status: 'active',
        lastStripeEventTimestamp: ts,
        currentPeriodStart: new Date('2026-06-01T00:00:00.000Z').toISOString(),
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z').toISOString(),
      },
    );

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(sub.id);
    expect(updated!.status).toBe('active');
    expect(updated!.lastStripeEventTimestamp).toBe(ts);
  });

  it('skips update when incoming event timestamp is older (idempotency)', async () => {
    const db = createIntegrationDb();
    const { organizationId, ownerId } =
      await seedV2OrgWithOwner('webhook-stale');

    // Seed with a recent timestamp already stored
    const newerTs = new Date('2026-06-10T10:00:00.000Z');
    await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_stale_001',
      lastStripeEventTimestamp: newerTs,
    });
    const existing = await db.query.subscription.findFirst({
      where: eq(subscriptionV2Table.organizationId, organizationId),
    });
    expect(existing).not.toBeNull();

    // Attempt to update with an OLDER event timestamp
    const staleTs = new Date('2026-06-01T00:00:00.000Z').toISOString();
    const result = await updateSubscriptionFromWebhookV2(db, 'sub_stale_001', {
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
    const { organizationId, ownerId } = await seedV2OrgWithOwner(
      'webhook-same-second-distinct',
    );

    const ts = new Date('2026-06-10T10:00:00.000Z');
    await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_same_second_001',
      lastStripeEventTimestamp: ts,
      lastStripeEventId: 'evt_same_second_first',
    });

    const result = await updateSubscriptionFromWebhookV2(
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

    const row = await db.query.subscription.findFirst({
      where: eq(subscriptionV2Table.organizationId, organizationId),
    });
    expect(row!.status).toBe('cancelled');
    expect(row!.lastStripeEventId).toBe('evt_same_second_second');
  });

  it('[WI-78 review] rejects same-second payment_failed after active recovery', async () => {
    const db = createIntegrationDb();
    const { organizationId, ownerId } = await seedV2OrgWithOwner(
      'webhook-same-second-past-due-stale',
    );

    const ts = new Date('2026-06-10T10:00:00.000Z');
    await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_same_second_past_due_001',
      lastStripeEventTimestamp: ts,
      lastStripeEventId: 'evt_payment_succeeded_same_second',
    });

    const result = await updateSubscriptionFromWebhookV2(
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

    const row = await db.query.subscription.findFirst({
      where: eq(subscriptionV2Table.organizationId, organizationId),
    });
    expect(row!.status).toBe('active');
    expect(row!.lastStripeEventId).toBe('evt_payment_succeeded_same_second');
  });

  it('[WI-78 review] applies a distinct same-second active recovery after payment_failed', async () => {
    const db = createIntegrationDb();
    const { organizationId, ownerId } = await seedV2OrgWithOwner(
      'webhook-same-second-active-recovery',
    );

    const ts = new Date('2026-06-10T10:00:00.000Z');
    await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'past_due',
      stripeSubscriptionId: 'sub_same_second_active_recovery_001',
      lastStripeEventTimestamp: ts,
      lastStripeEventId: 'evt_payment_failed_same_second',
    });

    const result = await updateSubscriptionFromWebhookV2(
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

    const row = await db.query.subscription.findFirst({
      where: eq(subscriptionV2Table.organizationId, organizationId),
    });
    expect(row!.status).toBe('active');
    expect(row!.lastStripeEventId).toBe('evt_payment_succeeded_same_second');
  });

  // [WI-1239 / 779-strip] The concurrent same-event-ID race case is DROPPED
  // here (not converted) — apps/api/src/services/billing/billing-v2/
  // subscription-core-v2.integration.test.ts already pins the identical
  // scenario against updateSubscriptionFromWebhookV2 directly
  // ("[BREAK CR-2026-05-19-M11] concurrent same-event-ID deliveries write
  // only once").

  it('throws on invalid transition so callers do not continue quota updates', async () => {
    const db = createIntegrationDb();
    const { organizationId, ownerId } = await seedV2OrgWithOwner(
      'webhook-invalid-transition',
    );
    await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'expired',
      stripeSubscriptionId: 'sub_invalid_001',
      lastStripeEventTimestamp: new Date('2026-01-01T00:00:00.000Z'),
    });

    // expired -> trial is not a valid transition in the state machine.
    // (Note: expired -> active / past_due are now VALID reactivations per fix
    // #4 — a re-charge after lapse legitimately revives the subscription — so
    // this test uses expired -> trial, which remains illegitimate.)
    const ts = new Date('2026-06-20T00:00:00.000Z').toISOString();
    await expect(
      updateSubscriptionFromWebhookV2(db, 'sub_invalid_001', {
        status: 'trial',
        lastStripeEventTimestamp: ts,
      }),
    ).rejects.toThrow(/Invalid Stripe subscription transition/);

    const row = await db.query.subscription.findFirst({
      where: eq(subscriptionV2Table.organizationId, organizationId),
    });
    expect(row!.status).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// linkStripeCustomer
// ---------------------------------------------------------------------------

// [WI-1239 / 779-strip] linkStripeCustomer was removed; its v2 twin
// (linkStripeCustomerV2) has zero production callers (grepped
// apps/api/src — no call site outside its own definition and the type
// declaration), same as the deleted handleTierChange
// (billing-service.integration.test.ts). Dropped rather than converted —
// testing dead code adds no coverage.

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

// [WI-1239 / 779-strip] markSubscriptionCancelled was removed; its v2 twin
// (markSubscriptionCancelledV2, called by routes/billing.ts's cancel route)
// already has real-DB coverage in
// apps/api/src/services/billing/billing-v2/subscription-core-v2-cancel.integration.test.ts
// ("[Thread-1] markSubscriptionCancelledV2 stamps subscription.cancelled_at
// and a v2 read reflects it") — same assertion this test made, against the
// v2 store. Dropped rather than duplicated.

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

describe('activateSubscriptionFromCheckoutV2', () => {
  it('rejects malformed metadata — missing sub_ prefix', async () => {
    const db = createIntegrationDb();
    const { organizationId } = await seedV2OrgWithOwner('activate-bad-sub-id');

    await expect(
      activateSubscriptionFromCheckoutV2(
        db,
        organizationId,
        'INVALID_sub_no_prefix',
        'plus',
        new Date().toISOString(),
      ),
    ).rejects.toThrow(/invalid input/i);
  });

  it('rejects malformed metadata — unknown tier', async () => {
    const db = createIntegrationDb();
    const { organizationId } = await seedV2OrgWithOwner('activate-bad-tier');

    await expect(
      activateSubscriptionFromCheckoutV2(
        db,
        organizationId,
        'sub_valid_001',
        'free' as 'plus', // free is not allowed (not a paid tier)
        new Date().toISOString(),
      ),
    ).rejects.toThrow(/invalid input/i);
  });

  it('rejects malformed metadata — empty accountId', async () => {
    const db = createIntegrationDb();

    await expect(
      activateSubscriptionFromCheckoutV2(
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
    const { organizationId } = await seedV2OrgWithOwner('activate-new');

    const result = await activateSubscriptionFromCheckoutV2(
      db,
      organizationId,
      'sub_activate_new_001',
      'plus',
      new Date('2026-06-01T10:00:00.000Z').toISOString(),
    );

    expect(result).not.toBeNull();
    expect(result!.tier).toBe('plus');
    expect(result!.status).toBe('active');
    expect(result!.stripeSubscriptionId).toBe('sub_activate_new_001');

    // Quota pool created with plus tier limits. createSubscriptionV2's
    // fresh-insert path dual-writes the legacy subscriptions parent row
    // (ensureLegacySubscriptionParent) that quota_pools still FKs to.
    const pool = await getQuotaPool(db, result!.id);
    expect(pool!.monthlyLimit).toBe(getTierConfig('plus').monthlyQuota);
  });

  it('bridges an existing subscription (null stripeSubscriptionId) to the Stripe sub', async () => {
    const db = createIntegrationDb();
    const { organizationId, ownerId } =
      await seedV2OrgWithOwner('activate-bridge');
    const sub = await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'active',
      withQuotaPool: {},
    });
    expect(sub.stripeSubscriptionId).toBeNull();

    const ts = new Date('2026-06-01T10:00:00.000Z').toISOString();
    const result = await activateSubscriptionFromCheckoutV2(
      db,
      organizationId,
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
    const { organizationId } = await seedV2OrgWithOwner('activate-idempotent');
    const ts = new Date('2026-06-01T10:00:00.000Z').toISOString();

    const first = await activateSubscriptionFromCheckoutV2(
      db,
      organizationId,
      'sub_idempotent_001',
      'plus',
      ts,
    );

    const second = await activateSubscriptionFromCheckoutV2(
      db,
      organizationId,
      'sub_idempotent_001',
      'plus',
      ts,
    );

    expect(second!.id).toBe(first!.id);
    expect(second!.stripeSubscriptionId).toBe('sub_idempotent_001');
  });

  it('applies newer incoming Stripe sub when existing lastStripeEventTimestamp is older', async () => {
    const db = createIntegrationDb();
    const { organizationId, ownerId } = await seedV2OrgWithOwner(
      'activate-divergent-newer',
    );

    const olderTs = new Date('2026-05-01T00:00:00.000Z').toISOString();
    const newerTs = new Date('2026-06-01T00:00:00.000Z').toISOString();

    // Seed subscription with an older event timestamp already linked
    const sub = await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_old_diverge_001',
      lastStripeEventTimestamp: new Date(olderTs),
      withQuotaPool: {},
    });

    // Incoming event with newer timestamp + different sub ID
    const result = await activateSubscriptionFromCheckoutV2(
      db,
      organizationId,
      'sub_new_diverge_002',
      'pro',
      newerTs,
    );

    // Newer incoming should override
    expect(result).not.toBeNull();
    expect(result!.stripeSubscriptionId).toBe('sub_new_diverge_002');
    expect(result!.tier).toBe('pro');

    // Quota pool limit synced to new tier
    const pool = await getQuotaPool(db, sub.id);
    expect(pool!.monthlyLimit).toBe(getTierConfig('pro').monthlyQuota);
  });

  it('keeps existing subscription when incoming Stripe sub event is older', async () => {
    const db = createIntegrationDb();
    const { organizationId, ownerId } = await seedV2OrgWithOwner(
      'activate-divergent-older',
    );

    const newerTs = new Date('2026-06-10T00:00:00.000Z').toISOString();
    const olderTs = new Date('2026-05-01T00:00:00.000Z').toISOString();

    // Seed subscription with a newer event timestamp already linked
    await seedV2SubscriptionDirect({
      organizationId,
      ownerId,
      tier: 'plus',
      status: 'active',
      stripeSubscriptionId: 'sub_keep_existing_001',
      lastStripeEventTimestamp: new Date(newerTs),
      withQuotaPool: { usedThisMonth: 10, usedToday: 2 },
    });

    // Incoming event with older timestamp → stale replay, should be dropped
    const result = await activateSubscriptionFromCheckoutV2(
      db,
      organizationId,
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
