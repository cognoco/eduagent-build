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

  await db.insert(quotaPools).values({
    subscriptionId: subRow.id,
    monthlyLimit,
    usedThisMonth: 0,
    cycleResetAt,
  });

  return mapSubscriptionRow(subRow);
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

  return mapSubscriptionRow(updated);
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

  return mapSubscriptionRow(updated);
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
      cycleResetAt: nextReset,
      updatedAt: now,
    })
    .where(eq(quotaPools.id, existing.id))
    .returning();

  return mapQuotaPoolRow(updated);
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
 */
export async function downgradeQuotaPool(
  db: Database,
  subscriptionId: string,
  monthlyLimit: number
): Promise<void> {
  await db
    .update(quotaPools)
    .set({
      monthlyLimit,
      usedThisMonth: 0,
      updatedAt: new Date(),
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId));
}

// ---------------------------------------------------------------------------
// Quota decrement / increment (Phase 4)
// ---------------------------------------------------------------------------

export interface DecrementResult {
  success: boolean;
  source: 'monthly' | 'top_up' | 'none';
  remainingMonthly: number;
  remainingTopUp: number;
}

/**
 * Decrements the quota pool by 1 exchange.
 *
 * Strategy:
 * 1. Try monthly quota first (atomic WHERE guard prevents TOCTOU race)
 * 2. If monthly exhausted, consume from oldest unexpired top-up credit (FIFO)
 * 3. If both exhausted, return { success: false }
 *
 * All UPDATEs use SQL WHERE guards so concurrent requests cannot over-decrement.
 */
export async function decrementQuota(
  db: Database,
  subscriptionId: string
): Promise<DecrementResult> {
  // 1. Try monthly quota — atomic: only succeeds if usedThisMonth < monthlyLimit
  const [monthlyUpdated] = await db
    .update(quotaPools)
    .set({
      usedThisMonth: sql`${quotaPools.usedThisMonth} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(quotaPools.subscriptionId, subscriptionId),
        sql`${quotaPools.usedThisMonth} < ${quotaPools.monthlyLimit}`
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
    };
  }

  // 2. Fall back to top-up credits (FIFO by purchasedAt, unexpired)
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
      return {
        success: true,
        source: 'top_up',
        remainingMonthly: 0,
        remainingTopUp: updatedTopUp.remaining,
      };
    }
  }

  // 3. Both exhausted or no quota pool exists
  return {
    success: false,
    source: 'none',
    remainingMonthly: 0,
    remainingTopUp: 0,
  };
}

/**
 * Refunds 1 exchange back to the quota pool.
 * Used when an LLM call fails after decrement — avoids charging for failed work.
 *
 * Refunds always go to the monthly pool (simpler, avoids FIFO complications).
 */
export async function incrementQuota(
  db: Database,
  subscriptionId: string
): Promise<void> {
  await db
    .update(quotaPools)
    .set({
      usedThisMonth: sql`GREATEST(${quotaPools.usedThisMonth} - 1, 0)`,
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
        monthlyLimit: tierConfig.monthlyQuota,
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
