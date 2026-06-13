// ---------------------------------------------------------------------------
// RevenueCat Webhook Route — Epic 9
// NOT behind Clerk auth — validates Authorization Bearer header against
// REVENUECAT_WEBHOOK_SECRET.
// Dispatches subscription lifecycle events to billing service + KV.
//
// [FCR-2026-05-23-L5.M2] All event-handler business logic lives in
// services/billing/revenuecat-webhook-handler.ts. This route file owns ONLY:
//   1. Bearer-token validation (timing-safe HMAC compare)
//   2. Zod payload parsing
//   3. account-resolution, idempotency gate, SANDBOX-in-prod guard,
//      late-event observability log, ensureFreeSubscription
//   4. event-type dispatch to the service-side handlers
//   5. HTTP response
// Route/service boundary is lint-enforced (eslint G1/G5).
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { ERROR_CODES } from '@eduagent/schemas';
import { apiError } from '../errors';
// [CUT-B3 / WI-693] The handler seam dispatches: flag-off → legacy handlers
// (byte-identical, accounts-keyed), flag-on → v2 handlers (login→membership→
// organization resolution, new `subscription` store). The route body and the
// bearer-auth / SANDBOX / idempotency-gate guards are unchanged.
import { getRevenuecatWebhookHandlers } from '../services/billing/billing-v2/dispatch';
import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';

const logger = createLogger();
import type { Database } from '@eduagent/database';

export const LATE_REVENUECAT_EVENT_OBSERVATION_MS = 48 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Timing-safe string comparison (prevents timing attacks on webhook secret)
// ---------------------------------------------------------------------------

/**
 * BS-01: HMAC-based constant-time comparison.
 * Both inputs are hashed with SHA-256 HMAC (using a private static key) before
 * comparison, producing fixed-length 32-byte digests regardless of input
 * length. This eliminates the length-leak timing side-channel that exists
 * when comparing raw strings of different lengths.
 *
 * The HMAC key is a private constant — callers cannot vary it, so all
 * comparisons use a single stable domain label and there is no risk of a
 * future caller accidentally passing a different label that would silently
 * change comparison semantics across deployments.
 *
 * Uses SubtleCrypto (available in Cloudflare Workers) for proper HMAC.
 */
// Private domain-separation label — not a secret, not caller-visible.
const HMAC_COMPARISON_LABEL = 'eduagent-revenuecat-hmac-comparison-v1';

