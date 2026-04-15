// ---------------------------------------------------------------------------
// Billing — Subscription CRUD, Stripe linking, free provisioning, quota pool
// getSubscriptionByAccountId, createSubscription, updateSubscriptionFromWebhook,
// linkStripeCustomer, getQuotaPool, resetMonthlyQuota, ensureFreeSubscription,
// markSubscriptionCancelled, updateQuotaPoolLimit, activateSubscriptionFromCheckout
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  subscriptions,
  quotaPools,
  type Database,
  createAccountRepository,
  findSubscriptionByStripeId,
  findQuotaPool,
} from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig, isValidTransition } from '../subscription';
import { captureException } from '../sentry';
import {
  mapSubscriptionRow,
  mapQuotaPoolRow,
  type SubscriptionRow,
  type QuotaPoolRow,
  type WebhookSubscriptionUpdate,
} from './types';

// ---------------------------------------------------------------------------
// getSubscriptionByAccountId
// ---------------------------------------------------------------------------

/**
 * Reads the subscription for a given account.
 * Returns null if no subscription exists.
 */
export async function getSubscriptionByAccountId(
  db: Database,
  accountId: string
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
  }
): Promise<SubscriptionRow> {
  const [subRow] = await db
    .insert(subscriptions)
    .values({
      accountId,
      tier,
      status: options?.status ?? 'trial',
      stripeCustomerId: options?.stripeCustomerId ?? null,
      stripeSubscriptionId: options?.stripeSubscriptionId ?? null,
      trialEndsAt: options?.trialEndsAt ? new Date(options.trialEndsAt) : null,
    })
    .returning();

  if (!subRow) throw new Error('Subscription insert did not return a row');

  // Create the quota pool linked to this subscription
  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

  const tierConfig = getTierConfig(tier);
  await db.insert(quotaPools).values({
    subscriptionId: subRow.id,
    monthlyLimit,
    usedThisMonth: 0,
    dailyLimit: tierConfig.dailyLimit,
    usedToday: 0,
    cycleResetAt,
  });

  return mapSubscriptionRow(subRow);
}

// ---------------------------------------------------------------------------
// updateSubscriptionFromWebhook
// ---------------------------------------------------------------------------

/**
 * Idempotent update from a Stripe webhook event.
 * Skips the update if `lastStripeEventTimestamp` is newer than the incoming event,
 * preventing out-of-order event processing.
 */
export async function updateSubscriptionFromWebhook(
  db: Database,
  stripeSubscriptionId: string,
  updates: WebhookSubscriptionUpdate
): Promise<SubscriptionRow | null> {
  // Load current row (BD-10: via standalone helper — keyed by Stripe ID, not accountId)
  const existing = await findSubscriptionByStripeId(db, stripeSubscriptionId);

  if (!existing) {
    return null;
  }

  // Idempotency check: skip if incoming event is older (NaN-safe) [1C.6]
  if (existing.lastStripeEventTimestamp) {
    const existingTs = existing.lastStripeEventTimestamp.getTime();
    const incomingTs = new Date(updates.lastStripeEventTimestamp).getTime();
    if (
      !Number.isNaN(existingTs) &&
      !Number.isNaN(incomingTs) &&
      incomingTs <= existingTs
    ) {
      return mapSubscriptionRow(existing);
    }
  }

  const setValues: Record<string, unknown> = {
    lastStripeEventTimestamp: new Date(updates.lastStripeEventTimestamp),
    updatedAt: new Date(),
  };

  if (updates.tier !== undefined) {
    setValues.tier = updates.tier;
  }
  if (updates.status !== undefined && updates.status !== existing.status) {
    if (!isValidTransition(existing.status, updates.status)) {
      console.error(
        `[billing] Invalid Stripe subscription transition: ${existing.status} -> ${updates.status} (sub: ${existing.id})`
      );
      captureException(
        new Error(
          `Invalid Stripe subscription transition: ${existing.status} -> ${updates.status}`
        ),
        {
          extra: {
            subscriptionId: existing.id,
            fromStatus: existing.status,
            toStatus: updates.status,
          },
        }
      );
      return mapSubscriptionRow(existing);
    }
    setValues.status = updates.status;
  }
  if (updates.currentPeriodStart !== undefined) {
    setValues.currentPeriodStart = new Date(updates.currentPeriodStart);
  }
  if (updates.currentPeriodEnd !== undefined) {
    setValues.currentPeriodEnd = new Date(updates.currentPeriodEnd);
  }
  if (updates.cancelledAt !== undefined) {
    setValues.cancelledAt = updates.cancelledAt
      ? new Date(updates.cancelledAt)
      : null;
  }

  const [updated] = await db
    .update(subscriptions)
    .set(setValues)
    .where(eq(subscriptions.id, existing.id))
    .returning();

  if (!updated)
    throw new Error('Subscription webhook update did not return a row');
  return mapSubscriptionRow(updated);
}

