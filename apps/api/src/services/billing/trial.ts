// ---------------------------------------------------------------------------
// Billing — Trial expiry, soft-landing, bulk cron helpers, date-range queries
// ---------------------------------------------------------------------------

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import {
  subscriptions,
  quotaPools,
  type Database,
  findQuotaPool,
} from '@eduagent/database';
import type { SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig } from '../subscription';
import { mapSubscriptionRow, type SubscriptionRow } from './types';

// Re-export shared type so callers of this module can use it
export type { SubscriptionRow };

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
  const currentPool = await findQuotaPool(db, subscriptionId);
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

/**
 * Finds all quota pools whose billing cycle has elapsed and resets them.
 * For each pool: resets usedThisMonth to 0, updates monthlyLimit to match
 * the subscription tier, and advances cycleResetAt by one month.
 */
export async function resetExpiredQuotaCycles(
  db: Database,
  now: Date
): Promise<number> {
  const free = getTierConfig('free');
  const plus = getTierConfig('plus');
  const family = getTierConfig('family');
  const pro = getTierConfig('pro');

  const result = await db.execute(sql`
    UPDATE quota_pools AS qp
    SET
      used_this_month = 0,
      used_today = 0,
      monthly_limit = CASE s.tier
        WHEN 'plus' THEN CAST(${plus.monthlyQuota} AS integer)
        WHEN 'family' THEN CAST(${family.monthlyQuota} AS integer)
        WHEN 'pro' THEN CAST(${pro.monthlyQuota} AS integer)
        ELSE CAST(${free.monthlyQuota} AS integer)
      END,
      daily_limit = CASE s.tier
        WHEN 'plus' THEN CAST(${plus.dailyLimit} AS integer)
        WHEN 'family' THEN CAST(${family.dailyLimit} AS integer)
        WHEN 'pro' THEN CAST(${pro.dailyLimit} AS integer)
        ELSE CAST(${free.dailyLimit} AS integer)
      END,
      cycle_reset_at = qp.cycle_reset_at + INTERVAL '1 month',
      updated_at = ${now}
    FROM subscriptions AS s
    WHERE qp.subscription_id = s.id
      AND qp.cycle_reset_at <= ${now}
  `);

  return result.rowCount ?? 0;
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
