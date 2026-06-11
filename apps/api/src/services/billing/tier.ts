// ---------------------------------------------------------------------------
// Billing — Tier logic
// handleTierChange, getUpgradePrompt, getTopUpPriceCents — pure logic
// ---------------------------------------------------------------------------

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  profiles,
  subscriptions,
  topUpCredits,
  type Database,
  findSubscriptionById__unscoped,
  findQuotaPool__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import { getTierConfig } from '../subscription';
import { reconcileQuotaStateForSubscription } from './quota-reconcile';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';
import { createLogger } from '../logger';

const logger = createLogger();

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

  // [F-124] Detect quota-model change so top-up credits are re-attributed
  // before the new model's metering path tries to consume them.
  //
  // Why: purchaseTopUpCredits sets profileId=owner.id on per-profile tiers
  // (plus) and profileId=null on shared-pool tiers (family/pro).
  // consumeOwnerTopUpCredit (per-profile path) filters by eq(profileId, owner.id)
  // — so shared-pool credits (profileId=null) become invisible after an upgrade
  // to per-profile. decrementPoolQuota (shared-pool path) has no profileId
  // filter, but the existing per-profile credits (profileId=owner.id) that were
  // previously invisible are now findable — HOWEVER those credits were purchased
  // under per-profile semantics and the profileId IS set to the owner, so they
  // ARE visible to the shared-pool path. Wait — this means:
  //   - per-profile → shared-pool: credits with profileId=owner.id are VISIBLE
  //     to decrementPoolQuota (no profileId filter) but their profileId is set.
  //     The shared-pool path (decrementPoolQuota) queries by subscriptionId only,
  //     so it WILL find them. They would work. BUT for the reverse case:
  //   - shared-pool → per-profile: credits with profileId=null are NOT found by
  //     consumeOwnerTopUpCredit which adds eq(topUpCredits.profileId, profileId).
  //     profileId=null rows fail the eq() test. STRANDED.
  //
  // Fix: re-attribute active (remaining>0) credits to match the new model:
  //   - shared-pool → per-profile: SET profileId = owner.id (makes them
  //     findable by consumeOwnerTopUpCredit)
  //   - per-profile → shared-pool: SET profileId = NULL (canonical shared-pool
  //     form; decrementPoolQuota already finds them, but normalizing to null
  //     is the correct canonical form so future per-profile readers don't see
  //     orphaned per-profile credits after the model change)
  //
  // Only active credits (remaining > 0) are re-attributed; spent rows stay
  // as-is (they are historical records, not functional state).
  //
  // The re-attribution happens INSIDE the same transaction so the model change
  // and credit re-attribution are atomic. safeSend emits a queryable metric
  // if any rows are moved (silent-recovery-banned rule).
  const oldQuotaModel = getTierConfig(sub.tier).quotaModel;
  const newQuotaModel = newConfig.quotaModel;
  const modelChanged = oldQuotaModel !== newQuotaModel;

  let reattributedCount = 0;

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

    if (modelChanged) {
      if (newQuotaModel === 'per-profile') {
        // shared-pool → per-profile: re-attribute null credits to the owner profile.
        // Find the owner for this subscription's account.
        // `sub` is guaranteed non-null at this point (early return above).
        const owner = await tx.query.profiles.findFirst({
          where: and(
            eq(profiles.accountId, sub.accountId),
            eq(profiles.isOwner, true),
          ),
          columns: { id: true },
        });

        if (owner) {
          const updated = await tx
            .update(topUpCredits)
            .set({ profileId: owner.id })
            .where(
              and(
                eq(topUpCredits.subscriptionId, subscriptionId),
                isNull(topUpCredits.profileId),
                sql`${topUpCredits.remaining} > 0`,
              ),
            )
            .returning({ id: topUpCredits.id });
          reattributedCount = updated.length;
        } else {
          // No owner profile yet — credits stay null; log so ops can see this.
          // This is an edge-case (account in transition); it is not a silent
          // failure because the metric below fires on reattributedCount == 0
          // only when modelChanged is true.
          logger.warn(
            '[billing.tier] shared-pool→per-profile: no owner profile found; top-up credits left with profileId=null',
            { subscriptionId, newTier, metric: 'billing_tier_topup_no_owner' },
          );
        }
      } else {
        // per-profile → shared-pool: re-attribute owner-profile credits to null.
        const updated = await tx
          .update(topUpCredits)
          .set({ profileId: null })
          .where(
            and(
              eq(topUpCredits.subscriptionId, subscriptionId),
              isNotNull(topUpCredits.profileId),
              sql`${topUpCredits.remaining} > 0`,
            ),
          )
          .returning({ id: topUpCredits.id });
        reattributedCount = updated.length;
      }
    }
  });

  // Emit a queryable metric whenever credits are re-attributed so ops can
  // measure how often this path fires (silent-recovery-banned rule).
  // Uses safeSend — a dispatch failure must never break the tier change.
  if (modelChanged && reattributedCount > 0) {
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: structured telemetry required by CLAUDE.md
          // ("silent recovery in billing must emit a structured metric").
          // The re-attribution is handled in-line. This event is a
          // dashboard-queryable signal so ops can audit credit migration.
          name: 'app/billing.topup_credits.reattributed',
          data: {
            subscriptionId,
            previousTier: sub.tier,
            newTier,
            previousModel: oldQuotaModel,
            newModel: newQuotaModel,
            reattributedCount,
            occurredAt: now.toISOString(),
          },
        }),
      'billing.topup_credits.reattributed',
      { subscriptionId, reattributedCount },
    );
  }

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
