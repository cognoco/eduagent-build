// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 barrel
//
// Public surface of the flag-gated v2 billing layer. Reachable only when
// IDENTITY_V2_ENABLED='true' (no deployed environment until the WI-586 flip).
// The webhook routes and the metering middleware select between these v2
// symbols and the legacy ones via the dispatchers in ./dispatch.
// ---------------------------------------------------------------------------

export { mapSubscriptionV2Row } from './types-v2';

export {
  getSubscriptionByAccountIdV2,
  createSubscriptionV2,
  updateSubscriptionFromWebhookV2,
  linkStripeCustomerV2,
  getQuotaPoolV2,
  resetMonthlyQuotaV2,
  ensureInitialTrialSubscriptionV2,
  ensureFreeSubscriptionV2,
  markSubscriptionCancelledV2,
  updateQuotaPoolLimitV2,
  activateSubscriptionFromCheckoutV2,
} from './subscription-core-v2';

export {
  isRevenuecatEventProcessedV2,
  updateSubscriptionFromRevenuecatWebhookV2,
  updateSubscriptionAndQuotaFromRevenuecatWebhookV2,
  activateSubscriptionFromRevenuecatV2,
} from './revenuecat-v2';

export { getEffectiveAccessForSubscriptionV2 } from './access-v2';

export {
  reconcileQuotaStateForSubscriptionV2,
  reconcileQuotaStateForEffectiveTierV2,
} from './quota-reconcile-v2';

export {
  resolveProfileQuotaRoleV2,
  provisionProfileQuotaUsageV2,
  getOrProvisionProfileQuotaUsageV2,
} from './quota-provision-v2';

export {
  expireTrialSubscriptionV2,
  expireTrialAndDowngradeQuotaV2,
  findExpiredTrialsV2,
  findSubscriptionsByTrialDateRangeV2,
  findExpiredTrialsByDaysSinceEndV2,
  transitionToExtendedTrialV2,
  transitionToExtendedTrialFromRevenuecatEventV2,
  downgradeExtendedTrialQuotaIfStillExpiredV2,
  resetExpiredQuotaCyclesV2,
} from './trial-v2';

export { reattributeTopUpCreditsOnModelChangeV2 } from './tier-v2';
export { purchaseTopUpCreditsV2 } from './top-up-v2';

export {
  listActiveChildCapNotificationsV2,
  recordChildCapNotificationForSubscriptionV2,
  recordChildCapNotificationForAccountV2,
} from './child-cap-notifications-v2';

export {
  getSubscriptionForProfileV2,
  getProfileCountForSubscriptionV2,
  canAddProfileV2,
  listFamilyMembersV2,
  addProfileToSubscriptionV2,
  removeProfileFromSubscriptionV2,
  getFamilyPoolStatusV2,
  ProfileRemovalNotImplementedErrorV2,
} from './family-v2';

// [WI-722] v2 twin of getUsageBreakdownForProfile — reads guardianship via the
// CUT-B2 reader (not family_links) + usage_events. Dispatched by the same
// per-route flag ternary as the other billing-v2 seams.
export { getUsageBreakdownForProfileV2 } from './family-usage-v2';

export { safeRefreshKvCacheV2 } from './safe-refresh-kv-cache-v2';

// [WI-776] v2 twin of the metering ownership cross-check
// (verifyProfileInSubscriptionAccount) — person × membership × subscription via
// organization_id; the §4.6 HIGH quota-enforcement / cross-org IDOR guard.
export { isPersonUnderSubscriptionV2 } from './metering-v2';

// Webhook handler twins
export {
  handleSubscriptionEventV2,
  handleSubscriptionDeletedV2,
  handleCheckoutCompletedV2,
  handlePaymentFailedV2,
  handlePaymentSucceededV2,
} from './stripe-webhook-handler-v2';

export {
  resolveAccountIdV2,
  handleInitialPurchaseV2,
  handleRenewalV2,
  handleCancellationV2,
  handleExpirationV2,
  handleBillingIssueV2,
  handleSubscriberAliasV2,
  handleProductChangeV2,
  handleNonRenewingPurchaseV2,
  handleUncancellationV2,
} from './revenuecat-webhook-handler-v2';
