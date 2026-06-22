// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — RevenueCat webhook handler twin (v2)
//
// v2 twin of revenuecat-webhook-handler.ts. The genuine store difference is the
// ACCOUNT-RESOLUTION SEAM: legacy resolves app_user_id → accounts via
// findAccountByClerkId; v2 resolves app_user_id → login.clerk_user_id →
// membership → organization (resolveAccountIdV2), returning organization.id
// (= accounts.id by the reseed). Every event handler then operates against the
// v2 store via the v2 core / v2 KV refresh / v2 trial transition. All escalation
// discipline (Sentry, structured signals, ack-200 on unresolvable) is preserved.
//
// The pure helpers (extractTierFromProductId, getTopUpCreditsForProduct,
// PRODUCT_TIER_MAP, RevenueCatEvent type) are imported from the legacy module —
// one copy. `shouldRefreshRevenuecatKv` is module-private in the legacy file and
// re-implemented locally.
//
// `accountId` here is the organization id (field name kept on the mapped row).
//
// Flag-gated: dispatched by routes/revenuecat-webhook.ts only when
// IDENTITY_V2_ENABLED='true'. Legacy revenuecat-webhook-handler.ts stays
// byte-identical.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type { SubscriptionStatus } from '@eduagent/schemas';
import {
  getTopUpCreditsForProduct,
  extractTierFromProductId,
  type RevenueCatEvent,
} from '../revenuecat-webhook-handler';
import { purchaseTopUpCreditsV2 } from './top-up-v2';
import { getTierConfig } from '../../subscription';
import { captureException, captureMessage } from '../../sentry';
import { createLogger } from '../../logger';
import { safeSend } from '../../safe-non-core';
import { EXTENDED_TRIAL_MONTHLY_EQUIVALENT } from '../../trial';
import { inngest } from '../../../inngest/client';
import { resolveIdentityV2 } from '../../identity-v2/identity-resolve';
import type { AppliedSubscriptionRow } from '../types';
import {
  getSubscriptionByAccountIdV2,
  ensureFreeSubscriptionV2,
} from './subscription-core-v2';
import {
  isRevenuecatEventProcessedV2,
  updateSubscriptionFromRevenuecatWebhookV2,
  updateSubscriptionAndQuotaFromRevenuecatWebhookV2,
  activateSubscriptionFromRevenuecatV2,
} from './revenuecat-v2';
import { transitionToExtendedTrialFromRevenuecatEventV2 } from './trial-v2';
import { safeRefreshKvCacheV2 } from './safe-refresh-kv-cache-v2';

const logger = createLogger();

// ---------------------------------------------------------------------------
// shouldRefreshRevenuecatKv (v2 — local copy of the module-private legacy helper)
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

// ---------------------------------------------------------------------------
// isFamilyShareBlocked (v2 — local copy of the module-private legacy helper)
// ---------------------------------------------------------------------------

/**
 * [Issue 836] Apple Family Sharing / Google Play family-library entitlement
 * block. See the legacy handler's escalateAndSkipFamilyShare for the full
 * product rationale: a single paid purchase propagates to every family member,
 * firing a purchase event (INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE,
 * NON_RENEWING_PURCHASE) under the family member's identity with
 * `is_family_share: true`. The original purchaser already holds the
 * entitlement — granting again N-tuples one paid seat into N.
 *
 * v2 re-implements the guard locally (the legacy copy is module-private) so the
 * behavior is identical across both handler files. We never auto-grant off a
 * family-shared event; we escalate via the established Sentry boundary
 * (matching the refund-revocation / topup-rejection conventions in this file —
 * `console.warn` alone is banned in billing code) and skip activation. The
 * caller returns afterward so the route still 200-acks (no RevenueCat retry
 * storm). is_family_share is UNRELATED to the com.eduagent.family.* product
 * IDs — only the shared-copy flag is blocked.
 */
function isFamilyShareBlocked(event: RevenueCatEvent): boolean {
  if (event.is_family_share !== true) return false;

  captureMessage(
    '[revenuecat] entitlement skipped — is_family_share shared copy (steer to Family plan)',
    {
      level: 'warning',
      extra: {
        eventId: event.id,
        eventType: event.type,
        appUserId: event.app_user_id,
        productId: event.product_id ?? event.new_product_id ?? null,
        category: 'revenuecat.family_share_blocked',
      },
      tags: { surface: 'billing.revenuecat.family_share' },
    },
  );
  return true;
}

