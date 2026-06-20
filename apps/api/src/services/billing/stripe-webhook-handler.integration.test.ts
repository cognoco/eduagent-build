/**
 * Integration: Stripe webhook tier-change top-up credit re-attribution
 * — WI-618 / F-124 siblings
 *
 * F-124 (Stripe path): when a Stripe subscription event crosses the quota model
 * (per-profile <-> shared-pool), active top-up credits must be re-attributed
 * (profileId owner <-> null) inside the same transaction that writes the new
 * tier, or they are stranded and become unspendable. The three crossing sites:
 *   - customer.subscription.deleted  (handleSubscriptionDeleted)  → free
 *   - expiry branch of subscription.updated (handleSubscriptionEvent) → free
 *   - active-tier branch of subscription.updated → effectiveTier (e.g. family)
 *
 * Mirrors the coherence tests added for the RevenueCat/Stripe handleTierChange
 * paths in tier.integration.test.ts (PR #897). No internal mocks — real DB only.
 * External-boundary Inngest dispatch is swallowed by safeSend (no event key in
 * test env → non-fatal); the KV cache arg is undefined (no KV in test env).
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
import type Stripe from 'stripe';

import {
  handleSubscriptionDeleted,
  handleSubscriptionEvent,
} from './stripe-webhook-handler';
import { getTierConfig } from '../subscription';
import type { StripePriceEnv } from '../billing-pricing';

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

// Empty env → Stripe pricing "unconfigured" → effectiveTier falls back to the
// metadata tier (verifySubscriptionTier). This is the dormant-billing posture
// the WI targets.
const UNCONFIGURED_ENV = {} as StripePriceEnv;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const PREFIX = 'integration-stripe-webhook-f124';
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
  stripeSubscriptionId: string;
}) {
  const db = createIntegrationDb();
  const tierConfig = getTierConfig(input.tier);

  const [sub] = await db
    .insert(subscriptions)
    .values({
      accountId: input.accountId,
      tier: input.tier,
      status: 'active',
      stripeSubscriptionId: input.stripeSubscriptionId,
    })
    .returning();

  await db.insert(quotaPools).values({
    subscriptionId: sub!.id,
    monthlyLimit: tierConfig.monthlyQuota,
    usedThisMonth: 0,
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

function stripeSub(input: {
  id: string;
  status: string;
  metadataTier?: string;
}): Stripe.Subscription {
  return {
    id: input.id,
    status: input.status,
    metadata: input.metadataTier ? { tier: input.metadataTier } : {},
    items: { data: [] },
    canceled_at: null,
  } as unknown as Stripe.Subscription;
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
// [BREAK F-124] handleSubscriptionDeleted — shared-pool → free re-attribution
// ---------------------------------------------------------------------------

describe('[BREAK F-124] handleSubscriptionDeleted re-attributes top-up credits', () => {
  it('[BREAK F-124] family (shared-pool) sub deleted → free: null credits re-attributed to owner', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('deleted-family');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family', // shared-pool
      stripeSubscriptionId: `sub_stripe_${PREFIX}-deleted-family`,
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null, // shared-pool purchase
      amount: 500,
      remaining: 400,
    });

    await handleSubscriptionDeleted(
      db,
      undefined,
      stripeSub({ id: sub.stripeSubscriptionId!, status: 'canceled' }),
      '2026-06-20T00:00:00.000Z',
      'evt_del_family_1',
    );

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBe(owner.id);

    const updatedSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, sub.id),
    });
    expect(updatedSub!.tier).toBe('free');
    expect(updatedSub!.status).toBe('expired');
  });

  it('[F-096] plus (per-profile) sub deleted → free: owner credits left untouched (no model crossing)', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('deleted-plus');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus', // per-profile
      stripeSubscriptionId: `sub_stripe_${PREFIX}-deleted-plus`,
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: owner.id, // per-profile purchase
      amount: 500,
      remaining: 300,
    });

    await handleSubscriptionDeleted(
      db,
      undefined,
      stripeSub({ id: sub.stripeSubscriptionId!, status: 'canceled' }),
      '2026-06-20T00:00:00.000Z',
      'evt_del_plus_1',
    );

    // free is also per-profile → no model crossing → unchanged.
    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBe(owner.id);
  });

  it('no credits present — deleted path succeeds without error', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('deleted-no-credits');
    await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'family',
      stripeSubscriptionId: `sub_stripe_${PREFIX}-deleted-no-credits`,
    });

    await handleSubscriptionDeleted(
      db,
      undefined,
      stripeSub({ id: sub.stripeSubscriptionId!, status: 'canceled' }),
      '2026-06-20T00:00:00.000Z',
      'evt_del_nocredits_1',
    );

    const credits = await loadTopUpCredits(sub.id);
    expect(credits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [BREAK F-124] handleSubscriptionEvent — expiry + active-tier crossings
// ---------------------------------------------------------------------------

describe('[BREAK F-124] handleSubscriptionEvent re-attributes top-up credits', () => {
  it('[BREAK F-124] expiry branch: pro (shared-pool) → free re-attributes null credits to owner', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('expiry-pro');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'pro', // shared-pool
      stripeSubscriptionId: `sub_stripe_${PREFIX}-expiry-pro`,
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: null,
      amount: 500,
      remaining: 250,
    });

    // 'incomplete_expired' maps to 'expired' → isExpired branch → tier free.
    await handleSubscriptionEvent(
      db,
      undefined,
      stripeSub({
        id: sub.stripeSubscriptionId!,
        status: 'incomplete_expired',
      }),
      '2026-06-20T00:00:00.000Z',
      'evt_expiry_pro_1',
      UNCONFIGURED_ENV,
    );

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBe(owner.id);

    const updatedSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, sub.id),
    });
    expect(updatedSub!.tier).toBe('free');
  });

  it('[BREAK F-124] active-tier branch: plus (per-profile) → family (shared-pool) nullifies owner credits', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('active-plus-to-family');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus', // per-profile
      stripeSubscriptionId: `sub_stripe_${PREFIX}-active-plus-to-family`,
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: owner.id, // per-profile purchase
      amount: 500,
      remaining: 200,
    });

    // status active + metadata tier family → effectiveTier 'family' (shared-pool).
    await handleSubscriptionEvent(
      db,
      undefined,
      stripeSub({
        id: sub.stripeSubscriptionId!,
        status: 'active',
        metadataTier: 'family',
      }),
      '2026-06-20T00:00:00.000Z',
      'evt_active_family_1',
      UNCONFIGURED_ENV,
    );

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBeNull();

    const updatedSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, sub.id),
    });
    expect(updatedSub!.tier).toBe('family');
  });

  it('[F-096] active-tier branch: plus → plus (no model change) leaves owner credits untouched', async () => {
    const db = createIntegrationDb();
    const acct = await seedAccount('active-plus-to-plus');
    const owner = await seedProfile({
      accountId: acct.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const sub = await seedSubscriptionWithQuota({
      accountId: acct.id,
      tier: 'plus',
      stripeSubscriptionId: `sub_stripe_${PREFIX}-active-plus-to-plus`,
    });
    await seedTopUpCredit({
      subscriptionId: sub.id,
      profileId: owner.id,
      amount: 500,
      remaining: 200,
    });

    await handleSubscriptionEvent(
      db,
      undefined,
      stripeSub({
        id: sub.stripeSubscriptionId!,
        status: 'active',
        metadataTier: 'plus',
      }),
      '2026-06-20T00:00:00.000Z',
      'evt_active_plus_1',
      UNCONFIGURED_ENV,
    );

    const credits = await loadTopUpCredits(sub.id);
    expect(credits.length).toBe(1);
    expect(credits[0]!.profileId).toBe(owner.id);
  });
});
