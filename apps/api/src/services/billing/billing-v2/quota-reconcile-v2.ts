// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 quota reconciliation
//
// v2 twin of quota-reconcile.ts. Two functions read identity tables and need
// re-pointing:
//   - reconcileQuotaStateForSubscription: reads the subscription row by id from
//     the `subscription` table (was `subscriptions`).
//   - reconcileQuotaStateForEffectiveTier (per-profile branch): the legacy form
//     joins `profiles × subscriptions` on account_id to enumerate the owner +
//     first child; the v2 form joins `person × membership × subscription` on
//     organization_id and reads `membership.roles @> '{admin}'` for ownership.
//
// The quota satellites (`quota_pools`, `profile_quota_usage`) are UNCHANGED —
// keyed on subscriptionId/profileId, which are identical across the cutover. The
// shared-pool branch touches no identity table and is reused verbatim from the
// legacy module.
//
// [WI-868] The identity-v2 flag is gone; this module and legacy
// quota-reconcile.ts both run unconditionally in parallel (convergence
// tracked in WI-1239).
// ---------------------------------------------------------------------------

import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  membership,
  person,
  profileQuotaUsage,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';

import { getTierConfig, resolveEffectiveAccessTier } from '../../subscription';
import { reconcileQuotaStateForEffectiveTier } from '../quota-reconcile';
import { provisionProfileQuotaUsageV2 } from './quota-provision-v2';
import {
  parseSubscriptionV2PlanTier,
  parseSubscriptionV2Status,
} from './types-v2';

type ReconcileQuotaOptions = {
  resetExpiredSharedPoolUsage?: boolean;
};

/**
 * v2: derive the effective tier from the new `subscription` table row, then
 * reconcile quota state. The shared-pool path delegates to the legacy
 * store-agnostic `reconcileQuotaStateForEffectiveTier`; the per-profile path
 * uses the v2-local function below (the legacy one joins legacy identity tables).
 */
export async function reconcileQuotaStateForSubscriptionV2(
  db: Database,
  subscriptionId: string,
  now = new Date(),
  options?: ReconcileQuotaOptions,
): Promise<SubscriptionTier | null> {
  const row = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
  });
  if (!row) return null;

  const tier = parseSubscriptionV2PlanTier(row.planTier);
  const status = parseSubscriptionV2Status(row.status);

  const { effectiveAccessTier } = resolveEffectiveAccessTier(
    {
      tier,
      status,
      trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: row.periodEndAt?.toISOString() ?? null,
    },
    now,
  );

  await reconcileQuotaStateForEffectiveTierV2(
    db,
    subscriptionId,
    effectiveAccessTier,
    now,
    options,
  );
  return effectiveAccessTier;
}

/**
 * v2 reconcile for a known effective tier. The shared-pool branch is identical
 * to the legacy module (no identity table), so it delegates. The per-profile
 * branch re-points the owner/child enumeration onto person × membership ×
 * subscription.
 */
export async function reconcileQuotaStateForEffectiveTierV2(
  db: Database,
  subscriptionId: string,
  tier: SubscriptionTier,
  now = new Date(),
  options?: ReconcileQuotaOptions,
): Promise<void> {
  const config = getTierConfig(tier);

  // Shared-pool path touches no identity table — reuse the legacy implementation
  // verbatim (it operates on quota_pools / profile_quota_usage by subscriptionId).
  if (config.quotaModel === 'shared-pool') {
    await reconcileQuotaStateForEffectiveTier(
      db,
      subscriptionId,
      tier,
      now,
      options,
    );
    return;
  }

  const ownerMonthlyLimit = config.ownerMonthlyQuota;
  const childMonthlyLimit = config.childMonthlyQuota;
  if (ownerMonthlyLimit === null || childMonthlyLimit === null) return;

  // v2 enumeration: persons in the subscription's organization, with their
  // membership role set (for ownership). Mirrors the legacy profiles×subscriptions
  // join, re-keyed onto person × membership × subscription via organization_id.
  const rows = (
    await db
      .select({
        id: person.id,
        roles: membership.roles,
        createdAt: person.createdAt,
      })
      .from(person)
      .innerJoin(membership, eq(membership.personId, person.id))
      .innerJoin(
        subscriptionTable,
        eq(subscriptionTable.organizationId, membership.organizationId),
      )
      .where(
        and(
          eq(subscriptionTable.id, subscriptionId),
          isNull(person.archivedAt),
        ),
      )
  )
    .map((row) => ({
      id: row.id,
      isOwner: row.roles.includes('admin'),
      createdAt: row.createdAt,
    }))
    .sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  const owner = rows.find((row) => row.isOwner);
  const firstChild = rows.find((row) => !row.isOwner);

  if (owner) {
    await provisionProfileQuotaUsageV2(db, subscriptionId, owner.id, 'owner', {
      tier,
      now,
    });
  }
  if (firstChild) {
    await provisionProfileQuotaUsageV2(
      db,
      subscriptionId,
      firstChild.id,
      'child',
      { tier, now },
    );
  }

  await db
    .update(profileQuotaUsage)
    .set({
      monthlyLimit: sql`CASE WHEN ${profileQuotaUsage.role} = 'owner' THEN ${ownerMonthlyLimit}::integer ELSE ${childMonthlyLimit}::integer END`,
      dailyLimit: sql`CASE WHEN ${profileQuotaUsage.role} = 'owner' THEN ${config.ownerDailyQuota}::integer ELSE ${config.childDailyQuota}::integer END`,
      updatedAt: now,
    })
    .where(eq(profileQuotaUsage.subscriptionId, subscriptionId));
}
