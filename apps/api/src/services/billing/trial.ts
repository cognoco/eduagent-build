// ---------------------------------------------------------------------------
// Billing — Trial expiry, soft-landing, bulk cron helpers, date-range queries
// ---------------------------------------------------------------------------

import { and, eq, gte, isNull, lte, ne, or, sql } from 'drizzle-orm';
import {
  subscriptions,
  quotaPools,
  profileQuotaUsage,
  type Database,
  findQuotaPool__unscoped,
} from '@eduagent/database';
// NOTE: PgTransaction → Database cast pattern used below.
// See feedback_drizzle_transaction_cast.md.
import type { SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig } from '../subscription';
import {
  mapSubscriptionRow,
  type AppliedSubscriptionRow,
  type SubscriptionRow,
} from './types';

// Re-export shared type so callers of this module can use it
export type { SubscriptionRow };

// ---------------------------------------------------------------------------
// Trial expiry helpers (used by Inngest trial-expiry function)
// ---------------------------------------------------------------------------
//
// [WI-618 / F-124 N/A] Top-up credit re-attribution is intentionally NOT called
// from any helper in this file. reattributeTopUpCreditsOnModelChange (tier.ts)
// only does work when the quota MODEL changes (per-profile <-> shared-pool).
// Every downgrade-to-free path here transitions a `status='trial'` subscription
// to `tier='free'`, and trials are created exclusively at `tier='plus'`
// (account.ts:179 trial-repair, account.ts:311 signup — both pass `'plus'`).
// Both `plus` and `free` are per-profile (subscription.ts quotaModel), so the
// model never crosses and re-attribution would be a guaranteed no-op (returns
// 0). The general helpers (expireTrialSubscription, downgradeQuotaPool,
// expireTrialAndDowngradeQuota) have no production callers that feed a
// shared-pool source tier — they are reached only via the trial-expiry Inngest
// function and the RevenueCat trial-extend path, both guarded on
// `status='trial'`. Stripe/RevenueCat tier changes that DO cross the model are
// re-attributed at their own sites (stripe-webhook-handler.ts, revenuecat.ts).
// If trials ever start on family/pro (shared-pool), this assumption breaks and
// these helpers must add the same re-attribution the Stripe path now carries.

/**
 * Expires a trial subscription by setting status to expired and tier to free.
 */
export async function expireTrialSubscription(
  db: Database,
  subscriptionId: string,
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
  dailyLimit: number | null = null,
): Promise<void> {
  // Only update pools that haven't already been downgraded to this limit.
  // This prevents retries from resetting usage counters for already-transitioned subscriptions.
  // safe-caller: cron/system function iterating over all subscriptions — no user-facing output
  const currentPool = await findQuotaPool__unscoped(db, subscriptionId);
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
 *
 * [CR-2026-05-19-C7] Accepts a `db | tx` so quota-reset can wrap both this
 * call and `resetExpiredQuotaCycles` in a single ACID transaction. Running
 * the two helpers in separate connections caused the daily reset row count
 * to be undercounted whenever a cycle boundary coincided with the cron tick:
 * if `resetExpiredQuotaCycles` raced ahead it zeroed `used_today` first, and
 * `resetDailyQuotas`' `usedToday > 0` filter then missed those rows.
 */
export async function resetDailyQuotas(
  db: Database,
  now: Date,
): Promise<number> {
  const poolResult = await db
    .update(quotaPools)
    .set({
      usedToday: 0,
      updatedAt: now,
    })
    .where(sql`${quotaPools.usedToday} > 0`)
    .returning();

  const profileResult = await db
    .update(profileQuotaUsage)
    .set({
      usedToday: 0,
      updatedAt: now,
    })
    .where(sql`${profileQuotaUsage.usedToday} > 0`)
    .returning();

  return poolResult.length + profileResult.length;
}

/**
 * Finds all quota pools whose billing cycle has elapsed and resets them.
 * For each pool: resets usedThisMonth to 0, updates monthlyLimit to match
 * the subscription tier, and advances cycleResetAt by one month.
 *
 * [CR-2026-05-19-C7] See `resetDailyQuotas` — the caller MUST invoke these
 * two helpers inside the same `db.transaction()` callback so they observe a
 * consistent snapshot of `used_today` (and so a retry of one does not
 * double-reset state the other already committed).
 */
export async function resetExpiredQuotaCycles(
  db: Database,
  now: Date,
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

  const profileResult = await db
    .update(profileQuotaUsage)
    .set({
      usedThisMonth: 0,
      usedToday: 0,
      cycleResetAt: sql`${profileQuotaUsage.cycleResetAt} + INTERVAL '1 month'`,
      updatedAt: now,
    })
    .where(sql`${profileQuotaUsage.cycleResetAt} <= ${now}`)
    .returning();

  return (result.rowCount ?? 0) + profileResult.length;
}

// ---------------------------------------------------------------------------
// Trial subscription queries (used by inngest/functions/trial-expiry.ts)
// ---------------------------------------------------------------------------

/**
 * Finds all trial subscriptions whose trialEndsAt has passed.
 */
export async function findExpiredTrials(
  db: Database,
  now: Date,
): Promise<SubscriptionRow[]> {
  const rows = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, 'trial'),
      lte(subscriptions.trialEndsAt, now),
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
  rangeEnd: Date,
): Promise<SubscriptionRow[]> {
  const rows = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, status),
      gte(subscriptions.trialEndsAt, rangeStart),
      lte(subscriptions.trialEndsAt, rangeEnd),
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
 *
 * [CR-2026-05-19-M3] SITE 2a: Both UPDATEs are in a single transaction.
 * A process death between the two previously left the subscription with
 * status='expired' + tier='free' but a quota pool still at plus limits
 * (billing leak: user sees free tier but has plus-sized quota). Atomic
 * commit-or-rollback closes that gap.
 * Known Drizzle pattern: PgTransaction → Database cast
 * (see feedback_drizzle_transaction_cast.md).
 */
