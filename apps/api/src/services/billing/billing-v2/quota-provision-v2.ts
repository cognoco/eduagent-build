// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 per-profile quota provisioning
//
// v2 twin of quota-provision.ts. Only the role-resolution join touches identity
// tables: the legacy `resolveProfileQuotaRole` joins `profiles × subscriptions`
// on account_id and reads `profiles.is_owner`; the v2 form joins
// `person × membership × subscription` on organization_id and derives ownership
// from `membership.roles @> '{admin}'`.
//
// The provisioning insert/update operate on `profile_quota_usage` (a satellite,
// unchanged) and the effective-tier resolver, which v2 supplies. The Inngest
// lazy-provisioned marker is dispatched via safeSend (billing silent-recovery
// ban: structured signal, never bare console.warn).
//
// Flag-gated: reachable only when IDENTITY_V2_ENABLED='true'. Legacy
// quota-provision.ts stays byte-identical.
// ---------------------------------------------------------------------------

import { and, eq, isNull } from 'drizzle-orm';
import {
  membership,
  person,
  profileQuotaUsage,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';

import { getTierConfig } from '../../subscription';
import { safeSend } from '../../safe-non-core';
import { inngest } from '../../../inngest/client';
import type {
  ProfileQuotaRole,
  ProfileQuotaUsageSnapshot,
} from '../quota-provision';
import { getEffectiveAccessForSubscriptionV2 } from './access-v2';

function nextMonthlyReset(now: Date): Date {
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
  return cycleResetAt;
}

function getProfileQuotaLimits(
  tier: SubscriptionTier,
  role: ProfileQuotaRole,
): { monthlyLimit: number; dailyLimit: number | null } | null {
  const config = getTierConfig(tier);
  if (config.quotaModel !== 'per-profile') return null;

  const monthlyLimit =
    role === 'owner' ? config.ownerMonthlyQuota : config.childMonthlyQuota;
  const dailyLimit =
    role === 'owner' ? config.ownerDailyQuota : config.childDailyQuota;

  if (monthlyLimit === null) return null;
  return { monthlyLimit, dailyLimit };
}

function mapProfileQuotaUsageRow(
  row: typeof profileQuotaUsage.$inferSelect,
): ProfileQuotaUsageSnapshot {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    profileId: row.profileId,
    role: row.role,
    monthlyLimit: row.monthlyLimit,
    usedThisMonth: row.usedThisMonth,
    dailyLimit: row.dailyLimit,
    usedToday: row.usedToday,
    cycleResetAt: row.cycleResetAt.toISOString(),
  };
}

/**
 * v2: resolve a profile's quota role (owner/child) for a subscription. Joins
 * person × membership × subscription on organization_id and reads the
 * membership role set instead of `profiles.is_owner`. profileId = person.id by
 * the reseed, so the input is unchanged.
 */
export async function resolveProfileQuotaRoleV2(
  db: Database,
  subscriptionId: string,
  profileId: string,
): Promise<ProfileQuotaRole | null> {
  const [row] = await db
    .select({ roles: membership.roles })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(
      subscriptionTable,
      eq(subscriptionTable.organizationId, membership.organizationId),
    )
    .where(
      and(
        eq(subscriptionTable.id, subscriptionId),
        eq(person.id, profileId),
        isNull(person.archivedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  return row.roles.includes('admin') ? 'owner' : 'child';
}

/**
 * v2 of provisionProfileQuotaUsage. Identical satellite writes; the only
 * difference is the effective-tier resolver (v2) when `tier` is not passed.
 */
export async function provisionProfileQuotaUsageV2(
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

/**
 * v2 of getOrProvisionProfileQuotaUsage. Reuses the v2 effective-access resolver
 * and the v2 role resolver.
 */
export async function getOrProvisionProfileQuotaUsageV2(
  db: Database,
  subscriptionId: string,
  profileId: string,
  options: { now?: Date; tier?: SubscriptionTier } = {},
): Promise<ProfileQuotaUsageSnapshot | null> {
  const now = options.now ?? new Date();
  const tier =
    options.tier ??
    (await getEffectiveAccessForSubscriptionV2(db, subscriptionId, now))
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

  const role = await resolveProfileQuotaRoleV2(db, subscriptionId, profileId);
  if (!role) return null;

  return provisionProfileQuotaUsageV2(db, subscriptionId, profileId, role, {
    tier,
    now,
    emitLazyProvisioned: true,
  });
}
