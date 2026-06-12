// ---------------------------------------------------------------------------
// Stripe Webhook Route — Sprint 9 Phase 2
// NOT behind Clerk auth — uses Stripe signature verification.
// Dispatches subscription lifecycle events to billing service + KV.
//
// [FCR-2026-05-23-L5.M3] All event-handler business logic lives in
// services/billing/stripe-webhook-handler.ts. This route file owns ONLY:
//   1. signature verification (verifyWebhookSignature)
//   2. test-mode-in-production guard
//   3. stale-event ack-and-drop guard
//   4. checkout.session.completed idempotency claim (claimWebhookId)
//   5. event-type dispatch to the service-side handlers
//   6. HTTP response
// Route/service boundary is lint-enforced (eslint G1/G5) and tested via the
// integration suite — see stripe-webhook.integration.test.ts.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { apiError } from '../errors';
import { verifyWebhookSignature } from '../services/stripe';
import {
  handleSubscriptionEvent,
  handleSubscriptionDeleted,
  handleCheckoutCompleted,
  handlePaymentFailed,
  handlePaymentSucceeded,
} from '../services/billing/stripe-webhook-handler';
import type { StripePriceEnv } from '../services/billing-pricing';
import { claimWebhookId } from '../services/webhook-idempotency';

import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';
import { recordSignatureFailure } from '../services/stripe/signature-failure-escalator';
import type { Database } from '@eduagent/database';
import type Stripe from 'stripe';

const logger = createLogger();

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
  } catch (err) {
    // Log the failure reason so a misconfiguration (e.g. webhook-secret rotation
    // gone wrong) is distinguishable from internet probes — without captureException
    // per-event (that would cause alert-storm from background noise).
    logger.warn('[stripe-webhook] signature verification failed', {
      event: 'stripe.webhook.signature_verification_failed',
      reason: err instanceof Error ? err.message : String(err),
    });
    // Rate-limited escalation: a single failure stays log-only; sustained
    // failures within the window fire exactly one deduplicated Sentry event.
    // Per-isolate best-effort — see signature-failure-escalator.ts header.
    recordSignatureFailure();
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
    // [#830] A test-mode event reaching production with a valid production
    // webhook secret is a high-signal security event — likely production
    // webhook-secret leak, secret reuse, or webhook-endpoint misconfiguration.
    // AGENTS.md "Silent recovery without escalation is banned in billing" —
    // logger.warn alone is explicitly insufficient. Mirror the stale-event
    // branch and escalate to Sentry so the rate is queryable.
    logger.warn('[stripe] Rejected test-mode webhook event in production', {
      eventType: event.type,
      eventId: event.id,
    });
    captureException(
      new Error('Stripe test-mode event received in production'),
      {
        extra: {
          context: 'stripe.webhook.test_mode_in_production',
          eventId: event.id,
          eventType: event.type,
        },
      },
    );
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
        // (AGENTS.md). activateSubscriptionFromCheckout has its own ON CONFLICT
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

    default:
      // [audit-2026-05-30] Future Stripe event types (e.g. dispute.created,
      // invoice.created) that get enabled on the webhook endpoint configuration
      // must surface — falling through silently would acknowledge with 200 and
      // Stripe would never retry, hiding the gap. Silent recovery is banned
      // (AGENTS.md); escalate via logger + Sentry so the unhandled type is
      // queryable. Still ack with 200 because hard-failing would loop Stripe
      // forever on a known-additive event.
      logger.warn(
        '[stripe-webhook] unhandled event type — acknowledged, no handler',
        { eventType: event.type, eventId: event.id },
      );
      captureException(
        new Error(`Unhandled Stripe webhook event type: ${event.type}`),
        {
          extra: {
            context: 'stripe.webhook.unhandled_event_type',
            eventType: event.type,
            eventId: event.id,
          },
        },
      );
      break;
  }

  return c.json({ received: true });
});
