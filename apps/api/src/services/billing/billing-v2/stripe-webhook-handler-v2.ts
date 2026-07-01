// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — Stripe webhook handler twin (v2)
//
// v2 twin of stripe-webhook-handler.ts. Same orchestration and same escalation
// discipline (out-of-order escalation, tier-price verification, atomic
// subscription+quota writes, KV refresh); the ONLY difference is the four
// store-specific operations are re-pointed at the v2 store:
//   updateSubscriptionFromWebhook   → updateSubscriptionFromWebhookV2
//   activateSubscriptionFromCheckout → activateSubscriptionFromCheckoutV2
//   updateQuotaPoolLimit            → updateQuotaPoolLimitV2 (satellite — same rows)
//   safeRefreshKvCache              → safeRefreshKvCacheV2
//
// The pure, store-agnostic helpers (mapStripeStatus, extractPaidTier,
// extractPeriodStart/End, extractSubscriptionIdFromInvoice, shouldRefreshStripeKv,
// verifySubscriptionTier) are imported from the legacy module / billing-pricing
// so there is exactly one copy of that logic. `escalateSubscriptionNotFound` is
// re-implemented locally (module-private in the legacy file).
//
// `accountId` everywhere here is the organization id under the flag
// (= accounts.id by the reseed); the field name stays `accountId` on the mapped
// SubscriptionRow so the orchestration reads identically.
//
// [WI-868] Dispatched unconditionally by routes/stripe-webhook.ts via
// billing-v2/dispatch.ts — the identity-v2 flag is gone and this handler is
// the only one that runs in production. Legacy stripe-webhook-handler.ts is
// retained only for routes/stripe-webhook.test.ts's mock seam.
// ---------------------------------------------------------------------------

