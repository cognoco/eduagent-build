// ---------------------------------------------------------------------------
// Billing — Subscription CRUD (legacy-reachable subset) + quota pool
// reads/writes (subscriptionId-keyed, store-agnostic)
//
// [WI-1239 / 779-strip] updateSubscriptionFromWebhook, linkStripeCustomer,
// getOrCreateStripeCustomer, getSubscriptionByStripeCustomerId,
// markSubscriptionCancelled, and activateSubscriptionFromCheckout were
// removed — every caller was dead (routes/webhooks always dispatch to the v2
// handler bundle; the legacy Stripe route flow was never reachable).
// Superseded by their `-V2` twins in billing-v2/subscription-core-v2.ts.
//
// getSubscriptionByAccountId, createSubscription, and ensureFreeSubscription
// are KEPT — they are still transitively reachable from services/account.ts's
// findOrCreateAccount and services/profile.ts's createProfileWithLimitCheck
// (both out of WI-1239's scope; dead in production routes, tracked as
// follow-up hygiene / WI-1254). Live v2 equivalents:
// getSubscriptionByAccountIdV2 / ensureFreeSubscriptionV2 in
// billing-v2/subscription-core-v2.ts.
//
// getQuotaPool / resetMonthlyQuota / updateQuotaPoolLimit are kept — they
// read/write only `quota_pools` by subscriptionId (a neutral satellite table,
// unaffected by the identity cutover), and getQuotaPool is a live dependency
// of inngest/functions/session-completed.ts.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  subscriptions,
  quotaPools,
  type Database,
  createAccountRepository,
  findQuotaPool__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig } from '../subscription';
import { captureException } from '../sentry';
import {
  mapSubscriptionRow,
  mapQuotaPoolRow,
  type SubscriptionRow,
  type QuotaPoolRow,
} from './types';
import { reconcileQuotaStateForSubscription } from './quota-reconcile';

// ---------------------------------------------------------------------------
// getSubscriptionByAccountId
// ---------------------------------------------------------------------------

/**
 * Reads the subscription for a given account.
 * Returns null if no subscription exists.
 */
export async function getSubscriptionByAccountId(
  db: Database,
  accountId: string,
): Promise<SubscriptionRow | null> {
  const repo = createAccountRepository(db, accountId);
  const row = await repo.subscriptions.findFirst();
  return row ? mapSubscriptionRow(row) : null;
}

// ---------------------------------------------------------------------------
// createSubscription
// ---------------------------------------------------------------------------

/**
 * Creates a new subscription for an account.
 * Also creates the associated quota pool with the given monthly limit.
 */
export async function createSubscription(
  db: Database,
  accountId: string,
  tier: SubscriptionTier,
  monthlyLimit: number,
  options?: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    trialEndsAt?: string;
    status?: SubscriptionStatus;
  },
): Promise<SubscriptionRow> {
  return db.transaction(async (tx) => {
    const [subRow] = await tx
      .insert(subscriptions)
      .values({
        accountId,
        tier,
        status: options?.status ?? 'trial',
        stripeCustomerId: options?.stripeCustomerId ?? null,
        stripeSubscriptionId: options?.stripeSubscriptionId ?? null,
        trialEndsAt: options?.trialEndsAt
          ? new Date(options.trialEndsAt)
          : null,
      })
      .returning();

    if (!subRow) throw new Error('Subscription insert did not return a row');

    // Create the quota pool linked to this subscription.
    const now = new Date();
    const cycleResetAt = new Date(now);
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    const tierConfig = getTierConfig(tier);
    await tx.insert(quotaPools).values({
      subscriptionId: subRow.id,
      monthlyLimit,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: 0,
      cycleResetAt,
    });
    await reconcileQuotaStateForSubscription(
      tx as unknown as Database,
      subRow.id,
      now,
    );

    return mapSubscriptionRow(subRow);
  });
}

// ---------------------------------------------------------------------------
// ensureFreeSubscription
// ---------------------------------------------------------------------------

const FREE_TIER_LIMIT = getTierConfig('free').monthlyQuota;

/**
 * Ensures an account has a free-tier subscription, creating one if absent.
 * Race-safe via ON CONFLICT DO NOTHING on the unique(subscription.accountId)
 * — if the unique(subscription_id) constraint trips, the other writer
 * already created it, so we no-op.
 */
