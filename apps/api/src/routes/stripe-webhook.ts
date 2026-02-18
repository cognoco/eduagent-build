// ---------------------------------------------------------------------------
// Stripe Webhook Route — Sprint 9 Phase 2
// NOT behind Clerk auth — uses Stripe signature verification.
// Dispatches subscription lifecycle events to billing service + KV.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { verifyWebhookSignature } from '../lib/stripe';
import { writeSubscriptionStatus } from '../lib/kv';
import {
  updateSubscriptionFromWebhook,
  getSubscriptionByAccountId,
  getQuotaPool,
} from '../services/billing';
import { inngest } from '../inngest/client';
import type { Database } from '@eduagent/database';
import type Stripe from 'stripe';
import type { CachedSubscriptionStatus } from '../lib/kv';
import type { WebhookSubscriptionUpdate } from '../services/billing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  if (stripeSubscription.current_period_start) {
    updates.currentPeriodStart = new Date(
      stripeSubscription.current_period_start * 1000
    ).toISOString();
  }
  if (stripeSubscription.current_period_end) {
    updates.currentPeriodEnd = new Date(
      stripeSubscription.current_period_end * 1000
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

async function handlePaymentFailed(
  db: Database,
  kv: KVNamespace | undefined,
  invoice: Stripe.Invoice,
  eventTimestamp: string
): Promise<void> {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

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
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

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
}>().post('/stripe/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json(
      {
        code: ERROR_CODES.MISSING_SIGNATURE,
        message: 'Missing Stripe-Signature header',
      },
      400
    );
  }

  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return c.json(
      {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Webhook secret not configured',
      },
      500
    );
  }

  // Read raw body for signature verification
  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await verifyWebhookSignature(rawBody, signature, webhookSecret);
  } catch {
    return c.json(
      {
        code: ERROR_CODES.MISSING_SIGNATURE,
        message: 'Invalid webhook signature',
      },
      400
    );
  }

  const db = c.get('db') as unknown as Database;
  const kv = c.env.SUBSCRIPTION_KV;
  const eventTimestamp = new Date(event.created * 1000).toISOString();

  switch (event.type) {
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
