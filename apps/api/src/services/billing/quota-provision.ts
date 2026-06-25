import { and, eq, isNull } from 'drizzle-orm';
import {
  profileQuotaUsage,
  profiles,
  subscriptions,
  type Database,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';

import { getTierConfig } from '../subscription';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';
import { getEffectiveAccessForSubscription } from './access';
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

export async function resolveProfileQuotaRole(
  db: Database,
  subscriptionId: string,
  profileId: string,
): Promise<ProfileQuotaRole | null> {
  const [row] = await db
    .select({ isOwner: profiles.isOwner })
    .from(profiles)
    .innerJoin(subscriptions, eq(subscriptions.accountId, profiles.accountId))
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(profiles.id, profileId),
        isNull(profiles.archivedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  return row.isOwner ? 'owner' : 'child';
}

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
    (await getEffectiveAccessForSubscription(db, subscriptionId, now))
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

export async function getOrProvisionProfileQuotaUsage(
  db: Database,
  subscriptionId: string,
  profileId: string,
  options: { now?: Date; tier?: SubscriptionTier } = {},
): Promise<ProfileQuotaUsageSnapshot | null> {
  const now = options.now ?? new Date();
  const tier =
    options.tier ??
    (await getEffectiveAccessForSubscription(db, subscriptionId, now))
      ?.effectiveAccessTier;
  if (!tier) return null;

  const config = getTierConfig(tier);
  if (config.quotaModel !== 'per-profile') return null;

  const existing = await db.query.profileQuotaUsage.findFirst({
    where: and(
      eq(profileQuotaUsage.subscriptionId, subscriptionId),
      eq(profileQuotaUsage.profileId, profileId),
    ),
  });

  if (existing) {
    const limits = getProfileQuotaLimits(tier, existing.role);
    if (
      limits &&
      (existing.monthlyLimit !== limits.monthlyLimit ||
        existing.dailyLimit !== limits.dailyLimit)
    ) {
      const [updated] = await db
        .update(profileQuotaUsage)
        .set({
          monthlyLimit: limits.monthlyLimit,
          dailyLimit: limits.dailyLimit,
          updatedAt: now,
        })
        .where(eq(profileQuotaUsage.id, existing.id))
        .returning();
      return updated ? mapProfileQuotaUsageRow(updated) : null;
    }
    return mapProfileQuotaUsageRow(existing);
  }

  const role = await resolveProfileQuotaRole(db, subscriptionId, profileId);
  if (!role) return null;

  return provisionProfileQuotaUsage(db, subscriptionId, profileId, role, {
    tier,
    now,
    emitLazyProvisioned: true,
  });
}
