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
import {
  getEffectiveAccessForSubscription,
  getSubscriptionByAccountId,
  getQuotaPool,
} from './billing';
import { writeSubscriptionStatus, type CachedSubscriptionStatus } from './kv';
import { captureException, captureMessage } from './sentry';
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
  if (!kv) {
    // [BUG-794] The KV binding is legitimately absent in dev/test, but a
    // missing binding in staging/production means the subscription-status
    // cache silently stops refreshing while the DB-fallback path masks the
    // drift — a "silent recovery without escalation" the billing rules forbid.
    // captureMessage no-ops without a Sentry DSN (so this stays silent in
    // dev/test where there is no DSN) but in deployed envs it produces a
    // queryable signal so the missing-binding rate is visible within 24h.
    captureMessage(
      '[safe-refresh-kv-cache] SUBSCRIPTION_KV not bound — cache refresh skipped',
      {
        level: 'warning',
        extra: {
          surface,
          accountId,
          kind: 'kv-cache-refresh.missing-kv',
          ...context,
        },
        tags: { surface: 'billing.kv' },
      },
    );
    return;
  }

  try {
    const sub = await getSubscriptionByAccountId(db, accountId);
    if (!sub) {
      // [BUG-794] A refresh requested for an account with no subscription row
      // (e.g. a handler passing an unexpected account id after a mutation)
      // would otherwise no-op invisibly. Emit a queryable signal so the
      // caller-surface + account id are recoverable for triage, then skip.
      captureMessage(
        '[safe-refresh-kv-cache] no subscription row for account — cache refresh skipped',
        {
          level: 'warning',
          extra: {
            surface,
            accountId,
            kind: 'kv-cache-refresh.missing-subscription',
            ...context,
          },
          tags: { surface: 'billing.kv' },
        },
      );
      return;
    }

    const quota = await getQuotaPool(db, sub.id);
    const access = await getEffectiveAccessForSubscription(db, sub.id);

    const cached: CachedSubscriptionStatus = {
      subscriptionId: sub.id,
      tier: sub.tier,
      effectiveAccessTier: access?.effectiveAccessTier ?? sub.tier,
      billingAccess: access?.billingAccess ?? 'current',
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
