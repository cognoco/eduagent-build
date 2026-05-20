// ---------------------------------------------------------------------------
// safeRefreshKvCache — non-throwing wrapper around KV cache refresh for
// billing webhooks (Stripe + RevenueCat).
//
// The cache refresh is an observability/optimization step, NOT critical to
// the webhook's contract. If KV (or the DB lookups feeding it) is down, the
// failure must be captured to Sentry but MUST NOT propagate to the response —
// otherwise the webhook returns 5xx and Stripe/RevenueCat retry the same
// event for up to 72 hours, creating a retry storm during a KV outage.
//
// Modeled after safeSend() in services/safe-non-core.ts.
// See: [CR-2026-05-19-H6]
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { getSubscriptionByAccountId, getQuotaPool } from './billing';
import { writeSubscriptionStatus, type CachedSubscriptionStatus } from './kv';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

/**
 * Refresh the KV-cached subscription status for an account, capturing any
 * failure to Sentry instead of throwing. Silently skips if the KV namespace
 * is not bound (dev/test) or the subscription row is missing.
 *
 * Webhook handlers (Stripe / RevenueCat) MUST use this helper rather than
 * an unguarded direct call — a KV outage during a real Stripe event must
 * not cause the route to return 5xx (which would trigger a 72h retry storm
 * from Stripe / RevenueCat).
 *
 * @param surface  Identifier for Sentry context (e.g. 'stripe.webhook.handleSubscriptionEvent').
 * @param context  Extra structured fields for Sentry (eventId, etc.).
 */
export async function safeRefreshKvCache(
  kv: KVNamespace | undefined,
  db: Database,
  accountId: string,
  surface: string,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!kv) return;

  try {
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
  } catch (err) {
    captureException(err, {
      extra: {
        surface,
        kind: 'kv-cache-refresh',
        accountId,
        ...context,
      },
    });
    logger.error('[safe-refresh-kv-cache] cache refresh failed', {
      surface,
      accountId,
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });
  }
}
