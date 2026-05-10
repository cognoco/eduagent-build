// ---------------------------------------------------------------------------
// Metering Middleware — Sprint 9 Phase 4 + Pre-Feature Hardening + Dual-Cap
// Enforces quota on billable LLM-consuming routes.
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
import type { LLMTier } from '../services/subscription';
import type { ProfileMeta } from './profile-scope';
import {
  ensureFreeSubscription,
  getQuotaPool,
  decrementQuota,
  getTopUpCreditsRemaining,
} from '../services/billing';
import { getTierConfig } from '../services/subscription';
import { checkQuota } from '../services/metering';
import {
  readSubscriptionStatus,
  writeSubscriptionStatus,
  type CachedSubscriptionStatus,
} from '../services/kv';
import { createLogger } from '../services/logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeteringEnv = {
  Bindings: { SUBSCRIPTION_KV?: KVNamespace };
  Variables: {
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
    subscriptionId: string;
    llmTier: LLMTier;
  };
};

// ---------------------------------------------------------------------------
// LLM-consuming route patterns
// The middleware only applies to routes that consume LLM exchanges.
// I6 fix: optional trailing slash (/?)
//
// [BUG-763] Routes are split by HTTP method-eligibility instead of relying on
// a `regex.source.includes('quiz')` string match in the dispatcher. Renaming
// or restructuring the quiz routes (e.g. adding a /quiz/rounds/coaching path)
// would silently break the previous filter — typed grouping prevents that.
// ---------------------------------------------------------------------------

// Routes that consume LLM exchanges on BOTH GET and POST. Currently every
// session-scoped LLM endpoint that may be invoked via SSE/GET counts here.
const LLM_ROUTE_PATTERNS_ANY_METHOD = [
  /\/sessions\/[^/]+\/messages\/?$/,
  /\/sessions\/[^/]+\/stream\/?$/,
  // [BUG-623 / A-6] generateRecallBridge calls the LLM but was missing from
  // this list, so any authenticated user could call recall-bridge in a tight
  // loop and burn unlimited LLM capacity at zero cost. Meter it like any
  // other LLM-driven session endpoint.
  /\/sessions\/[^/]+\/recall-bridge\/?$/,
  // [BUG-653 / A-5] evaluateSessionDepth runs an LLM call (depth gate +
  // topic detection). Without metering, an authenticated client could
  // spam this endpoint and burn unbounded LLM capacity at zero cost.
  /\/sessions\/[^/]+\/evaluate-depth\/?$/,
];

// Routes that consume LLM exchanges only on POST. Quiz round generation and
// dictation are billable on POST; their GET counterparts (history, stats,
// completion) are DB-only and must NOT decrement quota.
const LLM_ROUTE_PATTERNS_POST_ONLY = [
  /\/quiz\/rounds\/?$/,
  /\/quiz\/rounds\/prefetch\/?$/,
  // [CRIT-1] Dictation LLM-consuming routes — all POST-only.
  // generate + prepare-homework use rung 1, review uses rung 2 (vision).
  /\/dictation\/generate\/?$/,
  /\/dictation\/prepare-homework\/?$/,
  /\/dictation\/review\/?$/,
  // Retry filing re-runs the LLM-backed filing flow. Match only UUIDs so a
  // malformed path falls through to the route validator without burning quota.
  /\/sessions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/retry-filing\/?$/,
];

