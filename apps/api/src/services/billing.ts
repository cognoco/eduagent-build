// ---------------------------------------------------------------------------
// Billing DB Service — Sprint 9 Phase 1
// Account-scoped database operations for subscriptions and quota pools.
// Pure data layer — no Hono imports.
// ---------------------------------------------------------------------------

import { and, eq, sql, lte, gte } from 'drizzle-orm';
import {
  subscriptions,
  quotaPools,
  topUpCredits,
  profiles,
  byokWaitlist,
  type Database,
} from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig } from './subscription';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionRow {
  id: string;
  accountId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  lastStripeEventTimestamp: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotaPoolRow {
  id: string;
  subscriptionId: string;
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
  cycleResetAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookSubscriptionUpdate {
  tier?: SubscriptionTier;
  status?: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelledAt?: string | null;
  lastStripeEventTimestamp: string;
}

// ---------------------------------------------------------------------------
// Mappers — Drizzle Date -> API ISO string
// ---------------------------------------------------------------------------

function mapSubscriptionRow(
  row: typeof subscriptions.$inferSelect
): SubscriptionRow {
  return {
    id: row.id,
    accountId: row.accountId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    tier: row.tier,
    status: row.status,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    lastStripeEventTimestamp:
      row.lastStripeEventTimestamp?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapQuotaPoolRow(row: typeof quotaPools.$inferSelect): QuotaPoolRow {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    monthlyLimit: row.monthlyLimit,
    usedThisMonth: row.usedThisMonth,
    dailyLimit: row.dailyLimit,
    usedToday: row.usedToday,
    cycleResetAt: row.cycleResetAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Reads the subscription for a given account.
 * Returns null if no subscription exists.
 */
export async function getSubscriptionByAccountId(
  db: Database,
  accountId: string
): Promise<SubscriptionRow | null> {
  const row = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });
  return row ? mapSubscriptionRow(row) : null;
}

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

  // Create the quota pool linked to this subscription
  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

  const tierConfig = getTierConfig(tier);
  await db.insert(quotaPools).values({
    subscriptionId: subRow!.id,
    monthlyLimit,
    usedThisMonth: 0,
    dailyLimit: tierConfig.dailyLimit,
    usedToday: 0,
    cycleResetAt,
  });

  return mapSubscriptionRow(subRow!);
}

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
  // Load current row
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
  });

  if (!existing) {
    return null;
  }

  // Idempotency check: skip if incoming event is older
  if (existing.lastStripeEventTimestamp) {
    const existingTs = existing.lastStripeEventTimestamp.getTime();
    const incomingTs = new Date(updates.lastStripeEventTimestamp).getTime();
    if (incomingTs <= existingTs) {
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
  if (updates.status !== undefined) {
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

  return mapSubscriptionRow(updated!);
}

/**
 * Links a Stripe customer ID to an existing subscription.
 */
export async function linkStripeCustomer(
  db: Database,
  accountId: string,
  stripeCustomerId: string
): Promise<SubscriptionRow | null> {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });

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

  return mapSubscriptionRow(updated!);
}

/**
 * Reads the quota pool for a subscription.
 */
export async function getQuotaPool(
  db: Database,
  subscriptionId: string
): Promise<QuotaPoolRow | null> {
  const row = await db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
  return row ? mapQuotaPoolRow(row) : null;
}

/**
 * Resets the monthly quota counter and updates the limit.
 * Called at the start of each billing cycle.
 */
export async function resetMonthlyQuota(
  db: Database,
  subscriptionId: string,
  newLimit: number
): Promise<QuotaPoolRow | null> {
  const existing = await db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });

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

  return mapQuotaPoolRow(updated!);
}

// ---------------------------------------------------------------------------
// Free-tier auto-provisioning (CR1 fix: ensures free users get metered)
// ---------------------------------------------------------------------------

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
// Cancel helpers (Story 5.4 — immediate local state update)
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
// Checkout activation (Story 5.1 — bridges Stripe subscription ID)
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

  return mapSubscriptionRow(updated!);
}

// ---------------------------------------------------------------------------
// Trial expiry helpers (used by Inngest trial-expiry function)
// ---------------------------------------------------------------------------

/**
 * Expires a trial subscription by setting status to expired and tier to free.
 */
export async function expireTrialSubscription(
  db: Database,
  subscriptionId: string
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      status: 'expired',
      tier: 'free',
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId));
}

