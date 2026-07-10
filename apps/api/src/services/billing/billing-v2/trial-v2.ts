// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 trial lifecycle
//
// v2 twins of the trial.ts functions that read/write the subscription store.
// Used by the trial-expiry Inngest function (B3) and the RevenueCat handler
// twin (transitionToExtendedTrialFromRevenuecatEventV2).
//
// The quota-pool-only helpers (downgradeQuotaPool, resetDailyQuotas,
// downgradeExtendedTrialQuotaIfStillExpired) touch no identity table and are
// reused verbatim from the legacy module. Only the functions that touch
// `subscriptions` get v2 twins reading/writing `subscription`:
//   - findExpiredTrialsV2
//   - findSubscriptionsByTrialDateRangeV2
//   - findExpiredTrialsByDaysSinceEndV2
//   - expireTrialSubscriptionV2
//   - expireTrialAndDowngradeQuotaV2
//   - transitionToExtendedTrialV2
//   - transitionToExtendedTrialFromRevenuecatEventV2 (RC handler)
//   - resetExpiredQuotaCyclesV2 (joins subscription instead of subscriptions)
//
// `trialEndsAt` is the §1.4 column on the new table; the find queries read it
// there. Flag-gated: reachable only via the v2 Inngest path / RC handler. Legacy
// trial.ts stays byte-identical.
// ---------------------------------------------------------------------------

import { and, eq, gte, isNull, lte, ne, or, sql } from 'drizzle-orm';
import {
  subscription as subscriptionTable,
  quotaPools,
  profileQuotaUsage,
  type Database,
  findQuotaPool__unscoped,
} from '@eduagent/database';
import type { SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig } from '../../subscription';
import { type AppliedSubscriptionRow, type SubscriptionRow } from '../types';
import { mapSubscriptionV2Row } from './types-v2';

// ---------------------------------------------------------------------------
// Single-subscription expiry
// ---------------------------------------------------------------------------

export async function expireTrialSubscriptionV2(
  db: Database,
  subscriptionId: string,
): Promise<void> {
  await db
    .update(subscriptionTable)
    .set({
      status: 'expired',
      planTier: 'free',
      updatedAt: new Date(),
    })
    .where(eq(subscriptionTable.id, subscriptionId));
}

