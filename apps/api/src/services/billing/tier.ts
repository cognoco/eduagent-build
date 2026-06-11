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
  lockSubscriptionById__unscoped,
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
// Top-up credit re-attribution metric — single event name, single schema
// ---------------------------------------------------------------------------

export interface TopUpCreditsReattributedEventData {
  subscriptionId: string;
  accountId: string;
  previousTier: SubscriptionTier;
  newTier: SubscriptionTier;
  previousModel: 'per-profile' | 'shared-pool';
  newModel: 'per-profile' | 'shared-pool';
  reattributedCount: number;
  occurredAt: string;
}

/**
 * Pure builder — single source of truth for the
 * `app/billing.topup_credits.reattributed` payload so the Stripe path
 * (`handleTierChange`) and the RevenueCat webhook path
 * (`updateSubscriptionAndQuotaFromRevenuecatWebhook`) emit an identical
 * schema under the single event name. Exported for the schema-coherence
 * assertion in tier.integration.test.ts.
 */
export function buildTopUpCreditsReattributedEventData(params: {
  subscriptionId: string;
  accountId: string;
  previousTier: SubscriptionTier;
  newTier: SubscriptionTier;
  reattributedCount: number;
  occurredAt: Date;
}): TopUpCreditsReattributedEventData {
  return {
    subscriptionId: params.subscriptionId,
    accountId: params.accountId,
    previousTier: params.previousTier,
    newTier: params.newTier,
    previousModel: getTierConfig(params.previousTier).quotaModel,
    newModel: getTierConfig(params.newTier).quotaModel,
    reattributedCount: params.reattributedCount,
    occurredAt: params.occurredAt.toISOString(),
  };
}

/**
 * Emits the queryable re-attribution metric (silent-recovery-banned rule).
 * Both tier-change paths call this — a dispatch failure must never break
 * the tier change, so it routes through safeSend.
 */
export async function emitTopUpCreditsReattributedMetric(params: {
  subscriptionId: string;
  accountId: string;
  previousTier: SubscriptionTier;
  newTier: SubscriptionTier;
  reattributedCount: number;
  occurredAt: Date;
}): Promise<void> {
  const data = buildTopUpCreditsReattributedEventData(params);
  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: structured telemetry required by AGENTS.md
        // ("silent recovery in billing must emit a structured metric").
        // The re-attribution is handled in-line. This event is a
        // dashboard-queryable signal so ops can audit credit migration.
        name: 'app/billing.topup_credits.reattributed',
        data,
      }),
    'billing.topup_credits.reattributed',
    {
      subscriptionId: data.subscriptionId,
      reattributedCount: data.reattributedCount,
    },
  );
}

// ---------------------------------------------------------------------------
// reattributeTopUpCreditsOnModelChange
// ---------------------------------------------------------------------------

/**
 * Re-attributes active top-up credits when the quota model changes tier.
 *
 * Must be called INSIDE an open transaction (`tx`).
 * Returns the number of credit rows re-attributed (0 if no model change).
 *
 * This function is also called from the RevenueCat webhook tier-change path
 * (`updateSubscriptionAndQuotaFromRevenuecatWebhook`) so that credits are
 * re-attributed regardless of which path triggered the tier change.
 *
 * See [F-124] comment block in `handleTierChange` for the full rationale.
 */
export async function reattributeTopUpCreditsOnModelChange(
  tx: Database,
  subscriptionId: string,
  accountId: string,
  previousTier: SubscriptionTier,
  newTier: SubscriptionTier,
): Promise<number> {
  const oldModel = getTierConfig(previousTier).quotaModel;
  const newModel = getTierConfig(newTier).quotaModel;

  if (oldModel === newModel) return 0;

  if (newModel === 'per-profile') {
    // shared-pool → per-profile: re-attribute null credits to the owner profile.
    const owner = await tx.query.profiles.findFirst({
      where: and(eq(profiles.accountId, accountId), eq(profiles.isOwner, true)),
      columns: { id: true },
    });

    if (!owner) {
      logger.warn(
        '[billing.tier] shared-pool→per-profile: no owner profile found; top-up credits left with profileId=null',
        { subscriptionId, newTier, metric: 'billing_tier_topup_no_owner' },
      );
      return 0;
    }

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
    return updated.length;
  }

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
  return updated.length;
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

  // [F-124] Re-attribute top-up credits inside the transaction so the model
  // change and credit re-attribution are atomic.
  // See `reattributeTopUpCreditsOnModelChange` for the full rationale.
  let reattributedCount = 0;
  let previousTier: SubscriptionTier = sub.tier;

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // [F-124 rework] Lock-and-read the tier INSIDE the transaction
    // (SELECT … FOR UPDATE) so the tier-change detection and the credit
    // re-attribution below are serialized against concurrent tier changes on
    // the same subscription. A plain in-transaction read under READ COMMITTED
    // is not enough: two concurrent transactions can both read the same
    // previousTier before either commits (Codex P1 on PR #897). The row lock
    // is held until commit; the second transaction blocks here and then sees
    // the first one's committed tier. Mirrors the same fix in
    // updateSubscriptionAndQuotaFromRevenuecatWebhook (revenuecat.ts).
    // safe-caller: Stripe webhook tier-change handler — subscriptionId from verified Stripe event
    const current = await lockSubscriptionById__unscoped(txDb, subscriptionId);
    if (current) {
      previousTier = current.tier;
    }

    await tx
      .update(subscriptions)
      .set({
        tier: newTier,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscriptionId));

    await reconcileQuotaStateForSubscription(txDb, subscriptionId, now, {
      resetExpiredSharedPoolUsage: false,
    });

    reattributedCount = await reattributeTopUpCreditsOnModelChange(
      txDb,
      subscriptionId,
      sub.accountId,
      previousTier,
      newTier,
    );
  });

  // Emit a queryable metric whenever credits are re-attributed so ops can
  // measure how often this path fires (silent-recovery-banned rule).
  if (reattributedCount > 0) {
    await emitTopUpCreditsReattributedMetric({
      subscriptionId,
      accountId: sub.accountId,
      previousTier,
      newTier,
      reattributedCount,
      occurredAt: now,
    });
  }

  return {
    previousTier,
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
