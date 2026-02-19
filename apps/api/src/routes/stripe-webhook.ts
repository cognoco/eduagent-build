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
import type { Database } from '@eduagent/database';
import type Stripe from 'stripe';
import type { CachedSubscriptionStatus } from '../services/kv';
import type { WebhookSubscriptionUpdate } from '../services/billing';

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

  const updates: WebhookSubscriptionUpdate = {
    status,
    lastStripeEventTimestamp: eventTimestamp,
  };

  // Extract tier from subscription metadata (stamped during checkout)
  const tier = extractPaidTier(
    stripeSubscription.metadata as Record<string, string> | undefined
  );
  if (tier) {
    updates.tier = tier;
  }

  if ((stripeSubscription as any).current_period_start) {
    updates.currentPeriodStart = new Date(
      (stripeSubscription as any).current_period_start * 1000
    ).toISOString();
  }
  if ((stripeSubscription as any).current_period_end) {
    updates.currentPeriodEnd = new Date(
      (stripeSubscription as any).current_period_end * 1000
    ).toISOString();
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
    // If tier metadata present, sync quota pool limit to new tier
    if (tier) {
      const tierConfig = getTierConfig(tier);
      await updateQuotaPoolLimit(db, updated.id, tierConfig.monthlyQuota);
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
    cancelledAt: new Date().toISOString(),
    lastStripeEventTimestamp: eventTimestamp,
  };

  const updated = await updateSubscriptionFromWebhook(
    db,
    stripeSubscription.id,
    updates
  );

  if (updated) {
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

  // Graceful exit: missing critical data — log-worthy but not crash-worthy
  if (!accountId || !tier || !stripeSubscriptionId) return;

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
  const stripeSubscriptionId =
    typeof (invoice as any).subscription === 'string'
      ? (invoice as any).subscription
      : (invoice as any).subscription?.id;

  if (!stripeSubscriptionId) return;

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

    // Emit Inngest event for payment retry flow
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
  const stripeSubscriptionId =
    typeof (invoice as any).subscription === 'string'
      ? (invoice as any).subscription
      : (invoice as any).subscription?.id;

  if (!stripeSubscriptionId) return;

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
    event = await verifyWebhookSignature(rawBody, signature, webhookSecret);
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
