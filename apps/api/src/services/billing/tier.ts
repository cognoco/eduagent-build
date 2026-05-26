// ---------------------------------------------------------------------------
// Billing — Tier logic
// handleTierChange, getUpgradePrompt, getTopUpPriceCents — pure logic
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  subscriptions,
  type Database,
  findSubscriptionById__unscoped,
  findQuotaPool__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import { getTierConfig } from '../subscription';
import { reconcileQuotaStateForSubscription } from './quota-reconcile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TierChangeResult {
  previousTier: SubscriptionTier;
  newTier: SubscriptionTier;
  usedThisCycle: number;
  newMonthlyLimit: number;
  remainingQuestions: number;
}

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

// ---------------------------------------------------------------------------
// handleTierChange
// ---------------------------------------------------------------------------

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
  newTier: SubscriptionTier,
): Promise<TierChangeResult | null> {
  // safe-caller: Stripe webhook tier-change handler — subscriptionId from verified Stripe event
  const sub = await findSubscriptionById__unscoped(db, subscriptionId);

  if (!sub) {
    return null;
  }

  // safe-caller: Stripe webhook tier-change handler — subscriptionId from verified Stripe event
  const pool = await findQuotaPool__unscoped(db, subscriptionId);

  if (!pool) {
    return null;
  }

  const newConfig = getTierConfig(newTier);
  const usedThisCycle = pool.usedThisMonth;
  const newMonthlyLimit = newConfig.monthlyQuota;
  const remainingQuestions = Math.max(0, newMonthlyLimit - usedThisCycle);

  // [CR-2026-05-19-H22] Persist the new tier on the subscription row alongside
  // the quota-pool limit update. Without this, downstream readers (KV cache,
  // metering middleware, getSubscriptionByAccountId) continue to see the OLD
  // tier — silently diverging tier and quota. Both writes share a transaction
  // so the pair is atomic: either both land or neither does, never a state
  // where the quota pool reflects the new tier while subscriptions.tier lags.
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({
        tier: newTier,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscriptionId));

    await reconcileQuotaStateForSubscription(
      tx as unknown as Database,
      subscriptionId,
      now,
      { resetExpiredSharedPoolUsage: false },
    );
  });

  return {
    previousTier: sub.tier,
    newTier,
    usedThisCycle,
    newMonthlyLimit,
    remainingQuestions,
  };
}

// ---------------------------------------------------------------------------
// getUpgradePrompt
// ---------------------------------------------------------------------------

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
        "You've reached your free plan limit. Upgrade to Plus for 700 questions/month.",
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

  // Family -> Pro: at or over the 4-profile limit. The `isAddingProfile`
  // discriminator was redundant here — `profileCount >= 4` already covers
  // both "at limit" and "trying to add when already at limit".
  if (tier === 'family' && profileCount >= 4) {
    return {
      reason: 'max_profiles_reached',
      suggestedTier: 'pro',
      message:
        'Need more profiles? Upgrade to Pro for up to 6 learners and 3,000 questions/month.',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// getTopUpPriceCents
// ---------------------------------------------------------------------------

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
