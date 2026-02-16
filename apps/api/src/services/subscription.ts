// ---------------------------------------------------------------------------
// Subscription State Machine — Stories 5.1, 5.2, 5.4
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface SubscriptionState {
  tier: 'free' | 'plus' | 'family' | 'pro';
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

export interface TierConfig {
  monthlyQuota: number;
  maxProfiles: number;
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
    monthlyQuota: 50,
    maxProfiles: 1,
    priceMonthly: 0,
    priceYearly: 0,
    topUpPrice: 0,
    topUpAmount: 0,
  },
  plus: {
    monthlyQuota: 500,
    maxProfiles: 1,
    priceMonthly: 18.99,
    priceYearly: 168,
    topUpPrice: 10,
    topUpAmount: 500,
  },
  family: {
    monthlyQuota: 1500,
    maxProfiles: 4,
    priceMonthly: 28.99,
    priceYearly: 252,
    topUpPrice: 5,
    topUpAmount: 500,
  },
  pro: {
    monthlyQuota: 3000,
    maxProfiles: 6,
    priceMonthly: 48.99,
    priceYearly: 432,
    topUpPrice: 5,
    topUpAmount: 500,
  },
};

/** Set of valid status transitions as "from->to" strings */
const VALID_TRANSITIONS = new Set([
  'trial->active',
  'trial->expired',
  'active->past_due',
  'active->cancelled',
  'past_due->active',
  'past_due->cancelled',
  'cancelled->expired',
]);

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/** Returns the configuration for a given subscription tier */
export function getTierConfig(tier: SubscriptionState['tier']): TierConfig {
  return TIER_CONFIGS[tier];
}

/**
 * Checks whether a status transition is valid in the subscription state machine.
 *
 * Valid transitions:
 * - trial -> active, expired
 * - active -> past_due, cancelled
 * - past_due -> active, cancelled
 * - cancelled -> expired
 *
 * Invalid: expired -> anything, trial -> cancelled (must go through active first)
 */
export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS.has(`${from}->${to}`);
}

/**
 * Determines whether a subscription should be downgraded to free tier on expiry.
 *
 * Returns true when the subscription is in expired or cancelled status,
 * indicating the user should revert to the free tier.
 */
export function shouldDowngradeOnExpiry(state: SubscriptionState): boolean {
  return state.status === 'expired' || state.status === 'cancelled';
}

/**
 * Returns the number of trial days remaining.
 * Returns 0 if the trial has already expired.
 */
export function getTrialDaysRemaining(trialEndsAt: string): number {
  const now = Date.now();
  const endMs = new Date(trialEndsAt).getTime();
  const diffMs = endMs - now;

  if (diffMs <= 0) {
    return 0;
  }

  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
