// [WI-1239 / 779-strip] resolveProfileQuotaRole (legacy profiles×subscriptions
// join) and getOrProvisionProfileQuotaUsage were removed — dead, superseded by
// resolveProfileQuotaRoleV2 / getOrProvisionProfileQuotaUsageV2
// (billing-v2/quota-provision-v2.ts).
// [WI-1139] provisionProfileQuotaUsage (its last caller,
// services/profile.ts's createProfileWithLimitCheck, was removed by
// WI-1364/WI-1398) removed too — this file now only re-exports shared types.

// Re-export shared types so existing importers of quota-provision keep working.
export type {
  ProfileQuotaRole,
  ProfileQuotaUsageSnapshot,
} from './billing-shared';
