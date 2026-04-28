// ---------------------------------------------------------------------------
// Billing service — barrel re-export
// All public symbols from the billing sub-modules.
// ---------------------------------------------------------------------------

// Shared types and mappers
export type {
  SubscriptionRow,
  QuotaPoolRow,
  WebhookSubscriptionUpdate,
} from './types';

// Subscription CRUD, Stripe linking, free provisioning, quota pool read/write
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
} from './subscription-core';

// Trial expiry, quota cron helpers
export {
  expireTrialSubscription,
  downgradeQuotaPool,
  resetDailyQuotas,
  resetExpiredQuotaCycles,
  findExpiredTrials,
  findSubscriptionsByTrialDateRange,
  transitionToExtendedTrial,
  findExpiredTrialsByDaysSinceEnd,
} from './trial';

// Quota decrement / increment (hot path)
export type { DecrementResult } from './metering';
export { decrementQuota, incrementQuota, safeRefundQuota } from './metering';

// Top-up credit management
export type { TopUpCreditRow } from './top-up';
export {
  getTopUpCreditsRemaining,
  isTopUpAlreadyGranted,
  purchaseTopUpCredits,
  findExpiringTopUpCredits,
  countTopUpPurchasesSinceCycleStart,
} from './top-up';

// Mid-cycle tier change + upgrade prompts
export type {
  TierChangeResult,
  UpgradePromptReason,
  UpgradePrompt,
} from './tier';
export { handleTierChange, getUpgradePrompt, getTopUpPriceCents } from './tier';

// Family billing (Story 5.5)
export type { FamilyMember } from './family';
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
} from './family';

// RevenueCat webhook helpers (Epic 9)
export type { RevenuecatWebhookUpdate } from './revenuecat';
export {
  isRevenuecatEventProcessed,
  updateSubscriptionFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
} from './revenuecat';
