// ---------------------------------------------------------------------------
// Metering Middleware — Sprint 9 Phase 4
// Enforces quota on LLM-consuming routes (session messages + streaming).
// Reads from KV cache first, falls back to DB, backfills KV on miss.
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import type { Database } from '@eduagent/database';
import { ERROR_CODES } from '@eduagent/schemas';
import type { SubscriptionTier } from '@eduagent/schemas';
import type { Account } from '../services/account';
import {
  getSubscriptionByAccountId,
  getQuotaPool,
  decrementQuota,
} from '../services/billing';
import { getTierConfig } from '../services/subscription';
import { checkQuota } from '../services/metering';
import {
  readSubscriptionStatus,
  writeSubscriptionStatus,
  type CachedSubscriptionStatus,
} from '../lib/kv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeteringEnv = {
  Bindings: { SUBSCRIPTION_KV?: KVNamespace };
  Variables: {
    db: Database;
    account: Account;
    subscriptionId: string;
  };
};

// ---------------------------------------------------------------------------
// LLM-consuming route patterns
// The middleware only applies to routes that consume LLM exchanges.
// ---------------------------------------------------------------------------

const LLM_ROUTE_PATTERNS = [
  /\/sessions\/[^/]+\/messages$/,
  /\/sessions\/[^/]+\/stream$/,
];

function isLlmRoute(path: string): boolean {
  return LLM_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}

// ---------------------------------------------------------------------------
// Upgrade options builder
// ---------------------------------------------------------------------------

function buildUpgradeOptions(
  currentTier: SubscriptionTier
): Array<{
  tier: 'plus' | 'family' | 'pro';
  monthlyQuota: number;
  priceMonthly: number;
}> {
  const tiers = ['plus', 'family', 'pro'] as const;
  return tiers
    .filter((t) => t !== currentTier)
    .map((t) => {
      const config = getTierConfig(t);
      return {
        tier: t,
        monthlyQuota: config.monthlyQuota,
        priceMonthly: config.priceMonthly,
      };
    });
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export const meteringMiddleware = createMiddleware<MeteringEnv>(
  async (c, next) => {
    // Only apply to LLM-consuming routes
    if (!isLlmRoute(c.req.path)) {
      await next();
      return;
    }

    // Must have an authenticated account
    const account = c.get('account');
    if (!account) {
      await next();
      return;
    }

    const db = c.get('db');
    const kv = c.env?.SUBSCRIPTION_KV;

    // 1. Try KV cache for fast quota check
    let cached: CachedSubscriptionStatus | null = null;
    if (kv) {
      cached = await readSubscriptionStatus(kv, account.id);
    }

    let tier: SubscriptionTier;
    let monthlyLimit: number;
    let usedThisMonth: number;
    let subscriptionId: string | null = null;

    if (cached) {
      // KV hit — use cached values for the initial check
      tier = cached.tier;
      monthlyLimit = cached.monthlyLimit;
      usedThisMonth = cached.usedThisMonth;
    } else {
      // KV miss — fall back to DB
      const subscription = await getSubscriptionByAccountId(db, account.id);

      if (!subscription) {
        // No subscription — use free-tier defaults
        tier = 'free';
        monthlyLimit = 50;
        usedThisMonth = 0;
      } else {
        subscriptionId = subscription.id;
        tier = subscription.tier;
        const quota = await getQuotaPool(db, subscription.id);
        monthlyLimit = quota?.monthlyLimit ?? 50;
        usedThisMonth = quota?.usedThisMonth ?? 0;

        // Backfill KV cache on miss
        if (kv) {
          await writeSubscriptionStatus(kv, account.id, {
            tier,
            status: subscription.status,
            monthlyLimit,
            usedThisMonth,
          });
        }
      }
    }

    // Resolve subscriptionId if we only had cache
    if (!subscriptionId) {
      const subscription = await getSubscriptionByAccountId(db, account.id);
      subscriptionId = subscription?.id ?? null;
    }

    // 2. Check quota using pure business logic
    const result = checkQuota({
      monthlyLimit,
      usedThisMonth,
      topUpCreditsRemaining: 0, // will be checked by decrementQuota FIFO fallback
    });

    // If quota exceeded and no subscription to decrement from, block
    if (!result.allowed && !subscriptionId) {
      return c.json(
        {
          code: ERROR_CODES.QUOTA_EXCEEDED,
          message:
            'Monthly quota exceeded. Upgrade your plan or purchase top-up credits.',
          details: {
            tier,
            monthlyLimit,
            usedThisMonth,
            topUpCreditsRemaining: 0,
            upgradeOptions: buildUpgradeOptions(tier),
          },
        },
        402
      );
    }

    // 3. Attempt to decrement quota (atomic, handles top-up FIFO fallback)
    if (subscriptionId) {
      const decrement = await decrementQuota(db, subscriptionId);

      if (!decrement.success) {
        return c.json(
          {
            code: ERROR_CODES.QUOTA_EXCEEDED,
            message:
              'Monthly quota exceeded. Upgrade your plan or purchase top-up credits.',
            details: {
              tier,
              monthlyLimit,
              usedThisMonth,
              topUpCreditsRemaining: 0,
              upgradeOptions: buildUpgradeOptions(tier),
            },
          },
          402
        );
      }

      // Store subscriptionId for potential refund on LLM failure
      c.set('subscriptionId', subscriptionId);

      // Set quota headers for client-side UI
      const remaining = decrement.remainingMonthly + decrement.remainingTopUp;
      c.header('X-Quota-Remaining', String(remaining));
      c.header('X-Quota-Warning-Level', result.warningLevel);
    }

    await next();
  }
);
