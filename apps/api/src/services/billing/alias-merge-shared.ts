// ---------------------------------------------------------------------------
// Billing — RevenueCat SUBSCRIBER_ALIAS merge policy [BUG-783 / BUG-449]
// ---------------------------------------------------------------------------
// [WI-1239 / 779-strip] Relocated from the legacy alias-merge.ts (deleted —
// `mergeAliasedSubscription` itself was dead, superseded by
// billing-v2/alias-merge-v2.ts). This module holds only the pure,
// store-agnostic merge decision (no DB I/O), which billing-v2/alias-merge-v2.ts
// reuses unchanged — see its header comment.
//
// Policy:
//   - Subscription: keep the more valuable of the two tiers
//     (free < plus < family < pro), tiebreak by latest currentPeriodEnd.
//     Never downgrade the survivor as a merge side effect.
//   - Top-up credits: target ends with MAX(from, to) remaining, NOT the sum
//     (summing invites abuse via deliberate re-aliasing). Grant the positive
//     delta as a new top-up pack on the survivor.
//   - Never refund / cancel — Apple/Google own IAP billing. If BOTH sides are
//     genuinely active paid store subs, escalate to support; don't auto-merge
//     a second live charge away.
// ---------------------------------------------------------------------------

import type {
  BillingAliasReceivedEvent,
  SubscriptionTier,
} from '@eduagent/schemas';
import type { SubscriptionRow } from './types';

/** Idempotency source tag for the shared webhook_idempotency_keys table. */
export const ALIAS_MERGE_IDEMPOTENCY_SOURCE = 'revenuecat-alias-merge';

/**
 * Tier value ordering. A higher number is "more valuable" and wins the merge.
 * free < plus < family < pro.
 */
const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  plus: 1,
  family: 2,
  pro: 3,
};

/** Statuses that represent a live, paid (or trialing) entitlement. */
function isLiveEntitlement(status: SubscriptionRow['status']): boolean {
  return status === 'active' || status === 'trial';
}

export interface AliasMergeDecision {
  /** The tier the survivor should end up on. */
  survivorTier: SubscriptionTier;
  /** True when the survivor's tier must be raised to survivorTier. */
  upgradeSurvivor: boolean;
  /** currentPeriodEnd to carry onto the survivor when upgrading (ISO|null). */
  survivorPeriodEnd: string | null;
  /** trialEndsAt to carry onto the survivor when upgrading (ISO|null). */
  survivorTrialEndsAt: string | null;
  /** Survivor status to set when upgrading. */
  survivorStatus: SubscriptionRow['status'];
  /** Positive number of top-up credits to grant so survivor = MAX(from,to). */
  topUpDeltaToGrant: number;
  /**
   * True when BOTH sides are genuinely live paid (non-free) store subs — a
   * second live charge we must NOT silently merge away. Escalate to support.
   */
  bothActivePaid: boolean;
}

/**
 * Pure decision: given the from-side pre-downgrade snapshot and the survivor's
 * current state, decide the user-favorable merge. No I/O.
 */
export function decideAliasMerge(
  fromSnapshot: BillingAliasReceivedEvent['fromSnapshot'],
  survivor: Pick<
    SubscriptionRow,
    'tier' | 'status' | 'currentPeriodEnd' | 'trialEndsAt'
  >,
  survivorTopUpRemaining: number,
): AliasMergeDecision {
  const fromRank = TIER_RANK[fromSnapshot.tier];
  const survivorRank = TIER_RANK[survivor.tier];

  // Survivor tier wins unless the from-side is strictly more valuable, or the
  // tiers are equal and the from-side has a later currentPeriodEnd (more
  // remaining paid time).
  let upgradeSurvivor = false;
  if (fromRank > survivorRank) {
    upgradeSurvivor = true;
  } else if (fromRank === survivorRank && fromRank > 0) {
    const fromEnd = fromSnapshot.currentPeriodEnd
      ? Date.parse(fromSnapshot.currentPeriodEnd)
      : 0;
    const survivorEnd = survivor.currentPeriodEnd
      ? Date.parse(survivor.currentPeriodEnd)
      : 0;
    if (fromEnd > survivorEnd) upgradeSurvivor = true;
  }

  const survivorTier = upgradeSurvivor ? fromSnapshot.tier : survivor.tier;

  // Top-up: survivor ends with MAX(from, to); grant only the positive delta.
  const topUpDeltaToGrant = Math.max(
    0,
    fromSnapshot.topUpRemaining - survivorTopUpRemaining,
  );

  // Both genuinely live paid store subs — a second real charge. Flag for
  // support; we still keep the survivor on the better tier, but the second
  // store subscription must be reconciled by a human (we never auto-cancel).
  const bothActivePaid =
    isLiveEntitlement(fromSnapshot.status) &&
    fromSnapshot.tier !== 'free' &&
    isLiveEntitlement(survivor.status) &&
    survivor.tier !== 'free';

  return {
    survivorTier,
    upgradeSurvivor,
    survivorPeriodEnd: upgradeSurvivor
      ? fromSnapshot.currentPeriodEnd
      : survivor.currentPeriodEnd,
    survivorTrialEndsAt: upgradeSurvivor
      ? fromSnapshot.trialEndsAt
      : survivor.trialEndsAt,
    // When upgrading off a from-side trial, preserve trial status; otherwise
    // the survivor is on a live paid tier.
    survivorStatus: upgradeSurvivor
      ? fromSnapshot.status === 'trial'
        ? 'trial'
        : 'active'
      : survivor.status,
    topUpDeltaToGrant,
    bothActivePaid,
  };
}

export interface AliasMergeResult {
  status:
    | 'merged'
    | 'replay'
    | 'no_target_account'
    | 'no_target_subscription'
    | 'no_change';
  /** Decision applied (omitted for replay / missing-target outcomes). */
  decision?: AliasMergeDecision;
  /** Survivor subscription id, when resolved. */
  survivorSubscriptionId?: string;
}
