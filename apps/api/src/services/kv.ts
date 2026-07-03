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

// ---------------------------------------------------------------------------
// WI-1505 — Aggregate LLM traffic kill switch
//
// Per-request KV read at the routeAndCall/routeAndStream choke point
// (services/llm/router.ts) so an operator can stop or degrade learner-facing
// LLM traffic on the NEXT request without a mobile release or a Worker
// redeploy. Reuses SUBSCRIPTION_KV (no new namespace/binding needed) — see
// docs/runbooks/llm-kill-switch.md for the operator flip procedure.
// ---------------------------------------------------------------------------

/** Exported so callers/tests/the runbook reference the same literal key. */
export const LLM_KILL_SWITCH_KEY = 'llm:kill-switch';

/**
 * Writes (or clears) the aggregate LLM kill switch. `active: true` stores a
 * sentinel value; `active: false` deletes the key so a stale value can never
 * be misread as "on" — absence is the canonical "off" state.
 */
export async function writeLlmKillSwitch(
  kv: KVNamespace,
  active: boolean,
): Promise<void> {
  if (active) {
    await kv.put(LLM_KILL_SWITCH_KEY, '1');
  } else {
    await kv.delete(LLM_KILL_SWITCH_KEY);
  }
}

/**
 * Reads the aggregate LLM kill switch. Returns `false` (traffic continues)
 * on cache miss OR on a KV read error — a read failure must never itself
 * take down learner-facing traffic. The kill switch is an operator-triggered
 * override, not a safety invariant, so on ambiguity it fails OPEN ("keep
 * serving"), not closed.
 *
 * A read failure emits a structured, queryable `kv.llm_kill_switch.read_error`
 * log line — NOT a Sentry `captureException`. This path is LLM-routing infra,
 * not billing/auth/webhook code (where AGENTS.md bans silent recovery without
 * a Sentry/Inngest escalation), so the structured log is the appropriate and
 * sufficient signal; firing captureException here would also double Sentry
 * noise on every request (this runs in the global llmMiddleware) during any
 * transient KV blip.
 */
export async function readLlmKillSwitch(kv: KVNamespace): Promise<boolean> {
  try {
    const raw = await kv.get(LLM_KILL_SWITCH_KEY);
    return raw === '1';
  } catch (err) {
    logger.warn(
      '[kv] llm_kill_switch read failed — failing open (traffic continues)',
      {
        event: 'kv.llm_kill_switch.read_error',
        error: err instanceof Error ? err.message : String(err),
      },
    );
    return false;
  }
}