// ---------------------------------------------------------------------------
// linkStripeCustomer
// ---------------------------------------------------------------------------

/**
 * Links a Stripe customer ID to an existing subscription.
 */
export async function linkStripeCustomer(
  db: Database,
  accountId: string,
  stripeCustomerId: string
): Promise<SubscriptionRow | null> {
  const repo = createAccountRepository(db, accountId);
  const existing = await repo.subscriptions.findFirst();

  if (!existing) {
    return null;
  }

  const [updated] = await db
    .update(subscriptions)
    .set({
      stripeCustomerId,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  if (!updated)
    throw new Error('Stripe customer link update did not return a row');
  return mapSubscriptionRow(updated);
}

// ---------------------------------------------------------------------------
// getQuotaPool
// ---------------------------------------------------------------------------

/**
 * Reads the quota pool for a subscription.
 */
export async function getQuotaPool(
  db: Database,
  subscriptionId: string
): Promise<QuotaPoolRow | null> {
  const row = await findQuotaPool(db, subscriptionId);
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
  newLimit: number
): Promise<QuotaPoolRow | null> {
  const existing = await findQuotaPool(db, subscriptionId);

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
// ensureFreeSubscription
// ---------------------------------------------------------------------------

// Free-tier auto-provisioning (CR1 fix: ensures free users get metered)
const FREE_TIER_LIMIT = getTierConfig('free').monthlyQuota;

/**
 * Ensures an account has a subscription row for metering.
 * If no subscription exists, auto-provisions a free-tier subscription + quota pool.
 * This prevents free-tier users from bypassing metering entirely.
 */
export async function ensureFreeSubscription(
  db: Database,
  accountId: string
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountId(db, accountId);
  if (existing) return existing;
  return createSubscription(db, accountId, 'free', FREE_TIER_LIMIT, {
    status: 'active',
  });
}

// ---------------------------------------------------------------------------
// markSubscriptionCancelled
// ---------------------------------------------------------------------------

/**
 * Sets `cancelledAt` on a subscription for immediate UX feedback.
 * The webhook will also set this, but marking it locally avoids waiting
 * for the async Stripe event to reflect in the GET /subscription response.
 */
export async function markSubscriptionCancelled(
  db: Database,
  subscriptionId: string
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId));
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
  dailyLimit: number | null
): Promise<void> {
  await db
    .update(quotaPools)
    .set({
      monthlyLimit: newLimit,
      dailyLimit,
      updatedAt: new Date(),
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId));
}

// ---------------------------------------------------------------------------
// activateSubscriptionFromCheckout
// ---------------------------------------------------------------------------

/**
 * Bridges a Stripe subscription ID to our internal subscription row.
 * Called from `checkout.session.completed` webhook handler.
 *
 * - If no subscription exists → creates one via createSubscription()
 * - If subscription exists with null stripeSubscriptionId → links it
 * - If subscription already has a stripeSubscriptionId → returns existing (idempotent)
 */
export async function activateSubscriptionFromCheckout(
  db: Database,
  accountId: string,
  stripeSubscriptionId: string,
  tier: 'plus' | 'family' | 'pro',
  eventTimestamp: string
): Promise<SubscriptionRow | null> {
  const existing = await getSubscriptionByAccountId(db, accountId);

  if (!existing) {
    const tierConfig = getTierConfig(tier);
    return createSubscription(db, accountId, tier, tierConfig.monthlyQuota, {
      stripeSubscriptionId,
      status: 'active',
    });
  }

  // Already linked — idempotent return (same or different Stripe sub ID)
  if (existing.stripeSubscriptionId) {
    return existing;
  }

  // Bridge: set stripeSubscriptionId, tier, status, timestamp
  const tierConfig = getTierConfig(tier);
  const [updated] = await db
    .update(subscriptions)
    .set({
      stripeSubscriptionId,
      tier,
      status: 'active',
      lastStripeEventTimestamp: new Date(eventTimestamp),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  // Update quota pool limit to match the new tier
  await updateQuotaPoolLimit(
    db,
    existing.id,
    tierConfig.monthlyQuota,
    tierConfig.dailyLimit
  );

  if (!updated)
    throw new Error('Subscription activation update did not return a row');
  return mapSubscriptionRow(updated);
}