export async function transitionToExtendedTrial(
  db: Database,
  subscriptionId: string,
  extendedMonthlyQuota: number,
): Promise<boolean> {
  const freeTierConfig = getTierConfig('free');
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(subscriptions)
      .set({
        status: 'expired',
        tier: 'free',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.status, 'trial'),
        ),
      )
      .returning({ id: subscriptions.id });

    if (!updated) {
      return false;
    }

    await tx
      .update(quotaPools)
      .set({
        monthlyLimit: extendedMonthlyQuota,
        usedThisMonth: 0,
        dailyLimit: freeTierConfig.dailyLimit,
        usedToday: 0,
        updatedAt: new Date(),
      })
      .where(eq(quotaPools.subscriptionId, subscriptionId));

    return true;
  });
}

/**
 * Downgrades an extended-trial quota pool only if the subscription is still in
 * the soft-landing state selected by the cron. This closes the stale-selection
 * race where a user can convert to a paid plan after the cron query but before
 * the day-28 quota downgrade executes.
 */
export async function downgradeExtendedTrialQuotaIfStillExpired(
  db: Database,
  subscriptionId: string,
  monthlyLimit: number,
  dailyLimit: number | null = null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const currentPool = await findQuotaPool__unscoped(txDb, subscriptionId);
    if (
      currentPool &&
      currentPool.monthlyLimit === monthlyLimit &&
      currentPool.dailyLimit === dailyLimit
    ) {
      return false;
    }

    const rows = await tx
      .update(quotaPools)
      .set({
        monthlyLimit,
        usedThisMonth: 0,
        dailyLimit,
        usedToday: 0,
        updatedAt: new Date(),
      })
      .from(subscriptions)
      .where(
        and(
          eq(quotaPools.subscriptionId, subscriptionId),
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.status, 'expired'),
          eq(subscriptions.tier, 'free'),
        ),
      )
      .returning({ id: quotaPools.id });

    return rows.length > 0;
  });
}

