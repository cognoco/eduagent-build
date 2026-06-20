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
  AppliedSubscriptionRow,
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
  getSubscriptionByStripeCustomerId,
  getQuotaPool,
  resetMonthlyQuota,
  ensureFreeSubscription,
  markSubscriptionCancelled,
  updateQuotaPoolLimit,
  activateSubscriptionFromCheckout,
} from './billing/subscription-core';

// [WI-784] Identity-v2 twin re-exported here so callers import the v2
// equivalent (`ensureFreeSubscriptionV2`) alongside its legacy sibling
// (`ensureFreeSubscription`) from this one barrel, instead of reaching into
// the billing-v2 sub-barrel directly. Re-exported from the specific v2 source
// module (not the billing-v2 index barrel) to avoid pulling the full v2
// surface — which would form an import cycle with this facade via
// billing/metering → billing/billing-v2/*. Mirrors metering.ts's by-path v2
// imports. The full v2 API stays available from ./billing/billing-v2.
export { ensureFreeSubscriptionV2 } from './billing/billing-v2/subscription-core-v2';

// ---------------------------------------------------------------------------
// Trial expiry, quota cron helpers
// ---------------------------------------------------------------------------

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
} from './billing/trial';

// ---------------------------------------------------------------------------
// Quota decrement / increment (Phase 4)
// ---------------------------------------------------------------------------

export type { DecrementResult, MeteringErrorCode } from './billing/metering';
export {
  MeteringError,
  decrementQuota,
  incrementQuota,
  safeRefundQuota,
  refundQuotaOrEscalate,
} from './billing/metering';

export { getEffectiveAccessForSubscription } from './billing/access';
export type {
  ProfileQuotaUsageSnapshot,
  ProfileQuotaRole,
} from './billing/quota-provision';
export {
  getOrProvisionProfileQuotaUsage,
  provisionProfileQuotaUsage,
  resolveProfileQuotaRole,
} from './billing/quota-provision';
export {
  reconcileQuotaStateForEffectiveTier,
  reconcileQuotaStateForSubscription,
} from './billing/quota-reconcile';

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
// Time-zone helpers (per-account day-window resolution)
// ---------------------------------------------------------------------------

export {
  getTimeZoneOffsetMs,
  getStartOfTodayInTimeZone,
} from './billing/timezone';

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
  getUsageBreakdownForProfile,
  getUsageEventsAvailableSince,
  buildUsageDateLabels,
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
  updateSubscriptionAndQuotaFromRevenuecatWebhook,
  activateSubscriptionFromRevenuecat,
} from './billing/revenuecat';
