import { eq, sql } from 'drizzle-orm';
import {
  profileQuotaUsage,
  quotaPools,
  type Database,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';

import { getTierConfig } from '../subscription';
import { addMonthsClamped } from './billing-shared';

// [WI-1239 / 779-strip] The per-profile branch of
// reconcileQuotaStateForEffectiveTier (legacy profiles×subscriptions join)
// was removed — dead, superseded by reconcileQuotaStateForEffectiveTierV2
// (billing-v2/quota-reconcile-v2.ts), which has its own complete
// person×membership×subscription implementation for the per-profile case.
// The shared-pool branch below touches no identity table (only
// quotaPools/profileQuotaUsage by subscriptionId) — v2 reuses it verbatim,
// which is why this function stays store-agnostic and shared-pool-only.
//
// reconcileQuotaStateForSubscription is KEPT — it is transitively reachable
// from subscription-core.ts's createSubscription/ensureFreeSubscription,
// which are in turn only reachable from services/account.ts's
// findOrCreateAccount (out of WI-1239's scope; tracked as WI-1254 follow-up).

type ReconcileQuotaOptions = {
  resetExpiredSharedPoolUsage?: boolean;
};

/**
 * Reconciles shared-pool quota state for a subscription's effective tier.
 * Store-agnostic (touches only quotaPools/profileQuotaUsage by
 * subscriptionId) — shared verbatim by reconcileQuotaStateForEffectiveTierV2.
 * Callers with a per-profile tier must use the v2 per-profile reconciler
 * directly; this function only handles the shared-pool model.
 */
export async function reconcileQuotaStateForEffectiveTier(
  db: Database,
  subscriptionId: string,
  tier: SubscriptionTier,
  now = new Date(),
  options?: ReconcileQuotaOptions,
): Promise<void> {
  const config = getTierConfig(tier);
  if (config.quotaModel !== 'shared-pool') return;

  const nextReset = addMonthsClamped(now, 1);
  const resetExpiredUsage = options?.resetExpiredSharedPoolUsage ?? true;
  const sharedPoolUpdateSet = {
    monthlyLimit: config.monthlyQuota,
    dailyLimit: config.dailyLimit,
    updatedAt: now,
    ...(resetExpiredUsage
      ? {
          usedThisMonth: sql<number>`CASE WHEN ${quotaPools.cycleResetAt} <= ${now} THEN 0 ELSE ${quotaPools.usedThisMonth} END`,
          usedToday: sql<number>`CASE WHEN ${quotaPools.cycleResetAt} <= ${now} THEN 0 ELSE ${quotaPools.usedToday} END`,
          cycleResetAt: sql<Date>`CASE WHEN ${quotaPools.cycleResetAt} <= ${now} THEN ${nextReset} ELSE ${quotaPools.cycleResetAt} END`,
        }
      : {}),
  };

  await db
    .delete(profileQuotaUsage)
    .where(eq(profileQuotaUsage.subscriptionId, subscriptionId));

  await db
    .insert(quotaPools)
    .values({
      subscriptionId,
      monthlyLimit: config.monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: config.dailyLimit,
      usedToday: 0,
      cycleResetAt: nextReset,
    })
    .onConflictDoUpdate({
      target: quotaPools.subscriptionId,
      // Preserve active mid-cycle usage, but clear stale counters when a
      // subscription re-enters shared-pool metering after its old cycle ended.
      set: sharedPoolUpdateSet,
    });
}
