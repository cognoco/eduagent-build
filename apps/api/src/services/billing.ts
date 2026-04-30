// ---------------------------------------------------------------------------
// Billing DB Service — Sprint 9 Phase 1
// Account-scoped database operations for subscriptions and quota pools.
// Pure data layer — no Hono imports.
//
// This file is now a re-export facade. All logic lives in billing/ sub-modules.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type {
  SubscriptionRow,
  QuotaPoolRow,
  WebhookSubscriptionUpdate,
} from './billing/types';

// ---------------------------------------------------------------------------
// Subscription CRUD, Stripe linking, free provisioning, quota pool read/write
// ---------------------------------------------------------------------------

export {
  getSubscriptionByAccountId,
  createSubscription,
  updateSubscriptionFromWebhook,
  linkStripeCustomer,
  getQuotaPool,
  resetMonthlyQuota,
  ensureFreeSubscription,
  markSubscriptionCancelled,
  updateQuotaPoolLimit,
  activateSubscriptionFromCheckout,
} from './billing/subscription-core';

// ---------------------------------------------------------------------------
// Trial expiry, quota cron helpers
// ---------------------------------------------------------------------------

export {
  expireTrialSubscription,
  downgradeQuotaPool,
  resetDailyQuotas,
  resetExpiredQuotaCycles,
  findExpiredTrials,
  findSubscriptionsByTrialDateRange,
  transitionToExtendedTrial,
  findExpiredTrialsByDaysSinceEnd,
} from './billing/trial';

// ---------------------------------------------------------------------------
// Quota decrement / increment (Phase 4)
// ---------------------------------------------------------------------------

export type { DecrementResult } from './billing/metering';
export {
  decrementQuota,
  incrementQuota,
  safeRefundQuota,
} from './billing/metering';

// ---------------------------------------------------------------------------
// Top-up credit management
// ---------------------------------------------------------------------------

export type { TopUpCreditRow } from './billing/top-up';
export {
  getTopUpCreditsRemaining,
  isTopUpAlreadyGranted,
  purchaseTopUpCredits,
  findExpiringTopUpCredits,
  countTopUpPurchasesSinceCycleStart,
} from './billing/top-up';

// ---------------------------------------------------------------------------
// Mid-cycle tier change + upgrade prompts
// ---------------------------------------------------------------------------

export type {
  TierChangeResult,
  UpgradePromptReason,
  UpgradePrompt,
} from './billing/tier';
export {
  handleTierChange,
  getUpgradePrompt,
  getTopUpPriceCents,
} from './billing/tier';

// ---------------------------------------------------------------------------
// Family billing (Story 5.5)
// ---------------------------------------------------------------------------

export type { FamilyMember } from './billing/family';
export {
  getSubscriptionForProfile,
  getProfileCountForSubscription,
  canAddProfile,
  addToByokWaitlist,
  listFamilyMembers,
  addProfileToSubscription,
  removeProfileFromSubscription,
  ProfileRemovalNotImplementedError,
  downgradeAllFamilyProfiles,
  getFamilyPoolStatus,
} from './billing/family';

// ---------------------------------------------------------------------------
// RevenueCat webhook helpers (Epic 9)
// ---------------------------------------------------------------------------

export type { RevenuecatWebhookUpdate } from './billing/revenuecat';
export {
  isRevenuecatEventProcessed,
  updateSubscriptionFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
} from './billing/revenuecat';