/**
 * Downgrades a quota pool to the given tier's monthly limit and resets usage.
 * Idempotent: skips reset if the pool already has the target monthly limit,
 * preventing Inngest retries from re-zeroing usage counters mid-cycle.
 */
export async function downgradeQuotaPool(
  db: Database,
  subscriptionId: string,
  monthlyLimit: number,
  dailyLimit: number | null = null
): Promise<void> {
  // Only update pools that haven't already been downgraded to this limit.
  // This prevents retries from resetting usage counters for already-transitioned subscriptions.
  const currentPool = await db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
  if (currentPool && currentPool.monthlyLimit === monthlyLimit) {
    return; // Already at target tier — skip to preserve usage counters
  }

  await db
    .update(quotaPools)
    .set({
      monthlyLimit,
      usedThisMonth: 0,
      dailyLimit,
      usedToday: 0,
      updatedAt: new Date(),
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId));
}

/**
 * Resets the daily question counter for ALL quota pools.
 * Called by the daily Inngest cron at 01:00 UTC.
 */
export async function resetDailyQuotas(
  db: Database,
  now: Date
): Promise<number> {
  const result = await db
    .update(quotaPools)
    .set({
      usedToday: 0,
      updatedAt: now,
    })
    .where(sql`${quotaPools.usedToday} > 0`)
    .returning();

  return result.length;
}

// ---------------------------------------------------------------------------
// Quota decrement / increment (Phase 4)
// ---------------------------------------------------------------------------

export interface DecrementResult {
  success: boolean;
  source: 'monthly' | 'top_up' | 'none' | 'daily_exceeded';
  remainingMonthly: number;
  remainingTopUp: number;
  remainingDaily: number | null;
}

/**
 * Decrements the quota pool by 1 exchange.
 *
 * Strategy:
 * 1. Try monthly quota first (atomic WHERE guard prevents TOCTOU race)
 *    — also enforces daily limit when set (free tier: 10/day)
 * 2. If monthly exhausted but daily OK, consume from oldest unexpired top-up (FIFO)
 * 3. If daily limit hit, return { source: 'daily_exceeded' } immediately
 * 4. If both exhausted, return { success: false }
 *
 * All UPDATEs use SQL WHERE guards so concurrent requests cannot over-decrement.
 */
export async function decrementQuota(
  db: Database,
  subscriptionId: string
): Promise<DecrementResult> {
  // 1. Try monthly quota — atomic: succeeds only if monthly AND daily limits allow
  const [monthlyUpdated] = await db
    .update(quotaPools)
    .set({
      usedThisMonth: sql`${quotaPools.usedThisMonth} + 1`,
      usedToday: sql`${quotaPools.usedToday} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(quotaPools.subscriptionId, subscriptionId),
        sql`${quotaPools.usedThisMonth} < ${quotaPools.monthlyLimit}`,
        sql`(${quotaPools.dailyLimit} IS NULL OR ${quotaPools.usedToday} < ${quotaPools.dailyLimit})`
      )
    )
    .returning();

  if (monthlyUpdated) {
    return {
      success: true,
      source: 'monthly',
      remainingMonthly:
        monthlyUpdated.monthlyLimit - monthlyUpdated.usedThisMonth,
      remainingTopUp: 0,
      remainingDaily:
        monthlyUpdated.dailyLimit !== null
          ? monthlyUpdated.dailyLimit - monthlyUpdated.usedToday
          : null,
    };
  }

  // Atomic update failed — determine why (daily vs monthly)
  const pool = await db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });

  if (!pool) {
    return {
      success: false,
      source: 'none',
      remainingMonthly: 0,
      remainingTopUp: 0,
      remainingDaily: null,
    };
  }

  // Daily limit hit — hard stop, cannot use even top-ups
  if (pool.dailyLimit !== null && pool.usedToday >= pool.dailyLimit) {
    return {
      success: false,
      source: 'daily_exceeded',
      remainingMonthly: Math.max(0, pool.monthlyLimit - pool.usedThisMonth),
      remainingTopUp: 0,
      remainingDaily: 0,
    };
  }

  // 2. Monthly exhausted, daily OK — fall back to top-up credits (FIFO)
  const now = new Date();
  const topUp = await db.query.topUpCredits.findFirst({
    where: sql`${topUpCredits.subscriptionId} = ${subscriptionId}
      AND ${topUpCredits.remaining} > 0
      AND ${topUpCredits.expiresAt} > ${now}`,
    orderBy: sql`${topUpCredits.purchasedAt} ASC`,
  });

  if (topUp) {
    // Atomic: only succeeds if remaining > 0 (concurrent request may have consumed it)
    const [updatedTopUp] = await db
      .update(topUpCredits)
      .set({
        remaining: sql`${topUpCredits.remaining} - 1`,
      })
      .where(
        and(eq(topUpCredits.id, topUp.id), sql`${topUpCredits.remaining} > 0`)
      )
      .returning();

    if (updatedTopUp) {
      // Also increment usedToday since we consumed a question
      await db
        .update(quotaPools)
        .set({
          usedToday: sql`${quotaPools.usedToday} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(quotaPools.subscriptionId, subscriptionId));

      return {
        success: true,
        source: 'top_up',
        remainingMonthly: 0,
        remainingTopUp: updatedTopUp.remaining,
        remainingDaily:
          pool.dailyLimit !== null
            ? pool.dailyLimit - pool.usedToday - 1
            : null,
      };
    }
  }

  // 3. Both exhausted or no top-ups available
  return {
    success: false,
    source: 'none',
    remainingMonthly: 0,
    remainingTopUp: 0,
    remainingDaily:
      pool.dailyLimit !== null
        ? Math.max(0, pool.dailyLimit - pool.usedToday)
        : null,
  };
}

