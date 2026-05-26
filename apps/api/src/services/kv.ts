// ---------------------------------------------------------------------------
// Workers KV Helpers — Sprint 9 Phase 1
// Subscription status cache with 24h TTL
// ---------------------------------------------------------------------------

import { z } from 'zod';
import {
  billingAccessSchema,
  subscriptionStatusSchema,
  subscriptionTierSchema,
  type BillingAccess,
  type SubscriptionTier,
  type SubscriptionStatus,
} from '@eduagent/schemas';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

export interface CachedSubscriptionStatus {
  subscriptionId: string;
  tier: SubscriptionTier;
  effectiveAccessTier: SubscriptionTier;
  billingAccess: BillingAccess;
  status: SubscriptionStatus;
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
}

const cachedSubscriptionStatusSchema = z.object({
  subscriptionId: z.string(),
  tier: subscriptionTierSchema,
  effectiveAccessTier: subscriptionTierSchema.optional(),
  billingAccess: billingAccessSchema.optional(),
  status: subscriptionStatusSchema,
  monthlyLimit: z.number(),
  usedThisMonth: z.number(),
  dailyLimit: z.number().nullable().optional(),
  usedToday: z.number().optional(),
});

/** 24 hours in seconds */
const TTL_SECONDS = 86400;

/** Key pattern: sub:{accountId} */
function subscriptionKey(accountId: string): string {
  return `sub:${accountId}`;
}

/**
 * Writes subscription status to KV with a 24h TTL.
 * Called after webhook updates and DB changes to keep the cache fresh.
 */
export async function writeSubscriptionStatus(
  kv: KVNamespace,
  accountId: string,
  status: CachedSubscriptionStatus,
): Promise<void> {
  await kv.put(subscriptionKey(accountId), JSON.stringify(status), {
    expirationTtl: TTL_SECONDS,
  });
}

/**
 * Deletes subscription status from KV. Used when authoritative state diverges
 * from cache (e.g. after `safeRefundQuota` undoes a decrement) and we cannot
 * recompute the post-refund counters cheaply — invalidate and let the next
 * request backfill from DB.
 *
 * KVNamespace.delete is idempotent: deleting a missing key is a no-op.
 */
export async function deleteSubscriptionStatus(
  kv: KVNamespace,
  accountId: string,
): Promise<void> {
  await kv.delete(subscriptionKey(accountId));
}

/**
 * Reads subscription status from KV.
 * Returns null on cache miss — caller should fall back to DB.
 */
export async function readSubscriptionStatus(
  kv: KVNamespace,
  accountId: string,
): Promise<CachedSubscriptionStatus | null> {
  const raw = await kv.get(subscriptionKey(accountId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = cachedSubscriptionStatusSchema.parse(JSON.parse(raw));
    return {
      ...parsed,
      effectiveAccessTier: (parsed.effectiveAccessTier ??
        parsed.tier) as SubscriptionTier,
      billingAccess: parsed.billingAccess ?? 'current',
      dailyLimit: parsed.dailyLimit ?? null,
      usedToday: parsed.usedToday ?? 0,
    } as CachedSubscriptionStatus;
  } catch (err) {
    // Cache corruption — treat as miss, but escalate so we can query frequency.
    logger.warn('[kv] subscription_status corruption — treating as miss', {
      event: 'kv.subscription_status.corruption',
      accountId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      tags: { surface: 'kv_subscription', reason: 'corruption' },
    });
    return null;
  }
}
