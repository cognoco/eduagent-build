// ---------------------------------------------------------------------------
// Stripe Webhook Route — Sprint 9 Phase 2
// NOT behind Clerk auth — uses Stripe signature verification.
// Dispatches subscription lifecycle events to billing service + KV.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { apiError } from '../errors';
import { verifyWebhookSignature } from '../services/stripe';
import { writeSubscriptionStatus } from '../services/kv';
import {
  updateSubscriptionFromWebhook,
  getSubscriptionByAccountId,
  getQuotaPool,
  activateSubscriptionFromCheckout,
  updateQuotaPoolLimit,
} from '../services/billing';
import { getTierConfig } from '../services/subscription';

import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';
import type { Database } from '@eduagent/database';
import type Stripe from 'stripe';
import type { CachedSubscriptionStatus } from '../services/kv';
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
  invoice: Stripe.Invoice
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
  metadata: Record<string, string> | undefined | null
): ('plus' | 'family' | 'pro') | null {
  const tier = metadata?.tier;
  if (!tier || !PAID_TIERS.has(tier)) return null;
  return tier as 'plus' | 'family' | 'pro';
}

/** Maps a Stripe subscription status to our internal status. */
function mapStripeStatus(
  stripeStatus: string
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

/**
 * After a subscription DB update, refresh the KV cache.
 * Silently skips if KV namespace is not bound (dev/test).
 */
async function refreshKvCache(
  kv: KVNamespace | undefined,
  db: Database,
  accountId: string
): Promise<void> {
  if (!kv) return;

  const sub = await getSubscriptionByAccountId(db, accountId);
  if (!sub) return;

  const quota = await getQuotaPool(db, sub.id);

  const cached: CachedSubscriptionStatus = {
    subscriptionId: sub.id,
    tier: sub.tier,
    status: sub.status,
    monthlyLimit: quota?.monthlyLimit ?? 0,
    usedThisMonth: quota?.usedThisMonth ?? 0,
    dailyLimit: quota?.dailyLimit ?? null,
    usedToday: quota?.usedToday ?? 0,
  };

  await writeSubscriptionStatus(kv, accountId, cached);
}

// ---------------------------------------------------------------------------
// Webhook event handlers
// ---------------------------------------------------------------------------

async function handleSubscriptionEvent(
  db: Database,
  kv: KVNamespace | undefined,
  stripeSubscription: Stripe.Subscription,
  eventTimestamp: string
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
    stripeSubscription.metadata as Record<string, string> | undefined
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
      stripeSubscription.canceled_at * 1000
    ).toISOString();
  } else {
    updates.cancelledAt = null;
  }

  const updated = await updateSubscriptionFromWebhook(
    db,
    stripeSubscription.id,
    updates
  );

  if (updated) {
    if (isExpired) {
      const freeTier = getTierConfig('free');
      await updateQuotaPoolLimit(
        db,
        updated.id,
        freeTier.monthlyQuota,
        freeTier.dailyLimit
      );
    } else if (tier) {
      // If tier metadata present, sync quota pool limit to new tier
      const tierConfig = getTierConfig(tier);
      await updateQuotaPoolLimit(
        db,
        updated.id,
        tierConfig.monthlyQuota,
        tierConfig.dailyLimit
      );
    }
    await refreshKvCache(kv, db, updated.accountId);
  }
}

async function handleSubscriptionDeleted(
  db: Database,
  kv: KVNamespace | undefined,
  stripeSubscription: Stripe.Subscription,
  eventTimestamp: string
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
    updates
  );

  if (updated) {
    const freeTier = getTierConfig('free');
    await updateQuotaPoolLimit(
      db,
      updated.id,
      freeTier.monthlyQuota,
      freeTier.dailyLimit
    );
    await refreshKvCache(kv, db, updated.accountId);
  }
}

async function handleCheckoutCompleted(
  db: Database,
  kv: KVNamespace | undefined,
  session: Stripe.Checkout.Session,
  eventTimestamp: string
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
      })`
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
      }
    );
    return;
  }

  const activated = await activateSubscriptionFromCheckout(
    db,
    accountId,
    stripeSubscriptionId,
    tier,
    eventTimestamp
  );

  if (activated) {
    await refreshKvCache(kv, db, activated.accountId);
  }
}

async function handlePaymentFailed(
  db: Database,
  kv: KVNamespace | undefined,
  invoice: Stripe.Invoice,
  eventTimestamp: string
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
      `[stripe-webhook] invoice.payment_failed dropped — could not extract subscription id (invoiceId=${invoice.id})`
    );
    captureException(
      new Error(
        'Stripe invoice.payment_failed missing subscription id (possible Stripe schema change)'
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
      }
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
    }
  );

  if (updated) {
    await refreshKvCache(kv, db, updated.accountId);

    // Observed by payment-failed-observe.ts (queryable terminus for billing alerts).
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
  eventTimestamp: string
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
      `[stripe-webhook] invoice.payment_succeeded dropped — could not extract subscription id (invoiceId=${invoice.id})`
    );
    captureException(
      new Error(
        'Stripe invoice.payment_succeeded missing subscription id (possible Stripe schema change)'
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
      }
    );
    return;
  }

  const updated = await updateSubscriptionFromWebhook(
    db,
    stripeSubscriptionId,
    {
      status: 'active',
      lastStripeEventTimestamp: eventTimestamp,
    }
  );

  if (updated) {
    await refreshKvCache(kv, db, updated.accountId);
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
      'Missing Stripe-Signature header'
    );
  }

  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return apiError(
      c,
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'Webhook secret not configured'
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
      c.env.STRIPE_SECRET_KEY ?? 'sk_webhook_verification_only'
    );
  } catch {
    return apiError(
      c,
      400,
      ERROR_CODES.MISSING_SIGNATURE,
      'Invalid webhook signature'
    );
  }

  const db = c.get('db');
  const kv = c.env.SUBSCRIPTION_KV;
  const eventTimestamp = new Date(event.created * 1000).toISOString();

  // Reject stale events (>48 hours old) — Stripe retries for up to 72h,
  // so we allow a wide window. The idempotency guard in
  // updateSubscriptionFromWebhook handles duplicate/out-of-order events.
  const eventAge = Date.now() - event.created * 1000;
  if (eventAge > 48 * 60 * 60 * 1000) {
    return apiError(
      c,
      400,
      ERROR_CODES.STALE_EVENT,
      'Event too old — rejected to prevent replay'
    );
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(
        db,
        kv,
        event.data.object as Stripe.Checkout.Session,
        eventTimestamp
      );
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionEvent(
        db,
        kv,
        event.data.object as Stripe.Subscription,
        eventTimestamp
      );
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(
        db,
        kv,
        event.data.object as Stripe.Subscription,
        eventTimestamp
      );
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(
        db,
        kv,
        event.data.object as Stripe.Invoice,
        eventTimestamp
      );
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(
        db,
        kv,
        event.data.object as Stripe.Invoice,
        eventTimestamp
      );
      break;
  }

  return c.json({ received: true });
});