/**
 * Refunds 1 exchange back to the quota pool.
 * Used when an LLM call fails after decrement — avoids charging for failed work.
 *
 * Refunds always go to the monthly pool (simpler, avoids FIFO complications).
 * Also refunds the daily counter to keep both in sync.
 */
export async function incrementQuota(
  db: Database,
  subscriptionId: string
): Promise<void> {
  await db
    .update(quotaPools)
    .set({
      usedThisMonth: sql`GREATEST(${quotaPools.usedThisMonth} - 1, 0)`,
      usedToday: sql`GREATEST(${quotaPools.usedToday} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId));
}

// ---------------------------------------------------------------------------
// Family billing (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Resolves a profile ID to its account's subscription.
 * Profile → Account → Subscription chain.
 */
export async function getSubscriptionForProfile(
  db: Database,
  profileId: string
): Promise<SubscriptionRow | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });

  if (!profile) {
    return null;
  }

  return getSubscriptionByAccountId(db, profile.accountId);
}

/**
 * Counts profiles under the account that owns a subscription.
 */
export async function getProfileCountForSubscription(
  db: Database,
  subscriptionId: string
): Promise<number> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub) {
    return 0;
  }

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(eq(profiles.accountId, sub.accountId));

  return result[0]?.count ?? 0;
}

/**
 * Checks whether a subscription can accept another profile.
 * Profile limits are defined per-tier in TierConfig.
 */
export async function canAddProfile(
  db: Database,
  subscriptionId: string
): Promise<boolean> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub) {
    return false;
  }

  const tierConfig = getTierConfig(
    (sub.tier as 'free' | 'plus' | 'family' | 'pro') ?? 'free'
  );
  const current = await getProfileCountForSubscription(db, subscriptionId);

  return current < tierConfig.maxProfiles;
}

// ---------------------------------------------------------------------------
// BYOK Waitlist
// ---------------------------------------------------------------------------

/**
 * Adds an email to the BYOK (Bring Your Own Key) waitlist.
 * Uses ON CONFLICT DO NOTHING for idempotency.
 */
export async function addToByokWaitlist(
  db: Database,
  email: string
): Promise<void> {
  await db
    .insert(byokWaitlist)
    .values({ email })
    .onConflictDoNothing({ target: byokWaitlist.email });
}

// ---------------------------------------------------------------------------
// Quota cycle reset (used by inngest/functions/quota-reset.ts)
// ---------------------------------------------------------------------------

/**
 * Finds all quota pools whose billing cycle has elapsed and resets them.
 * For each pool: resets usedThisMonth to 0, updates monthlyLimit to match
 * the subscription tier, and advances cycleResetAt by one month.
 */
export async function resetExpiredQuotaCycles(
  db: Database,
  now: Date
): Promise<number> {
  const dueForReset = await db.query.quotaPools.findMany({
    where: lte(quotaPools.cycleResetAt, now),
  });

  let count = 0;

  for (const pool of dueForReset) {
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, pool.subscriptionId),
    });

    const tierConfig = getTierConfig(
      (sub?.tier as 'free' | 'plus' | 'family' | 'pro') ?? 'free'
    );

    // Advance from the pool's own cycle date to maintain billing cadence
    const nextReset = new Date(pool.cycleResetAt);
    nextReset.setMonth(nextReset.getMonth() + 1);

    await db
      .update(quotaPools)
      .set({
        usedThisMonth: 0,
        usedToday: 0,
        monthlyLimit: tierConfig.monthlyQuota,
        dailyLimit: tierConfig.dailyLimit,
        cycleResetAt: nextReset,
        updatedAt: now,
      })
      .where(eq(quotaPools.id, pool.id));

    count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Trial subscription queries (used by inngest/functions/trial-expiry.ts)
// ---------------------------------------------------------------------------

/**
 * Finds all trial subscriptions whose trialEndsAt has passed.
 */
export async function findExpiredTrials(
  db: Database,
  now: Date
): Promise<SubscriptionRow[]> {
  const rows = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, 'trial'),
      lte(subscriptions.trialEndsAt, now)
    ),
  });
  return rows.map(mapSubscriptionRow);
}

/**
 * Finds subscriptions matching a given status whose trialEndsAt falls
 * within a date range (inclusive). Used for trial warnings and soft-landing.
 */
export async function findSubscriptionsByTrialDateRange(
  db: Database,
  status: SubscriptionStatus,
  rangeStart: Date,
  rangeEnd: Date
): Promise<SubscriptionRow[]> {
  const rows = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, status),
      gte(subscriptions.trialEndsAt, rangeStart),
      lte(subscriptions.trialEndsAt, rangeEnd)
    ),
  });
  return rows.map(mapSubscriptionRow);
}

// ---------------------------------------------------------------------------
// Reverse trial soft landing (Story 5.2)
// ---------------------------------------------------------------------------

/**
 * Transitions a trial subscription to the extended trial (soft landing) period.
 * Sets status to 'expired', tier to 'free', and quota pool to the extended
 * trial monthly equivalent (15 questions/day * 30 = 450/month).
 * Resets usedThisMonth so the user starts with a fresh allowance.
 */
export async function transitionToExtendedTrial(
  db: Database,
  subscriptionId: string,
  extendedMonthlyQuota: number
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      status: 'expired',
      tier: 'free',
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId));

  const freeTierConfig = getTierConfig('free');
  await db
    .update(quotaPools)
    .set({
      monthlyLimit: extendedMonthlyQuota,
      usedThisMonth: 0,
      dailyLimit: freeTierConfig.dailyLimit,
      usedToday: 0,
      updatedAt: new Date(),
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId));
}

/**
 * Finds expired subscriptions whose trialEndsAt is between `daysAgo` and
 * `daysAgo - 1` days before `now`. Used to identify subscriptions that have
 * been in the extended trial for exactly N days.
 */
export async function findExpiredTrialsByDaysSinceEnd(
  db: Database,
  now: Date,
  daysAgo: number
): Promise<SubscriptionRow[]> {
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() - daysAgo);
  const dayStart = new Date(
    targetDate.toISOString().slice(0, 10) + 'T00:00:00.000Z'
  );
  const dayEnd = new Date(
    targetDate.toISOString().slice(0, 10) + 'T23:59:59.999Z'
  );

  return findSubscriptionsByTrialDateRange(db, 'expired', dayStart, dayEnd);
}

// ---------------------------------------------------------------------------
// Top-up credit management (Story 5.3)
// ---------------------------------------------------------------------------

export interface TopUpCreditRow {
  id: string;
  subscriptionId: string;
  amount: number;
  remaining: number;
  purchasedAt: string;
  expiresAt: string;
  revenuecatTransactionId: string | null;
  createdAt: string;
}

function mapTopUpCreditRow(
  row: typeof topUpCredits.$inferSelect
): TopUpCreditRow {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    amount: row.amount,
    remaining: row.remaining,
    purchasedAt: row.purchasedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revenuecatTransactionId: row.revenuecatTransactionId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Aggregates total remaining credits across all unexpired top-up packs
 * for a subscription.
 */
export async function getTopUpCreditsRemaining(
  db: Database,
  subscriptionId: string,
  now: Date = new Date()
): Promise<number> {
  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${topUpCredits.remaining}), 0)::int`,
    })
    .from(topUpCredits)
    .where(
      and(
        eq(topUpCredits.subscriptionId, subscriptionId),
        sql`${topUpCredits.remaining} > 0`,
        sql`${topUpCredits.expiresAt} > ${now}`
      )
    );

  return result[0]?.total ?? 0;
}