export async function ensureFreeSubscription(
  db: Database,
  accountId: string,
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountId(db, accountId);
  if (existing) return existing;

  // Attempt the insert with ON CONFLICT DO NOTHING. If we win the race, we
  // get the inserted row back. If another writer beat us, returning() yields
  // an empty array and we re-read.
  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
  const tierConfig = getTierConfig('free');

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(subscriptions)
      .values({
        accountId,
        tier: 'free',
        status: 'active',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        trialEndsAt: null,
      })
      .onConflictDoNothing({ target: subscriptions.accountId })
      .returning();

    if (!row) return null;

    // We won the race — also create the quota pool. Same race-safe insert.
    await tx
      .insert(quotaPools)
      .values({
        subscriptionId: row.id,
        monthlyLimit: FREE_TIER_LIMIT,
        usedThisMonth: 0,
        dailyLimit: tierConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt,
      })
      .onConflictDoNothing({ target: quotaPools.subscriptionId });
    await reconcileQuotaStateForSubscription(
      tx as unknown as Database,
      row.id,
      now,
    );
    return row;
  });

  if (inserted) {
    return mapSubscriptionRow(inserted);
  }

  // Lost the race — the other writer's row should now be visible. Re-read.
  const winner = await getSubscriptionByAccountId(db, accountId);
  if (winner) return winner;

  // Extremely unlikely fallthrough: ON CONFLICT fired but the re-read still
  // returns null (would indicate the row was deleted between the two reads,
  // or a partition-level isolation issue). Escalate so we know, and surface
  // a hard error rather than continuing in an inconsistent state.
  captureException(
    new Error(
      'ensureFreeSubscription: ON CONFLICT fired but re-read returned null',
    ),
    {
      extra: {
        context: 'billing.ensure_free_subscription.race_fallthrough',
        accountId,
      },
    },
  );
  throw new Error(
    'ensureFreeSubscription: failed to insert and failed to re-read existing',
  );
}

// ---------------------------------------------------------------------------
// getQuotaPool
// ---------------------------------------------------------------------------

/**
 * Reads the quota pool for a subscription.
 */
export async function getQuotaPool(
  db: Database,
  subscriptionId: string,
): Promise<QuotaPoolRow | null> {
  // safe-caller: internal billing aggregate — subscriptionId comes from a previously-verified account row
  const row = await findQuotaPool__unscoped(db, subscriptionId);
  return row ? mapQuotaPoolRow(row) : null;
}

// ---------------------------------------------------------------------------
// resetMonthlyQuota
// ---------------------------------------------------------------------------

/**
 * Resets the monthly quota counter and updates the limit.
 * Called at the start of each billing cycle.
 */
export async function resetMonthlyQuota(
  db: Database,
  subscriptionId: string,
  newLimit: number,
): Promise<QuotaPoolRow | null> {
  // safe-caller: billing cycle reset (cron/Stripe webhook) — subscriptionId from verified event
  const existing = await findQuotaPool__unscoped(db, subscriptionId);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setMonth(nextReset.getMonth() + 1);

  const [updated] = await db
    .update(quotaPools)
    .set({
      monthlyLimit: newLimit,
      usedThisMonth: 0,
      usedToday: 0,
      cycleResetAt: nextReset,
      updatedAt: now,
    })
    .where(eq(quotaPools.id, existing.id))
    .returning();

  if (!updated) throw new Error('Quota pool update did not return a row');
  return mapQuotaPoolRow(updated);
}

// ---------------------------------------------------------------------------
// updateQuotaPoolLimit
// ---------------------------------------------------------------------------

/**
 * Updates the monthly limit on a quota pool without resetting usedThisMonth.
 * Used for mid-cycle tier changes — preserves current usage count.
 */
export async function updateQuotaPoolLimit(
  db: Database,
  subscriptionId: string,
  newLimit: number,
  dailyLimit: number | null,
): Promise<void> {
  const updatedRows = await db
    .update(quotaPools)
    .set({
      monthlyLimit: newLimit,
      dailyLimit,
      updatedAt: new Date(),
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId))
    .returning({ id: quotaPools.id });

  if (updatedRows.length === 0) {
    throw new Error(
      `Missing quota pool for subscription ${subscriptionId}; rolling back quota limit update`,
    );
  }
}