import {
  type Database,
  findSubscriptionByStripeIdV2__unscoped,
  lockSubscriptionByOrganizationId__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import type Stripe from 'stripe';
import type {
  AppliedSubscriptionRow,
  WebhookSubscriptionUpdate,
} from '../types';
import { getTierConfig } from '../../subscription';
import {
  verifySubscriptionTier,
  type StripePriceEnv,
} from '../../billing-pricing';
import {
  extractPeriodStart,
  extractPeriodEnd,
  extractSubscriptionIdFromInvoice,
  shouldRefreshStripeKv,
  extractPaidTier,
  mapStripeStatus,
} from '../stripe-webhook-handler';
import { inngest } from '../../../inngest/client';
import { captureException } from '../../sentry';
import { createLogger } from '../../logger';
import {
  updateSubscriptionFromWebhookV2,
  activateSubscriptionFromCheckoutV2,
  updateQuotaPoolLimitV2,
  getSubscriptionByStripeCustomerIdV2,
} from './subscription-core-v2';
import { safeRefreshKvCacheV2 } from './safe-refresh-kv-cache-v2';
import { emitTopUpCreditsReattributedMetric } from '../tier';
import { reattributeTopUpCreditsOnModelChangeV2 } from './tier-v2';

const logger = createLogger();

// ---------------------------------------------------------------------------
// [#828] Out-of-order event escalation (v2 — local copy of the module-private
// legacy helper; same structured escalation).
// ---------------------------------------------------------------------------
function escalateSubscriptionNotFound(
  handlerContext: string,
  stripeSubscriptionId: string,
  stripeEventId: string,
  eventTimestamp: string,
  extra: Record<string, unknown> = {},
): void {
  logger.warn(
    `[stripe-webhook] ${handlerContext}: local subscription row not found for stripeSubscriptionId — event dropped (possible out-of-order delivery before checkout.session.completed)`,
    {
      stripeSubscriptionId,
      stripeEventId,
      eventTimestamp,
      ...extra,
    },
  );
  captureException(
    new Error(
      `Stripe webhook event references unknown subscription (handler=${handlerContext}, stripeSubscriptionId=${stripeSubscriptionId})`,
    ),
    {
      extra: {
        context: `stripe.webhook.${handlerContext}.subscription_not_found`,
        stripeSubscriptionId,
        stripeEventId,
        eventTimestamp,
        ...extra,
      },
    },
  );
}

/**
 * Lock-and-read the previous tier of a v2 subscription keyed by Stripe ID,
 * inside an open transaction. The lock is on the new organization-keyed
 * subscription row, so tier-change detection and top-up re-attribution serialize
 * against concurrent webhooks for the same subscription.
 */
async function lockPreviousTierByStripeIdV2(
  txDb: Database,
  stripeSubscriptionId: string,
): Promise<SubscriptionTier | undefined> {
  // safe-caller: Stripe webhook — keyed by external Stripe ID, authenticated by event signature.
  const existing = await findSubscriptionByStripeIdV2__unscoped(
    txDb,
    stripeSubscriptionId,
  );
  if (!existing) return undefined;

  // safe-caller: org id resolved from the verified Stripe subscription row above.
  const locked = await lockSubscriptionByOrganizationId__unscoped(
    txDb,
    existing.organizationId,
  );
  return (locked?.planTier ?? existing.planTier) as SubscriptionTier;
}

async function reattributeStripeTierChangeV2(
  txDb: Database,
  result: AppliedSubscriptionRow,
  previousTier: SubscriptionTier | undefined,
  newTier: SubscriptionTier,
): Promise<number> {
  if (!previousTier || previousTier === newTier) return 0;
  return reattributeTopUpCreditsOnModelChangeV2(
    txDb,
    result.id,
    result.accountId,
    previousTier,
    newTier,
  );
}

// ---------------------------------------------------------------------------
// Webhook event handlers (v2)
// ---------------------------------------------------------------------------

export async function handleSubscriptionEventV2(
  db: Database,
  kv: KVNamespace | undefined,
  stripeSubscription: Stripe.Subscription,
  eventTimestamp: string,
  stripeEventId: string,
  env: StripePriceEnv,
): Promise<void> {
  const status = mapStripeStatus(stripeSubscription.status);
  if (!status) {
    // [#441] Unmapped Stripe status — silent early-return is banned in billing.
    logger.warn(
      '[stripe-webhook] handleSubscriptionEvent: unmapped Stripe status — event dropped',
      {
        unmappedStatus: stripeSubscription.status,
        stripeSubscriptionId: stripeSubscription.id,
      },
    );
    captureException(
      new Error(
        `Stripe subscription status not mapped: '${stripeSubscription.status}'`,
      ),
      {
        extra: {
          context: 'stripe.webhook.handleSubscriptionEvent.unmapped_status',
          unmappedStatus: stripeSubscription.status,
          stripeSubscriptionId: stripeSubscription.id,
        },
      },
    );
    return;
  }
  const isExpired = status === 'expired';

  const updates: WebhookSubscriptionUpdate = {
    status,
    lastStripeEventTimestamp: eventTimestamp,
    stripeEventId,
  };

  // [WI-85 / WI-175] Price-authoritative tier verification (store-agnostic).
  const itemPriceIds = (stripeSubscription.items?.data ?? [])
    .map((item) => item.price?.id)
    .filter((id): id is string => !!id);
  const verifiedTier = verifySubscriptionTier(
    env,
    extractPaidTier(
      stripeSubscription.metadata as Record<string, string> | undefined,
    ),
    itemPriceIds,
  );
  const effectiveTier = verifiedTier.effectiveTier;

  if (verifiedTier.status === 'mismatch') {
    captureException(
      new Error(
        `Stripe subscription tier mismatch: metadata='${verifiedTier.metadataTier}' but purchased price maps to '${verifiedTier.priceTier}'`,
      ),
      {
        extra: {
          context: 'stripe.webhook.tier_mismatch',
          stripeSubscriptionId: stripeSubscription.id,
          metadataTier: verifiedTier.metadataTier,
          priceTier: verifiedTier.priceTier,
          priceId: verifiedTier.priceId,
        },
      },
    );
  } else if (verifiedTier.status === 'unverifiable') {
    captureException(
      new Error(
        `Stripe subscription tier could not be verified against a configured price (metadata='${verifiedTier.metadataTier}', priceId='${verifiedTier.priceId ?? 'none'}')`,
      ),
      {
        extra: {
          context: 'stripe.webhook.tier_unverifiable',
          stripeSubscriptionId: stripeSubscription.id,
          metadataTier: verifiedTier.metadataTier,
          priceId: verifiedTier.priceId,
        },
      },
    );
  } else if (verifiedTier.status === 'unconfigured') {
    logger.warn(
      '[stripe-webhook] tier not verified against price — Stripe pricing not configured in this environment',
      {
        stripeSubscriptionId: stripeSubscription.id,
        metadataTier: verifiedTier.metadataTier,
      },
    );
  }

  if (isExpired) {
    updates.tier = 'free';
  } else if (effectiveTier) {
    updates.tier = effectiveTier;
  }

  const periodStart = extractPeriodStart(stripeSubscription);
  if (periodStart) {
    updates.currentPeriodStart = new Date(periodStart * 1000).toISOString();
  }
  const periodEnd = extractPeriodEnd(stripeSubscription);
  if (periodEnd) {
    updates.currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
  }
  // [CR-052] Only set cancelledAt when Stripe signals a cancellation timestamp.
  if (stripeSubscription.canceled_at) {
    updates.cancelledAt = new Date(
      stripeSubscription.canceled_at * 1000,
    ).toISOString();
  }

  // [CR-2026-05-19-M3] Outer transaction: subscription update + quota pool limit
  // commit atomically. The v2 core's M11 fence transaction nests as a savepoint.
  let reattributedCount = 0;
  let previousTier: SubscriptionTier | undefined;
  let appliedNewTier: SubscriptionTier | undefined;
  const reattributionNow = new Date();

  const updated = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    previousTier = await lockPreviousTierByStripeIdV2(
      txDb,
      stripeSubscription.id,
    );

    const result = await updateSubscriptionFromWebhookV2(
      txDb,
      stripeSubscription.id,
      updates,
    );

    if (result && result.webhookApplied !== false) {
      if (isExpired) {
        const freeTier = getTierConfig('free');
        await updateQuotaPoolLimitV2(
          txDb,
          result.id,
          freeTier.monthlyQuota,
          freeTier.dailyLimit,
        );
        appliedNewTier = 'free';
        reattributedCount = await reattributeStripeTierChangeV2(
          txDb,
          result,
          previousTier,
          'free',
        );
      } else if (effectiveTier) {
        const tierConfig = getTierConfig(effectiveTier);
        await updateQuotaPoolLimitV2(
          txDb,
          result.id,
          tierConfig.monthlyQuota,
          tierConfig.dailyLimit,
        );
        appliedNewTier = effectiveTier;
        reattributedCount = await reattributeStripeTierChangeV2(
          txDb,
          result,
          previousTier,
          effectiveTier,
        );
      }
    }

    return result;
  });

  if (reattributedCount > 0 && updated && previousTier && appliedNewTier) {
    await emitTopUpCreditsReattributedMetric({
      subscriptionId: updated.id,
      accountId: updated.accountId,
      previousTier,
      newTier: appliedNewTier,
      reattributedCount,
      occurredAt: reattributionNow,
    });
  }

  if (shouldRefreshStripeKv(updated, stripeEventId)) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handleSubscriptionEvent',
      { stripeSubscriptionId: stripeSubscription.id },
    );
  } else if (updated === null) {
    escalateSubscriptionNotFound(
      'handleSubscriptionEvent',
      stripeSubscription.id,
      stripeEventId,
      eventTimestamp,
      { stripeStatus: stripeSubscription.status, mappedStatus: status },
    );
  }
}

