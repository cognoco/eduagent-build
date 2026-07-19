// ---------------------------------------------------------------------------
// Shared billing helpers — used by both billing/v1 and billing-v2 surfaces
//
// These pure functions are canonical; both billing layers import from here so
// a limit-change or reset-time fix applies to both automatically.
// WI-1072 extracts them from the duplicated quota-provision/quota-provision-v2
// twins. Do NOT edit the copies in quota-provision.ts / quota-provision-v2.ts
// directly — they now delegate to this module.
//
// Deletion gate: WI-693/805 (billing v2 cutover / legacy drop) will eventually
// remove quota-provision.ts; this shared module stays until both consumers are
// gone.
// ---------------------------------------------------------------------------

import type { profileQuotaUsage } from '@eduagent/database';
import type { ProfileQuotaRole, SubscriptionTier } from '@eduagent/schemas';

import { getTierConfig } from '../subscription';

export type { ProfileQuotaRole } from '@eduagent/schemas';

export interface ProfileQuotaUsageSnapshot {
  id: string;
  subscriptionId: string;
  profileId: string;
  role: ProfileQuotaRole;
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
  cycleResetAt: string;
}

/**
 * Compute the next monthly reset date from a given reference date.
 * Shared by quota-provision.ts and quota-provision-v2.ts.
 */
export function nextMonthlyReset(now: Date): Date {
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
  return cycleResetAt;
}

/**
 * Shift a UTC billing-cycle anchor by whole months without Date's end-of-month
 * overflow (for example, March 31 minus one month is February 28/29, never
 * March 3). The time-of-day is preserved.
 */
export function shiftUtcMonthClamped(anchor: Date, monthOffset: number): Date {
  const firstOfTargetMonth = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth() + monthOffset,
      1,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
  const lastTargetDay = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  firstOfTargetMonth.setUTCDate(Math.min(anchor.getUTCDate(), lastTargetDay));
  return firstOfTargetMonth;
}

/**
 * Extract per-profile quota limits for a tier + role pair.
 * Returns null when the tier does not use the per-profile quota model, or when
 * the monthly limit for this role is null (shared-pool tiers set ownerMonthlyQuota=null).
 *
 * Shared by quota-provision.ts and quota-provision-v2.ts.
 */
export function getProfileQuotaLimits(
  tier: SubscriptionTier,
  role: ProfileQuotaRole,
): { monthlyLimit: number; dailyLimit: number | null } | null {
  const config = getTierConfig(tier);
  if (config.quotaModel !== 'per-profile') return null;

  const monthlyLimit =
    role === 'owner' ? config.ownerMonthlyQuota : config.childMonthlyQuota;
  const dailyLimit =
    role === 'owner' ? config.ownerDailyQuota : config.childDailyQuota;

  if (monthlyLimit === null) return null;
  return { monthlyLimit, dailyLimit };
}

/**
 * Map a profileQuotaUsage DB row to the public snapshot type.
 * Shared by quota-provision.ts and quota-provision-v2.ts.
 */
export function mapProfileQuotaUsageRow(
  row: typeof profileQuotaUsage.$inferSelect,
): ProfileQuotaUsageSnapshot {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    profileId: row.profileId,
    role: row.role,
    monthlyLimit: row.monthlyLimit,
    usedThisMonth: row.usedThisMonth,
    dailyLimit: row.dailyLimit,
    usedToday: row.usedToday,
    cycleResetAt: row.cycleResetAt.toISOString(),
  };
}

/**
 * Extract the tier-level quota fields used when upgrading a subscription via a
 * RevenueCat webhook (alias-merge and direct webhook handlers).
 * Shared by alias-merge.ts and alias-merge-v2.ts to avoid each calling
 * getTierConfig and re-extracting the same two fields independently.
 */
export function extractTierQuota(tier: SubscriptionTier): {
  monthlyQuota: number;
  dailyLimit: number | null;
} {
  const config = getTierConfig(tier);
  return { monthlyQuota: config.monthlyQuota, dailyLimit: config.dailyLimit };
}
