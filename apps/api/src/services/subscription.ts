// ---------------------------------------------------------------------------
// Subscription State Machine — Stories 5.1, 5.2, 5.4
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';

export interface SubscriptionState {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

export type LLMTier = 'flash' | 'standard' | 'premium';
export type BillingAccess = 'current' | 'free_fallback';

export interface TierConfig {
  monthlyQuota: number;
  dailyLimit: number | null;
  maxProfiles: number;
  llmTier: LLMTier;
  quotaModel: 'per-profile' | 'shared-pool';
  // Shared-pool tiers can still expose per-profile breakdown views.
  // Gate aggregate quota reads on profile context for those tiers so a
  // child caller cannot receive family-wide usage without a profileId.
  // Adding a new shared-pool tier with breakdown support means flipping
  // this flag here; routes read it via getTierConfig.
  supportsProfileBreakdown: boolean;
  ownerMonthlyQuota: number | null;
  ownerDailyQuota: number | null;
  childMonthlyQuota: number | null;
  childDailyQuota: number | null;
  priceMonthly: number;
  priceYearly: number;
  topUpPrice: number;
  topUpAmount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_CONFIGS: Record<SubscriptionState['tier'], TierConfig> = {
  free: {
    monthlyQuota: 100,
    dailyLimit: 10,
    maxProfiles: 2,
    llmTier: 'flash',
    quotaModel: 'per-profile',
    supportsProfileBreakdown: false,
    ownerMonthlyQuota: 100,
    ownerDailyQuota: 10,
    childMonthlyQuota: 100,
    childDailyQuota: 10,
    priceMonthly: 0,
    priceYearly: 0,
    topUpPrice: 0,
    topUpAmount: 0,
  },
  // LLM tier resolution lives in two layers:
  //
  // 1. Base account `llmTier` (this config) is what bulk/background callers
  //    read — Free -> 'flash', Plus/Family/Pro -> 'standard'. Used wherever a
  //    per-request decision is not appropriate (for example background workers).
  //
  // 2. Per-exchange routing is decided by `resolveExchangeLlmRouting` at
  //    `services/session/session-exchange.ts`. That function elevates Plus to
  //    'premium' on advanced rungs and services the AI upgrade entitlement.
  //    Family stays Gemini-only. Future owner-only premium routing belongs
  //    there with an `isOwner` input, not in a parallel resolver.
  plus: {
    monthlyQuota: 700,
    dailyLimit: null,
    maxProfiles: 2,
    llmTier: 'standard',
    quotaModel: 'per-profile',
    supportsProfileBreakdown: false,
    ownerMonthlyQuota: 700,
    ownerDailyQuota: null,
    childMonthlyQuota: 100,
    childDailyQuota: 10,
    priceMonthly: 18.99,
    priceYearly: 168,
    topUpPrice: 10,
    topUpAmount: 500,
  },
  family: {
    monthlyQuota: 1500,
    dailyLimit: null,
    maxProfiles: 4,
    llmTier: 'standard',
    quotaModel: 'shared-pool',
    supportsProfileBreakdown: true,
    ownerMonthlyQuota: null,
    ownerDailyQuota: null,
    childMonthlyQuota: null,
    childDailyQuota: null,
    priceMonthly: 28.99,
    priceYearly: 252,
    topUpPrice: 5,
    topUpAmount: 500,
  },
  pro: {
    monthlyQuota: 3000,
    dailyLimit: null,
    maxProfiles: 6,
    llmTier: 'standard',
    quotaModel: 'shared-pool',
    supportsProfileBreakdown: true,
    ownerMonthlyQuota: null,
    ownerDailyQuota: null,
    childMonthlyQuota: null,
    childDailyQuota: null,
    priceMonthly: 48.99,
    priceYearly: 432,
    topUpPrice: 5,
    topUpAmount: 500,
  },
};

// ---------------------------------------------------------------------------
// AI Upgrade Add-on — per-profile premium model upgrade
// ---------------------------------------------------------------------------

export interface AIUpgradeConfig {
  priceMonthly: number;
  llmTier: LLMTier;
}

export const AI_UPGRADE_ADDON: AIUpgradeConfig = {
  priceMonthly: 15,
  // Entitlement only: session exchange routing uses the advanced model from
  // rung 4 upward, while easier turns stay on Gemini.
  llmTier: 'premium',
};

/** Set of valid status transitions as "from->to" strings */
const VALID_TRANSITIONS = new Set([
  'trial->active',
  'trial->expired',
  'trial->past_due', // [BUG-442] handleBillingIssue / handlePaymentFailed set past_due; trial must be reachable
  'active->past_due',
  'active->cancelled',
  'active->expired', // Stripe customer.subscription.deleted (immediate cancellation)
  'past_due->active',
  'past_due->cancelled',
  'past_due->expired', // Stripe customer.subscription.deleted while past_due
  'cancelled->active', // [BUG-443] Stripe portal uncancel (cancel_at_period_end=false) reverses cancellation; payment_succeeded on a cancelled sub re-activates it
  'cancelled->expired',
  // Reactivation after expiry. A RevenueCat RENEWAL / PRODUCT_CHANGE for an
  // already-`expired` account represents a real, successful charge that revives
  // the subscription. Previously these threw ("expired->active" not allowed),
  // 500'd the webhook, and left the customer downgraded despite paying while
  // RevenueCat retried for ~3 days. This mirrors how INITIAL_PURCHASE
  // reactivation already works (it routes through activateSubscriptionFromRevenuecat,
  // which bypasses the transition guard). past_due is included for the
  // expired-then-grace-period reactivation ordering.
  'expired->active',
  'expired->past_due',
]);

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/** Returns the configuration for a given subscription tier */
export function getTierConfig(tier: SubscriptionState['tier']): TierConfig {
  return TIER_CONFIGS[tier];
}

export function resolveEffectiveAccessTier(
  subscription: SubscriptionState,
  now = new Date(),
): {
  effectiveAccessTier: SubscriptionState['tier'];
  billingAccess: BillingAccess;
} {
  if (subscription.tier === 'free') {
    return { effectiveAccessTier: 'free', billingAccess: 'current' };
  }

  if (subscription.status === 'trial' || subscription.status === 'active') {
    return {
      effectiveAccessTier: subscription.tier,
      billingAccess: 'current',
    };
  }

  if (
    subscription.status === 'cancelled' &&
    subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > now
  ) {
    return {
      effectiveAccessTier: subscription.tier,
      billingAccess: 'current',
    };
  }

  // [BUG-792] App-store grace period. When Apple/Google grant a billing grace
  // window after a renewal failure, the RevenueCat BILLING_ISSUE handler marks
  // the subscription `past_due` AND writes the grace expiry into
  // `currentPeriodEnd` (see services/billing/revenuecat-webhook-handler.ts →
  // handleBillingIssue). Preserve paid access until that platform-managed grace
  // window expires — the learner is still entitled while the store retries the
  // charge. We mirror the `cancelled` branch above (access capped by
  // currentPeriodEnd) rather than introducing a parallel status so the
  // entitlement read stays single-sourced. Without a *future* currentPeriodEnd
  // (no grace remaining, or grace already expired) past_due falls through to the
  // free fallback below — the conservative default.
  if (
    subscription.status === 'past_due' &&
    subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > now
  ) {
    return {
      effectiveAccessTier: subscription.tier,
      billingAccess: 'current',
    };
  }

  return { effectiveAccessTier: 'free', billingAccess: 'free_fallback' };
}

/**
 * Checks whether a status transition is valid in the subscription state machine.
 *
 * Valid transitions:
 * - trial -> active, expired, past_due (payment failed before trial converts)
 * - active -> past_due, cancelled, expired
 * - past_due -> active, cancelled, expired
 * - cancelled -> active, expired
 * - expired -> active, past_due (RevenueCat RENEWAL/PRODUCT_CHANGE reactivation
 *   after a successful re-charge; expired is NOT a terminal state)
 *
 * Invalid: trial -> cancelled (must go through active first)
 */
export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS.has(`${from}->${to}`);
}
