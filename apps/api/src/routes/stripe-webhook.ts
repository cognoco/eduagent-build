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
import {
  verifySubscriptionTier,
  type StripePriceEnv,
} from '../services/billing-pricing';
import { safeRefreshKvCache } from '../services/safe-refresh-kv-cache';
import { claimWebhookId } from './resend-webhook';

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
  stripeEventId: string,
  env: StripePriceEnv,
): Promise<void> {
  const status = mapStripeStatus(stripeSubscription.status);
  if (!status) {
    // [#441] Unmapped Stripe status — silent early-return is banned in billing
    // (CLAUDE.md: "Silent recovery without escalation is banned"). Surface to
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
  const updated = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

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
      } else if (effectiveTier) {
        // Sync quota pool limit to the price-authoritative tier.
        const tierConfig = getTierConfig(effectiveTier);
        await updateQuotaPoolLimit(
          txDb,
          result.id,
          tierConfig.monthlyQuota,
          tierConfig.dailyLimit,
        );
      }
    }

    return result;
  });

  if (updated && updated.webhookApplied !== false) {
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
  const updated = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

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
    }

    return result;
  });

  if (updated && updated.webhookApplied !== false) {
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

  if (updated && updated.webhookApplied !== false) {
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

  if (updated && updated.webhookApplied !== false) {
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
  // StripePriceEnv carries the STRIPE_PRICE_<TIER>_<INTERVAL> bindings used to
  // verify the granted tier against the actually-purchased price [WI-85].
  Bindings: StripePriceEnv & {
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

  // claimWebhookId gates checkout.session.completed because that event creates
  // the initial subscription row (no timestamp to compare against). Other
  // billing events (subscription.updated, invoice.payment_succeeded,
  // subscription.deleted) rely on the timestamp guard in
  // updateSubscriptionFromWebhook to reject duplicate replays.
  switch (event.type) {
    case 'checkout.session.completed': {
      // [#450] Atomic idempotency gate — must be the FIRST step before any
      // billing mutation. Stripe retries on transient 5xx; two concurrent
      // deliveries of the same checkout.session.completed would both see no
      // existing subscription row, both call createSubscription, and the
      // second would crash on UNIQUE(account_id) → Stripe interprets 500 as
      // retry → loop. INSERT ... ON CONFLICT DO NOTHING is atomic so only one
      // delivery can claim the event ID; the other returns 200 immediately.
      const STRIPE_WEBHOOK_SOURCE = 'stripe';
      const checkoutClaim = await claimWebhookId(
        db,
        STRIPE_WEBHOOK_SOURCE,
        event.id,
      );
      if (checkoutClaim === 'replay') {
        logger.warn(
          '[stripe-webhook] checkout.session.completed replay detected — already claimed, skipping',
          { eventId: event.id },
        );
        return c.json({ received: true, replayed: true });
      }
      if (checkoutClaim === 'unavailable') {
        // DB gate unavailable — escalate but continue. Silent recovery is banned
        // (CLAUDE.md). activateSubscriptionFromCheckout has its own ON CONFLICT
        // guard so a duplicate will be caught at the DB level, but surface the
        // missing gate so it is queryable.
        logger.warn(
          '[stripe-webhook] checkout idempotency DB claim unavailable — continuing without atomic gate',
          { eventId: event.id },
        );
        captureException(
          new Error(
            'Stripe checkout.session.completed idempotency DB claim unavailable',
          ),
          {
            extra: {
              context: 'stripe.webhook.checkout.completed.claim_unavailable',
              eventId: event.id,
            },
          },
        );
      }
      await handleCheckoutCompleted(
        db,
        kv,
        event.data.object as Stripe.Checkout.Session,
        eventTimestamp,
      );
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionEvent(
        db,
        kv,
        event.data.object as Stripe.Subscription,
        eventTimestamp,
        event.id,
        c.env,
      );
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(
        db,
        kv,
        event.data.object as Stripe.Subscription,
        eventTimestamp,
        event.id,
      );
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(
        db,
        kv,
        event.data.object as Stripe.Invoice,
        eventTimestamp,
        event.id,
      );
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(
        db,
        kv,
        event.data.object as Stripe.Invoice,
        eventTimestamp,
        event.id,
      );
      break;
  }

  return c.json({ received: true });
});
