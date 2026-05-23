// ---------------------------------------------------------------------------
// RevenueCat Webhook Route — Epic 9
// NOT behind Clerk auth — validates Authorization Bearer header against
// REVENUECAT_WEBHOOK_SECRET.
// Dispatches subscription lifecycle events to billing service + KV.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { ERROR_CODES } from '@eduagent/schemas';
import { apiError } from '../errors';
import {
  getSubscriptionByAccountId,
  ensureFreeSubscription,
  isRevenuecatEventProcessed,
  updateSubscriptionFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
  updateQuotaPoolLimit,
  transitionToExtendedTrial,
  purchaseTopUpCredits,
} from '../services/billing';
import { findAccountByClerkId } from '../services/account';
import { getTierConfig } from '../services/subscription';
import { safeRefreshKvCache } from '../services/safe-refresh-kv-cache';
import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';
import { safeSend } from '../services/safe-non-core';

const logger = createLogger();
import { EXTENDED_TRIAL_MONTHLY_EQUIVALENT } from '../services/trial';
import { inngest } from '../inngest/client';
import type { Database } from '@eduagent/database';
import type { SubscriptionStatus } from '@eduagent/schemas';

export const LATE_REVENUECAT_EVENT_OBSERVATION_MS = 48 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Timing-safe string comparison (prevents timing attacks on webhook secret)
// ---------------------------------------------------------------------------

/**
 * BS-01: HMAC-based constant-time comparison.
 * Both inputs are hashed with SHA-256 HMAC (using a static key) before
 * comparison, producing fixed-length 32-byte digests regardless of input
 * length. This eliminates the length-leak timing side-channel that exists
 * when comparing raw strings of different lengths.
 *
 * Uses SubtleCrypto (available in Cloudflare Workers) for proper HMAC.
 */
