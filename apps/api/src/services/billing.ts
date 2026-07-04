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
// Quota pool read/write (subscriptionId-keyed, store-agnostic)
// ---------------------------------------------------------------------------

export type { StripeCustomerCreator } from './billing/types';
export { getQuotaPool } from './billing/subscription-core';

// [WI-784] Identity-v2 twin re-exported here so callers import the v2
// equivalent (`ensureFreeSubscriptionV2`) alongside its legacy sibling
// (`ensureFreeSubscription`) from this one barrel, instead of reaching into
// the billing-v2 sub-barrel directly. Re-exported from the specific v2 source
// module (not the billing-v2 index barrel) to avoid pulling the full v2
// surface — which would form an import cycle with this facade via
// billing/metering → billing/billing-v2/*. Mirrors metering.ts's by-path v2
// imports. The full v2 API stays available from ./billing/billing-v2.
// [BUG-827] getOrCreateStripeCustomerV2 re-exported by-path alongside it.
export {
  ensureFreeSubscriptionV2,
  getOrCreateStripeCustomerV2,
} from './billing/billing-v2/subscription-core-v2';

// ---------------------------------------------------------------------------
// Trial expiry, quota cron helpers
// ---------------------------------------------------------------------------

export { resetDailyQuotas } from './billing/trial';

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

export type {
  ProfileQuotaUsageSnapshot,
  ProfileQuotaRole,
} from './billing/quota-provision';
export { reconcileQuotaStateForEffectiveTier } from './billing/quota-reconcile';

// ---------------------------------------------------------------------------
// Top-up credit management + mid-cycle tier-change pricing/metric
// ---------------------------------------------------------------------------

export type {
  TopUpCreditRow,
  TopUpCreditsReattributedEventData,
} from './billing/top-up';
export {
  getTopUpCreditsRemaining,
  findExpiringTopUpCredits,
  getTopUpPriceCents,
  buildTopUpCreditsReattributedEventData,
  emitTopUpCreditsReattributedMetric,
} from './billing/top-up';

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
  addToByokWaitlist,
  getUsageEventsAvailableSince,
  buildUsageDateLabels,
  ProfileRemovalNotImplementedError,
} from './billing/family';
