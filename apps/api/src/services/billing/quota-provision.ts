import { and, eq } from 'drizzle-orm';
import { profileQuotaUsage, type Database } from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';

import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';
import { getEffectiveAccessForSubscriptionV2 } from './billing-v2/access-v2';
import {
  getProfileQuotaLimits,
  mapProfileQuotaUsageRow,
  nextMonthlyReset,
  type ProfileQuotaRole,
  type ProfileQuotaUsageSnapshot,
} from './billing-shared';

// Re-export shared types so existing importers of quota-provision keep working.
export type {
  ProfileQuotaRole,
  ProfileQuotaUsageSnapshot,
} from './billing-shared';

// [WI-1239 / 779-strip] resolveProfileQuotaRole (legacy profiles×subscriptions
// join) and getOrProvisionProfileQuotaUsage were removed — dead, superseded by
// resolveProfileQuotaRoleV2 / getOrProvisionProfileQuotaUsageV2
// (billing-v2/quota-provision-v2.ts). provisionProfileQuotaUsage below is kept:
// its only remaining caller is services/profile.ts's createProfileWithLimitCheck,
// itself dead (routes use createChildProfileV2) but out of this WI's named
// scope — see the 779-strip handoff's deferred-hygiene note. Its internal
// effective-access resolution now uses the v2 store (access.ts, the legacy
// `subscriptions`-table twin, is deleted — this was its last caller).

export async function provisionProfileQuotaUsage(
  db: Database,
  subscriptionId: string,
  profileId: string,
  role: ProfileQuotaRole,
  options: {
    tier?: SubscriptionTier;
    cycleResetAt?: Date;
    now?: Date;
    emitLazyProvisioned?: boolean;
  } = {},
): Promise<ProfileQuotaUsageSnapshot | null> {
  const now = options.now ?? new Date();
  const tier =
    options.tier ??
    (await getEffectiveAccessForSubscriptionV2(db, subscriptionId, now))
      ?.effectiveAccessTier;
  if (!tier) return null;

  const limits = getProfileQuotaLimits(tier, role);
  if (!limits) return null;

  const [inserted] = await db
    .insert(profileQuotaUsage)
    .values({
      subscriptionId,
      profileId,
      role,
      monthlyLimit: limits.monthlyLimit,
      dailyLimit: limits.dailyLimit,
      usedThisMonth: 0,
      usedToday: 0,
      cycleResetAt: options.cycleResetAt ?? nextMonthlyReset(now),
    })
    .onConflictDoNothing({
      target: [profileQuotaUsage.subscriptionId, profileQuotaUsage.profileId],
    })
    .returning();

  if (inserted && options.emitLazyProvisioned) {
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: operational billing marker consumed from Inngest event history; no function should run.
          name: 'app/billing.profile_quota.lazy_provisioned',
          data: {
            subscriptionId,
            profileId,
            role,
            tier,
            timestamp: now.toISOString(),
          },
        }),
      'billing.profile_quota.lazy_provisioned',
      { subscriptionId, profileId, role, tier },
    );
  }

  if (inserted) return mapProfileQuotaUsageRow(inserted);

  const existing = await db.query.profileQuotaUsage.findFirst({
    where: and(
      eq(profileQuotaUsage.subscriptionId, subscriptionId),
      eq(profileQuotaUsage.profileId, profileId),
    ),
  });
  return existing ? mapProfileQuotaUsageRow(existing) : null;
}
