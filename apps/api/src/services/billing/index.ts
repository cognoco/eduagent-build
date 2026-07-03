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

// Quota pool read/write (subscriptionId-keyed, store-agnostic) + the
// legacy-reachable subscription CRUD subset kept for out-of-scope callers
// (services/account.ts, services/profile.ts — see subscription-core.ts header)
export { getQuotaPool } from './subscription-core';

// Trial expiry, quota cron helpers
export { resetDailyQuotas } from './trial';

// Quota decrement / increment (hot path)
export type { DecrementResult, MeteringErrorCode } from './metering';
export {
  MeteringError,
  decrementQuota,
  incrementQuota,
  safeRefundQuota,
  refundQuotaOrEscalate,
} from './metering';

export type {
  ProfileQuotaUsageSnapshot,
  ProfileQuotaRole,
} from './quota-provision';
export { provisionProfileQuotaUsage } from './quota-provision';
export { reconcileQuotaStateForEffectiveTier } from './quota-reconcile';

// Top-up credit management + mid-cycle tier-change pricing/metric
export type {
  TopUpCreditRow,
  TopUpCreditsReattributedEventData,
} from './top-up';
export {
  getTopUpCreditsRemaining,
  findExpiringTopUpCredits,
  getTopUpPriceCents,
  buildTopUpCreditsReattributedEventData,
  emitTopUpCreditsReattributedMetric,
} from './top-up';

// Time-zone helpers (per-account day-window resolution)
export { getTimeZoneOffsetMs, getStartOfTodayInTimeZone } from './timezone';

// Family billing (Story 5.5)
export type { FamilyMember } from './family';
export { addToByokWaitlist, ProfileRemovalNotImplementedError } from './family';
