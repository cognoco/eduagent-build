/**
 * Integration: handleTierChange — WI-583 / F-124 + F-096
 *
 * F-124: Top-up credits stranded after tier change between shared-pool
 *        (family/pro, profileId=null) and per-profile (plus, profileId=ownerId).
 * F-096: Billing/quota/idempotency coverage for handleTierChange and related paths.
 *
 * No internal mocks — real DB only. External-boundary Inngest dispatch errors
 * are swallowed by safeSend (no event key in test env → non-fatal).
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  quotaPools,
  subscriptions,
  topUpCredits,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  handleTierChange,
  buildTopUpCreditsReattributedEventData,
} from './tier';
import { updateSubscriptionAndQuotaFromRevenuecatWebhook } from './revenuecat';
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

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const PREFIX = 'integration-tier-change';
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

async function seedProfile(input: {
  accountId: string;
  displayName: string;
  isOwner: boolean;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(profiles)
    .values({
      accountId: input.accountId,
      displayName: input.displayName,
      birthYear: input.isOwner ? 1990 : 2016,
      isOwner: input.isOwner,
    })
    .returning();
  return row!;
}

async function seedSubscriptionWithQuota(input: {
  accountId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
  usedThisMonth?: number;
}) {
  const db = createIntegrationDb();
  const tierConfig = getTierConfig(input.tier);

  const [sub] = await db
    .insert(subscriptions)
    .values({
      accountId: input.accountId,
      tier: input.tier,
      status: 'active',
    })
    .returning();

  await db.insert(quotaPools).values({
    subscriptionId: sub!.id,
    monthlyLimit: tierConfig.monthlyQuota,
    usedThisMonth: input.usedThisMonth ?? 0,
    dailyLimit: tierConfig.dailyLimit ?? null,
    usedToday: 0,
    cycleResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  return sub!;
}

async function seedTopUpCredit(input: {
  subscriptionId: string;
  profileId: string | null;
  amount: number;
  remaining?: number;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(topUpCredits)
    .values({
      subscriptionId: input.subscriptionId,
      profileId: input.profileId,
      amount: input.amount,
      remaining: input.remaining ?? input.amount,
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    .returning();
  return row!;
}

async function loadTopUpCredits(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.topUpCredits.findMany({
    where: eq(topUpCredits.subscriptionId, subscriptionId),
  });
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
// handleTierChange — basic contract (F-096 coverage)
// ---------------------------------------------------------------------------

describe('handleTierChange — basic contract', () => {
  it('returns null when subscription does not exist', async () => {
    const db = createIntegrationDb();
    const result = await handleTierChange(
      db,
      '00000000-0000-0000-0000-000000000000',
      'plus',
    );
    expect(result).toBeNull();
  });

  it('updates subscription tier and returns TierChangeResult', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('basic-upgrade');
    await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus',
      usedThisMonth: 200,
    });

    const result = await handleTierChange(db, sub.id, 'family');

    expect(result).not.toBeNull();
    expect(result!.previousTier).toBe('plus');
    expect(result!.newTier).toBe('family');
    expect(result!.usedThisCycle).toBe(200);
    expect(result!.newMonthlyLimit).toBe(getTierConfig('family').monthlyQuota);
    // Family has 1500 quota; used 200; but reconcileQuotaStateForSubscription
    // switches to shared-pool model which resets quota pool on model change.
    // Result's remainingQuestions is computed before the reconcile.
    expect(result!.remainingQuestions).toBeGreaterThanOrEqual(0);

    // Verify tier was persisted
    const updatedSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, sub.id),
    });
    expect(updatedSub!.tier).toBe('family');
  });

  it('idempotent: calling handleTierChange twice with same new tier is safe', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('idempotent-tier');
    await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus',
    });

    const first = await handleTierChange(db, sub.id, 'family');
    const second = await handleTierChange(db, sub.id, 'family');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Both succeed; second is a no-op in terms of model state
    expect(second!.newTier).toBe('family');

    const updatedSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, sub.id),
    });
    expect(updatedSub!.tier).toBe('family');
  });

  it('handles same-tier call (no actual change) without error', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('same-tier');
    await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus',
    });

    const result = await handleTierChange(db, sub.id, 'plus');
    expect(result).not.toBeNull();
    expect(result!.previousTier).toBe('plus');
    expect(result!.newTier).toBe('plus');
  });

  it('no credits present — tier change succeeds without error', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('no-credits-tier');
    await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus',
    });

    const result = await handleTierChange(db, sub.id, 'family');
    expect(result).not.toBeNull();

    const credits = await loadTopUpCredits(sub.id);
    expect(credits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [BREAK F-124] Top-up credit re-attribution across tier changes
// ---------------------------------------------------------------------------

describe('[BREAK F-124] top-up credits preserved across tier change', () => {
  /**
   * Scenario: user on shared-pool (family, profileId=null credits) upgrades
   * to per-profile (plus). Credits must be re-attributed to the owner profile
   * so consumeOwnerTopUpCredit can find them.
   */
  it('[BREAK F-124] shared-pool to per-profile: credits with profileId=null re-attributed to owner', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('f124-shared-to-perprofile');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family', // shared-pool
    });

    // Seed credits with profileId=null (shared-pool purchase)
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 400, // partially consumed
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 500, // untouched
    });

    // Tier change: family (shared-pool) → plus (per-profile)
    const result = await handleTierChange(db, sub.id, 'plus');
    expect(result).not.toBeNull();

    // All active credits must now have profileId = owner.id
    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(2);
    for (const credit of credits) {
      expect(credit.profileId).toBe(owner.id);
    }
  });

  /**
   * Scenario: user on per-profile (plus, profileId=ownerId credits) upgrades
   * to shared-pool (family). Credits must be re-attributed to profileId=null
   * so decrementPoolQuota can find them.
   */
  it('[BREAK F-124] per-profile to shared-pool: credits with profileId=owner re-attributed to null', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('f124-perprofile-to-shared');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus', // per-profile
    });

    // Seed credits with profileId=owner.id (per-profile purchase)
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: owner.id,
      amount: 500,
      remaining: 300,
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: owner.id,
      amount: 500,
      remaining: 500,
    });

    // Tier change: plus (per-profile) → family (shared-pool)
    const result = await handleTierChange(db, sub.id, 'family');
    expect(result).not.toBeNull();

    // All active credits must now have profileId = null
    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(2);
    for (const credit of credits) {
      expect(credit.profileId).toBeNull();
    }
  });

  /**
   * Scenario: per-profile → pro (also shared-pool). Same as family path.
   */
  it('[BREAK F-124] per-profile (plus) to pro (shared-pool): credits nullified', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('f124-plus-to-pro');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus',
    });

    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: owner.id,
      amount: 500,
      remaining: 200,
    });

    const result = await handleTierChange(db, sub.id, 'pro');
    expect(result).not.toBeNull();

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBeNull();
  });

  /**
   * Scenario: expired credits (remaining=0) are NOT re-attributed (they're spent).
   * Ensures we don't disturb fully-consumed rows.
   */
  it('[BREAK F-124] fully-consumed credits (remaining=0) are not re-attributed', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('f124-consumed-credits');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family', // shared-pool
    });

    // One active (remaining>0), one spent (remaining=0)
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 0, // spent
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 100, // active
    });

    await handleTierChange(db, sub.id, 'plus');

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(2);

    // Active credit re-attributed
    const active = credits.find((c) => c.remaining > 0);
    expect(active!.profileId).toBe(owner.id);

    // Spent credit left untouched (profileId stays null)
    const spent = credits.find((c) => c.remaining === 0);
    expect(spent!.profileId).toBeNull();
  });

  /**
   * Scenario: shared-pool → shared-pool (family → pro).
   * No model change — credits with profileId=null stay null.
   */
  it('[F-096] shared-pool to shared-pool: credits unchanged', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('f096-shared-to-shared');
    await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family',
    });

    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 200,
    });

    await handleTierChange(db, sub.id, 'pro');

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBeNull(); // unchanged
  });

  /**
   * Scenario: per-profile → per-profile (plus → free both per-profile per config).
   * No model change — credits with profileId=owner stay.
   */
  it('[F-096] per-profile to per-profile: credits unchanged', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('f096-perprofile-to-perprofile');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus',
    });

    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: owner.id,
      amount: 500,
      remaining: 300,
    });

    // downgrade plus → free (both per-profile)
    await handleTierChange(db, sub.id, 'free');

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBe(owner.id); // unchanged
  });

  /**
   * Scenario: no owner profile exists on a per-profile tier change.
   * Re-attribution must not error out; credits stay as-is (can't re-attribute
   * without a target profile). The metric is still emitted.
   */
  it('[F-096] shared-pool to per-profile with no owner profile: credits stay null (no error)', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('f096-no-owner-profile');
    // No profile seeded — simulates edge case before profile creation
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family',
    });

    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 200,
    });

    // Must not throw
    const result = await handleTierChange(db, sub.id, 'plus');
    expect(result).not.toBeNull();

    // Credits stay null — no owner to attribute them to
    const credits = await loadTopUpCredits(sub.id);
    expect(credits[0]!.profileId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Event-schema coherence — app/billing.topup_credits.reattributed
// ---------------------------------------------------------------------------
//
// Both tier-change paths (Stripe: handleTierChange; RevenueCat:
// updateSubscriptionAndQuotaFromRevenuecatWebhook) emit the SAME event name
// through the SAME builder (buildTopUpCreditsReattributedEventData →
// emitTopUpCreditsReattributedMetric). This block pins the canonical field
// set so the two paths can never drift into incompatible payload schemas
// (CodeRabbit Major on PR #876).

describe('topup_credits.reattributed event schema coherence', () => {
  const CANONICAL_FIELDS = [
    'accountId',
    'newModel',
    'newTier',
    'occurredAt',
    'previousModel',
    'previousTier',
    'reattributedCount',
    'subscriptionId',
  ];

  it('builder emits the identical field set for Stripe-path and RevenueCat-path argument shapes', () => {
    // Stripe-path shape: handleTierChange (shared-pool → per-profile)
    const stripeData = buildTopUpCreditsReattributedEventData({
      subscriptionId: 'sub-stripe',
      accountId: 'acct-stripe',
      previousTier: 'family',
      newTier: 'plus',
      reattributedCount: 2,
      occurredAt: new Date('2026-06-11T00:00:00Z'),
    });

    // RevenueCat-path shape: updateSubscriptionAndQuotaFromRevenuecatWebhook
    // (per-profile → shared-pool)
    const revenuecatData = buildTopUpCreditsReattributedEventData({
      subscriptionId: 'sub-rc',
      accountId: 'acct-rc',
      previousTier: 'plus',
      newTier: 'pro',
      reattributedCount: 1,
      occurredAt: new Date('2026-06-11T00:00:00Z'),
    });

    expect(Object.keys(stripeData).sort()).toEqual(CANONICAL_FIELDS);
    expect(Object.keys(revenuecatData).sort()).toEqual(CANONICAL_FIELDS);
    expect(Object.keys(stripeData).sort()).toEqual(
      Object.keys(revenuecatData).sort(),
    );
  });

  it('builder derives previousModel/newModel from tier config (superset schema)', () => {
    const data = buildTopUpCreditsReattributedEventData({
      subscriptionId: 'sub-x',
      accountId: 'acct-x',
      previousTier: 'family',
      newTier: 'plus',
      reattributedCount: 3,
      occurredAt: new Date('2026-06-11T00:00:00Z'),
    });

    expect(data.previousModel).toBe('shared-pool');
    expect(data.newModel).toBe('per-profile');
    expect(data.occurredAt).toBe('2026-06-11T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// [F-124] RevenueCat webhook path — credit re-attribution end-to-end
// ---------------------------------------------------------------------------
//
// The RevenueCat PRODUCT_CHANGE / tier-changing RENEWAL path goes through
// updateSubscriptionAndQuotaFromRevenuecatWebhook, NOT handleTierChange
// (Codex P1 on PR #876). These tests exercise that path end-to-end,
// including the in-transaction previous-tier read (reviewer rework finding:
// the read must be coherent with the row the transaction updates).

describe('[F-124] RevenueCat webhook path re-attributes top-up credits', () => {
  it('family (shared-pool) to plus (per-profile) via webhook: null credits re-attributed to owner', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('rc-family-to-plus');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family',
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 300,
    });

    const result = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
      db,
      acct.id,
      { eventId: 'evt-rc-f124-downgrade', tier: 'plus' },
      { monthlyQuota: getTierConfig('plus').monthlyQuota, dailyLimit: null },
    );

    expect(result).not.toBeNull();
    expect(result!.tier).toBe('plus');

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBe(owner.id);
  });

  it('plus (per-profile) to family (shared-pool) via webhook: owner credits nullified', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('rc-plus-to-family');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus',
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: owner.id,
      amount: 500,
      remaining: 250,
    });

    const result = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
      db,
      acct.id,
      { eventId: 'evt-rc-f124-upgrade', tier: 'family' },
      { monthlyQuota: getTierConfig('family').monthlyQuota, dailyLimit: null },
    );

    expect(result).not.toBeNull();
    expect(result!.tier).toBe('family');

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBeNull();
  });

  it('duplicate webhook delivery (same eventId) does not re-run re-attribution side effects', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('rc-duplicate-event');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family',
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 100,
    });

    const updates = {
      eventId: 'evt-rc-f124-dup',
      tier: 'plus' as const,
    };
    const quota = {
      monthlyQuota: getTierConfig('plus').monthlyQuota,
      dailyLimit: null,
    };

    const first = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
      db,
      acct.id,
      updates,
      quota,
    );
    expect(first!.webhookApplied).toBe(true);

    // Duplicate delivery — idempotency stamp short-circuits before the
    // re-attribution block (webhookApplied=false branch).
    const second = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
      db,
      acct.id,
      updates,
      quota,
    );
    expect(second!.webhookApplied).toBe(false);

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBe(owner.id); // attributed once, stable
  });
});