async function constantTimeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(HMAC_COMPARISON_LABEL),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign('HMAC', hmacKey, encoder.encode(a)),
    crypto.subtle.sign('HMAC', hmacKey, encoder.encode(b)),
  ]);

  const hashA = new Uint8Array(digestA);
  const hashB = new Uint8Array(digestB);

  // Fixed-length XOR comparison — always 32 bytes, constant time
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) {
    diff |= (hashA[i] ?? 0) ^ (hashB[i] ?? 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Zod schema for RevenueCat webhook payload
// ---------------------------------------------------------------------------

const revenuecatWebhookSchema = z.object({
  api_version: z.string().optional(),
  event: z.object({
    id: z.string(),
    type: z.string(),
    app_user_id: z.string(),
    original_app_user_id: z.string().optional(),
    product_id: z.string().optional(),
    entitlement_ids: z.array(z.string()).optional(),
    period_type: z.string().optional(),
    purchased_at_ms: z.number().optional(),
    expiration_at_ms: z.number().optional(),
    store: z.string().optional(),
    environment: z.string().optional(),
    is_family_share: z.boolean().optional(),
    transferred_from: z.array(z.string()).optional(),
    transferred_to: z.array(z.string()).optional(),
    new_product_id: z.string().optional(),
    cancel_reason: z.string().optional(),
    grace_period_expiration_at_ms: z.number().optional(),
    transaction_id: z.string().optional(),
    store_transaction_id: z.string().optional(),
    /** BD-01: Event timestamp for ordering-based idempotency. */
    event_timestamp_ms: z.number().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const revenuecatWebhookRoute = new Hono<{
  Bindings: {
    REVENUECAT_WEBHOOK_SECRET?: string;
    SUBSCRIPTION_KV?: KVNamespace;
    ENVIRONMENT?: string;
    // [CUT-B3 / WI-693] Identity-foundation cutover flag — selects the v2
    // subscription-store handlers. 'false'/unset in every deployed env.
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    db: Database;
  };
}>().post('/revenuecat/webhook', async (c) => {
  // [CUT-B3 / WI-693] Resolve the handler bundle once (legacy vs v2) — the seam.
  const handlers = getRevenuecatWebhookHandlers(c.env);
  // Validate Authorization Bearer header
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return apiError(
      c,
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Missing or invalid Authorization header',
    );
  }

  const token = authHeader.slice(7);
  const webhookSecret = c.env.REVENUECAT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // [CR-2E.8] Structured log for missing credential — queryable in Logpush
    logger.error(
      '[revenuecat] REVENUECAT_WEBHOOK_SECRET is not configured — webhook rejected',
    );
    return apiError(
      c,
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Invalid webhook authorization',
    );
  }

  if (!(await constantTimeCompare(token, webhookSecret))) {
    return apiError(
      c,
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Invalid webhook authorization',
    );
  }

  // Parse and validate webhook payload
  // [BUG-835] Malformed JSON body must surface as 400, not 500. RevenueCat
  // treats any non-2xx as transient and retries for ~72h; a SyntaxError thrown
  // from c.req.json() produced a 500 and a 3-day retry storm against the
  // worker. A malformed body is permanently bad — ack with 400 so RC stops.
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch (err) {
    logger.error('[revenuecat-webhook] malformed JSON body — rejecting 400', {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(
      err instanceof Error
        ? err
        : new Error('RevenueCat webhook malformed JSON body'),
      {
        extra: {
          context: 'revenuecat.webhook.malformed_json',
        },
      },
    );
    return apiError(c, 400, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body');
  }
  const parsed = revenuecatWebhookSchema.safeParse(rawBody);

  if (!parsed.success) {
    return apiError(
      c,
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid webhook payload',
      parsed.error.flatten(),
    );
  }

  const { event } = parsed.data;

  // [WI-170 / DS-081] Production SANDBOX events must be rejected immediately
  // after payload validation, before account lookup, idempotency checks, free
  // subscription provisioning, handler dispatch, KV writes, or any other
  // billing-state mutation.
  if (event.environment === 'SANDBOX' && c.env.ENVIRONMENT === 'production') {
    logger.warn(
      '[revenuecat] Rejected SANDBOX webhook event in production environment',
      {
        eventType: event.type,
        eventId: event.id,
      },
    );
    return c.json({
      received: true,
      skipped: true,
      reason: 'sandbox_in_production',
    });
  }

  const db = c.get('db');
  const kv = c.env.SUBSCRIPTION_KV;

  // Resolve account — reject if the app_user_id cannot be mapped to an account
  const accountId = await handlers.resolveAccountId(db, event.app_user_id);
  if (!accountId) {
    // [SEC-11] appUserId is a Clerk pseudonymous identifier — GDPR data minimisation
    // requires it is NOT sent to Sentry (third-party processor). eventId + eventType
    // are sufficient for triage without PII exposure.
    logger.error('[revenuecat-webhook] Unresolvable app_user_id', {
      eventType: event.type,
      eventId: event.id,
    });
    captureException(new Error('Unresolvable RevenueCat app_user_id'), {
      extra: {
        eventType: event.type,
        eventId: event.id,
        // appUserId intentionally omitted — GDPR data minimisation [SEC-11]
      },
    });
    return c.json({ received: true, error: 'Unknown app_user_id' }, 200);
  }

  // Idempotency: skip already-processed events (BD-01: timestamp-based ordering)
  const alreadyProcessed = await handlers.isRevenuecatEventProcessed(
    db,
    accountId,
    event.id,
    event.event_timestamp_ms,
  );
  // [BD-01 ordering exemptions]
  // - BILLING_ISSUE: a re-delivered payment-failure must still re-assert
  //   past_due even if a newer subscription event already advanced the
  //   timestamp watermark.
  // - NON_RENEWING_PURCHASE (top-up): the ordering watermark
  //   (lastRevenuecatEventTimestampMs) is only advanced by SUBSCRIPTION
  //   events, never by top-ups. An out-of-order / retried top-up that arrives
  //   AFTER a later subscription event would otherwise be silently dropped
  //   here and the user never receives the paid credits. Top-ups carry their
  //   own per-transaction-ID idempotency (purchaseTopUpCredits uses
  //   INSERT ... ON CONFLICT DO NOTHING on revenuecatTransactionId), which is
  //   the correct dedup boundary — so exempting them from the timestamp skip
  //   is safe and required for correctness.
  const exemptFromOrderingSkip =
    event.type === 'BILLING_ISSUE' || event.type === 'NON_RENEWING_PURCHASE';
  if (alreadyProcessed && !exemptFromOrderingSkip) {
    return c.json({ received: true, skipped: true });
  }

  // Non-production SANDBOX events continue through the normal webhook flow so
  // staging/dev can exercise RevenueCat QA paths.
  if (event.environment === 'SANDBOX') {
    logger.warn(
      '[revenuecat] Received SANDBOX webhook event — verify this is intentional',
      {
        eventType: event.type,
        eventId: event.id,
        accountId,
      },
    );
  }

  // [CR-049] Events older than RevenueCat's normal retry window are suspicious,
  // but not automatically invalid: delayed purchase/renewal/expiration events
  // can repair entitlement state. Ordering-based idempotency above is the guard
  // against stale retries overwriting newer subscription state.
  const eventAgeMs =
    event.event_timestamp_ms === undefined
      ? undefined
      : Date.now() - event.event_timestamp_ms;
  if (
    eventAgeMs !== undefined &&
    eventAgeMs > LATE_REVENUECAT_EVENT_OBSERVATION_MS
  ) {
    logger.warn(
      '[revenuecat] Late event observed; processing after idempotency',
      {
        eventType: event.type,
        eventId: event.id,
        eventAgeMs,
      },
    );
  }

  await handlers.ensureFreeSubscription(db, accountId);

  // Dispatch to event-specific handler
  switch (event.type) {
    case 'INITIAL_PURCHASE':
      await handlers.handleInitialPurchase(db, kv, event);
      break;
    case 'RENEWAL':
      await handlers.handleRenewal(db, kv, event);
      break;
    case 'CANCELLATION':
      await handlers.handleCancellation(db, kv, event);
      break;
    case 'EXPIRATION':
      await handlers.handleExpiration(db, kv, event);
      break;
    case 'BILLING_ISSUE':
      await handlers.handleBillingIssue(db, kv, event);
      break;
    case 'SUBSCRIBER_ALIAS':
      await handlers.handleSubscriberAlias(db, kv, event);
      break;
    case 'PRODUCT_CHANGE':
      await handlers.handleProductChange(db, kv, event);
      break;
    case 'UNCANCELLATION':
      await handlers.handleUncancellation(db, kv, event);
      break;
    case 'NON_RENEWING_PURCHASE': {
      const result = await handlers.handleNonRenewingPurchase(db, kv, event);
      if (result) {
        return c.json(result.body, result.status as ContentfulStatusCode);
      }
      break;
    }

    default:
      // [audit-2026-05-30] New RevenueCat event types (e.g. a future
      // FAMILY_SHARE_REVOKED, GRACE_PERIOD_ENDED) must surface — silent 200
      // acknowledgement would let real entitlement changes go unhandled.
      // Silent recovery is banned (AGENTS.md); escalate via logger + Sentry.
      // Ack with 200 because hard-failing would loop RevenueCat forever on a
      // known-additive event.
      logger.warn(
        '[revenuecat-webhook] unhandled event type — acknowledged, no handler',
        {
          eventType: (event as { type?: string }).type,
          eventId: (event as { id?: string }).id,
        },
      );
      captureException(
        new Error(
          `Unhandled RevenueCat webhook event type: ${(event as { type?: string }).type ?? 'unknown'}`,
        ),
        {
          extra: {
            context: 'revenuecat.webhook.unhandled_event_type',
            eventType: (event as { type?: string }).type,
            eventId: (event as { id?: string }).id,
          },
        },
      );
      break;
  }

  return c.json({ received: true });
});
