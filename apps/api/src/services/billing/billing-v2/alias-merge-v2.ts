// ---------------------------------------------------------------------------
// Billing-v2 — RevenueCat SUBSCRIBER_ALIAS merge twin (subscription table)
// [WI-1057 / BUG-783 / BUG-449]
//
// v2 twin of services/billing/alias-merge.ts `mergeAliasedSubscription`. The
// legacy service reconciles the dropped `subscriptions` table; this one reads
// and writes the v2 `subscription` table via the billing-v2 surface. The
// billing-alias-merge worker selects between the two on IDENTITY_V2_ENABLED,
// mirroring quota-reset's resetExpiredQuotaCycles / resetExpiredQuotaCyclesV2
// split. Inert behind the flag until the WI-586 cutover; the legacy path stays
// byte-identical.
//
// Only the four identity-bound I/O calls are re-pointed:
//   - surviving identity resolution: findAccountByClerkId → resolveAccountIdV2
//     (Clerk app_user_id → organization id; v2 "account" = organization).
//   - surviving subscription read: getSubscriptionByAccountId →
//     getSubscriptionByAccountIdV2 (joins the `subscription` table).
//   - tier + quota upgrade: updateSubscriptionAndQuotaFromRevenuecatWebhook →
//     updateSubscriptionAndQuotaFromRevenuecatWebhookV2.
//   - top-up grant: purchaseTopUpCredits → purchaseTopUpCreditsV2.
//
// Reused unchanged (NOT forked): the pure `decideAliasMerge` policy, the shared
// `top_up_credits` satellite reader `getTopUpCreditsRemaining` (the satellite
// table is not re-pointed in v2 — only the parent subscription lookup is), the
// idempotency claim, tier config, and Sentry escalation. Policy, atomicity, and
// idempotency guarantees are identical to the legacy service — see its header.
//
// Live path: identity-v2 is cut over (IDENTITY_V2_ENABLED='true' in stg+prd),
// so the billing-alias-merge worker routes here, and the v2 webhook handler
// (handleSubscriberAliasV2) dispatches a real `fromSnapshot.topUpRemaining`
// read via the shared getTopUpCreditsRemaining reader (WI-1057 closed the prior
// `topUpRemaining: 0` floor). Both halves of the BUG-783 reconciliation — tier
// upgrade AND top-up credit migration — therefore fire end-to-end on the v2
// store. (top_up_credits is not forked in v2; the same reader keys on the
// subscription id for both legacy and v2 rows.)
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type { BillingAliasReceivedEvent } from '@eduagent/schemas';

import { captureMessage } from '../../sentry';
import { createLogger } from '../../logger';
import { claimWebhookId } from '../../webhook-idempotency';
import { getTopUpCreditsRemaining } from '../top-up';
import {
  decideAliasMerge,
  ALIAS_MERGE_IDEMPOTENCY_SOURCE,
  type AliasMergeResult,
} from '../alias-merge';
import { extractTierQuota } from '../billing-shared';
import { resolveAccountIdV2 } from './revenuecat-webhook-handler-v2';
import { getSubscriptionByAccountIdV2 } from './subscription-core-v2';
import { updateSubscriptionAndQuotaFromRevenuecatWebhookV2 } from './revenuecat-v2';
import { purchaseTopUpCreditsV2 } from './top-up-v2';

const logger = createLogger();

/**
 * v2 twin of `mergeAliasedSubscription`. Reconciles an aliased
 * (transferred_from -> transferred_to) RevenueCat subscriber pair onto the
 * surviving identity's v2 `subscription` row. Idempotent and atomic — same
 * contract as the legacy service.
 */
