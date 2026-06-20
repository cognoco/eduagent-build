// ---------------------------------------------------------------------------
// Billing service — barrel re-export
// All public symbols from the billing sub-modules.
// ---------------------------------------------------------------------------

// Shared types and mappers
export type {
  SubscriptionRow,
  AppliedSubscriptionRow,
  QuotaPoolRow,
  WebhookSubscriptionUpdate,
} from './types';

// Subscription CRUD, Stripe linking, free provisioning, quota pool read/write
export {
  getSubscriptionByAccountId,
  createSubscription,
  updateSubscriptionFromWebhook,
  linkStripeCustomer,
  getSubscriptionByStripeCustomerId,
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
  downgradeExtendedTrialQuotaIfStillExpired,
  expireTrialAndDowngradeQuota,
  resetDailyQuotas,
  resetExpiredQuotaCycles,
  findExpiredTrials,
  findSubscriptionsByTrialDateRange,
  transitionToExtendedTrial,
  transitionToExtendedTrialFromRevenuecatEvent,
  findExpiredTrialsByDaysSinceEnd,
} from './trial';

// Quota decrement / increment (hot path)
export type { DecrementResult, MeteringErrorCode } from './metering';
export {
  MeteringError,
  decrementQuota,
  incrementQuota,
  safeRefundQuota,
  refundQuotaOrEscalate,
} from './metering';

export { getEffectiveAccessForSubscription } from './access';
export type {
  ProfileQuotaUsageSnapshot,
  ProfileQuotaRole,
} from './quota-provision';
export {
  getOrProvisionProfileQuotaUsage,
  provisionProfileQuotaUsage,
  resolveProfileQuotaRole,
} from './quota-provision';
export {
  reconcileQuotaStateForEffectiveTier,
  reconcileQuotaStateForSubscription,
} from './quota-reconcile';

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
  TopUpCreditsReattributedEventData,
} from './tier';
export {
  handleTierChange,
  getUpgradePrompt,
  getTopUpPriceCents,
  reattributeTopUpCreditsOnModelChange,
  buildTopUpCreditsReattributedEventData,
  emitTopUpCreditsReattributedMetric,
} from './tier';

// Time-zone helpers (per-account day-window resolution)
export { getTimeZoneOffsetMs, getStartOfTodayInTimeZone } from './timezone';

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
  updateSubscriptionAndQuotaFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
} from './revenuecat';
