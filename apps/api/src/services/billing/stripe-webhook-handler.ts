// ---------------------------------------------------------------------------
// Stripe Webhook Handler — service module
// ---------------------------------------------------------------------------
// [FCR-2026-05-23-L5.M3] Extracted from routes/stripe-webhook.ts to enforce
// the route/service boundary (eslint G1/G5, AGENTS.md §"Non-Negotiable
// Engineering Rules"). The route file now owns ONLY signature verification,
// idempotency claim, livemode / stale-event guards, and the event-type switch.
// All subscription-state, quota-pool, KV-cache, and Inngest dispatches live
// here so they can be unit-tested without the HTTP shell and reused by other
// callers (e.g. an Inngest replay tool) without going through the route.
// ---------------------------------------------------------------------------

import {
  type Database,
  findSubscriptionByStripeId__unscoped,
  lockSubscriptionById__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import type Stripe from 'stripe';
// NOTE: Import via the barrel (`../billing`) — NOT via the relative `./index`
// — so existing webhook tests that mock `../services/billing` continue to
// intercept these calls. Jest's mock registry is keyed by the importing
// module's resolution; `../billing` from inside `services/billing/` resolves
// to the same `index.ts` but matches the mock specifier the route tests use.
import {
  updateSubscriptionFromWebhook,
  activateSubscriptionFromCheckout,
  updateQuotaPoolLimit,
} from '../billing';
import type {
  AppliedSubscriptionRow,
  WebhookSubscriptionUpdate,
} from '../billing';
import {
  reattributeTopUpCreditsOnModelChange,
  emitTopUpCreditsReattributedMetric,
} from './tier';
import { getTierConfig } from '../subscription';
import {
  verifySubscriptionTier,
  type StripePriceEnv,
} from '../billing-pricing';
import { safeRefreshKvCache } from '../safe-refresh-kv-cache';
import { inngest } from '../../inngest/client';
import { captureException } from '../sentry';
import { createLogger } from '../logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Stripe SDK v20 type helpers
// ---------------------------------------------------------------------------
// In Stripe SDK v20, `current_period_start` and `current_period_end` moved
// from `Subscription` to `SubscriptionItem`. Webhook payloads still include
// them at the subscription level, but the TypeScript types don't expose them.
// These helpers safely extract period timestamps from subscription items.

export function extractPeriodStart(
  sub: Stripe.Subscription,
): number | undefined {
  const ts = sub.items?.data?.[0]?.current_period_start;
  return typeof ts === 'number' ? ts : undefined;
}

export function extractPeriodEnd(sub: Stripe.Subscription): number | undefined {
  const ts = sub.items?.data?.[0]?.current_period_end;
  return typeof ts === 'number' ? ts : undefined;
}

/**
 * Extracts the subscription ID from an Invoice.
 * In Stripe SDK v20, `subscription` moved to `parent.subscription_details`.
 */
export function extractSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice,
): string | undefined {
  const parentSub = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSub === 'string') return parentSub;
  if (parentSub && typeof parentSub === 'object' && 'id' in parentSub) {
    return parentSub.id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAID_TIERS = new Set<string>(['plus', 'family', 'pro']);

export function shouldRefreshStripeKv(
  updated: AppliedSubscriptionRow | null,
  stripeEventId: string,
): updated is AppliedSubscriptionRow {
  return (
    updated !== null &&
    (updated.webhookApplied !== false ||
      updated.lastStripeEventId === stripeEventId)
  );
}

/** Validates and extracts a paid tier from metadata. */
export function extractPaidTier(
  metadata: Record<string, string> | undefined | null,
): ('plus' | 'family' | 'pro') | null {
  const tier = metadata?.tier;
  if (!tier || !PAID_TIERS.has(tier)) return null;
  return tier as 'plus' | 'family' | 'pro';
}

/** Maps a Stripe subscription status to our internal status. */
export function mapStripeStatus(
  stripeStatus: string,
): 'active' | 'past_due' | 'cancelled' | 'expired' | null {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'cancelled';
    case 'unpaid':
    case 'incomplete_expired':
      return 'expired';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// [#828] Out-of-order event escalation
// ---------------------------------------------------------------------------
// Stripe explicitly does NOT guarantee event ordering — `customer.subscription.created`,
// `customer.subscription.updated`, or `invoice.payment_*` events can arrive
// before `checkout.session.completed` has created the local subscriptions row.
// `updateSubscriptionFromWebhook` returns null when no row matches the Stripe
// subscription ID. Previously the handlers returned silently — the event's
// state (period dates, cancelled_at, past_due transitions) was lost forever
// because Stripe will not re-deliver after a 200. AGENTS.md "Silent recovery
// without escalation is banned in billing" — escalate so the rate is
// queryable in Sentry.
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

// ---------------------------------------------------------------------------
// [WI-618 / F-124] Top-up credit re-attribution on Stripe tier changes
// ---------------------------------------------------------------------------
// The Stripe subscription handlers cross the quota-model boundary (per-profile
// <-> shared-pool) on three sites: customer.subscription.deleted and the
// expiry branch (both → free / per-profile), and the active-tier branch of
// customer.subscription.updated (e.g. plus → family). When the model changes,
// active top-up credits must be re-attributed (profileId owner <-> null) inside
// the SAME transaction that writes the new tier, or they are stranded on the
// wrong attribution and become unspendable — the original F-124 value-loss
// class, identical to the RevenueCat path fixed under WI-583 (PR #876/#897).
//
// These were left untouched in the WI-583 sweep because the Stripe webhook path
// is dormant (store billing not live). WI-618 closes the sibling gap so the
// risk does not go live when Stripe billing activates.

/**
 * Lock-and-read the previous tier of a subscription keyed by Stripe ID, INSIDE
 * an open transaction. The row lock (SELECT … FOR UPDATE) is held until the
 * transaction commits, serializing the tier-change detection + credit
 * re-attribution against concurrent webhooks for the same subscription — the
 * same F-124 serialization contract as the RevenueCat path
 * (updateSubscriptionAndQuotaFromRevenuecatWebhook, revenuecat.ts).
 *
 * Returns the locked subscription's prior tier, or undefined when no local row
 * matches the Stripe ID (out-of-order delivery — handled by the caller's
 * existing escalateSubscriptionNotFound path).
 */
async function lockPreviousTierByStripeId(
  txDb: Database,
  stripeSubscriptionId: string,
): Promise<SubscriptionTier | undefined> {
  // safe-caller: Stripe webhook — keyed by external Stripe ID, authenticated by event signature
  const existing = await findSubscriptionByStripeId__unscoped(
    txDb,
    stripeSubscriptionId,
  );
  if (!existing) return undefined;
  // safe-caller: Stripe webhook — internal id resolved from the verified Stripe ID above
  const locked = await lockSubscriptionById__unscoped(txDb, existing.id);
  return locked?.tier ?? existing.tier;
}

/**
 * Re-attributes top-up credits when a Stripe tier change crosses the quota
 * model, inside the open transaction `txDb`, and returns the re-attributed
 * count (0 when the model did not change or no credits qualified). The queryable
 * metric is emitted by the caller OUTSIDE the transaction (silent-recovery-banned
 * rule) — see emitTopUpCreditsReattributedMetric.
 */
async function reattributeStripeTierChange(
  txDb: Database,
  result: AppliedSubscriptionRow,
  previousTier: SubscriptionTier | undefined,
  newTier: SubscriptionTier,
): Promise<number> {
  if (!previousTier || previousTier === newTier) return 0;
  return reattributeTopUpCreditsOnModelChange(
    txDb,
    result.id,
    result.accountId,
    previousTier,
    newTier,
  );
}

// ---------------------------------------------------------------------------
// Webhook event handlers
// ---------------------------------------------------------------------------

export async function handleSubscriptionEvent(
  db: Database,
  kv: KVNamespace | undefined,
  stripeSubscription: Stripe.Subscription,
  eventTimestamp: string,
  stripeEventId: string,
  env: StripePriceEnv,
): Promise<void> {
  const status = mapStripeStatus(stripeSubscription.status);
  if (!status) {
    // [#441] Unmapped Stripe status — silent early-return is banned in billing
    // (AGENTS.md: "Silent recovery without escalation is banned"). Surface to
    // Sentry so stuck-in-incomplete scenarios are visible in the dashboard.
    logger.warn(
      '[stripe-webhook] handleSubscriptionEvent: unmapped Stripe status — event dropped',
      {
        unmappedStatus: stripeSubscription.status,
        stripeSubscriptionId: stripeSubscription.id,
        accountId: (
          stripeSubscription.metadata as Record<string, string> | null
        )?.accountId,
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
          accountId: (
            stripeSubscription.metadata as Record<string, string> | null
          )?.accountId,
        },
      },
    );
    return;
  }
  const isExpired = status === 'expired';

  const updates: WebhookSubscriptionUpdate = {
    status,
    lastStripeEventTimestamp: eventTimestamp,
    // [CR-2026-05-19-M11] Thread Stripe event ID for atomic dedup inside transaction.
    stripeEventId,
  };

  // [WI-85 / WI-175] The granted tier must reflect the actually-purchased
  // Stripe price, not the metadata stamped at checkout. Subscription metadata is
  // operator/dashboard-mutable and can diverge from the line item if a
  // checkout-wiring bug stamps the wrong tier — trusting it grants entitlements
  // the customer did not pay for. The decision logic lives in the service
  // (verifySubscriptionTier); the route owns only the resulting alert emission.
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
    // Genuine divergence: the purchased price contradicts the stamped tier.
    // Price is authoritative; alert so the bad metadata source is fixed.
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
    // Pricing IS configured but a live price maps to no tier — genuine drift.
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
    // Stripe pricing not configured (dormant) — expected steady state, so log
    // rather than burn Sentry quota on every webhook (mirrors auth-middleware
    // Sentry discipline).
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
  // Do NOT null it out here — subsequent events (e.g. period-end reminders) fire
  // after the cancellation is recorded and must not clobber it. Re-activation
  // events (invoice.payment_succeeded) clear cancelledAt explicitly.
  if (stripeSubscription.canceled_at) {
    updates.cancelledAt = new Date(
      stripeSubscription.canceled_at * 1000,
    ).toISOString();
  }

  // [CR-2026-05-19-M3] SITE 3: Wrap updateSubscriptionFromWebhook + updateQuotaPoolLimit
  // in a single outer transaction so a process death between the two writes
  // cannot leave subscription.status updated while quota pool limits are stale
  // (tier/quota divergence). M11's inner transaction inside updateSubscriptionFromWebhook
  // becomes a savepoint inside this outer transaction — Postgres handles nested
  // transactions as savepoints correctly.
  // [WI-618 / F-124] Capture re-attribution count to emit the queryable metric
  // outside the transaction (silent-recovery-banned rule). previousTier is read
  // under a row lock inside the tx so the model-change detection serializes
  // against concurrent webhooks for this subscription.
  let reattributedCount = 0;
  let previousTier: SubscriptionTier | undefined;
  // The new tier actually written when the quota pool was synced — captured so
  // the metric emit outside the tx reflects the same value the re-attribution
  // used (avoids a non-null assertion on effectiveTier).
  let appliedNewTier: SubscriptionTier | undefined;
  const reattributionNow = new Date();

  const updated = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // [WI-618 / F-124] Lock-and-read the prior tier BEFORE the update so the
    // tier change is detected coherently and serialized (FOR UPDATE).
    previousTier = await lockPreviousTierByStripeId(
      txDb,
      stripeSubscription.id,
    );

    const result = await updateSubscriptionFromWebhook(
      txDb,
      stripeSubscription.id,
      updates,
    );

    if (result && result.webhookApplied !== false) {
      if (isExpired) {
        const freeTier = getTierConfig('free');
        await updateQuotaPoolLimit(
          txDb,
          result.id,
          freeTier.monthlyQuota,
          freeTier.dailyLimit,
        );
        // [WI-618 / F-124] expiry → free (per-profile): re-attribute credits
        // if the prior tier was shared-pool (family/pro).
        appliedNewTier = 'free';
        reattributedCount = await reattributeStripeTierChange(
          txDb,
          result,
          previousTier,
          'free',
        );
      } else if (effectiveTier) {
        // Sync quota pool limit to the price-authoritative tier.
        const tierConfig = getTierConfig(effectiveTier);
        await updateQuotaPoolLimit(
          txDb,
          result.id,
          tierConfig.monthlyQuota,
          tierConfig.dailyLimit,
        );
        // [WI-618 / F-124] active-tier change (customer.subscription.updated):
        // re-attribute credits if the model crossed (e.g. plus <-> family).
        appliedNewTier = effectiveTier;
        reattributedCount = await reattributeStripeTierChange(
          txDb,
          result,
          previousTier,
          effectiveTier,
        );
      }
    }

    return result;
  });

  // [WI-618 / F-124] Emit the queryable re-attribution metric outside the tx.
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
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handleSubscriptionEvent',
      {
        stripeSubscriptionId: stripeSubscription.id,
      },
    );
  } else if (updated === null) {
    // [#828] Out-of-order delivery: subscription event arrived before
    // checkout.session.completed created the local row. Escalate (don't drop
    // silently) so the rate is queryable.
    escalateSubscriptionNotFound(
      'handleSubscriptionEvent',
      stripeSubscription.id,
      stripeEventId,
      eventTimestamp,
      { stripeStatus: stripeSubscription.status, mappedStatus: status },
    );
  }
}

