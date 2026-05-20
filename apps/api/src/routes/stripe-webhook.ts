// ---------------------------------------------------------------------------
// Stripe Webhook Route — Sprint 9 Phase 2
// NOT behind Clerk auth — uses Stripe signature verification.
// Dispatches subscription lifecycle events to billing service + KV.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { apiError } from '../errors';
import { verifyWebhookSignature } from '../services/stripe';
import {
  updateSubscriptionFromWebhook,
  activateSubscriptionFromCheckout,
  updateQuotaPoolLimit,
} from '../services/billing';
import { getTierConfig } from '../services/subscription';
import { safeRefreshKvCache } from '../services/safe-refresh-kv-cache';

import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';
import type { Database } from '@eduagent/database';
import type Stripe from 'stripe';
import type { WebhookSubscriptionUpdate } from '../services/billing';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Stripe SDK v20 type helpers
// ---------------------------------------------------------------------------
// In Stripe SDK v20, `current_period_start` and `current_period_end` moved
// from `Subscription` to `SubscriptionItem`. Webhook payloads still include
// them at the subscription level, but the TypeScript types don't expose them.
// These helpers safely extract period timestamps from subscription items.

function extractPeriodStart(sub: Stripe.Subscription): number | undefined {
  const ts = sub.items?.data?.[0]?.current_period_start;
  return typeof ts === 'number' ? ts : undefined;
}

function extractPeriodEnd(sub: Stripe.Subscription): number | undefined {
  const ts = sub.items?.data?.[0]?.current_period_end;
  return typeof ts === 'number' ? ts : undefined;
}

/**
 * Extracts the subscription ID from an Invoice.
 * In Stripe SDK v20, `subscription` moved to `parent.subscription_details`.
 */
function extractSubscriptionIdFromInvoice(
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

/** Validates and extracts a paid tier from metadata. */
function extractPaidTier(
  metadata: Record<string, string> | undefined | null,
): ('plus' | 'family' | 'pro') | null {
  const tier = metadata?.tier;
  if (!tier || !PAID_TIERS.has(tier)) return null;
  return tier as 'plus' | 'family' | 'pro';
}

/** Maps a Stripe subscription status to our internal status. */
function mapStripeStatus(
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
// Webhook event handlers
// ---------------------------------------------------------------------------

async function handleSubscriptionEvent(
  db: Database,
  kv: KVNamespace | undefined,
  stripeSubscription: Stripe.Subscription,
  eventTimestamp: string,
): Promise<void> {
  const status = mapStripeStatus(stripeSubscription.status);
  if (!status) return;
  const isExpired = status === 'expired';

  const updates: WebhookSubscriptionUpdate = {
    status,
    lastStripeEventTimestamp: eventTimestamp,
  };

  // Extract tier from subscription metadata (stamped during checkout)
  const tier = extractPaidTier(
    stripeSubscription.metadata as Record<string, string> | undefined,
  );
  if (isExpired) {
    updates.tier = 'free';
  } else if (tier) {
    updates.tier = tier;
  }

  const periodStart = extractPeriodStart(stripeSubscription);
  if (periodStart) {
    updates.currentPeriodStart = new Date(periodStart * 1000).toISOString();
  }
  const periodEnd = extractPeriodEnd(stripeSubscription);
  if (periodEnd) {
    updates.currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
  }
  if (stripeSubscription.canceled_at) {
    updates.cancelledAt = new Date(
      stripeSubscription.canceled_at * 1000,
    ).toISOString();
  } else {
    updates.cancelledAt = null;
  }

  const updated = await updateSubscriptionFromWebhook(
    db,
    stripeSubscription.id,
    updates,
  );

  if (updated) {
    if (isExpired) {
      const freeTier = getTierConfig('free');
      await updateQuotaPoolLimit(
        db,
        updated.id,
        freeTier.monthlyQuota,
        freeTier.dailyLimit,
      );
    } else if (tier) {
      // If tier metadata present, sync quota pool limit to new tier
      const tierConfig = getTierConfig(tier);
      await updateQuotaPoolLimit(
        db,
        updated.id,
        tierConfig.monthlyQuota,
        tierConfig.dailyLimit,
      );
    }
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handleSubscriptionEvent',
      {
        stripeSubscriptionId: stripeSubscription.id,
      },
    );
  }
}

async function handleSubscriptionDeleted(
  db: Database,
  kv: KVNamespace | undefined,
  stripeSubscription: Stripe.Subscription,
  eventTimestamp: string,
): Promise<void> {
  const updates: WebhookSubscriptionUpdate = {
    status: 'expired',
    tier: 'free',
    cancelledAt: new Date().toISOString(),
    lastStripeEventTimestamp: eventTimestamp,
  };

  const updated = await updateSubscriptionFromWebhook(
    db,
    stripeSubscription.id,
    updates,
  );

  if (updated) {
    const freeTier = getTierConfig('free');
    await updateQuotaPoolLimit(
      db,
      updated.id,
      freeTier.monthlyQuota,
      freeTier.dailyLimit,
    );
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'stripe.webhook.handleSubscriptionDeleted',
      {
        stripeSubscriptionId: stripeSubscription.id,
      },
    );
  }
}

