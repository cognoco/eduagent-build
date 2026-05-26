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
import {
  ensureFreeSubscription,
  isRevenuecatEventProcessed,
} from '../services/billing';
import {
  handleInitialPurchase,
  handleRenewal,
  handleCancellation,
  handleExpiration,
  handleBillingIssue,
  handleSubscriberAlias,
  handleProductChange,
  handleNonRenewingPurchase,
  handleUncancellation,
  resolveAccountId,
} from '../services/billing/revenuecat-webhook-handler';
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
  };
  Variables: {
    db: Database;
  };
}>().post('/revenuecat/webhook', async (c) => {
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
  const rawBody = await c.req.json();
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
  const db = c.get('db');
  const kv = c.env.SUBSCRIPTION_KV;

  // Resolve account — reject if the app_user_id cannot be mapped to an account
  const accountId = await resolveAccountId(db, event.app_user_id);
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
  const alreadyProcessed = await isRevenuecatEventProcessed(
    db,
    accountId,
    event.id,
    event.event_timestamp_ms,
  );
  if (alreadyProcessed && event.type !== 'BILLING_ISSUE') {
    return c.json({ received: true, skipped: true });
  }

  // [CR-2026-05-19-H6/H7] SANDBOX guard MUST run before ensureFreeSubscription
  // so that sandbox-in-prod events do not provision subscription rows / quota
  // pools for accounts that should not have them in production. Ordering:
  // resolveAccountId → isRevenuecatEventProcessed (idempotency) → SANDBOX guard
  // → ensureFreeSubscription → event-type dispatch.
  if (event.environment === 'SANDBOX') {
    if (c.env.ENVIRONMENT === 'production') {
      logger.warn(
        '[revenuecat] Rejected SANDBOX webhook event in production environment',
        {
          eventType: event.type,
          eventId: event.id,
          accountId,
        },
      );
      return c.json({
        received: true,
        skipped: true,
        reason: 'sandbox_in_production',
      });
    }
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

  await ensureFreeSubscription(db, accountId);

  // Dispatch to event-specific handler
  switch (event.type) {
    case 'INITIAL_PURCHASE':
      await handleInitialPurchase(db, kv, event);
      break;
    case 'RENEWAL':
      await handleRenewal(db, kv, event);
      break;
    case 'CANCELLATION':
      await handleCancellation(db, kv, event);
      break;
    case 'EXPIRATION':
      await handleExpiration(db, kv, event);
      break;
    case 'BILLING_ISSUE':
      await handleBillingIssue(db, kv, event);
      break;
    case 'SUBSCRIBER_ALIAS':
      await handleSubscriberAlias(db, kv, event);
      break;
    case 'PRODUCT_CHANGE':
      await handleProductChange(db, kv, event);
      break;
    case 'UNCANCELLATION':
      await handleUncancellation(db, kv, event);
      break;
    case 'NON_RENEWING_PURCHASE': {
      const result = await handleNonRenewingPurchase(db, kv, event);
      if (result) {
        return c.json(result.body, result.status as ContentfulStatusCode);
      }
      break;
    }
  }

  return c.json({ received: true });
});