async function constantTimeCompare(
  a: string,
  b: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
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

type RevenueCatWebhookPayload = z.infer<typeof revenuecatWebhookSchema>;

// ---------------------------------------------------------------------------
// Product ID mapping
// ---------------------------------------------------------------------------

const PRODUCT_TIER_MAP: Record<string, 'plus' | 'family' | 'pro'> = {
  // iOS products
  'com.eduagent.plus.monthly': 'plus',
  'com.eduagent.plus.yearly': 'plus',
  'com.eduagent.family.monthly': 'family',
  'com.eduagent.family.yearly': 'family',
  'com.eduagent.pro.monthly': 'pro',
  'com.eduagent.pro.yearly': 'pro',
  // Android products (same naming convention)
  'com.eduagent.plus.monthly.android': 'plus',
  'com.eduagent.plus.yearly.android': 'plus',
  'com.eduagent.family.monthly.android': 'family',
  'com.eduagent.family.yearly.android': 'family',
  'com.eduagent.pro.monthly.android': 'pro',
  'com.eduagent.pro.yearly.android': 'pro',
};

/**
 * Maps consumable product IDs to the number of top-up credits granted.
 */
const CONSUMABLE_PRODUCT_CREDITS: Record<string, number> = {
  'com.eduagent.topup.500': 500,
  'com.eduagent.topup.500.android': 500,
};

/**
 * Returns the credit amount for a consumable product ID, or null if not a top-up product.
 */
function getTopUpCreditsForProduct(
  productId: string | undefined,
): number | null {
  if (!productId) return null;
  return CONSUMABLE_PRODUCT_CREDITS[productId] ?? null;
}

/**
 * Extracts the tier from a product ID using the product-to-tier map.
 * [BUG-444] The regex fallback was removed — it granted entitlement for ANY
 * product matching `com.eduagent.<tier>.*` prefix, including future trial-only,
 * marketing, or test products not in the authoritative PRODUCT_TIER_MAP.
 * Unknown product_ids now hit the Sentry escalation path in callers.
 */
function extractTierFromProductId(
  productId: string | undefined,
): ('plus' | 'family' | 'pro') | null {
  if (!productId) return null;

  // Authoritative lookup only — no regex fallback.
  // Unknown products must be added to PRODUCT_TIER_MAP explicitly.
  return PRODUCT_TIER_MAP[productId] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a RevenueCat app_user_id to an internal account ID.
 * RevenueCat app_user_id is set to the Clerk user ID via Purchases.logIn().
 */
async function resolveAccountId(
  db: Database,
  appUserId: string,
): Promise<string | null> {
  // RevenueCat anonymous IDs start with $ — skip them
  if (appUserId.startsWith('$')) return null;

  const account = await findAccountByClerkId(db, appUserId);
  return account?.id ?? null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleInitialPurchase(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const tier = extractTierFromProductId(event.product_id);
  if (!tier) {
    // [FIX-API-REVENUECAT] Unknown product_id — capture to Sentry so new
    // products added to RevenueCat but not to PRODUCT_TIER_MAP are surfaced
    // immediately rather than silently dropping the purchase event.
    captureException(
      new Error('Unknown RevenueCat product_id in INITIAL_PURCHASE'),
      {
        extra: { productId: event.product_id, eventId: event.id },
      },
    );
    return;
  }

  // RevenueCat sets period_type to "TRIAL" for introductory offer / free trial
  const isTrial = event.period_type === 'TRIAL';

  const sub = await activateSubscriptionFromRevenuecat(
    db,
    accountId,
    tier,
    event.id,
    {
      currentPeriodStart: event.purchased_at_ms
        ? new Date(event.purchased_at_ms).toISOString()
        : undefined,
      currentPeriodEnd: event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : undefined,
      revenuecatOriginalAppUserId: event.original_app_user_id,
      isTrial,
      trialEndsAt:
        isTrial && event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : undefined,
      eventTimestampMs: event.event_timestamp_ms,
    },
  );

  await safeRefreshKvCache(
    kv,
    db,
    sub.accountId,
    'revenuecat.webhook.handleInitialPurchase',
    {
      eventId: event.id,
    },
  );
}

async function handleRenewal(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const eventTier = extractTierFromProductId(event.product_id);

  // Read existing subscription to detect tier changes and preserve trialEndsAt.
  // [BUG-453] Only pass tier to the update when it actually changed — RC can
  // send RENEWAL for a different product, silently changing tier without going
  // through PRODUCT_CHANGE.
  const existingSub = await getSubscriptionByAccountId(db, accountId);
  const tierChanged = eventTier !== null && existingSub?.tier !== eventTier;

  // [BUG-453] RENEWAL during a trial period (period_type === 'TRIAL') must NOT
  // clear trialEndsAt — the trial is still active. Only wipe it on conversion
  // (period_type !== 'TRIAL').
  const isTrial = event.period_type === 'TRIAL';

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'active',
    // Only include tier when the event actually signals a different product tier.
    // Omitting the key entirely prevents any DB write to the tier column.
    ...(tierChanged && eventTier ? { tier: eventTier } : {}),
    currentPeriodStart: event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : undefined,
    currentPeriodEnd: event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : undefined,
    cancelledAt: null,
    // Preserve trialEndsAt during trial-period renewals by omitting it;
    // clear it on conversion to active (period_type !== 'TRIAL').
    ...(isTrial ? {} : { trialEndsAt: null }),
  });

  // Only update quota pool when the tier actually changed.
  if (updated && tierChanged && eventTier) {
    const tierConfig = getTierConfig(eventTier);
    await updateQuotaPoolLimit(
      db,
      updated.id,
      tierConfig.monthlyQuota,
      tierConfig.dailyLimit,
    );
  }

  if (updated) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleRenewal',
      {
        eventId: event.id,
      },
    );
  }
}

async function handleCancellation(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  // [BUG-445] If the sub was already past_due when the user cancelled, DO NOT
  // flip it back to 'active' — that would erase the payment-failure signal.
  // Only promote to 'active' when the current status is active or trial (still
  // entitled). past_due stays past_due; cancelledAt records the intent.
  const existingSub = await getSubscriptionByAccountId(db, accountId);
  const targetStatus: SubscriptionStatus =
    existingSub?.status === 'past_due' ? 'past_due' : 'active';

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    // Keep the entitlement active (or past_due) until period end so mobile can
    // render the correct "Cancelling" state from cancelledAt + status.
    status: targetStatus,
    cancelledAt: new Date().toISOString(),
  });

  if (updated) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleCancellation',
      {
        eventId: event.id,
      },
    );
  }
}

