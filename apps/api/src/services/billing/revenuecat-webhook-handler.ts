// ---------------------------------------------------------------------------
// RevenueCat Webhook Handler — service module
// ---------------------------------------------------------------------------
// [FCR-2026-05-23-L5.M2] Extracted from routes/revenuecat-webhook.ts to
// enforce the route/service boundary (eslint G1/G5, AGENTS.md §"Non-Negotiable
// Engineering Rules"). The route file now owns ONLY:
//   1. Bearer-token validation (timing-safe HMAC compare)
//   2. Zod payload parsing
//   3. account-resolution + idempotency gate + SANDBOX-in-prod guard +
//      ensureFreeSubscription
//   4. event-type dispatch to the service-side handlers below
//   5. HTTP response
// All entitlement mutations, KV-cache refreshes, top-up credit grants and
// Inngest dispatches live here so they can be unit-tested without the HTTP
// shell and reused by other callers (e.g. an Inngest replay tool).
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type { SubscriptionStatus } from '@eduagent/schemas';
// NOTE: Import via the barrel (`../billing`) — NOT via `./index` — so the
// existing webhook test suite (which mocks `../services/billing`) intercepts
// these calls. See parallel comment in stripe-webhook-handler.ts.
import {
  getSubscriptionByAccountId,
  updateSubscriptionFromRevenuecatWebhook,
  updateSubscriptionAndQuotaFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
  transitionToExtendedTrialFromRevenuecatEvent,
  purchaseTopUpCredits,
  getTopUpCreditsRemaining,
  type AppliedSubscriptionRow,
} from '../billing';
import { findAccountByClerkId } from '../account';
import { getTierConfig } from '../subscription';
import { safeRefreshKvCache } from '../safe-refresh-kv-cache';
import { captureException, captureMessage } from '../sentry';
import { createLogger } from '../logger';
import { safeSend } from '../safe-non-core';
import { EXTENDED_TRIAL_MONTHLY_EQUIVALENT } from '../trial';
import { inngest } from '../../inngest/client';
import {
  type RevenueCatEvent,
  getTopUpCreditsForProduct,
  extractTierFromProductId,
} from './revenuecat-shared';

const logger = createLogger();

// [WI-1239 / 779-strip] RevenueCatEvent + the product-id mapping helpers were
// relocated to revenuecat-shared.ts (pure, store-agnostic, shared with the v2
// handler) — imported above.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldRefreshRevenuecatKv(
  updated: AppliedSubscriptionRow | null,
  eventId: string,
): updated is AppliedSubscriptionRow {
  return (
    updated !== null &&
    (updated.webhookApplied !== false ||
      updated.lastRevenuecatEventId === eventId)
  );
}

/**
 * [SEC: revenuecat-webhook is_family_share] Apple Family Sharing and Google
 * Play family library propagate a single paid purchase to every family
 * member's account. RevenueCat then fires a purchase event (INITIAL_PURCHASE,
 * RENEWAL, PRODUCT_CHANGE, NON_RENEWING_PURCHASE) under the family member's
 * Clerk identity with `is_family_share: true`. The original purchaser already
 * holds the entitlement — granting again here N-tuples one paid seat into N.
 *
 * We never auto-grant entitlement off a family-shared event. Instead we
 * escalate via the established Sentry observability path (matching the
 * refund-revocation / topup-rejection conventions in this handler) so ops can
 * reconcile, and skip activation. Returns true when the event was a
 * family-share grant the caller must abort on.
 */