export async function expireTrialAndDowngradeQuotaV2(
  db: Database,
  subscriptionId: string,
  monthlyLimit: number,
  dailyLimit: number | null = null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionTable)
      .set({
        status: 'expired',
        planTier: 'free',
        updatedAt: new Date(),
      })
      .where(eq(subscriptionTable.id, subscriptionId));

    const txDb = tx as unknown as Database;
    const currentPool = await findQuotaPool__unscoped(txDb, subscriptionId);
    if (
      currentPool &&
      currentPool.monthlyLimit === monthlyLimit &&
      currentPool.dailyLimit === dailyLimit &&
      currentPool.usedThisMonth === 0 &&
      currentPool.usedToday === 0
    ) {
      return;
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

// ---------------------------------------------------------------------------
// Trial queries (used by the trial-expiry Inngest function)
// ---------------------------------------------------------------------------

export async function findExpiredTrialsV2(
  db: Database,
  now: Date,
): Promise<SubscriptionRow[]> {
  const rows = await db.query.subscription.findMany({
    where: and(
      eq(subscriptionTable.status, 'trial'),
      lte(subscriptionTable.trialEndsAt, now),
    ),
  });
  return rows.map(mapSubscriptionV2Row);
}

export async function findSubscriptionsByTrialDateRangeV2(
  db: Database,
  status: SubscriptionStatus,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<SubscriptionRow[]> {
  const rows = await db.query.subscription.findMany({
    where: and(
      eq(subscriptionTable.status, status),
      gte(subscriptionTable.trialEndsAt, rangeStart),
      lte(subscriptionTable.trialEndsAt, rangeEnd),
    ),
  });
  return rows.map(mapSubscriptionV2Row);
}

export async function findExpiredTrialsByDaysSinceEndV2(
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

  return findSubscriptionsByTrialDateRangeV2(db, 'expired', dayStart, dayEnd);
}

// ---------------------------------------------------------------------------
// Reverse trial soft landing
// ---------------------------------------------------------------------------

export async function transitionToExtendedTrialV2(
  db: Database,
  subscriptionId: string,
  extendedMonthlyQuota: number,
): Promise<boolean> {
  const freeTierConfig = getTierConfig('free');
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(subscriptionTable)
      .set({
        status: 'expired',
        planTier: 'free',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subscriptionTable.id, subscriptionId),
          eq(subscriptionTable.status, 'trial'),
        ),
      )
      .returning({ id: subscriptionTable.id });

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

export async function transitionToExtendedTrialFromRevenuecatEventV2(
  db: Database,
  subscriptionId: string,
  extendedMonthlyQuota: number,
  eventId: string,
  eventTimestampMs?: number,
): Promise<AppliedSubscriptionRow | null> {
  const freeTierConfig = getTierConfig('free');
  return db.transaction(async (tx) => {
    const setValues: Partial<typeof subscriptionTable.$inferInsert> = {
      status: 'expired',
      planTier: 'free',
      lastRevenuecatEventId: eventId,
      updatedAt: new Date(),
    };
    if (eventTimestampMs != null) {
      setValues.lastRevenuecatEventTimestampMs = String(eventTimestampMs);
    }

    const whereParts = [
      eq(subscriptionTable.id, subscriptionId),
      eq(subscriptionTable.status, 'trial'),
    ];
    const eventIdPredicate = or(
      isNull(subscriptionTable.lastRevenuecatEventId),
      ne(subscriptionTable.lastRevenuecatEventId, eventId),
    );
    if (eventIdPredicate) whereParts.push(eventIdPredicate);
    if (eventTimestampMs != null) {
      const eventTimestampPredicate = or(
        isNull(subscriptionTable.lastRevenuecatEventTimestampMs),
        sql`(${subscriptionTable.lastRevenuecatEventTimestampMs})::bigint <= ${eventTimestampMs}`,
      );
      if (eventTimestampPredicate) whereParts.push(eventTimestampPredicate);
    }

    const [updated] = await tx
      .update(subscriptionTable)
      .set(setValues)
      .where(and(...whereParts))
      .returning();

    if (!updated) {
      const latest = await tx.query.subscription.findFirst({
        where: eq(subscriptionTable.id, subscriptionId),
      });
      return latest
        ? { ...mapSubscriptionV2Row(latest), webhookApplied: false }
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

    return { ...mapSubscriptionV2Row(updated), webhookApplied: true };
  });
}

/**
 * v2 of downgradeExtendedTrialQuotaIfStillExpired. The stale-selection guard
 * joins the new `subscription` table (status='expired' AND plan_tier='free')
 * instead of `subscriptions` (status='expired' AND tier='free'). The quota_pools
 * write is unchanged.
 */
export async function downgradeExtendedTrialQuotaIfStillExpiredV2(
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
      .from(subscriptionTable)
      .where(
        and(
          eq(quotaPools.subscriptionId, subscriptionId),
          eq(subscriptionTable.id, subscriptionId),
          eq(subscriptionTable.status, 'expired'),
          eq(subscriptionTable.planTier, 'free'),
        ),
      )
      .returning({ id: quotaPools.id });

    return rows.length > 0;
  });
}

// ---------------------------------------------------------------------------
// Cycle reset (joins the subscription store for tier-aware limits)
// ---------------------------------------------------------------------------

/**
 * v2 of resetExpiredQuotaCycles. Identical to the legacy version except the
 * tier-deriving join targets the new `subscription` table (`plan_tier`) instead
 * of `subscriptions` (`tier`). The `profile_quota_usage` reset is store-agnostic
 * and unchanged.
 */
export async function resetExpiredQuotaCyclesV2(
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
      monthly_limit = CASE s.plan_tier
        WHEN 'plus' THEN CAST(${plus.monthlyQuota} AS integer)
        WHEN 'family' THEN CAST(${family.monthlyQuota} AS integer)
        WHEN 'pro' THEN CAST(${pro.monthlyQuota} AS integer)
        ELSE CAST(${free.monthlyQuota} AS integer)
      END,
      daily_limit = CASE s.plan_tier
        WHEN 'plus' THEN CAST(${plus.dailyLimit} AS integer)
        WHEN 'family' THEN CAST(${family.dailyLimit} AS integer)
        WHEN 'pro' THEN CAST(${pro.dailyLimit} AS integer)
        ELSE CAST(${free.dailyLimit} AS integer)
      END,
      cycle_reset_at = qp.cycle_reset_at + INTERVAL '1 month',
      updated_at = ${now}
    FROM subscription AS s
    WHERE qp.subscription_id = s.id
      AND qp.cycle_reset_at <= ${now}
  `);

  // scope-allow: cycle reset cron intentionally advances all due profile quota rows.
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
