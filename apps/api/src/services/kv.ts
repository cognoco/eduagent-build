// ---------------------------------------------------------------------------
// Workers KV Helpers — Sprint 9 Phase 1
// Subscription status cache with 24h TTL
// ---------------------------------------------------------------------------

import { z } from 'zod';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';

export interface CachedSubscriptionStatus {
  subscriptionId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  monthlyLimit: number;
  usedThisMonth: number;
}

const cachedSubscriptionStatusSchema = z.object({
  subscriptionId: z.string(),
  tier: z.string(),
  status: z.string(),
  monthlyLimit: z.number(),
  usedThisMonth: z.number(),
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
  status: CachedSubscriptionStatus
): Promise<void> {
  await kv.put(subscriptionKey(accountId), JSON.stringify(status), {
    expirationTtl: TTL_SECONDS,
  });
}

/**
 * Reads subscription status from KV.
 * Returns null on cache miss — caller should fall back to DB.
 */
export async function readSubscriptionStatus(
  kv: KVNamespace,
  accountId: string
): Promise<CachedSubscriptionStatus | null> {
  const raw = await kv.get(subscriptionKey(accountId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = cachedSubscriptionStatusSchema.parse(JSON.parse(raw));
    return parsed as CachedSubscriptionStatus;
  } catch {
    // Cache corruption — treat as miss
    return null;
  }
}
