// ---------------------------------------------------------------------------
// RevenueCat Webhook Route — Epic 9
// NOT behind Clerk auth — validates Authorization Bearer header against
// REVENUECAT_WEBHOOK_SECRET.
// Dispatches subscription lifecycle events to billing service + KV.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { z } from 'zod';
import { ERROR_CODES } from '@eduagent/schemas';
import { apiError } from '../errors';
import { writeSubscriptionStatus } from '../services/kv';
import {
  getSubscriptionByAccountId,
  getQuotaPool,
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
import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';

const logger = createLogger({ level: 'info', environment: 'production' });
import { EXTENDED_TRIAL_MONTHLY_EQUIVALENT } from '../services/trial';
import { inngest } from '../inngest/client';
import type { Database } from '@eduagent/database';
import type { CachedSubscriptionStatus } from '../services/kv';
import type { SubscriptionStatus } from '@eduagent/schemas';

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
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
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
  productId: string | undefined
): number | null {
  if (!productId) return null;
  return CONSUMABLE_PRODUCT_CREDITS[productId] ?? null;
}

/**
 * Extracts the tier from a product ID using the product-to-tier map.
 * Falls back to parsing `com.eduagent.<tier>.<interval>` format.
 */
function extractTierFromProductId(
  productId: string | undefined
): ('plus' | 'family' | 'pro') | null {
  if (!productId) return null;

  // Direct lookup
  if (productId in PRODUCT_TIER_MAP) {
    return PRODUCT_TIER_MAP[productId] ?? null;
  }

  // Fallback: parse com.eduagent.<tier>.<interval>
  const match = productId.match(/^com\.eduagent\.(plus|family|pro)\./);
  if (match) {
    return match[1] as 'plus' | 'family' | 'pro';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Resolves a RevenueCat app_user_id to an internal account ID.
 * RevenueCat app_user_id is set to the Clerk user ID via Purchases.logIn().
 */
async function resolveAccountId(
  db: Database,
  appUserId: string
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
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const tier = extractTierFromProductId(event.product_id);
  if (!tier) return;

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
    }
  );

  await refreshKvCache(kv, db, sub.accountId);
}

async function handleRenewal(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const tier = extractTierFromProductId(event.product_id);

  // RENEWAL after a trial converts status to 'active' and clears trialEndsAt.
  // This handles both trial-to-paid conversion and regular renewal.
  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'active',
    tier: tier ?? undefined,
    currentPeriodStart: event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : undefined,
    currentPeriodEnd: event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : undefined,
    cancelledAt: null,
    trialEndsAt: null, // Clear trial end date on conversion / renewal
  });

  if (updated && tier) {
    const tierConfig = getTierConfig(tier);
    await updateQuotaPoolLimit(
      db,
      updated.id,
      tierConfig.monthlyQuota,
      tierConfig.dailyLimit
    );
  }

  if (updated) {
    await refreshKvCache(kv, db, updated.accountId);
  }
}

async function handleCancellation(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    // Keep the entitlement active until period end so mobile can render the
    // correct "Cancelling" state from cancelledAt + active status.
    status: 'active' as SubscriptionStatus,
    cancelledAt: new Date().toISOString(),
  });

  if (updated) {
    await refreshKvCache(kv, db, updated.accountId);
  }
}

async function handleExpiration(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event']
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
      EXTENDED_TRIAL_MONTHLY_EQUIVALENT
    );

    // Record the event for idempotency
    await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
      eventId: event.id,
      eventTimestampMs: event.event_timestamp_ms,
      // transitionToExtendedTrial already set status to 'expired' and tier to 'free'
      // but we need to record the eventId without overwriting those values
    });

    await refreshKvCache(kv, db, accountId);
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
      freeConfig.dailyLimit
    );
    await refreshKvCache(kv, db, updated.accountId);
  }
}