/** 12-month expiry constant for top-up credits. */
const TOP_UP_EXPIRY_MONTHS = 12;

/**
 * Checks whether a top-up credit pack with the given RevenueCat transaction ID
 * has already been granted. Used for idempotency on webhook retries.
 */
export async function isTopUpAlreadyGranted(
  db: Database,
  transactionId: string
): Promise<boolean> {
  const existing = await db.query.topUpCredits.findFirst({
    where: eq(topUpCredits.revenuecatTransactionId, transactionId),
  });
  return !!existing;
}

/**
 * Creates a top-up credit pack for a subscription.
 * Credits expire 12 months after purchase.
 *
 * Only paid tiers (plus, family, pro) can purchase top-ups.
 * Returns null if the subscription's tier is not eligible.
 *
 * Accepts an optional `transactionId` for RevenueCat IAP idempotency tracking.
 */
export async function purchaseTopUpCredits(
  db: Database,
  subscriptionId: string,
  amount: number,
  now: Date = new Date(),
  transactionId?: string
): Promise<TopUpCreditRow | null> {
  // Verify subscription exists and tier is eligible
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub || sub.tier === 'free') {
    return null;
  }

  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + TOP_UP_EXPIRY_MONTHS);

  const [row] = await db
    .insert(topUpCredits)
    .values({
      subscriptionId,
      amount,
      remaining: amount,
      purchasedAt: now,
      expiresAt,
      revenuecatTransactionId: transactionId ?? null,
    })
    .returning();

  return mapTopUpCreditRow(row!);
}