export async function mergeAliasedSubscriptionV2(
  db: Database,
  event: BillingAliasReceivedEvent,
): Promise<AliasMergeResult> {
  // 1. Resolve the surviving identity. transferred_to is a Clerk user id set
  //    via Purchases.logIn(); anonymous ids ($...) can never own a sub.
  //    resolveAccountIdV2 already short-circuits the $-prefix case to null.
  if (event.toAppUserId.startsWith('$')) {
    return { status: 'no_target_account' };
  }
  const toOrganizationId = await resolveAccountIdV2(db, event.toAppUserId);
  if (!toOrganizationId) {
    return { status: 'no_target_account' };
  }

  const survivor = await getSubscriptionByAccountIdV2(db, toOrganizationId);
  if (!survivor) {
    // The survivor has no subscription row to upgrade. We never CREATE a paid
    // subscription off an alias (no store-side proof the charge belongs here).
    // Escalate — ops reconcile by hand. Banned: silent recovery in billing.
    captureMessage(
      '[revenuecat] alias merge (v2) skipped — surviving identity has no subscription row',
      {
        level: 'warning',
        extra: {
          eventId: event.eventId,
          fromAccountId: event.fromAccountId,
          toAppUserId: event.toAppUserId,
          fromTier: event.fromSnapshot.tier,
          category: 'revenuecat.alias_merge.no_target_subscription',
        },
        tags: { surface: 'billing.revenuecat.alias_merge.v2' },
      },
    );
    return { status: 'no_target_subscription' };
  }

  // The shared `top_up_credits` satellite is keyed by subscription id and is
  // NOT forked in v2 — the legacy reader is correct here.
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
  //    before any state change. (Shared webhook_idempotency_keys table; the
  //    source tag is shared with the legacy path so a redelivery across a flag
  //    flip can never double-apply.)
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
        'alias-merge (v2) idempotency claim unavailable — retrying to avoid double-apply',
      );
    }

    let changed = false;

    // 3a. Upgrade the survivor's subscription + quota when the from-side was
    //     more valuable. The v2 update nests its own transaction as a
    //     savepoint under this one (neon-serverless). A synthetic event id
    //     keys its internal dedup off the alias merge, not the original
    //     purchase event.
    if (decision.upgradeSurvivor) {
      const updated = await updateSubscriptionAndQuotaFromRevenuecatWebhookV2(
        txDb,
        toOrganizationId,
        {
          eventId: `alias-merge:${event.eventId}`,
          status: decision.survivorStatus,
          tier: decision.survivorTier,
          currentPeriodEnd: decision.survivorPeriodEnd,
          trialEndsAt: decision.survivorTrialEndsAt,
        },
        extractTierQuota(decision.survivorTier),
      );
      if (updated) {
        changed = true;
      } else {
        // The decision said upgrade but the v2 update applied nothing (e.g. a
        // stale event-ordering guard). Surface it — billing no-silent-recovery.
        captureMessage(
          '[revenuecat] alias merge (v2): survivor upgrade decided but no row applied',
          {
            level: 'warning',
            extra: {
              eventId: event.eventId,
              toOrganizationId,
              survivorSubscriptionId: survivor.id,
              survivorTier: decision.survivorTier,
              category: 'revenuecat.alias_merge.v2_upgrade_no_apply',
            },
            tags: { surface: 'billing.revenuecat.alias_merge.v2' },
          },
        );
      }
    }

    // 3b. Top-up: grant the positive delta so survivor = MAX(from, to).
    //     Deterministic txn id keys off the event so a retry can't double-grant
    //     (purchaseTopUpCreditsV2 uses ON CONFLICT DO NOTHING on that txn id).
    if (decision.topUpDeltaToGrant > 0) {
      const granted = await purchaseTopUpCreditsV2(
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
    logger.info('[revenuecat] alias merge (v2) replay — already reconciled', {
      eventId: event.eventId,
      survivorSubscriptionId: survivor.id,
    });
    return { status: 'replay', survivorSubscriptionId: survivor.id };
  }

  // 4. Escalate when both sides were live paid store subs — a second live
  //    charge a human must reconcile (we never auto-cancel a store sub).
  if (decision.bothActivePaid) {
    captureMessage(
      '[revenuecat] alias merge (v2): both identities held a live paid store subscription — manual reconciliation required',
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
        tags: { surface: 'billing.revenuecat.alias_merge.v2' },
      },
    );
  }

  logger.info('[revenuecat] alias merge (v2) reconciled', {
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