function escalateAndSkipFamilyShare(
  event: RevenueCatEvent,
  accountId: string,
): boolean {
  if (event.is_family_share !== true) return false;

  // Silent recovery is banned in billing/webhook code (AGENTS.md). Emit a
  // queryable Sentry message (no-ops without a DSN, so silent in dev/test)
  // carrying the event + product context ops need to reconcile — no raw PII
  // beyond what this handler already logs (accountId, productId).
  captureMessage(
    '[revenuecat] purchase event with is_family_share=true — entitlement NOT granted (family-shared purchase)',
    {
      level: 'warning',
      extra: {
        eventId: event.id,
        eventType: event.type,
        accountId,
        productId: event.product_id ?? event.new_product_id ?? null,
        category: 'revenuecat.family_share_received',
      },
      tags: { surface: 'revenuecat.family_share_received' },
    },
  );
  return true;
}

/**
 * Resolves a RevenueCat app_user_id to an internal account ID.
 * RevenueCat app_user_id is set to the Clerk user ID via Purchases.logIn().
 *
 * Exported because the route uses it once (during account-rejection) BEFORE
 * dispatching to the event-specific handlers, so the resolution result is
 * available across both pre- and post-dispatch paths.
 */
export async function resolveAccountId(
  db: Database,
  appUserId: string,
): Promise<string | null> {
  // RevenueCat anonymous IDs start with $ — skip them
  if (appUserId.startsWith('$')) return null;

  const account = await findAccountByClerkId(db, appUserId);
  return account?.id ?? null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

export async function handleInitialPurchase(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  // Family-shared purchase: original purchaser already holds entitlement. Skip.
  if (escalateAndSkipFamilyShare(event, accountId)) return;

  const tier = extractTierFromProductId(event.product_id);
  if (!tier) {
    // [FIX-API-REVENUECAT] Unknown product_id — capture to Sentry so new
    // products added to RevenueCat but not to PRODUCT_TIER_MAP are surfaced
    // immediately rather than silently dropping the purchase event.
    captureException(
      new Error('Unknown RevenueCat product_id in INITIAL_PURCHASE'),
      {
        extra: { productId: event.product_id, eventId: event.id },
      },
    );
    return;
  }

  // RevenueCat sets period_type to "TRIAL" for introductory offer / free trial
  const isTrial = event.period_type === 'TRIAL';

  const sub = await activateSubscriptionFromRevenuecat(
    db,
    accountId,
    tier,
    event.id,
    {
      currentPeriodStart: event.purchased_at_ms
        ? new Date(event.purchased_at_ms).toISOString()
        : undefined,
      currentPeriodEnd: event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : undefined,
      revenuecatOriginalAppUserId: event.original_app_user_id,
      isTrial,
      trialEndsAt:
        isTrial && event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : undefined,
      eventTimestampMs: event.event_timestamp_ms,
    },
  );

  await safeRefreshKvCache(
    kv,
    db,
    sub.accountId,
    'revenuecat.webhook.handleInitialPurchase',
    {
      eventId: event.id,
    },
  );
}

export async function handleRenewal(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  // Family-shared purchase: original purchaser already holds entitlement. Skip.
  if (escalateAndSkipFamilyShare(event, accountId)) return;

  const eventTier = extractTierFromProductId(event.product_id);

  // Read existing subscription to detect tier changes and preserve trialEndsAt.
  // [BUG-453] Only pass tier to the update when it actually changed — RC can
  // send RENEWAL for a different product, silently changing tier without going
  // through PRODUCT_CHANGE.
  const existingSub = await getSubscriptionByAccountId(db, accountId);
  const tierChanged = eventTier !== null && existingSub?.tier !== eventTier;

  // [BUG-453] RENEWAL during a trial period (period_type === 'TRIAL') must NOT
  // clear trialEndsAt — the trial is still active. Only wipe it on conversion
  // (period_type !== 'TRIAL').
  const isTrial = event.period_type === 'TRIAL';

  const renewalUpdates = {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'active' as const,
    // Only include tier when the event actually signals a different product tier.
    // Omitting the key entirely prevents any DB write to the tier column.
    ...(tierChanged && eventTier ? { tier: eventTier } : {}),
    currentPeriodStart: event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : undefined,
    currentPeriodEnd: event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : undefined,
    cancelledAt: null,
    // Preserve trialEndsAt during trial-period renewals by omitting it;
    // clear it on conversion to active (period_type !== 'TRIAL').
    ...(isTrial ? {} : { trialEndsAt: null }),
  };

  // Only update quota pool when the tier actually changed.
  const updated =
    tierChanged && eventTier
      ? await updateSubscriptionAndQuotaFromRevenuecatWebhook(
          db,
          accountId,
          renewalUpdates,
          {
            monthlyQuota: getTierConfig(eventTier).monthlyQuota,
            dailyLimit: getTierConfig(eventTier).dailyLimit,
          },
        )
      : await updateSubscriptionFromRevenuecatWebhook(
          db,
          accountId,
          renewalUpdates,
        );

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleRenewal',
      {
        eventId: event.id,
      },
    );
  }
}