/**
 * Finds top-up credit packs expiring within a date range.
 * Used by the Inngest top-up expiry reminder function.
 */
export async function findExpiringTopUpCredits(
  db: Database,
  rangeStart: Date,
  rangeEnd: Date
): Promise<TopUpCreditRow[]> {
  const rows = await db.query.topUpCredits.findMany({
    where: and(
      sql`${topUpCredits.remaining} > 0`,
      gte(topUpCredits.expiresAt, rangeStart),
      lte(topUpCredits.expiresAt, rangeEnd)
    ),
  });
  return rows.map(mapTopUpCreditRow);
}

/**
 * Counts how many top-up packs have been purchased for a subscription
 * in the current billing cycle (since cycleStart).
 * Used for the context-aware upgrade prompt: "3+ top-ups in a cycle".
 */
export async function countTopUpPurchasesSinceCycleStart(
  db: Database,
  subscriptionId: string,
  cycleStart: Date
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(topUpCredits)
    .where(
      and(
        eq(topUpCredits.subscriptionId, subscriptionId),
        gte(topUpCredits.purchasedAt, cycleStart)
      )
    );
  return result[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Mid-cycle tier change (Story 5.3)
// ---------------------------------------------------------------------------

export interface TierChangeResult {
  previousTier: SubscriptionTier;
  newTier: SubscriptionTier;
  usedThisCycle: number;
  newMonthlyLimit: number;
  remainingQuestions: number;
}

/**
 * Handles a mid-cycle tier change (upgrade or downgrade).
 *
 * On upgrade:  new tier's full allocation minus questions already consumed.
 *   Example: Plus user consumed 200/500, upgrades to Family (1,500) -> remaining = 1,300.
 *
 * On downgrade: if consumed more than lower tier's allocation, 0 remaining until reset.
 *   Example: Family user consumed 800, downgrades to Plus (500) -> 0 remaining.
 *
 * Stripe handles billing proration; this function updates only our quota pool.
 */
export async function handleTierChange(
  db: Database,
  subscriptionId: string,
  newTier: SubscriptionTier
): Promise<TierChangeResult | null> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub) {
    return null;
  }

  const pool = await db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });

  if (!pool) {
    return null;
  }

  const newConfig = getTierConfig(newTier);
  const usedThisCycle = pool.usedThisMonth;
  const newMonthlyLimit = newConfig.monthlyQuota;
  const remainingQuestions = Math.max(0, newMonthlyLimit - usedThisCycle);

  // Update quota pool limit (preserves usedThisMonth)
  await updateQuotaPoolLimit(
    db,
    subscriptionId,
    newMonthlyLimit,
    newConfig.dailyLimit
  );

  return {
    previousTier: sub.tier,
    newTier,
    usedThisCycle,
    newMonthlyLimit,
    remainingQuestions,
  };
}