async function handleExpiration(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  // Check if this is a trial expiration — use period_type from the event
  // as the authoritative signal (safe regardless of webhook delivery order).
  // Fallback to DB status only when period_type is absent.
  const existingSub = await getSubscriptionByAccountId(db, accountId);
  const isTrialExpiration =
    event.period_type === 'TRIAL' ||
    (event.period_type == null && existingSub?.status === 'trial');

  if (isTrialExpiration && existingSub) {
    // Trial expiration triggers the reverse trial soft landing:
    // Days 15-28: extended access at 450 questions/month (15/day)
    // The daily trial-expiry Inngest function handles Day 29+ transition to free.
    await transitionToExtendedTrial(
      db,
      existingSub.id,
      EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
    );

    // Record the event for idempotency
    await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
      eventId: event.id,
      eventTimestampMs: event.event_timestamp_ms,
      // transitionToExtendedTrial already set status to 'expired' and tier to 'free'
      // but we need to record the eventId without overwriting those values
    });

    await safeRefreshKvCache(
      kv,
      db,
      accountId,
      'revenuecat.webhook.handleExpiration.trial',
      {
        eventId: event.id,
      },
    );
    return;
  }

  // Non-trial expiration: downgrade to free tier immediately
  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'expired',
    tier: 'free',
    cancelledAt: new Date().toISOString(),
  });

  if (updated) {
    const freeConfig = getTierConfig('free');
    await updateQuotaPoolLimit(
      db,
      updated.id,
      freeConfig.monthlyQuota,
      freeConfig.dailyLimit,
    );
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleExpiration',
      {
        eventId: event.id,
      },
    );
  }
}