function isLlmRoute(path: string, method: string): boolean {
  // GET methods never decrement quota for POST-only endpoints. The any-method
  // list is what bills GET requests (SSE streams, recall-bridge, etc.).
  if (method === 'GET') {
    return LLM_ROUTE_PATTERNS_ANY_METHOD.some((pattern) => pattern.test(path));
  }
  return (
    LLM_ROUTE_PATTERNS_ANY_METHOD.some((pattern) => pattern.test(path)) ||
    LLM_ROUTE_PATTERNS_POST_ONLY.some((pattern) => pattern.test(path))
  );
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

// [T-11 / BUG-753] Silent recovery is banned by project policy: any catch
// block in billing/auth code that swallows an error must emit a structured
// log line so the failure rate is queryable. Without this, a sustained KV
// outage manifests only as elevated DB load — invisible to oncall.
//
// `event` field is the metric name; downstream log pipeline aggregates by it.
async function safeReadKV(
  kv: KVNamespace,
  accountId: string,
): Promise<CachedSubscriptionStatus | null> {
  try {
    return await readSubscriptionStatus(kv, accountId);
  } catch (error) {
    logger.warn('[metering] KV read failed — falling back to DB', {
      event: 'metering.kv_read_failed',
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null; // KV unavailable — fall through to DB
  }
}

async function safeWriteKV(
  kv: KVNamespace,
  accountId: string,
  status: CachedSubscriptionStatus,
): Promise<void> {
  try {
    await writeSubscriptionStatus(kv, accountId, status);
  } catch (error) {
    logger.warn('[metering] KV write failed — DB remains source of truth', {
      event: 'metering.kv_write_failed',
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export const meteringMiddleware = createMiddleware<MeteringEnv>(
  async (c, next) => {
    // Only apply to LLM-consuming routes (method-aware to avoid charging GET)
    if (!isLlmRoute(c.req.path, c.req.method)) {
      await next();
      return;
    }

    // Fail closed: LLM routes MUST have an authenticated account.
    // If auth middleware failed to populate account (misconfigured route
    // stack), reject rather than silently bypassing quota enforcement.
    const account = c.get('account');
    if (!account) {
      return c.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        401,
      );
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

    // Don't trust KV when it reports daily exhaustion — the daily cron
    // resets used_today in DB but cannot invalidate KV entries (no KV binding).
    // Fall through to DB so the first post-reset request gets fresh data.
    if (
      cached &&
      cached.dailyLimit !== null &&
      cached.usedToday >= cached.dailyLimit
    ) {
      cached = null;
    }

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

    // 2. Query actual top-up credits for accurate quota check
    const topUpCreditsRemaining = await getTopUpCreditsRemaining(
      db,
      subscriptionId,
    );

    // 3. Check quota using pure business logic (checks both daily + monthly)
    const result = checkQuota({
      monthlyLimit,
      usedThisMonth,
      topUpCreditsRemaining,
      dailyLimit,
      usedToday,
    });

    // Fast-path rejection: skip atomic decrement if quota is clearly exhausted
    if (!result.allowed) {
      const isDailyExceeded =
        result.dailyRemaining !== null && result.dailyRemaining <= 0;
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
            topUpCreditsRemaining,
            upgradeOptions: buildUpgradeOptions(tier),
          },
        },
        402,
      );
    }

    // 4. Attempt to decrement quota (atomic, handles top-up FIFO fallback + daily guard)
    const profileMeta = c.get('profileMeta');
    const profileId = c.get('profileId');
    const decrement = await decrementQuota(db, subscriptionId, profileId);

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
            topUpCreditsRemaining,
            upgradeOptions: buildUpgradeOptions(tier),
          },
        },
        402,
      );
    }

    // Store subscriptionId for potential refund on LLM failure
    c.set('subscriptionId', subscriptionId);

    // Expose the LLM tier so session route handlers can thread it to the LLM router.
    // Per-profile premium flag overrides the subscription-level default — this is how
    // pro plans (2 premium profiles out of 6) and future AI upgrade add-ons work.
    const baseLlmTier = getTierConfig(tier).llmTier;
    c.set('llmTier', profileMeta?.hasPremiumLlm ? 'premium' : baseLlmTier);

    // I7 fix: Update KV cache after decrement so next request sees fresh count.
    // Derive from the atomic DB result (decrement.remainingMonthly/Daily) to
    // avoid stale-read races under concurrency — two requests reading the same
    // cached count would each write original+1, understating actual usage.
    if (kv) {
      // Single formula for both branches: `remainingMonthly` is already 0 in
      // the top-up path, so `monthlyLimit - 0 - remainingTopUp` is the same
      // accounting as the monthly-source path. Branching to literal
      // `monthlyLimit` made the cache report fully exhausted on the very
      // first top-up consumption and blocked the user until KV TTL expired.
      const atomicUsedMonth =
        monthlyLimit - decrement.remainingMonthly - decrement.remainingTopUp;
      const atomicUsedToday =
        dailyLimit !== null && decrement.remainingDaily !== null
          ? dailyLimit - decrement.remainingDaily
          : usedToday + 1;
      await safeWriteKV(kv, account.id, {
        subscriptionId,
        tier,
        status: subscriptionStatus,
        monthlyLimit,
        usedThisMonth: atomicUsedMonth,
        dailyLimit,
        usedToday: atomicUsedToday,
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
  },
);