// ---------------------------------------------------------------------------
// Context-aware upgrade prompts (Story 5.3)
// ---------------------------------------------------------------------------

export type UpgradePromptReason =
  | 'quota_cap_reached'
  | 'adding_family_member'
  | 'frequent_top_ups'
  | 'max_profiles_reached';

export interface UpgradePrompt {
  reason: UpgradePromptReason;
  suggestedTier: 'plus' | 'family' | 'pro';
  message: string;
}

/**
 * Determines whether a context-aware upgrade prompt should be shown.
 *
 * Trigger conditions from Story 5.3:
 * - Free->Plus: at 50/month cap (quota_cap_reached)
 * - Plus->Family: when adding family member (adding_family_member)
 * - Plus->Family: when 3+ top-ups purchased in cycle (frequent_top_ups)
 * - Family->Pro: when needing 5-6 users (max_profiles_reached)
 */
export function getUpgradePrompt(params: {
  tier: SubscriptionTier;
  usedThisMonth: number;
  monthlyLimit: number;
  topUpPurchasesThisCycle: number;
  profileCount: number;
  isAddingProfile: boolean;
}): UpgradePrompt | null {
  const {
    tier,
    usedThisMonth,
    monthlyLimit,
    topUpPurchasesThisCycle,
    profileCount,
    isAddingProfile,
  } = params;

  // Free -> Plus: user hit the 50/month cap
  if (tier === 'free' && usedThisMonth >= monthlyLimit) {
    return {
      reason: 'quota_cap_reached',
      suggestedTier: 'plus',
      message:
        "You've reached your free plan limit. Upgrade to Plus for 500 questions/month.",
    };
  }

  // Plus -> Family: trying to add a family member
  if (tier === 'plus' && isAddingProfile) {
    return {
      reason: 'adding_family_member',
      suggestedTier: 'family',
      message: 'Upgrade to Family to add up to 4 learner profiles.',
    };
  }

  // Plus -> Family: 3+ top-ups purchased this cycle
  if (tier === 'plus' && topUpPurchasesThisCycle >= 3) {
    return {
      reason: 'frequent_top_ups',
      suggestedTier: 'family',
      message:
        "You've bought multiple top-ups this month. Family plan gives you 1,500 questions for less.",
    };
  }

  // Family -> Pro: at profile limit or trying to add beyond 4
  if (
    tier === 'family' &&
    (profileCount >= 4 || (isAddingProfile && profileCount >= 4))
  ) {
    return {
      reason: 'max_profiles_reached',
      suggestedTier: 'pro',
      message:
        'Need more profiles? Upgrade to Pro for up to 6 learners and 3,000 questions/month.',
    };
  }

  return null;
}

/**
 * Returns the top-up price in EUR cents for a given tier.
 * Free tier cannot purchase top-ups (returns null).
 */
export function getTopUpPriceCents(tier: SubscriptionTier): number | null {
  const config = getTierConfig(tier);
  if (config.topUpPrice === 0) {
    return null;
  }
  return config.topUpPrice * 100;
}

// ---------------------------------------------------------------------------
// Family billing — Story 5.5
// ---------------------------------------------------------------------------

export interface FamilyMember {
  profileId: string;
  displayName: string;
  isOwner: boolean;
}

/**
 * Lists all profiles under the same account (family) as the given subscription.
 */
export async function listFamilyMembers(
  db: Database,
  subscriptionId: string
): Promise<FamilyMember[]> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub) {
    return [];
  }

  const rows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, sub.accountId),
  });

  return rows.map((r) => ({
    profileId: r.id,
    displayName: r.displayName,
    isOwner: r.isOwner,
  }));
}

/**
 * Adds a profile to a family subscription.
 *
 * Checks:
 * - Subscription exists
 * - Subscription tier supports multi-profile (family or pro)
 * - Target profile already belongs to the subscription account
 *
 * Family membership is account-scoped. Until an invite/claim flow exists,
 * cross-account profile transfers are rejected instead of re-parented.
 */