export async function handleSubscriptionDeleted(
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
    // [CR-2026-05-19-M11] Thread Stripe event ID for atomic dedup inside transaction.
    stripeEventId,
  };

  // [CR-2026-05-19-M3] SITE 3 (handleSubscriptionDeleted): Outer transaction
  // ensures subscription.status='expired' and quota pool downgrade commit
  // atomically. M11's inner dedup transaction in updateSubscriptionFromWebhook
  // nests as a savepoint. KV cache refresh is intentionally outside the tx
  // (KV is not part of the Postgres commit).
  // [WI-618 / F-124] See handleSubscriptionEvent — capture count + previousTier
  // to emit the queryable metric outside the transaction.
  let reattributedCount = 0;
  let previousTier: SubscriptionTier | undefined;
  const reattributionNow = new Date();

  const updated = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // [WI-618 / F-124] Lock-and-read the prior tier BEFORE the update.
    previousTier = await lockPreviousTierByStripeId(
      txDb,
      stripeSubscription.id,
    );

    const result = await updateSubscriptionFromWebhook(
      txDb,
      stripeSubscription.id,
      updates,
    );

    if (result && result.webhookApplied !== false) {
      const freeTier = getTierConfig('free');
      await updateQuotaPoolLimit(
        txDb,
        result.id,
        freeTier.monthlyQuota,
        freeTier.dailyLimit,
      );
      // [WI-618 / F-124] subscription.deleted → free (per-profile): re-attribute
      // credits if the prior tier was shared-pool (family/pro).
      reattributedCount = await reattributeStripeTierChange(
        txDb,
        result,
        previousTier,
        'free',
      );
    }

    return result;
  });

  // [WI-618 / F-124] Emit the queryable re-attribution metric outside the tx.
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
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handleSubscriptionDeleted',
      {
        stripeSubscriptionId: stripeSubscription.id,
      },
    );
  } else if (updated === null) {
    // [#828] Out-of-order: subscription.deleted before checkout.completed.
    escalateSubscriptionNotFound(
      'handleSubscriptionDeleted',
      stripeSubscription.id,
      stripeEventId,
      eventTimestamp,
    );
  }
}