async function handleBillingIssue(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'past_due',
  });

  if (updated) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleBillingIssue',
      {
        eventId: event.id,
      },
    );

    // core-send: payment-failed alert - billing observability cannot be silent.
    // A swallowed dispatch leaves the failed payment unobserved by alerting.
    await inngest.send({
      name: 'app/payment.failed',
      data: {
        subscriptionId: updated.id,
        accountId: updated.accountId,
        source: 'revenuecat',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

async function handleSubscriberAlias(
  db: Database,
  _kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<void> {
  // SUBSCRIBER_ALIAS: RevenueCat merged two subscriber records.
  // [BUG-728 / SEC-12] Routed through the structured logger so the Clerk
  // user IDs land as JSON `context` fields the log pipeline can index and
  // redact uniformly, rather than as raw console.info args that bypass the
  // pipeline's PII handling.
  logger.info('[revenuecat] SUBSCRIBER_ALIAS event', {
    appUserId: event.app_user_id,
    transferredFrom: event.transferred_from,
    transferredTo: event.transferred_to,
  });

  // [BUG-449] Full merge implementation deferred — escalation + event dispatch
  // unblock visibility. TODO(BUG-449): full merge implementation deferred —
  // escalation + event dispatch unblock visibility.
  //
  // When transferred_from has an existing subscription, credits/entitlements
  // on that app_user_id are NOT yet migrated to the new identity. Surface
  // this via Sentry (high severity) and dispatch an Inngest event so a future
  // migration worker can consume it without data loss.
  const transferredFrom = event.transferred_from ?? [];
  if (transferredFrom.length > 0) {
    // Resolve the transferred_from app_user_id(s) to check for existing subs
    for (const fromUserId of transferredFrom) {
      // Skip anonymous IDs — these are the normal alias case (anon→identified)
      // where no subscription can be held on the anon side.
      if (fromUserId.startsWith('$')) continue;

      const fromAccount = await findAccountByClerkId(db, fromUserId);
      if (!fromAccount) continue;

      const fromSub = await getSubscriptionByAccountId(db, fromAccount.id);
      if (!fromSub) continue;

      // A subscription exists on the transferred_from identity — this is the
      // revenue-loss scenario. Escalate immediately.
      captureException(
        new Error(
          'SUBSCRIBER_ALIAS: transferred_from has active subscription — merge not implemented',
        ),
        {
          extra: {
            tag: 'revenuecat.alias.unhandled',
            severity: 'high',
            eventId: event.id,
            fromAppUserId: fromUserId,
            toAppUserId: event.app_user_id,
            fromSubscriptionId: fromSub.id,
            fromSubscriptionTier: fromSub.tier,
            fromSubscriptionStatus: fromSub.status,
          },
        },
      );

      // Dispatch alias_received so a future migration worker can consume it.
      await safeSend(
        () =>
          inngest.send({
            name: 'app/billing.alias_received',
            data: {
              eventId: event.id,
              fromAppUserId: fromUserId,
              toAppUserId: event.app_user_id,
              fromAccountId: fromAccount.id,
              fromSubscriptionId: fromSub.id,
              timestamp: new Date().toISOString(),
            },
          }),
        'revenuecat.alias_received',
        { eventId: event.id, fromAppUserId: fromUserId },
      );
    }
  }
}

async function handleProductChange(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const newTier = extractTierFromProductId(event.new_product_id);
  if (!newTier) {
    // [FIX-API-REVENUECAT] Unknown new_product_id — capture to Sentry so product
    // map mismatches surface before they cause silent subscription-change drops.
    captureException(
      new Error('Unknown RevenueCat new_product_id in PRODUCT_CHANGE'),
      {
        extra: { newProductId: event.new_product_id, eventId: event.id },
      },
    );
    return;
  }

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    tier: newTier,
    status: 'active',
  });

  if (updated) {
    const tierConfig = getTierConfig(newTier);
    await updateQuotaPoolLimit(
      db,
      updated.id,
      tierConfig.monthlyQuota,
      tierConfig.dailyLimit,
    );
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleProductChange',
      {
        eventId: event.id,
      },
    );
  }
}

async function handleNonRenewingPurchase(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return null;

  const credits = getTopUpCreditsForProduct(event.product_id);
  if (credits === null) return null;

  // Resolve the transaction ID for idempotency (prefer store_transaction_id)
  const transactionId =
    event.store_transaction_id ?? event.transaction_id ?? null;

  // [BUG-451] Malformed payload (no transaction ID) → 200 so RevenueCat does
  // NOT retry. Returning 400 guarantees ~3 days of retry spam because RC
  // treats any non-2xx as transient. The payload is permanently malformed
  // (both fields absent simultaneously is a provider-side bug, not a
  // transient outage), so we ack, skip, and capture to Sentry for ops review.
  if (!transactionId) {
    logger.error('[revenuecat] NON_RENEWING_PURCHASE missing transaction ID', {
      eventId: event.id,
      productId: event.product_id,
    });
    captureException(
      new Error('RevenueCat NON_RENEWING_PURCHASE missing transaction ID'),
      {
        extra: {
          eventId: event.id,
          productId: event.product_id,
          category: 'revenuecat.malformed_payload',
        },
      },
    );
    return {
      status: 200,
      body: { received: true, skipped: 'missing_transaction_id' },
    };
  }

  // Look up the account's subscription to verify tier eligibility
  const sub = await getSubscriptionByAccountId(db, accountId);
  if (!sub || sub.tier === 'free') {
    return {
      status: 403,
      body: {
        received: true,
        error: 'Top-ups are not available on the free tier',
      },
    };
  }

  // BS-02: Atomic idempotent credit grant — purchaseTopUpCredits uses
  // INSERT ... ON CONFLICT DO NOTHING on the unique revenuecatTransactionId
  // index. Returns null when credit was already granted (duplicate txn).
  const granted = await purchaseTopUpCredits(
    db,
    sub.id,
    credits,
    new Date(),
    transactionId,
  );

  if (!granted) {
    // [A-22] Distinguish intentional idempotency skip from silent failure.
    // Log with eventId + transactionId so ops can query how often this fires.
    logger.info(
      '[revenuecat] NON_RENEWING_PURCHASE duplicate skipped — credits already granted',
      { eventId: event.id, transactionId, accountId },
    );
    return null;
  }

  await safeRefreshKvCache(
    kv,
    db,
    accountId,
    'revenuecat.webhook.handleNonRenewingPurchase',
    {
      eventId: event.id,
      transactionId,
    },
  );

  return null;
}

async function handleUncancellation(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event'],
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'active',
    cancelledAt: null,
  });

  if (updated) {
    await safeRefreshKvCache(
      kv,
      db,
      updated.accountId,
      'revenuecat.webhook.handleUncancellation',
      {
        eventId: event.id,
      },
    );
  }
}

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

  if (
    !(await constantTimeCompare(
      token,
      webhookSecret,
      'eduagent-revenuecat-hmac-comparison-v1',
    ))
  ) {
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
  if (alreadyProcessed) {
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
