// ---------------------------------------------------------------------------
// Billing — RevenueCat SUBSCRIBER_ALIAS merge service [BUG-783 / BUG-449]
//
// When RevenueCat merges two subscriber records (SUBSCRIBER_ALIAS) and the
// `transferred_from` identity still held an active subscription, the webhook
// handler:
//   1. force-downgrades the from-side row to free/expired (BUG-833 — prevents
//      the old Clerk identity from keeping paid access on re-link), and
//   2. dispatches `app/billing.alias_received` carrying a PRE-DOWNGRADE
//      snapshot of the from-side entitlement.
//
// This module owns the reconciliation half: `mergeAliasedSubscription` moves
// the from-side's value onto the surviving (transferred_to) identity. Because
// the from-side row is already free/expired by worker-run time, the worker
// must rely on the snapshot in the event — it cannot re-read the original
// entitlement.
//
// Policy (documented in the webhook handler + the event schema):
//   - Subscription: keep the more valuable of the two tiers
//     (free < plus < family < pro), tiebreak by latest currentPeriodEnd.
//     Never downgrade the survivor as a merge side effect.
//   - Top-up credits: target ends with MAX(from, to) remaining, NOT the sum
//     (summing invites abuse via deliberate re-aliasing). We grant the
//     positive delta as a new top-up pack on the survivor.
//   - Never refund / cancel — Apple/Google own IAP billing. If BOTH sides are
//     genuinely active paid store subs, escalate to support; don't auto-merge
//     a second live charge away.
//
// Idempotency: keyed on the RevenueCat event id via the shared
// `webhook_idempotency_keys` table (source `revenuecat-alias-merge`). A
// redelivered webhook or a retried worker run claims the same key and
// short-circuits as a replay before any write.
//
// Atomicity: the idempotency claim + every reconciliation write run inside one
// `db.transaction()` so a crash never leaves the survivor half-merged. The
// neon-serverless driver makes `db.transaction()` genuinely interactive + ACID
// in production (see project memory: neon-transaction-facts).
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type {
  BillingAliasReceivedEvent,
  SubscriptionTier,
} from '@eduagent/schemas';

import { findAccountByClerkId } from '../account';
import { captureMessage } from '../sentry';
import { createLogger } from '../logger';
import { claimWebhookId } from '../webhook-idempotency';
import {
  getSubscriptionByAccountId,
  updateSubscriptionAndQuotaFromRevenuecatWebhook,
  getTopUpCreditsRemaining,
  purchaseTopUpCredits,
} from '../billing';
import { extractTierQuota } from './billing-shared';
import type { SubscriptionRow } from './types';

const logger = createLogger();

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

/**
 * Reconciles an aliased (transferred_from -> transferred_to) RevenueCat
 * subscriber pair onto the surviving identity. Idempotent and atomic.
 */