export async function addProfileToSubscription(
  db: Database,
  subscriptionId: string,
  profileId: string
): Promise<{ profileCount: number } | null> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub) {
    return null;
  }

  // Only family and pro tiers support multiple profiles
  if (sub.tier !== 'family' && sub.tier !== 'pro') {
    return null;
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });

  // Family membership is currently modeled as shared account ownership.
  // Until an invite/claim flow exists, never re-parent profiles across accounts.
  if (!profile || profile.accountId !== sub.accountId) {
    return null;
  }

  const count = await getProfileCountForSubscription(db, subscriptionId);
  return { profileCount: count };
}

/**
 * Removes a profile from a family subscription.
 *
 * Cross-account detachment is intentionally disabled until the backend has a
 * verifiable invite/claim flow for the destination account.
 */
export async function removeProfileFromSubscription(
  db: Database,
  subscriptionId: string,
  profileId: string,
  newAccountId: string
): Promise<{ removedProfileId: string } | null> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub) {
    return null;
  }

  const profile = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.accountId, sub.accountId)
    ),
  });

  if (!profile) {
    return null;
  }

  // Owner cannot be removed — they must cancel the entire subscription
  if (profile.isOwner) {
    return null;
  }

  // Cross-account profile detachment needs an invite/claim flow so the
  // destination account can be proven. Until that exists, reject the move
  // instead of trusting a caller-supplied account ID.
  void newAccountId;
  throw new ProfileRemovalNotImplementedError();
}

export class ProfileRemovalNotImplementedError extends Error {
  constructor() {
    super(
      'Profile removal requires an invite/claim flow that is not yet implemented'
    );
    this.name = 'ProfileRemovalNotImplementedError';
  }
}

/**
 * Family owner cancellation — downgrades all non-owner profiles to free tier.
 *
 * When the family owner cancels:
 * 1. Each non-owner profile gets moved to its own new account with free-tier sub
 * 2. The owner's subscription is downgraded to free tier
 *
 * This function handles only the DB-side: moving profiles and provisioning
 * free subscriptions. Stripe cancellation is handled separately.
 *
 * Returns the list of profile IDs that were downgraded (for notification).
 */
export async function downgradeAllFamilyProfiles(
  db: Database,
  subscriptionId: string,
  profileToAccountMap: Map<string, string>
): Promise<string[]> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub) {
    return [];
  }

  const allProfiles = await db.query.profiles.findMany({
    where: eq(profiles.accountId, sub.accountId),
  });

  const downgraded: string[] = [];

  for (const profile of allProfiles) {
    if (profile.isOwner) {
      continue;
    }

    const newAccountId = profileToAccountMap.get(profile.id);
    if (!newAccountId) {
      continue;
    }

    // Move to new account
    await db
      .update(profiles)
      .set({
        accountId: newAccountId,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id));

    // Provision free-tier subscription for new account
    await ensureFreeSubscription(db, newAccountId);

    downgraded.push(profile.id);
  }

  // Downgrade the owner's subscription to free tier
  const freeTier = getTierConfig('free');
  await db
    .update(subscriptions)
    .set({
      tier: 'free',
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId));

  await updateQuotaPoolLimit(
    db,
    subscriptionId,
    freeTier.monthlyQuota,
    freeTier.dailyLimit
  );

  return downgraded;
}

/**
 * Returns subscription-level quota pool status for the family.
 * Shows pool-level consumption (not per-profile).
 */
export async function getFamilyPoolStatus(
  db: Database,
  subscriptionId: string
): Promise<{
  tier: SubscriptionTier;
  monthlyLimit: number;
  usedThisMonth: number;
  remainingQuestions: number;
  profileCount: number;
  maxProfiles: number;
} | null> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub) {
    return null;
  }

  const pool = await db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });

  if (!pool) {
    return null;
  }

  const tierConfig = getTierConfig(sub.tier);
  const profileCount = await getProfileCountForSubscription(db, subscriptionId);
  const remaining = Math.max(0, pool.monthlyLimit - pool.usedThisMonth);

  return {
    tier: sub.tier,
    monthlyLimit: pool.monthlyLimit,
    usedThisMonth: pool.usedThisMonth,
    remainingQuestions: remaining,
    profileCount,
    maxProfiles: tierConfig.maxProfiles,
  };
}

// ---------------------------------------------------------------------------
// RevenueCat webhook helpers (Epic 9)
// ---------------------------------------------------------------------------