// ---------------------------------------------------------------------------
// resolveAccountId (v2 seam): app_user_id → login → membership → organization.
// Returns organization.id (= accounts.id by the reseed) or null.
// ---------------------------------------------------------------------------

export async function resolveAccountIdV2(
  db: Database,
  appUserId: string,
): Promise<string | null> {
  // RevenueCat anonymous IDs start with $ — skip them (same as legacy).
  if (appUserId.startsWith('$')) return null;

  const resolved = await resolveIdentityV2(db, appUserId);
  return resolved?.organizationId ?? null;
}

// ---------------------------------------------------------------------------
// REFUND_CANCEL_REASONS (re-declared — module-private in the legacy file)
// ---------------------------------------------------------------------------

const REFUND_CANCEL_REASONS: ReadonlySet<string> = new Set([
  'CUSTOMER_SUPPORT',
  'BILLING_ERROR',
]);

// ---------------------------------------------------------------------------
// Event handlers (v2)
// ---------------------------------------------------------------------------

export async function handleInitialPurchaseV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  // [Issue 836] Block entitlement on Apple/Google family-shared copies.
  if (isFamilyShareBlocked(event)) return;

  const accountId = await resolveAccountIdV2(db, event.app_user_id);
  if (!accountId) return;

  const tier = extractTierFromProductId(event.product_id);
  if (!tier) {
    captureException(
      new Error('Unknown RevenueCat product_id in INITIAL_PURCHASE'),
      { extra: { productId: event.product_id, eventId: event.id } },
    );
    return;
  }

  const isTrial = event.period_type === 'TRIAL';

  const sub = await activateSubscriptionFromRevenuecatV2(
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

  await safeRefreshKvCacheV2(
    kv,
    db,
    sub.accountId,
    'revenuecat.webhook.handleInitialPurchase',
    { eventId: event.id },
  );
}

export async function handleRenewalV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  // [Issue 836] Block entitlement on Apple/Google family-shared copies.
  if (isFamilyShareBlocked(event)) return;

  const accountId = await resolveAccountIdV2(db, event.app_user_id);
  if (!accountId) return;

  const eventTier = extractTierFromProductId(event.product_id);

  const existingSub = await getSubscriptionByAccountIdV2(db, accountId);
  const tierChanged = eventTier !== null && existingSub?.tier !== eventTier;

  const isTrial = event.period_type === 'TRIAL';

  const renewalUpdates = {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'active' as const,
    ...(tierChanged && eventTier ? { tier: eventTier } : {}),
    currentPeriodStart: event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : undefined,
    currentPeriodEnd: event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : undefined,
    cancelledAt: null,
    ...(isTrial ? {} : { trialEndsAt: null }),
  };

  const updated =
    tierChanged && eventTier
      ? await updateSubscriptionAndQuotaFromRevenuecatWebhookV2(
          db,
          accountId,
          renewalUpdates,
          {
            monthlyQuota: getTierConfig(eventTier).monthlyQuota,
            dailyLimit: getTierConfig(eventTier).dailyLimit,
          },
        )
      : await updateSubscriptionFromRevenuecatWebhookV2(
          db,
          accountId,
          renewalUpdates,
        );

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleRenewal',
      { eventId: event.id },
    );
  }
}

export async function handleCancellationV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountIdV2(db, event.app_user_id);
  if (!accountId) return;

  if (event.cancel_reason && REFUND_CANCEL_REASONS.has(event.cancel_reason)) {
    logger.warn(
      '[revenuecat] CANCELLATION with refund-class cancel_reason — revoking entitlement immediately',
      { eventId: event.id, accountId, cancelReason: event.cancel_reason },
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
    const updatedRefund =
      await updateSubscriptionAndQuotaFromRevenuecatWebhookV2(
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
      await safeRefreshKvCacheV2(
        kv,
        db,
        updatedRefund.accountId,
        'revenuecat.webhook.handleCancellation.refund',
        { eventId: event.id, cancelReason: event.cancel_reason },
      );
    }
    return;
  }

  // [BUG-445] Do not flip past_due back to active on cancellation.
  const existingSub = await getSubscriptionByAccountIdV2(db, accountId);
  const targetStatus: SubscriptionStatus =
    existingSub?.status === 'past_due' ? 'past_due' : 'active';

  const updated = await updateSubscriptionFromRevenuecatWebhookV2(
    db,
    accountId,
    {
      eventId: event.id,
      eventTimestampMs: event.event_timestamp_ms,
      status: targetStatus,
      cancelledAt: new Date().toISOString(),
    },
  );

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleCancellation',
      { eventId: event.id },
    );
  }
}