export async function handleSubscriptionDeletedV2(
  db: Database,
  kv: KVNamespace | undefined,
  stripeSubscription: Stripe.Subscription,
  eventTimestamp: string,
  stripeEventId: string,
): Promise<void> {
  const updates: WebhookSubscriptionUpdate = {
    status: 'expired',
    tier: 'free',
    cancelledAt: new Date().toISOString(),
    lastStripeEventTimestamp: eventTimestamp,
    stripeEventId,
  };

  let reattributedCount = 0;
  let previousTier: SubscriptionTier | undefined;
  const reattributionNow = new Date();

  const updated = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    previousTier = await lockPreviousTierByStripeIdV2(
      txDb,
      stripeSubscription.id,
    );

    const result = await updateSubscriptionFromWebhookV2(
      txDb,
      stripeSubscription.id,
      updates,
    );

    if (result && result.webhookApplied !== false) {
      const freeTier = getTierConfig('free');
      await updateQuotaPoolLimitV2(
        txDb,
        result.id,
        freeTier.monthlyQuota,
        freeTier.dailyLimit,
      );
      reattributedCount = await reattributeStripeTierChangeV2(
        txDb,
        result,
        previousTier,
        'free',
      );
    }

    return result;
  });

  if (reattributedCount > 0 && updated && previousTier) {
    await emitTopUpCreditsReattributedMetric({
      subscriptionId: updated.id,
      accountId: updated.accountId,
      previousTier,
      newTier: 'free',
      reattributedCount,
      occurredAt: reattributionNow,
    });
  }

  if (shouldRefreshStripeKv(updated, stripeEventId)) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handleSubscriptionDeleted',
      { stripeSubscriptionId: stripeSubscription.id },
    );
  } else if (updated === null) {
    escalateSubscriptionNotFound(
      'handleSubscriptionDeleted',
      stripeSubscription.id,
      stripeEventId,
      eventTimestamp,
    );
  }
}