async function handleBillingIssue(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const updated = await updateSubscriptionFromRevenuecatWebhook(db, accountId, {
    eventId: event.id,
    eventTimestampMs: event.event_timestamp_ms,
    status: 'past_due',
  });

  if (updated) {
    await refreshKvCache(kv, db, updated.accountId);

    // Emit Inngest event for billing issue notification
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
  _db: Database,
  _kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  // SUBSCRIBER_ALIAS: RevenueCat merged two subscriber records.
  // Log for audit — no immediate action needed since we key by Clerk user ID.
  console.info('[revenuecat] SUBSCRIBER_ALIAS event', {
    appUserId: event.app_user_id,
    transferredFrom: event.transferred_from,
    transferredTo: event.transferred_to,
  });
}

async function handleProductChange(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return;

  const newTier = extractTierFromProductId(event.new_product_id);
  if (!newTier) return;

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
      tierConfig.dailyLimit
    );
    await refreshKvCache(kv, db, updated.accountId);
  }
}

async function handleNonRenewingPurchase(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event']
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) return null;

  const credits = getTopUpCreditsForProduct(event.product_id);
  if (credits === null) return null;

  // Resolve the transaction ID for idempotency (prefer store_transaction_id)
  const transactionId =
    event.store_transaction_id ?? event.transaction_id ?? null;

  // Reject if no transaction ID — without it we cannot guarantee idempotency
  // and webhook retries would grant duplicate credits.
  if (!transactionId) {
    console.error('[revenuecat] NON_RENEWING_PURCHASE missing transaction ID', {
      eventId: event.id,
      productId: event.product_id,
    });
    return {
      status: 400,
      body: { received: false, error: 'Missing transaction ID' },
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
    transactionId
  );

  if (!granted) {
    return null; // duplicate transaction — already granted, silently skip
  }

  await refreshKvCache(kv, db, accountId);

  return null;
}

async function handleUncancellation(
  db: Database,
  kv: KVNamespace | undefined,
  event: RevenueCatWebhookPayload['event']
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
    await refreshKvCache(kv, db, updated.accountId);
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const revenuecatWebhookRoute = new Hono<{
  Bindings: {
    REVENUECAT_WEBHOOK_SECRET?: string;
    SUBSCRIPTION_KV?: KVNamespace;
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
      'Missing or invalid Authorization header'
    );
  }

  const token = authHeader.slice(7);
  const webhookSecret = c.env.REVENUECAT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // [CR-2E.8] Structured log for missing credential — queryable in Logpush
    logger.error(
      '[revenuecat] REVENUECAT_WEBHOOK_SECRET is not configured — webhook rejected'
    );
    return apiError(
      c,
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Invalid webhook authorization'
    );
  }

  if (
    !(await constantTimeCompare(
      token,
      webhookSecret,
      'eduagent-revenuecat-hmac-comparison-v1'
    ))
  ) {
    return apiError(
      c,
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Invalid webhook authorization'
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
      parsed.error.flatten()
    );
  }

  const { event } = parsed.data;
  const db = c.get('db');
  const kv = c.env.SUBSCRIPTION_KV;

  // Resolve account — reject if the app_user_id cannot be mapped to an account
  const accountId = await resolveAccountId(db, event.app_user_id);
  if (!accountId) {
    console.error(
      `[revenuecat-webhook] Unresolvable app_user_id: ${event.app_user_id}, event: ${event.type}/${event.id}`
    );
    captureException(
      new Error(`Unresolvable RevenueCat app_user_id: ${event.app_user_id}`),
      {
        extra: {
          eventType: event.type,
          eventId: event.id,
          appUserId: event.app_user_id,
        },
      }
    );
    return c.json({ received: true, error: 'Unknown app_user_id' }, 200);
  }

  // Idempotency: skip already-processed events (BD-01: timestamp-based ordering)
  const alreadyProcessed = await isRevenuecatEventProcessed(
    db,
    accountId,
    event.id,
    event.event_timestamp_ms
  );
  if (alreadyProcessed) {
    return c.json({ received: true, skipped: true });
  }

  // Ensure free subscription exists for the account (auto-provisioning)
  await ensureFreeSubscription(db, accountId);

  // Warn in non-production environments when RevenueCat sends sandbox events.
  // Sandbox webhooks from test purchases should not mutate production data.
  if (event.environment === 'SANDBOX') {
    logger.warn(
      '[revenuecat] Received SANDBOX webhook event — verify this is intentional',
      {
        eventType: event.type,
        eventId: event.id,
        accountId,
      }
    );
  }

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
        return c.json(result.body, result.status as 400 | 403);
      }
      break;
    }
  }

  return c.json({ received: true });
});