export async function handleExpirationV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountIdV2(db, event.app_user_id);
  if (!accountId) return;

  const existingSub = await getSubscriptionByAccountIdV2(db, accountId);
  const isTrialExpiration =
    event.period_type === 'TRIAL' ||
    (event.period_type == null && existingSub?.status === 'trial');

  if (isTrialExpiration && existingSub) {
    const updated = await transitionToExtendedTrialFromRevenuecatEventV2(
      db,
      existingSub.id,
      EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
      event.id,
      event.event_timestamp_ms,
    );

    if (shouldRefreshRevenuecatKv(updated, event.id)) {
      await safeRefreshKvCacheV2(
        kv,
        db,
        accountId,
        'revenuecat.webhook.handleExpiration.trial',
        { eventId: event.id },
      );
    }
    return;
  }

  const freeConfig = getTierConfig('free');
  const updated = await updateSubscriptionAndQuotaFromRevenuecatWebhookV2(
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
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleExpiration',
      { eventId: event.id },
    );
  }
}

export async function handleBillingIssueV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountIdV2(db, event.app_user_id);
  if (!accountId) return;

  // [BUG-792] Honor an app-store-managed billing grace period.
  const graceExpiryMs = event.grace_period_expiration_at_ms;
  const hasFutureGrace = graceExpiryMs != null && graceExpiryMs > Date.now();

  const updated = await updateSubscriptionFromRevenuecatWebhookV2(
    db,
    accountId,
    {
      eventId: event.id,
      eventTimestampMs: event.event_timestamp_ms,
      status: 'past_due',
      currentPeriodEnd:
        hasFutureGrace && graceExpiryMs != null
          ? new Date(graceExpiryMs).toISOString()
          : null,
    },
  );

  const shouldDispatchBillingIssue =
    updated !== null &&
    (updated.webhookApplied !== false ||
      updated.lastRevenuecatEventId === event.id);

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleBillingIssue',
      { eventId: event.id },
    );
  }

  if (!updated) return;

  if (shouldDispatchBillingIssue) {
    // core-send: payment-failed alert — billing observability cannot be silent.
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

export async function handleSubscriberAliasV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  // SUBSCRIBER_ALIAS: RevenueCat merged two subscriber records.
  logger.info('[revenuecat] SUBSCRIBER_ALIAS event', {
    appUserId: event.app_user_id,
    transferredFrom: event.transferred_from,
    transferredTo: event.transferred_to,
  });

  // [BUG-449] Full merge deferred — escalation + event dispatch unblock
  // visibility. Manual remediation policy (see legacy handler header).
  const transferredFrom = event.transferred_from ?? [];
  if (transferredFrom.length > 0) {
    for (const fromUserId of transferredFrom) {
      if (fromUserId.startsWith('$')) continue;

      const fromAccountId = await resolveAccountIdV2(db, fromUserId);
      if (!fromAccountId) continue;

      const fromSub = await getSubscriptionByAccountIdV2(db, fromAccountId);
      if (!fromSub) continue;

      // [BUG-783] Pre-downgrade snapshot for the alias-merge worker. NOTE: the
      // worker currently reconciles the LEGACY `subscriptions` table; a v2
      // merge twin (reading the `subscription` table) is owed when identity-v2
      // cuts over — same split pattern as quota-reset's v2 path. This v2 path
      // is inert behind IDENTITY_V2_ENABLED today, so the worker never runs on
      // v2-shaped data in production yet. `topUpRemaining` floors at 0 (no v2
      // remaining-credits reader exists yet) so the merge never grants phantom
      // credits before the twin lands.
      const fromSnapshot = {
        tier: fromSub.tier,
        status: fromSub.status,
        currentPeriodEnd: fromSub.currentPeriodEnd,
        trialEndsAt: fromSub.trialEndsAt,
        topUpRemaining: 0,
      };

      const nowIso = new Date().toISOString();
      const freeConfig = getTierConfig('free');
      const downgraded =
        await updateSubscriptionAndQuotaFromRevenuecatWebhookV2(
          db,
          fromAccountId,
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
        await safeRefreshKvCacheV2(
          kv,
          db,
          downgraded.accountId,
          'revenuecat.webhook.handleSubscriberAlias.fromDowngrade',
          { eventId: event.id, fromAppUserId: fromUserId },
        );
      }

      // [BUG-783] Handled by the billing-alias-merge worker — informational
      // breadcrumb, no longer the high-severity "merge not implemented" alert.
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

      await safeSend(
        () =>
          inngest.send({
            name: 'app/billing.alias_received',
            data: {
              eventId: event.id,
              fromAppUserId: fromUserId,
              toAppUserId: event.app_user_id,
              fromAccountId,
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

export async function handleProductChangeV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  // [Issue 836] Block entitlement on Apple/Google family-shared copies.
  if (isFamilyShareBlocked(event)) return;

  const accountId = await resolveAccountIdV2(db, event.app_user_id);
  if (!accountId) return;

  const newTier = extractTierFromProductId(event.new_product_id);
  if (!newTier) {
    captureException(
      new Error('Unknown RevenueCat new_product_id in PRODUCT_CHANGE'),
      { extra: { newProductId: event.new_product_id, eventId: event.id } },
    );
    return;
  }

  const tierConfig = getTierConfig(newTier);
  const updated = await updateSubscriptionAndQuotaFromRevenuecatWebhookV2(
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
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleProductChange',
      { eventId: event.id },
    );
  }
}

export async function handleNonRenewingPurchaseV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  // [Issue 836] Block top-up credit grant on Apple/Google family-shared copies.
  if (isFamilyShareBlocked(event)) return null;

  const accountId = await resolveAccountIdV2(db, event.app_user_id);
  if (!accountId) return null;

  const credits = getTopUpCreditsForProduct(event.product_id);
  if (credits === null) return null;

  const transactionId =
    event.store_transaction_id ?? event.transaction_id ?? null;

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

  const sub = await getSubscriptionByAccountIdV2(db, accountId);
  if (!sub || sub.tier === 'free') {
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
      body: { received: true, skipped: 'topup_requires_paid_subscription' },
    };
  }

  // BS-02: Atomic idempotent credit grant — top_up_credits is a satellite keyed
  // on subscriptionId + the unique revenuecatTransactionId index (unchanged). The
  // v2 variant reads the subscription/owner from the new store.
  const granted = await purchaseTopUpCreditsV2(
    db,
    sub.id,
    credits,
    new Date(),
    transactionId,
  );

  if (!granted) {
    logger.info(
      '[revenuecat] NON_RENEWING_PURCHASE duplicate skipped — credits already granted',
      { eventId: event.id, transactionId, accountId },
    );
    return null;
  }

  await safeRefreshKvCacheV2(
    kv,
    db,
    accountId,
    'revenuecat.webhook.handleNonRenewingPurchase',
    { eventId: event.id, transactionId },
  );

  return null;
}

export async function handleUncancellationV2(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatEvent,
): Promise<void> {
  const accountId = await resolveAccountIdV2(db, event.app_user_id);
  if (!accountId) return;

  const updated = await updateSubscriptionFromRevenuecatWebhookV2(
    db,
    accountId,
    {
      eventId: event.id,
      eventTimestampMs: event.event_timestamp_ms,
      status: 'active',
      cancelledAt: null,
    },
  );

  if (shouldRefreshRevenuecatKv(updated, event.id)) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleUncancellation',
      { eventId: event.id },
    );
  }
}

// ---------------------------------------------------------------------------
// v2 idempotency + free-provisioning passthroughs the route needs (mirrors the
// barrel functions the legacy route imports directly).
// ---------------------------------------------------------------------------

export { isRevenuecatEventProcessedV2, ensureFreeSubscriptionV2 };
