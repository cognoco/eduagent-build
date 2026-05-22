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

export type LLMTier = 'flash' | 'standard' | 'premium';

export interface TierConfig {
  monthlyQuota: number;
  dailyLimit: number | null;
  maxProfiles: number;
  premiumModelProfiles: number;
  llmTier: LLMTier;
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
    maxProfiles: 1,
    premiumModelProfiles: 0,
    llmTier: 'flash',
    priceMonthly: 0,
    priceYearly: 0,
    topUpPrice: 0,
    topUpAmount: 0,
  },
  // Plus is the one-person serious-study plan: one profile with advanced-model
  // access on the hard rungs. Its base tier stays standard so easier turns
  // remain on Gemini. Family/Pro are multi-profile plans; Pro still has two
  // selectable advanced-model profiles out of its six seats.
  plus: {
    monthlyQuota: 700,
    dailyLimit: null,
    maxProfiles: 1,
    premiumModelProfiles: 1,
    llmTier: 'standard',
    priceMonthly: 18.99,
    priceYearly: 168,
    topUpPrice: 10,
    topUpAmount: 500,
  },
  family: {
    monthlyQuota: 1500,
    dailyLimit: null,
    maxProfiles: 4,
    premiumModelProfiles: 0,
    llmTier: 'standard',
    priceMonthly: 28.99,
    priceYearly: 252,
    topUpPrice: 5,
    topUpAmount: 500,
  },
  pro: {
    monthlyQuota: 3000,
    dailyLimit: null,
    maxProfiles: 6,
    premiumModelProfiles: 2,
    llmTier: 'standard',
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
 * - trial -> active, expired, past_due (payment failed before trial converts)
 * - active -> past_due, cancelled, expired
 * - past_due -> active, cancelled, expired
 * - cancelled -> expired
 *
 * Invalid: expired -> anything, trial -> cancelled (must go through active first)
 */
export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS.has(`${from}->${to}`);
}
