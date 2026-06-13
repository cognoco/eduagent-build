// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 KV cache refresh
//
// v2 twin of safe-refresh-kv-cache.ts. Same non-throwing observability
// contract (a KV/DB failure is captured to Sentry, never propagated — a 5xx
// here would trigger a 72h Stripe/RevenueCat retry storm). Only the three
// subscription reads are re-pointed at the v2 store: getSubscriptionByAccountIdV2,
// getQuotaPoolV2, getEffectiveAccessForSubscriptionV2. The `accountId` param is
// the organization id under the flag (= account.id by the reseed), so the KV key
// is unchanged.
//
// Flag-gated: reachable only via the v2 webhook handlers. Legacy
// safe-refresh-kv-cache.ts stays byte-identical.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import {
  writeSubscriptionStatus,
  type CachedSubscriptionStatus,
} from '../../kv';
import { captureException, captureMessage } from '../../sentry';
import { createLogger } from '../../logger';
import {
  getSubscriptionByAccountIdV2,
  getQuotaPoolV2,
} from './subscription-core-v2';
import { getEffectiveAccessForSubscriptionV2 } from './access-v2';

const logger = createLogger();

/**
 * v2 KV cache refresh. See the legacy module header for the non-throwing
 * rationale; this is the byte-for-byte same control flow with the three reads
 * re-pointed at the v2 store.
 */
export async function safeRefreshKvCacheV2(
  kv: KVNamespace | undefined,
  db: Database,
  organizationId: string,
  surface: string,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!kv) {
    // [BUG-794] Missing KV in a deployed env is a silent-recovery hazard —
    // emit a queryable signal (captureMessage no-ops without a DSN).
    captureMessage(
      '[safe-refresh-kv-cache] SUBSCRIPTION_KV not bound — cache refresh skipped',
      {
        level: 'warning',
        extra: {
          surface,
          accountId: organizationId,
          kind: 'kv-cache-refresh.missing-kv',
          ...context,
        },
        tags: { surface: 'billing.kv' },
      },
    );
    return;
  }

  try {
    const sub = await getSubscriptionByAccountIdV2(db, organizationId);
    if (!sub) {
      captureMessage(
        '[safe-refresh-kv-cache] no subscription row for account — cache refresh skipped',
        {
          level: 'warning',
          extra: {
            surface,
            accountId: organizationId,
            kind: 'kv-cache-refresh.missing-subscription',
            ...context,
          },
          tags: { surface: 'billing.kv' },
        },
      );
      return;
    }

    const quota = await getQuotaPoolV2(db, sub.id);
    const access = await getEffectiveAccessForSubscriptionV2(db, sub.id);

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

    await writeSubscriptionStatus(kv, organizationId, cached);
  } catch (err) {
    captureException(err, {
      extra: {
        surface,
        kind: 'kv-cache-refresh',
        accountId: organizationId,
        ...context,
      },
    });
    logger.error('[safe-refresh-kv-cache] cache refresh failed', {
      surface,
      accountId: organizationId,
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });
  }
}