export interface RevenuecatWebhookUpdate {
  tier?: SubscriptionTier;
  status?: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelledAt?: string | null;
  trialEndsAt?: string | null;
}

/**
 * Checks whether a RevenueCat event has already been processed.
 * Uses `lastRevenuecatEventId` on the subscription row for idempotency.
 */
export async function isRevenuecatEventProcessed(
  db: Database,
  accountId: string,
  eventId: string
): Promise<boolean> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });
  if (!sub) return false;
  return sub.lastRevenuecatEventId === eventId;
}

/**
 * Updates a subscription from a RevenueCat webhook event.
 * Writes `lastRevenuecatEventId` for idempotency.
 */
export async function updateSubscriptionFromRevenuecatWebhook(
  db: Database,
  accountId: string,
  updates: RevenuecatWebhookUpdate & { eventId: string }
): Promise<SubscriptionRow | null> {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });

  if (!existing) return null;

  const setValues: Partial<typeof subscriptions.$inferInsert> = {
    lastRevenuecatEventId: updates.eventId,
    updatedAt: new Date(),
  };

  if (updates.tier !== undefined) {
    setValues.tier = updates.tier;
  }
  if (updates.status !== undefined) {
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
  if (updates.trialEndsAt !== undefined) {
    setValues.trialEndsAt = updates.trialEndsAt
      ? new Date(updates.trialEndsAt)
      : null;
  }

  const [updated] = await db
    .update(subscriptions)
    .set(setValues)
    .where(eq(subscriptions.id, existing.id))
    .returning();

  return mapSubscriptionRow(updated!);
}

/**
 * Activates (or creates) a subscription from a RevenueCat purchase event.
 * Similar to `activateSubscriptionFromCheckout` but keyed by accountId
 * instead of stripeSubscriptionId.
 */
export async function activateSubscriptionFromRevenuecat(
  db: Database,
  accountId: string,
  tier: 'plus' | 'family' | 'pro',
  eventId: string,
  options?: {
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    revenuecatOriginalAppUserId?: string;
    /** When true, sets status to 'trial' and stores trialEndsAt (expiration_at_ms). */
    isTrial?: boolean;
    /** ISO 8601 trial end date. Required when isTrial is true. */
    trialEndsAt?: string;
  }
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountId(db, accountId);
  const tierConfig = getTierConfig(tier);
  const status = options?.isTrial ? 'trial' : 'active';

  if (!existing) {
    // Create new subscription + quota pool
    const [subRow] = await db
      .insert(subscriptions)
      .values({
        accountId,
        tier,
        status,
        lastRevenuecatEventId: eventId,
        revenuecatOriginalAppUserId:
          options?.revenuecatOriginalAppUserId ?? null,
        currentPeriodStart: options?.currentPeriodStart
          ? new Date(options.currentPeriodStart)
          : null,
        currentPeriodEnd: options?.currentPeriodEnd
          ? new Date(options.currentPeriodEnd)
          : null,
        trialEndsAt: options?.trialEndsAt
          ? new Date(options.trialEndsAt)
          : null,
      })
      .returning();

    const now = new Date();
    const cycleResetAt = new Date(now);
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    await db.insert(quotaPools).values({
      subscriptionId: subRow!.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: 0,
      cycleResetAt,
    });

    return mapSubscriptionRow(subRow!);
  }

  // Update existing subscription
  const setValues: Record<string, unknown> = {
    tier,
    status,
    lastRevenuecatEventId: eventId,
    updatedAt: new Date(),
  };

  if (options?.revenuecatOriginalAppUserId) {
    setValues.revenuecatOriginalAppUserId = options.revenuecatOriginalAppUserId;
  }
  if (options?.currentPeriodStart) {
    setValues.currentPeriodStart = new Date(options.currentPeriodStart);
  }
  if (options?.currentPeriodEnd) {
    setValues.currentPeriodEnd = new Date(options.currentPeriodEnd);
  }
  if (options?.trialEndsAt) {
    setValues.trialEndsAt = new Date(options.trialEndsAt);
  }

  const [updated] = await db
    .update(subscriptions)
    .set(setValues)
    .where(eq(subscriptions.id, existing.id))
    .returning();

  // Update quota pool limit to match the new tier
  await updateQuotaPoolLimit(
    db,
    existing.id,
    tierConfig.monthlyQuota,
    tierConfig.dailyLimit
  );

  return mapSubscriptionRow(updated!);
}