export async function handleCheckoutCompleted(
  db: Database,
  kv: KVNamespace | undefined,
  session: Stripe.Checkout.Session,
  eventTimestamp: string,
): Promise<void> {
  // [WI-85 / WI-175] checkout.session.completed trusts metadata.tier by design:
  // at checkout-session creation (routes/billing.ts) the price line item and
  // metadata.tier both derive from the same authenticated `tier`
  // (resolvePriceId binds tier → price), so they cannot diverge here. Any later
  // operator/dashboard mutation of the subscription's tier flows through
  // customer.subscription.updated, which IS price-verified in
  // handleSubscriptionEvent above.
  const metadata = session.metadata as Record<string, string> | undefined;
  const accountId = metadata?.accountId;
  const tier = extractPaidTier(metadata);
  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  // [BUG-658 / A-17] Missing critical metadata is graceful at the route level
  // (we still 200 to Stripe so it does not retry indefinitely), but it must
  // be observable. Without escalation a regression in checkout-session
  // metadata wiring silently drops paid users on the floor — they are charged
  // but never activated. Fields below help triage which one is missing.
  if (!accountId || !tier || !stripeSubscriptionId) {
    logger.warn(
      `[stripe-webhook] checkout.completed dropped — missing metadata (accountId=${!!accountId}, tier=${!!tier}, subscriptionId=${!!stripeSubscriptionId}, sessionId=${
        session.id
      })`,
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

  // [#829] For async payment methods (SEPA Direct Debit, Bacs, BLIK, bank
  // transfer), Stripe fires checkout.session.completed with
  // payment_status='unpaid' while the actual payment is still pending. The
  // real resolution arrives later via checkout.session.async_payment_succeeded
  // or checkout.session.async_payment_failed. If we activate the paid tier on
  // 'unpaid' we grant entitlements + quota before money has cleared; a
  // subsequent async_payment_failed would leave the user already having
  // consumed paid-tier quota. Gate activation on the two terminal-success
  // states only ('paid' for card/most methods, 'no_payment_required' for
  // setup/100%-discount flows). For 'unpaid', escalate and wait — the async
  // success event will route through this handler again with payment_status
  // flipped to 'paid'.
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

  const activated = await activateSubscriptionFromCheckout(
    db,
    accountId,
    stripeSubscriptionId,
    tier,
    eventTimestamp,
  );

  if (activated) {
    await safeRefreshKvCache(
      kv,
      db,
      activated.accountId,
      'stripe.webhook.handleCheckoutCompleted',
      {
        stripeSessionId: session.id,
        stripeSubscriptionId,
      },
    );
  }
}

export async function handlePaymentFailed(
  db: Database,
  kv: KVNamespace | undefined,
  invoice: Stripe.Invoice,
  eventTimestamp: string,
  stripeEventId: string,
): Promise<void> {
  const stripeSubscriptionId = extractSubscriptionIdFromInvoice(invoice);

  // [BUG-659 / A-18] Schema-evolution risk: Stripe SDK v20 moved
  // invoice.subscription → invoice.parent.subscription_details.subscription.
  // If Stripe further refactors the invoice payload, our extractor returns
  // undefined and we drop a payment-failed event silently — the customer's
  // subscription is never marked past_due. Escalate so we can detect the
  // schema drift before users are silently kept on a tier they can't pay for.
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

  // Update subscription to past_due
  const updated = await updateSubscriptionFromWebhook(
    db,
    stripeSubscriptionId,
    {
      status: 'past_due',
      lastStripeEventTimestamp: eventTimestamp,
      // [CR-2026-05-19-M11] Thread Stripe event ID for atomic dedup inside transaction.
      stripeEventId,
    },
  );

  const shouldDispatchPaymentFailed =
    updated !== null &&
    (updated.webhookApplied !== false ||
      updated.lastStripeEventId === stripeEventId);

  if (shouldRefreshStripeKv(updated, stripeEventId)) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handlePaymentFailed',
      {
        stripeSubscriptionId,
        invoiceId: invoice.id,
      },
    );
  } else if (updated === null) {
    // [#828] Out-of-order: invoice.payment_failed before checkout.completed.
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
    // Kept direct so a dispatch failure throws to the Stripe webhook handler,
    // which then returns non-2xx → Stripe retries the webhook. A swallowed
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

export async function handlePaymentSucceeded(
  db: Database,
  kv: KVNamespace | undefined,
  invoice: Stripe.Invoice,
  eventTimestamp: string,
  stripeEventId: string,
): Promise<void> {
  const stripeSubscriptionId = extractSubscriptionIdFromInvoice(invoice);

  // Mirror handlePaymentFailed escalation pattern [ultrareview finding]:
  // If Stripe SDK v21 (or later) refactors the invoice payload again,
  // extractSubscriptionIdFromInvoice() will return undefined and we will
  // silently skip re-activating the subscription after a successful payment —
  // subscriptions get stuck in past_due with zero observability. Escalate so
  // we detect the schema drift before users notice.
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

  const updated = await updateSubscriptionFromWebhook(
    db,
    stripeSubscriptionId,
    {
      status: 'active',
      // [CR-052] Clear cancelledAt on payment success so a user who cancelled
      // and then paid (or resumed after past_due) does NOT stay in the
      // "Cancelling" UI state. The comment in handleSubscriptionEvent documents
      // this intent; this is where it is fulfilled for the invoice path.
      cancelledAt: null,
      lastStripeEventTimestamp: eventTimestamp,
      // [CR-2026-05-19-M11] Thread Stripe event ID for atomic dedup inside transaction.
      stripeEventId,
    },
  );

  if (shouldRefreshStripeKv(updated, stripeEventId)) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handlePaymentSucceeded',
      {
        stripeSubscriptionId,
        invoiceId: invoice.id,
      },
    );
  } else if (updated === null) {
    // [#828] Out-of-order: invoice.payment_succeeded before checkout.completed.
    escalateSubscriptionNotFound(
      'handlePaymentSucceeded',
      stripeSubscriptionId,
      stripeEventId,
      eventTimestamp,
      { invoiceId: invoice.id },
    );
  }
}