export async function handleCheckoutCompletedV2(
  db: Database,
  kv: KVNamespace | undefined,
  session: Stripe.Checkout.Session,
  eventTimestamp: string,
): Promise<void> {
  // [WI-85 / WI-175] checkout trusts metadata.tier by design (price + metadata
  // both derive from the same authenticated tier at session creation).
  const metadata = session.metadata as Record<string, string> | undefined;
  const accountId = metadata?.accountId;
  const tier = extractPaidTier(metadata);
  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (!accountId || !tier || !stripeSubscriptionId) {
    logger.warn(
      `[stripe-webhook] checkout.completed dropped — missing metadata (accountId=${!!accountId}, tier=${!!tier}, subscriptionId=${!!stripeSubscriptionId}, sessionId=${session.id})`,
    );
    captureException(
      new Error('Stripe checkout.session.completed missing required metadata'),
      {
        extra: {
          context: 'stripe.webhook.checkout.completed.missing_metadata',
          stripeSessionId: session.id,
          hasAccountId: !!accountId,
          hasTier: !!tier,
          hasSubscriptionId: !!stripeSubscriptionId,
          customerId:
            typeof session.customer === 'string'
              ? session.customer
              : session.customer?.id,
        },
      },
    );
    return;
  }

  // [#829] Defer activation on non-terminal payment_status.
  const paymentStatus = session.payment_status;
  if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
    logger.warn(
      `[stripe-webhook] checkout.completed deferred — payment_status='${paymentStatus}', awaiting async_payment_succeeded (sessionId=${session.id})`,
    );
    captureException(
      new Error(
        `Stripe checkout.session.completed with non-terminal payment_status='${paymentStatus}' — activation deferred`,
      ),
      {
        extra: {
          context: 'stripe.webhook.checkout.completed.payment_pending',
          stripeSessionId: session.id,
          stripeSubscriptionId,
          accountId,
          tier,
          paymentStatus,
          paymentMethodTypes: session.payment_method_types,
        },
      },
    );
    return;
  }

  // [SEC] customer↔account binding check (v2 twin of the legacy guard added in
  // #1318). `metadata.accountId` is set at checkout-session creation but is
  // operator/dashboard-mutable: a Stripe Dashboard user (or a compromised
  // dashboard token / future checkout-wiring bug) can stamp ANOTHER account's
  // id and grant the paid tier on the wrong account. The Stripe customer
  // (`session.customer`) is NOT operator-editable in the same way, so it is
  // the trustworthy anchor. If this customer is already bound to a DIFFERENT
  // account in the v2 store, refuse to activate and escalate.
  //
  // First-purchase is legitimate: a brand-new customer has no prior binding
  // (getSubscriptionByStripeCustomerIdV2 returns null), so the check must only
  // fire when a binding EXISTS and its accountId conflicts — never block a
  // first-time checkout. A missing session.customer (unexpected for a paid
  // subscription checkout) leaves the existing accountId-keyed path unchanged.
  const stripeCustomerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;

  if (stripeCustomerId) {
    const boundSubscription = await getSubscriptionByStripeCustomerIdV2(
      db,
      stripeCustomerId,
    );
    if (boundSubscription && boundSubscription.accountId !== accountId) {
      logger.warn(
        `[stripe-webhook-v2] checkout.completed REFUSED — customer↔account binding mismatch (customer=${stripeCustomerId} bound to account=${boundSubscription.accountId}, metadata stamped account=${accountId}, sessionId=${session.id})`,
      );
      captureException(
        new Error(
          `Stripe checkout.session.completed customer↔account binding mismatch — metadata.accountId='${accountId}' but customer '${stripeCustomerId}' is bound to account '${boundSubscription.accountId}'; activation refused`,
        ),
        {
          extra: {
            context:
              'stripe.webhook.v2.checkout.completed.account_binding_mismatch',
            stripeSessionId: session.id,
            stripeSubscriptionId,
            stripeCustomerId,
            metadataAccountId: accountId,
            boundAccountId: boundSubscription.accountId,
            tier,
          },
        },
      );
      return;
    }
  }

  const activated = await activateSubscriptionFromCheckoutV2(
    db,
    accountId,
    stripeSubscriptionId,
    tier,
    eventTimestamp,
  );

  if (activated) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      activated.accountId,
      'stripe.webhook.handleCheckoutCompleted',
      { stripeSessionId: session.id, stripeSubscriptionId },
    );
  }
}