/**
 * [BUG-832] RevenueCat cancel_reason values that indicate the underlying
 * charge was reversed (refund, chargeback, store-side payment error). When
 * any of these arrive — or when RevenueCat fires the dedicated REFUND event —
 * the entitlement must be revoked immediately, not held until
 * currentPeriodEnd. Otherwise the user keeps paid access after Apple/Google
 * have already reversed the charge.
 *
 * Reference: RevenueCat webhooks docs — cancel_reason enum.
 */
const REFUND_CANCEL_REASONS: ReadonlySet<string> = new Set([
  'CUSTOMER_SUPPORT',
  'BILLING_ERROR',
]);

export async function handleCancellation(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  // [BUG-832] Refund / chargeback / billing-error cancel reasons mean the
  // charge was reversed by Apple/Google or RC support. Revoke entitlement
  // immediately (downgrade tier='free', status='expired') rather than letting
  // the subscription ride out the original currentPeriodEnd. Log + Sentry
  // breadcrumb so ops can audit the revocation.
  if (event.cancel_reason && REFUND_CANCEL_REASONS.has(event.cancel_reason)) {
    logger.warn(
      '[revenuecat] CANCELLATION with refund-class cancel_reason — revoking entitlement immediately',
      {
        eventId: event.id,
        accountId,
        cancelReason: event.cancel_reason,
      },
    );
    captureMessage(
      '[revenuecat] entitlement revoked due to refund/chargeback',
      {
        level: 'warning',
        extra: {
          eventId: event.id,
          accountId,
          cancelReason: event.cancel_reason,
          category: 'revenuecat.refund_revocation',
        },
        tags: { surface: 'billing.revenuecat.refund' },
      },
    );

    const nowIso = new Date().toISOString();
    const freeConfig = getTierConfig('free');
    const updatedRefund = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
      db,
      accountId,
      {
        eventId: event.id,
        eventTimestampMs: event.event_timestamp_ms,
        status: 'expired',
        tier: 'free',
        cancelledAt: nowIso,
        currentPeriodEnd: nowIso,
      },
      {
        monthlyQuota: freeConfig.monthlyQuota,
        dailyLimit: freeConfig.dailyLimit,
      },
    );

    if (shouldRefreshRevenuecatKv(updatedRefund, event.id)) {
      await safeRefreshKvCache(
        kv,
        db,
        updatedRefund.accountId,
        'revenuecat.webhook.handleCancellation.refund',
        {
          eventId: event.id,
          cancelReason: event.cancel_reason,
        },
      );
    }
    return;
  }

  // [BUG-445] If the sub was already past_due when the user cancelled, DO NOT
  // flip it back to 'active' — that would erase the payment-failure signal.
  // Only promote to 'active' when the current status is active or trial (still
  // entitled). past_due stays past_due; cancelledAt records the intent.
  const existingSub = await getSubscriptionByAccountId(db, accountId);
  const targetStatus: SubscriptionStatus =
    existingSub?.status === 'past_due' ? 'past_due' : 'active';

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    // Keep the entitlement active (or past_due) until period end so mobile can
    // render the correct "Cancelling" state from cancelledAt + status.
    status: targetStatus,
    cancelledAt: new Date().toISOString(),
  });

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleCancellation',
      {
        eventId: event.id,
      },
    );
  }
}