export async function transitionToExtendedTrialFromRevenuecatEvent(
  db: Database,
  subscriptionId: string,
  extendedMonthlyQuota: number,
  eventId: string,
  eventTimestampMs?: number,
): Promise<AppliedSubscriptionRow | null> {
  const freeTierConfig = getTierConfig('free');
  return db.transaction(async (tx) => {
    const setValues: Partial<typeof subscriptions.$inferInsert> = {
      status: 'expired',
      tier: 'free',
      lastRevenuecatEventId: eventId,
      updatedAt: new Date(),
    };
    if (eventTimestampMs != null) {
      setValues.lastRevenuecatEventTimestampMs = String(eventTimestampMs);
    }

    const whereParts = [
      eq(subscriptions.id, subscriptionId),
      eq(subscriptions.status, 'trial'),
    ];
    const eventIdPredicate = or(
      isNull(subscriptions.lastRevenuecatEventId),
      ne(subscriptions.lastRevenuecatEventId, eventId),
    );
    if (eventIdPredicate) whereParts.push(eventIdPredicate);
    if (eventTimestampMs != null) {
      const eventTimestampPredicate = or(
        isNull(subscriptions.lastRevenuecatEventTimestampMs),
        sql`(${subscriptions.lastRevenuecatEventTimestampMs})::bigint <= ${eventTimestampMs}`,
      );
      if (eventTimestampPredicate) whereParts.push(eventTimestampPredicate);
    }

    const [updated] = await tx
      .update(subscriptions)
      .set(setValues)
      .where(and(...whereParts))
      .returning();

    if (!updated) {
      const latest = await tx.query.subscriptions.findFirst({
        where: eq(subscriptions.id, subscriptionId),
      });
      return latest
        ? { ...mapSubscriptionRow(latest), webhookApplied: false }
        : null;
    }

    const quotaRows = await tx
      .update(quotaPools)
      .set({
        monthlyLimit: extendedMonthlyQuota,
        usedThisMonth: 0,
        dailyLimit: freeTierConfig.dailyLimit,
        usedToday: 0,
        updatedAt: new Date(),
      })
      .where(eq(quotaPools.subscriptionId, subscriptionId))
      .returning({ id: quotaPools.id });

    if (quotaRows.length === 0) {
      throw new Error(
        `Missing quota pool for subscription ${subscriptionId}; rolling back trial extension`,
      );
    }

    return { ...mapSubscriptionRow(updated), webhookApplied: true };
  });
}

/**
 * Atomically expires a trial subscription AND downgrades its quota pool.
 * Combines expireTrialSubscription + downgradeQuotaPool in a single
 * transaction so no process death can leave subscription.status='expired'
 * while the quota pool still carries plus-tier limits.
 *
 * [CR-2026-05-19-M3] SITE 2b: The pair expireTrialSubscription + downgradeQuotaPool
 * was always meant to run together but had no tx wrap at the call site.
 * This combined helper is the canonical atomic version; callers should prefer
 * it over calling the two functions separately.
 */
export async function expireTrialAndDowngradeQuota(
  db: Database,
  subscriptionId: string,
  monthlyLimit: number,
  dailyLimit: number | null = null,
): Promise<void> {
  await db.transaction(async (tx) => {
    // safe-caller: cron/system function — no user-facing output
    await tx
      .update(subscriptions)
      .set({
        status: 'expired',
        tier: 'free',
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId));

    // Idempotency: skip reset if already at target limit (mirrors downgradeQuotaPool).
    const txDb = tx as unknown as Database;
    const currentPool = await findQuotaPool__unscoped(txDb, subscriptionId);
    if (currentPool && currentPool.monthlyLimit === monthlyLimit) {
      return; // Already at target tier — preserve usage counters
    }

    await tx
      .update(quotaPools)
      .set({
        monthlyLimit,
        usedThisMonth: 0,
        dailyLimit,
        usedToday: 0,
        updatedAt: new Date(),
      })
      .where(eq(quotaPools.subscriptionId, subscriptionId));
  });
}

/**
 * Finds expired subscriptions whose trialEndsAt is between `daysAgo` and
 * `daysAgo - 1` days before `now`. Used to identify subscriptions that have
 * been in the extended trial for exactly N days.
 */
export async function findExpiredTrialsByDaysSinceEnd(
  db: Database,
  now: Date,
  daysAgo: number,
): Promise<SubscriptionRow[]> {
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() - daysAgo);
  const dayStart = new Date(
    targetDate.toISOString().slice(0, 10) + 'T00:00:00.000Z',
  );
  const dayEnd = new Date(
    targetDate.toISOString().slice(0, 10) + 'T23:59:59.999Z',
  );

  return findSubscriptionsByTrialDateRange(db, 'expired', dayStart, dayEnd);
}
