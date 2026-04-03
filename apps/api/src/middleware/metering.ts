// ---------------------------------------------------------------------------
// Metering Middleware — Sprint 9 Phase 4 + Pre-Feature Hardening + Dual-Cap
// Enforces quota on LLM-consuming routes (session messages + streaming).
// Reads from KV cache first, falls back to DB, backfills KV on miss.
//
// Fixes applied:
//   CR1 — Free-tier users auto-provisioned (ensureFreeSubscription)
//   CR3 — KV cache stores subscriptionId (no DB hit on cache hit)
//   I4  — KV operations wrapped in try/catch
//   I6  — Trailing slash tolerated in route matching
//   I7  — KV cache updated after decrement
//
// Dual-cap: free tier enforces 10 questions/day AND 50 questions/month.
// Paid tiers: monthly limit only (dailyLimit = null).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import type { Database } from '@eduagent/database';
import { ERROR_CODES } from '@eduagent/schemas';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import type { Account } from '../services/account';
import {
  ensureFreeSubscription,
  getQuotaPool,
  decrementQuota,
} from '../services/billing';
import { getTierConfig } from '../services/subscription';
import { checkQuota } from '../services/metering';
import {
  readSubscriptionStatus,
  writeSubscriptionStatus,
  type CachedSubscriptionStatus,
} from '../services/kv';

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
// I6 fix: optional trailing slash (/?)
// ---------------------------------------------------------------------------

const LLM_ROUTE_PATTERNS = [
  /\/sessions\/[^/]+\/messages\/?$/,
  /\/sessions\/[^/]+\/stream\/?$/,
];

function isLlmRoute(path: string): boolean {
  return LLM_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}

// ---------------------------------------------------------------------------
// Upgrade options builder
// ---------------------------------------------------------------------------

function buildUpgradeOptions(currentTier: SubscriptionTier): Array<{
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
// KV helpers with error resilience (I4 fix)
// ---------------------------------------------------------------------------

async function safeReadKV(
  kv: KVNamespace,
  accountId: string
): Promise<CachedSubscriptionStatus | null> {
  try {
    return await readSubscriptionStatus(kv, accountId);
  } catch {
    return null; // KV unavailable — fall through to DB
  }
}

async function safeWriteKV(
  kv: KVNamespace,
  accountId: string,
  status: CachedSubscriptionStatus
): Promise<void> {
  try {
    await writeSubscriptionStatus(kv, accountId, status);
  } catch {
    // KV unavailable — ignore, DB is source of truth
  }
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
    const freeTier = getTierConfig('free');

    // 1. Try KV cache for fast quota check (I4: wrapped in try/catch)
    let cached: CachedSubscriptionStatus | null = null;
    if (kv) {
      cached = await safeReadKV(kv, account.id);
    }

    let tier: SubscriptionTier;
    let monthlyLimit: number;
    let usedThisMonth: number;
    let dailyLimit: number | null;
    let usedToday: number;
    let subscriptionId: string;
    let subscriptionStatus: SubscriptionStatus;

    if (cached) {
      // KV hit — use cached values (CR3: subscriptionId now in cache)
      subscriptionId = cached.subscriptionId;
      tier = cached.tier;
      monthlyLimit = cached.monthlyLimit;
      usedThisMonth = cached.usedThisMonth;
      dailyLimit = cached.dailyLimit;
      usedToday = cached.usedToday;
      subscriptionStatus = cached.status;
    } else {
      // KV miss — fall back to DB
      // CR1: Auto-provision free-tier subscription if none exists
      const subscription = await ensureFreeSubscription(db, account.id);
      subscriptionId = subscription.id;
      tier = subscription.tier;
      subscriptionStatus = subscription.status;

      const quota = await getQuotaPool(db, subscriptionId);
      monthlyLimit = quota?.monthlyLimit ?? freeTier.monthlyQuota;
      usedThisMonth = quota?.usedThisMonth ?? 0;
      dailyLimit = quota?.dailyLimit ?? null;
      usedToday = quota?.usedToday ?? 0;

      // Backfill KV cache on miss (I4: wrapped in try/catch)
      if (kv) {
        await safeWriteKV(kv, account.id, {
          subscriptionId,
          tier,
          status: subscriptionStatus,
          monthlyLimit,
          usedThisMonth,
          dailyLimit,
          usedToday,
        });
      }
    }

    // 2. Check quota using pure business logic (checks both daily + monthly)
    const result = checkQuota({
      monthlyLimit,
      usedThisMonth,
      topUpCreditsRemaining: 0, // will be checked by decrementQuota FIFO fallback
      dailyLimit,
      usedToday,
    });

    // 3. Attempt to decrement quota (atomic, handles top-up FIFO fallback + daily guard)
    const decrement = await decrementQuota(db, subscriptionId);

    if (!decrement.success) {
      const isDailyExceeded = decrement.source === 'daily_exceeded';
      return c.json(
        {
          code: ERROR_CODES.QUOTA_EXCEEDED,
          message: isDailyExceeded
            ? "You've reached your daily question limit. Come back tomorrow for more!"
            : 'Monthly quota exceeded. Upgrade your plan or purchase top-up credits.',
          details: {
            tier,
            reason: isDailyExceeded ? ('daily' as const) : ('monthly' as const),
            monthlyLimit,
            usedThisMonth,
            dailyLimit,
            usedToday,
            topUpCreditsRemaining: 0,
            upgradeOptions: buildUpgradeOptions(tier),
          },
        },
        402
      );
    }

    // Store subscriptionId for potential refund on LLM failure
    c.set('subscriptionId', subscriptionId);

    // I7 fix: Update KV cache after decrement so next request sees fresh count
    if (kv) {
      await safeWriteKV(kv, account.id, {
        subscriptionId,
        tier,
        status: subscriptionStatus,
        monthlyLimit,
        usedThisMonth: usedThisMonth + 1,
        dailyLimit,
        usedToday: usedToday + 1,
      });
    }

    // Set quota headers for client-side UI
    const remaining = decrement.remainingMonthly + decrement.remainingTopUp;
    c.header('X-Quota-Remaining', String(remaining));
    c.header('X-Quota-Warning-Level', result.warningLevel);
    if (decrement.remainingDaily !== null) {
      c.header('X-Daily-Remaining', String(decrement.remainingDaily));
    }

    await next();
    return;
  }
);