// ---------------------------------------------------------------------------
// [F-124 rework] Stripe path (handleTierChange) — transaction-coherent
// previous-tier read
// ---------------------------------------------------------------------------
//
// Third review pass on WI-583: handleTierChange read the previous tier BEFORE
// the transaction opened (tier.ts pre-fix), so a concurrent tier change could
// make the compare-and-reattribute act on a stale tier — the same defect class
// fixed on the RevenueCat path in PR #876. The fix re-reads the tier INSIDE
// db.transaction. A deterministic concurrency interleaving is not controllable
// through the Neon HTTP driver, so these tests pin the observable contract:
// chained sequential tier changes must derive each step's previous tier from
// the CURRENT row state, with credits tracking the quota model at every hop.

describe('[F-124 rework] Stripe path chained tier changes stay transaction-coherent', () => {
  it('family→plus→pro→plus: credits track the quota model at every hop, previousTier reflects current row state', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('stripe-tx-chained');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family',
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 400,
    });

    // Hop 1: family (shared-pool) → plus (per-profile) — attribute to owner
    const r1 = await handleTierChange(db, sub.id, 'plus');
    expect(r1!.previousTier).toBe('family');
    let credits = await loadTopUpCredits(sub.id);
    expect(credits[0]!.profileId).toBe(owner.id);

    // Hop 2: plus (per-profile) → pro (shared-pool) — nullify.
    // previousTier MUST be 'plus' (the current row state written by hop 1),
    // not any earlier snapshot.
    const r2 = await handleTierChange(db, sub.id, 'pro');
    expect(r2!.previousTier).toBe('plus');
    credits = await loadTopUpCredits(sub.id);
    expect(credits[0]!.profileId).toBeNull();

    // Hop 3: pro (shared-pool) → plus (per-profile) — attribute again
    const r3 = await handleTierChange(db, sub.id, 'plus');
    expect(r3!.previousTier).toBe('pro');
    credits = await loadTopUpCredits(sub.id);
    expect(credits[0]!.profileId).toBe(owner.id);
  });

  it('repeated same-tier call after a model change is a no-op for credits (idempotent)', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('stripe-tx-idem');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family',
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 100,
    });

    await handleTierChange(db, sub.id, 'plus');

    // Second identical call: in-tx read sees tier already 'plus' →
    // previousTier === newTier → model unchanged → no re-attribution work.
    const second = await handleTierChange(db, sub.id, 'plus');
    expect(second!.previousTier).toBe('plus');

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBe(owner.id); // attributed once, stable
  });

  /**
   * Concurrency invariant (Codex P1 on PR #897): the in-transaction tier read
   * is SELECT … FOR UPDATE, so two concurrent tier changes on the same
   * subscription serialize — the second blocks on the row lock and then sees
   * the first one's committed tier. Whichever order they commit in, the
   * credits' profileId must match the FINAL tier's quota model (a stale
   * unserialized read could leave credits attributed for the losing tier).
   */
  it('concurrent tier changes serialize on the row lock — credits match the final tier model', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('stripe-tx-concurrent');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family',
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 350,
    });

    // Race a per-profile target against a shared-pool target.
    await Promise.all([
      handleTierChange(db, sub.id, 'plus'),
      handleTierChange(db, sub.id, 'pro'),
    ]);

    const finalSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, sub.id),
    });
    const finalModel = getTierConfig(finalSub!.tier).quotaModel;
    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    if (finalModel === 'per-profile') {
      expect(credits[0]!.profileId).toBe(owner.id);
    } else {
      expect(credits[0]!.profileId).toBeNull();
    }
  });
});