export async function handlePaymentFailedV2(
  db: Database,
  kv: KVNamespace | undefined,
  invoice: Stripe.Invoice,
  eventTimestamp: string,
  stripeEventId: string,
): Promise<void> {
  const stripeSubscriptionId = extractSubscriptionIdFromInvoice(invoice);

  if (!stripeSubscriptionId) {
    logger.warn(
      `[stripe-webhook] invoice.payment_failed dropped — could not extract subscription id (invoiceId=${invoice.id})`,
    );
    captureException(
      new Error(
        'Stripe invoice.payment_failed missing subscription id (possible Stripe schema change)',
      ),
      {
        extra: {
          context: 'stripe.webhook.payment_failed.missing_subscription_id',
          invoiceId: invoice.id,
          customerId:
            typeof invoice.customer === 'string'
              ? invoice.customer
              : invoice.customer?.id,
          billingReason: invoice.billing_reason,
        },
      },
    );
    return;
  }

  const updated = await updateSubscriptionFromWebhookV2(
    db,
    stripeSubscriptionId,
    {
      status: 'past_due',
      lastStripeEventTimestamp: eventTimestamp,
      stripeEventId,
    },
  );

  const shouldDispatchPaymentFailed =
    updated !== null &&
    (updated.webhookApplied !== false ||
      updated.lastStripeEventId === stripeEventId);

  if (shouldRefreshStripeKv(updated, stripeEventId)) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handlePaymentFailed',
      { stripeSubscriptionId, invoiceId: invoice.id },
    );
  } else if (updated === null) {
    escalateSubscriptionNotFound(
      'handlePaymentFailed',
      stripeSubscriptionId,
      stripeEventId,
      eventTimestamp,
      { invoiceId: invoice.id, attempt: invoice.attempt_count ?? 1 },
    );
  }

  if (!updated) return;

  if (shouldDispatchPaymentFailed) {
    // core-send: payment-failed alert — observed by payment-failed-observe.ts.
    // Direct send so a dispatch failure throws → Stripe retries; a swallowed
    // dispatch would lose the payment-failure signal entirely.
    await inngest.send({
      id: `stripe-payment-failed:${stripeEventId}`,
      name: 'app/payment.failed',
      data: {
        subscriptionId: updated.id,
        stripeSubscriptionId,
        accountId: updated.accountId,
        attempt: invoice.attempt_count ?? 1,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

export async function handlePaymentSucceededV2(
  db: Database,
  kv: KVNamespace | undefined,
  invoice: Stripe.Invoice,
  eventTimestamp: string,
  stripeEventId: string,
): Promise<void> {
  const stripeSubscriptionId = extractSubscriptionIdFromInvoice(invoice);

  if (!stripeSubscriptionId) {
    logger.warn(
      `[stripe-webhook] invoice.payment_succeeded dropped — could not extract subscription id (invoiceId=${invoice.id})`,
    );
    captureException(
      new Error(
        'Stripe invoice.payment_succeeded missing subscription id (possible Stripe schema change)',
      ),
      {
        extra: {
          context: 'stripe.webhook.payment_succeeded.missing_subscription_id',
          invoiceId: invoice.id,
          customerId:
            typeof invoice.customer === 'string'
              ? invoice.customer
              : invoice.customer?.id,
          billingReason: invoice.billing_reason,
        },
      },
    );
    return;
  }

  const updated = await updateSubscriptionFromWebhookV2(
    db,
    stripeSubscriptionId,
    {
      status: 'active',
      // [CR-052] Clear cancelledAt on payment success.
      cancelledAt: null,
      lastStripeEventTimestamp: eventTimestamp,
      stripeEventId,
    },
  );

  if (shouldRefreshStripeKv(updated, stripeEventId)) {
    await safeRefreshKvCacheV2(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handlePaymentSucceeded',
      { stripeSubscriptionId, invoiceId: invoice.id },
    );
  } else if (updated === null) {
    escalateSubscriptionNotFound(
      'handlePaymentSucceeded',
      stripeSubscriptionId,
      stripeEventId,
      eventTimestamp,
      { invoiceId: invoice.id },
    );
  }
}