export async function handleExpiration(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  // Check if this is a trial expiration — use period_type from the event
  // as the authoritative signal (safe regardless of webhook delivery order).
  // Fallback to DB status only when period_type is absent.
  const existingSub = await getSubscriptionByAccountId(db, accountId);
  const isTrialExpiration =
    event.period_type === 'TRIAL' ||
    (event.period_type == null && existingSub?.status === 'trial');

  if (isTrialExpiration && existingSub) {
    // Trial expiration triggers the reverse trial soft landing:
    // Days 15-28: extended access at 450 questions/month (15/day)
    // The daily trial-expiry Inngest function handles Day 29+ transition to free.
    const updated = await transitionToExtendedTrialFromRevenuecatEvent(
      db,
      existingSub.id,
      EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
      event.id,
      event.event_timestamp_ms,
    );

    if (shouldRefreshRevenuecatKv(updated, event.id)) {
      await safeRefreshKvCache(
        kv,
        db,
        accountId,
        'revenuecat.webhook.handleExpiration.trial',
        {
          eventId: event.id,
        },
      );
    }
    return;
  }

  // Non-trial expiration: downgrade to free tier immediately
  const freeConfig = getTierConfig('free');
  const updated = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
    db,
    accountId,
    {
      eventId: event.id,
      eventTimestampMs: event.event_timestamp_ms,
      status: 'expired',
      tier: 'free',
      cancelledAt: new Date().toISOString(),
    },
    {
      monthlyQuota: freeConfig.monthlyQuota,
      dailyLimit: freeConfig.dailyLimit,
    },
  );

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleExpiration',
      {
        eventId: event.id,
      },
    );
  }
}