async function handleCheckoutCompleted(
  db: Database,
  kv: KVNamespace | undefined,
  session: Stripe.Checkout.Session,
  eventTimestamp: string,
): Promise<void> {
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

async function handlePaymentFailed(
  db: Database,
  kv: KVNamespace | undefined,
  invoice: Stripe.Invoice,
  eventTimestamp: string,
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
    },
  );

  if (updated) {
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

    // core-send: payment-failed alert — observed by payment-failed-observe.ts.
    // Kept direct so a dispatch failure throws to the Stripe webhook handler,
    // which then returns non-2xx → Stripe retries the webhook. A swallowed
    // dispatch would lose the payment-failure signal entirely.
    await inngest.send({
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

async function handlePaymentSucceeded(
  db: Database,
  kv: KVNamespace | undefined,
  invoice: Stripe.Invoice,
  eventTimestamp: string,
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
      lastStripeEventTimestamp: eventTimestamp,
    },
  );

  if (updated) {
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
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const stripeWebhookRoute = new Hono<{
  Bindings: {
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_SECRET_KEY?: string;
    SUBSCRIPTION_KV?: KVNamespace;
    ENVIRONMENT?: string;
  };
  Variables: {
    db: Database;
  };
}>().post('/stripe/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return apiError(
      c,
      400,
      ERROR_CODES.MISSING_SIGNATURE,
      'Missing Stripe-Signature header',
    );
  }

  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return apiError(
      c,
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'Webhook secret not configured',
    );
  }

  // Read raw body for signature verification
  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await verifyWebhookSignature(
      rawBody,
      signature,
      webhookSecret,
      c.env.STRIPE_SECRET_KEY ?? 'sk_webhook_verification_only',
    );
  } catch {
    return apiError(
      c,
      400,
      ERROR_CODES.MISSING_SIGNATURE,
      'Invalid webhook signature',
    );
  }

  // [H-1 / BUG-624 parity] In production, test-mode events MUST NOT mutate
  // state. A Stripe test-mode event signed with the production webhook secret
  // could otherwise activate or cancel real subscriptions. Matches the
  // RevenueCat SANDBOX guard pattern (rca-webhook.ts:687).
  if (!event.livemode && c.env.ENVIRONMENT === 'production') {
    logger.warn('[stripe] Rejected test-mode webhook event in production', {
      eventType: event.type,
      eventId: event.id,
    });
    return c.json({ received: true, skipped: true });
  }

  const db = c.get('db');
  const kv = c.env.SUBSCRIPTION_KV;
  const eventTimestamp = new Date(event.created * 1000).toISOString();

  // [BUG-113] Stale events (>48h old) are acknowledged (200) and dropped, NOT
  // rejected with 4xx. A 4xx response causes Stripe to RETRY the webhook for
  // up to 72h — meaning a single stale event becomes a permanent retry storm
  // and floods the endpoint with the same payload until Stripe gives up. The
  // idempotency guard in updateSubscriptionFromWebhook already handles
  // duplicate/out-of-order events safely, so the only purpose of this guard
  // is to prevent acting on stale data. Ack + no-op + escalate so we still
  // see the drop in Sentry without inviting infinite retries.
  const eventAge = Date.now() - event.created * 1000;
  if (eventAge > 48 * 60 * 60 * 1000) {
    logger.warn('[stripe-webhook] stale event dropped (acked 200)', {
      eventId: event.id,
      eventType: event.type,
      eventAgeHours: Math.round(eventAge / (60 * 60 * 1000)),
    });
    captureException(
      new Error('Stripe webhook event older than 48h — acknowledged + dropped'),
      {
        extra: {
          context: 'stripe.webhook.stale_event_dropped',
          eventId: event.id,
          eventType: event.type,
          eventAgeMs: eventAge,
        },
      },
    );
    return c.json({ received: true, stale: true });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(
        db,
        kv,
        event.data.object as Stripe.Checkout.Session,
        eventTimestamp,
      );
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionEvent(
        db,
        kv,
        event.data.object as Stripe.Subscription,
        eventTimestamp,
      );
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(
        db,
        kv,
        event.data.object as Stripe.Subscription,
        eventTimestamp,
      );
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(
        db,
        kv,
        event.data.object as Stripe.Invoice,
        eventTimestamp,
      );
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(
        db,
        kv,
        event.data.object as Stripe.Invoice,
        eventTimestamp,
      );
      break;
  }

  return c.json({ received: true });
});