export async function mergeAliasedSubscription(
  db: Database,
  event: BillingAliasReceivedEvent,
): Promise<AliasMergeResult> {
  // 1. Resolve the surviving identity. transferred_to is a Clerk user id set
  //    via Purchases.logIn(); anonymous ids ($...) can never own a sub.
  if (event.toAppUserId.startsWith('$')) {
    return { status: 'no_target_account' };
  }
  const toAccount = await findAccountByClerkId(db, event.toAppUserId);
  if (!toAccount) {
    return { status: 'no_target_account' };
  }

  const survivor = await getSubscriptionByAccountId(db, toAccount.id);
  if (!survivor) {
    // The survivor has no subscription row to upgrade. We never CREATE a paid
    // subscription off an alias (no store-side proof the charge belongs here).
    // Escalate — ops reconcile by hand. Banned: silent recovery in billing.
    captureMessage(
      '[revenuecat] alias merge skipped — surviving identity has no subscription row',
      {
        level: 'warning',
        extra: {
          eventId: event.eventId,
          fromAccountId: event.fromAccountId,
          toAppUserId: event.toAppUserId,
          fromTier: event.fromSnapshot.tier,
          category: 'revenuecat.alias_merge.no_target_subscription',
        },
        tags: { surface: 'billing.revenuecat.alias_merge' },
      },
    );
    return { status: 'no_target_subscription' };
  }

  const survivorTopUpRemaining = await getTopUpCreditsRemaining(
    db,
    survivor.id,
  );
  const decision = decideAliasMerge(
    event.fromSnapshot,
    survivor,
    survivorTopUpRemaining,
  );

  // 2. Idempotency + writes, atomically. Claim the event id FIRST inside the
  //    transaction; a replay/redelivery loses the claim and we short-circuit
  //    before any state change.
  const result = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const claim = await claimWebhookId(
      txDb,
      ALIAS_MERGE_IDEMPOTENCY_SOURCE,
      event.eventId,
    );
    if (claim === 'replay') {
      return { status: 'replay' as const };
    }
    if (claim === 'unavailable') {
      // The dedup store is down. Fail the step so Inngest retries rather than
      // double-applying — claimWebhookId already escalated to Sentry.
      throw new Error(
        'alias-merge idempotency claim unavailable — retrying to avoid double-apply',
      );
    }

    let changed = false;

    // 3a. Upgrade the survivor's subscription + quota when the from-side was
    //     more valuable. updateSubscriptionAndQuotaFromRevenuecatWebhook is
    //     itself transactional-safe and tier-aware; we pass a synthetic event
    //     id so its internal dedup keys off the alias merge, not the original
    //     purchase event.
    if (decision.upgradeSurvivor) {
      await updateSubscriptionAndQuotaFromRevenuecatWebhook(
        txDb,
        survivor.accountId,
        {
          eventId: `alias-merge:${event.eventId}`,
          status: decision.survivorStatus,
          tier: decision.survivorTier,
          currentPeriodEnd: decision.survivorPeriodEnd,
          trialEndsAt: decision.survivorTrialEndsAt,
        },
        extractTierQuota(decision.survivorTier),
      );
      changed = true;
    }

    // 3b. Top-up: grant the positive delta so survivor = MAX(from, to).
    //     Deterministic txn id keys off the event so a retry can't double-grant
    //     (purchaseTopUpCredits uses ON CONFLICT DO NOTHING on that txn id).
    if (decision.topUpDeltaToGrant > 0) {
      const granted = await purchaseTopUpCredits(
        txDb,
        survivor.id,
        decision.topUpDeltaToGrant,
        new Date(),
        `alias-merge:${event.eventId}`,
      );
      if (granted) changed = true;
    }

    return {
      status: changed ? ('merged' as const) : ('no_change' as const),
    };
  });

  if (result.status === 'replay') {
    logger.info('[revenuecat] alias merge replay — already reconciled', {
      eventId: event.eventId,
      survivorSubscriptionId: survivor.id,
    });
    return { status: 'replay', survivorSubscriptionId: survivor.id };
  }

  // 4. Escalate when both sides were live paid store subs — a second live
  //    charge a human must reconcile (we never auto-cancel a store sub).
  if (decision.bothActivePaid) {
    captureMessage(
      '[revenuecat] alias merge: both identities held a live paid store subscription — manual reconciliation required',
      {
        level: 'warning',
        extra: {
          eventId: event.eventId,
          fromAccountId: event.fromAccountId,
          toAppUserId: event.toAppUserId,
          fromTier: event.fromSnapshot.tier,
          survivorTier: survivor.tier,
          category: 'revenuecat.alias_merge.both_active_paid',
        },
        tags: { surface: 'billing.revenuecat.alias_merge' },
      },
    );
  }

  logger.info('[revenuecat] alias merge reconciled', {
    eventId: event.eventId,
    survivorSubscriptionId: survivor.id,
    survivorTier: decision.survivorTier,
    upgraded: decision.upgradeSurvivor,
    topUpDeltaGranted: decision.topUpDeltaToGrant,
    bothActivePaid: decision.bothActivePaid,
    status: result.status,
  });

  return {
    status: result.status,
    decision,
    survivorSubscriptionId: survivor.id,
  };
}