export async function handleBillingIssue(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  // [BUG-792] Honor an app-store-managed billing grace period. Apple and Google
  // grant a grace window after a renewal failure, surfaced by RevenueCat as
  // `grace_period_expiration_at_ms`. During that window the learner must keep
  // paid access — the store is still attempting to collect, and downgrading to
  // Free mid-grace strands a paying customer.
  //
  // We persist a FUTURE grace expiry into `currentPeriodEnd` so the effective-
  // access resolver (services/subscription.ts → resolveEffectiveAccessTier) caps
  // paid access at the grace boundary, exactly as it already does for a
  // cancelled-but-not-yet-expired subscription. Status still moves to `past_due`
  // (the payment really did fail — billing observability + the payment.failed
  // dispatch below depend on it), but past_due + a future currentPeriodEnd now
  // resolves to `current` access until grace expiry.
  //
  // We OWN currentPeriodEnd on BILLING_ISSUE: write the grace expiry when grace
  // is genuinely in the future, and explicitly null otherwise. Leaving the
  // column untouched would let a stale future value from a prior successful
  // RENEWAL satisfy the resolver's `past_due && currentPeriodEnd > now` branch
  // and grant unintended paid access during a payment failure with no grace
  // (caught by Claude Code Review on PR #609). The new past_due branch reads
  // currentPeriodEnd; the write must own that column's state.
  const graceExpiryMs = event.grace_period_expiration_at_ms;
  const hasFutureGrace = graceExpiryMs != null && graceExpiryMs > Date.now();

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'past_due',
    currentPeriodEnd:
      hasFutureGrace && graceExpiryMs != null
        ? new Date(graceExpiryMs).toISOString()
        : null,
  });

  const shouldDispatchBillingIssue =
    updated !== null &&
    (updated.webhookApplied !== false ||
      updated.lastRevenuecatEventId === event.id);

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleBillingIssue',
      {
        eventId: event.id,
      },
    );
  }

  if (!updated) return;

  if (shouldDispatchBillingIssue) {
    // core-send: payment-failed alert - billing observability cannot be silent.
    // A swallowed dispatch leaves the failed payment unobserved by alerting.
    await inngest.send({
      id: `revenuecat-payment-failed:${event.id}`,
      name: 'app/payment.failed',
      data: {
        subscriptionId: updated.id,
        accountId: updated.accountId,
        source: 'revenuecat',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

export async function handleSubscriberAlias(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  // SUBSCRIBER_ALIAS: RevenueCat merged two subscriber records.
  // [BUG-728 / SEC-12] Routed through the structured logger so the Clerk
  // user IDs land as JSON `context` fields the log pipeline can index and
  // redact uniformly, rather than as raw console.info args that bypass the
  // pipeline's PII handling.
  logger.info('[revenuecat] SUBSCRIBER_ALIAS event', {
    appUserId: event.app_user_id,
    transferredFrom: event.transferred_from,
    transferredTo: event.transferred_to,
  });

  // [BUG-449] Full merge implementation deferred — escalation + event dispatch
  // unblock visibility. TODO(BUG-449): full merge implementation deferred —
  // escalation + event dispatch unblock visibility.
  //
  // When transferred_from has an existing subscription, credits/entitlements
  // on that app_user_id are NOT yet migrated to the new identity. Surface
  // this via Sentry (high severity) and dispatch an Inngest event so a future
  // migration worker can consume it without data loss.
  const transferredFrom = event.transferred_from ?? [];
  if (transferredFrom.length > 0) {
    // Resolve the transferred_from app_user_id(s) to check for existing subs
    for (const fromUserId of transferredFrom) {
      // Skip anonymous IDs — these are the normal alias case (anon→identified)
      // where no subscription can be held on the anon side.
      if (fromUserId.startsWith('$')) continue;

      const fromAccount = await findAccountByClerkId(db, fromUserId);
      if (!fromAccount) continue;

      const fromSub = await getSubscriptionByAccountId(db, fromAccount.id);
      if (!fromSub) continue;

      // [BUG-783] Capture the PRE-DOWNGRADE entitlement snapshot. The BUG-833
      // downgrade below force-resets the from-side to free/expired, so the
      // alias-merge worker can no longer re-read the original tier/credits —
      // it must reconcile the survivor from this snapshot.
      const fromTopUpRemaining = await getTopUpCreditsRemaining(db, fromSub.id);
      const fromSnapshot = {
        tier: fromSub.tier,
        status: fromSub.status,
        currentPeriodEnd: fromSub.currentPeriodEnd,
        trialEndsAt: fromSub.trialEndsAt,
        topUpRemaining: fromTopUpRemaining,
      };

      // [BUG-833] Strict downgrade of the transferred_from subscription.
      // Without this, after RC merges two subscriber records, the
      // transferred_from account still has status='active' + a paid tier
      // locally. If the original user signs back into the old Clerk identity
      // (recovery, household transfer, account re-link), they continue to
      // receive paid entitlement for free. Force the from-side row to
      // status='expired' / tier='free' / currentPeriodEnd=now and refresh its
      // KV cache. The transferred_to side keeps its existing entitlement —
      // this is a one-sided revocation, not a merge.
      const nowIso = new Date().toISOString();
      const freeConfig = getTierConfig('free');
      const downgraded = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
        db,
        fromAccount.id,
        {
          eventId: event.id,
          eventTimestampMs: event.event_timestamp_ms,
          status: 'expired',
          tier: 'free',
          cancelledAt: nowIso,
          currentPeriodEnd: nowIso,
        },
        {
          monthlyQuota: freeConfig.monthlyQuota,
          dailyLimit: freeConfig.dailyLimit,
        },
      );

      if (shouldRefreshRevenuecatKv(downgraded, event.id)) {
        await safeRefreshKvCache(
          kv,
          db,
          downgraded.accountId,
          'revenuecat.webhook.handleSubscriberAlias.fromDowngrade',
          {
            eventId: event.id,
            fromAppUserId: fromUserId,
          },
        );
      }

      // [BUG-783] A subscription existed on the transferred_from identity —
      // the revenue-loss scenario. This is now HANDLED: we dispatch
      // app/billing.alias_received (below) and the billing-alias-merge worker
      // (services/billing/alias-merge.ts) reconciles the survivor atomically
      // and idempotently. Emit a queryable breadcrumb (no longer the
      // high-severity "merge not implemented" alert) so ops can still audit
      // alias merges; the worker's own Sentry escalations cover the
      // unrecoverable branches (no surviving subscription, both-active-paid).
      captureMessage(
        '[revenuecat] SUBSCRIBER_ALIAS: transferred_from had an active subscription — dispatching alias merge',
        {
          level: 'info',
          extra: {
            tag: 'revenuecat.alias.merge_dispatched',
            eventId: event.id,
            fromAppUserId: fromUserId,
            toAppUserId: event.app_user_id,
            fromSubscriptionId: fromSub.id,
            fromSubscriptionTier: fromSub.tier,
            fromSubscriptionStatus: fromSub.status,
          },
        },
      );

      // [BUG-783 / BUG-449] Dispatch alias_received with the PRE-DOWNGRADE
      // snapshot. Consumed by the billing-alias-merge Inngest worker, which
      // reconciles the surviving (transferred_to) identity toward "best of
      // both, user-favorable, never refund":
      //   - subscription: keep the more valuable tier (free<plus<family<pro),
      //     tiebreak by latest currentPeriodEnd; never downgrade the survivor.
      //   - top-up credits: survivor ends with MAX(from,to), never the sum.
      //   - never refund/cancel — if BOTH are live paid store subs the worker
      //     escalates to support rather than auto-cancelling a second charge.
      // Non-core dispatch: a swallowed send is captured in Sentry by safeSend
      // and the from-side breadcrumb above keeps the merge auditable.
      await safeSend(
        () =>
          inngest.send({
            name: 'app/billing.alias_received',
            data: {
              eventId: event.id,
              fromAppUserId: fromUserId,
              toAppUserId: event.app_user_id,
              fromAccountId: fromAccount.id,
              fromSubscriptionId: fromSub.id,
              fromSnapshot,
              timestamp: new Date().toISOString(),
            },
          }),
        'revenuecat.alias_received',
        { eventId: event.id, fromAppUserId: fromUserId },
      );
    }
  }
}

export async function handleProductChange(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  // Family-shared purchase: original purchaser already holds entitlement. Skip.
  if (escalateAndSkipFamilyShare(event, accountId)) return;

  const newTier = extractTierFromProductId(event.new_product_id);
  if (!newTier) {
    // [FIX-API-REVENUECAT] Unknown new_product_id — capture to Sentry so product
    // map mismatches surface before they cause silent subscription-change drops.
    captureException(
      new Error('Unknown RevenueCat new_product_id in PRODUCT_CHANGE'),
      {
        extra: { newProductId: event.new_product_id, eventId: event.id },
      },
    );
    return;
  }

  const tierConfig = getTierConfig(newTier);
  const updated = await updateSubscriptionAndQuotaFromRevenuecatWebhook(
    db,
    accountId,
    {
      eventId: event.id,
      eventTimestampMs: event.event_timestamp_ms,
      tier: newTier,
      status: 'active',
    },
    {
      monthlyQuota: tierConfig.monthlyQuota,
      dailyLimit: tierConfig.dailyLimit,
    },
  );

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleProductChange',
      {
        eventId: event.id,
      },
    );
  }
}

export async function handleNonRenewingPurchase(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return null;

  const credits = getTopUpCreditsForProduct(event.product_id);
  if (credits === null) return null;

  // Family-shared consumable: original purchaser already received the credit.
  // Escalate + ack 200 (so RevenueCat stops the ~72h retry storm) without
  // granting. Skip is intentional, not a transient failure.
  if (escalateAndSkipFamilyShare(event, accountId)) {
    return {
      status: 200,
      body: { received: true, skipped: 'family_share' },
    };
  }

  // Resolve the transaction ID for idempotency (prefer store_transaction_id)
  const transactionId =
    event.store_transaction_id ?? event.transaction_id ?? null;

  // [BUG-451] Malformed payload (no transaction ID) → 200 so RevenueCat does
  // NOT retry. Returning 400 guarantees ~3 days of retry spam because RC
  // treats any non-2xx as transient. The payload is permanently malformed
  // (both fields absent simultaneously is a provider-side bug, not a
  // transient outage), so we ack, skip, and capture to Sentry for ops review.
  if (!transactionId) {
    logger.error('[revenuecat] NON_RENEWING_PURCHASE missing transaction ID', {
      eventId: event.id,
      productId: event.product_id,
    });
    captureException(
      new Error('RevenueCat NON_RENEWING_PURCHASE missing transaction ID'),
      {
        extra: {
          eventId: event.id,
          productId: event.product_id,
          category: 'revenuecat.malformed_payload',
        },
      },
    );
    return {
      status: 200,
      body: { received: true, skipped: 'missing_transaction_id' },
    };
  }

  // Look up the account's subscription to verify tier eligibility
  const sub = await getSubscriptionByAccountId(db, accountId);
  if (!sub || sub.tier === 'free') {
    // [BUG-793] A consumable top-up for an account with no paid local
    // subscription is a PERMANENT business-state rejection, not a transient
    // failure. Returning 403 (non-2xx) makes RevenueCat retry the same event
    // for ~72h while the store may have already charged the user and credits
    // are never granted — and ops received no structured signal to action a
    // refund / manual review (the "silent recovery without escalation" rule).
    // Ack with 200 so RC stops retrying, do NOT grant credits, and emit a
    // queryable Sentry message (no-ops without a DSN, so silent in dev/test)
    // carrying every field ops needs to reconcile the charge. Mirrors the
    // BUG-451 missing-transaction-id branch above.
    captureMessage(
      '[revenuecat] NON_RENEWING_PURCHASE rejected — top-up on account without a paid local subscription',
      {
        level: 'warning',
        extra: {
          eventId: event.id,
          transactionId,
          accountId,
          productId: event.product_id,
          localTier: sub?.tier ?? null,
          category: 'revenuecat.topup_rejected_free_tier',
        },
        tags: { surface: 'billing.revenuecat.topup' },
      },
    );
    return {
      status: 200,
      body: {
        received: true,
        skipped: 'topup_requires_paid_subscription',
      },
    };
  }

  // BS-02: Atomic idempotent credit grant — purchaseTopUpCredits uses
  // INSERT ... ON CONFLICT DO NOTHING on the unique revenuecatTransactionId
  // index. Returns null when credit was already granted (duplicate txn).
  const granted = await purchaseTopUpCredits(
    db,
    sub.id,
    credits,
    new Date(),
    transactionId,
  );

  if (!granted) {
    // [A-22] Distinguish intentional idempotency skip from silent failure.
    // Log with eventId + transactionId so ops can query how often this fires.
    logger.info(
      '[revenuecat] NON_RENEWING_PURCHASE duplicate skipped — credits already granted',
      { eventId: event.id, transactionId, accountId },
    );
    return null;
  }

  await safeRefreshKvCache(
    kv,
    db,
    accountId,
    'revenuecat.webhook.handleNonRenewingPurchase',
    {
      eventId: event.id,
      transactionId,
    },
  );

  return null;
}

export async function handleUncancellation(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'active',
    cancelledAt: null,
  });

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleUncancellation',
      {
        eventId: event.id,
      },
    );
  }
}
