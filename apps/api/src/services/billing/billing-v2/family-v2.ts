// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 family billing
//
// v2 twins of the family.ts functions reachable through routes/billing.ts. The
// profile enumeration re-points from `profiles` (by account_id) to the persons
// of the subscription's organization (person × membership), with isOwner from
// membership.roles. The `getSubscriptionForProfile` chain re-points
// profile → account → subscription onto person → membership(org) → subscription.
//
// `removeProfileFromSubscriptionV2` re-points the family-link cleanup onto the
// ratified `guardianship` edge (revoke by stamping `revoked_at`, the
// behavior-preserving v2 image of the legacy `family_links` delete) and archives
// the person (`person.archived_at`) instead of `profiles.archived_at`. The
// guardianship WRITE machine is CUT-B2's domain, but this billing-side seat
// removal needs the edge cleanup to keep the family-seat semantics; it uses the
// same revoked-at convention CUT-B2 establishes for reads.
//
// Dispatched by routes/billing.ts. [WI-868] The identity-v2 flag is gone;
// legacy family.ts still runs in parallel — convergence tracked in WI-1239.
// ---------------------------------------------------------------------------

import { and, asc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import {
  person,
  membership,
  guardianship,
  quotaPools,
  subscription as subscriptionTable,
  usageEvents,
  type Database,
} from '@eduagent/database';
import type {
  CoherentBillingAccessResultV2,
  FamilyMember,
  SubscriptionTier,
} from '@eduagent/schemas';
import { getTierConfig, resolveEffectiveAccessTier } from '../../subscription';
import type { SubscriptionRow } from '../types';
import { createLogger } from '../../logger';
import { captureException, captureMessage } from '../../sentry';
import { addMonthsClamped } from '../billing-shared';
import { getSubscriptionByAccountIdV2 } from './subscription-core-v2';
import {
  getEffectiveAccessForSubscriptionV2,
  type EffectiveSubscriptionAccessV2,
} from './access-v2';
import { mapSubscriptionV2Row, parseSubscriptionV2PlanTier } from './types-v2';

const logger = createLogger();

/**
 * Resolve a person's organization (their single home-org membership). The v2
 * image of `profiles.account_id`. Returns null when the person has no membership.
 */
async function organizationOfPerson(
  db: Database,
  personId: string,
): Promise<string | null> {
  const row = await db.query.membership.findFirst({
    where: eq(membership.personId, personId),
    columns: { organizationId: true },
  });
  return row?.organizationId ?? null;
}

/**
 * v2 of getSubscriptionForProfile: person → membership(org) → subscription.
 */
export async function getSubscriptionForProfileV2(
  db: Database,
  profileId: string,
): Promise<SubscriptionRow | null> {
  const organizationId = await organizationOfPerson(db, profileId);
  if (!organizationId) return null;
  return getSubscriptionByAccountIdV2(db, organizationId);
}

/**
 * v2 of getProfileCountForSubscription: count the non-archived persons in the
 * subscription's organization.
 */
export async function getProfileCountForSubscriptionV2(
  db: Database,
  subscriptionId: string,
): Promise<number> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
    columns: { organizationId: true },
  });
  if (!sub) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        eq(membership.organizationId, sub.organizationId),
        isNull(person.archivedAt),
      ),
    );

  return result[0]?.count ?? 0;
}

/**
 * v2 of canAddProfile.
 */
export async function canAddProfileV2(
  db: Database,
  subscriptionId: string,
): Promise<boolean> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
    columns: { planTier: true },
  });
  if (!sub) return false;

  const tier = parseSubscriptionV2PlanTier(sub.planTier);
  const access = await getEffectiveAccessForSubscriptionV2(db, subscriptionId);
  const tierConfig = getTierConfig(access?.effectiveAccessTier ?? tier);
  const current = await getProfileCountForSubscriptionV2(db, subscriptionId);

  return current < tierConfig.maxProfiles;
}

/**
 * v2 of listFamilyMembers: the persons of the subscription's organization
 * (profileId = person.id, displayName from person, isOwner from membership.roles).
 */
export async function listFamilyMembersV2(
  db: Database,
  subscriptionId: string,
): Promise<FamilyMember[]> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
    columns: { organizationId: true },
  });

  if (!sub) {
    logger.warn('[billing] listFamilyMembers: subscription not found', {
      event: 'billing.family.list_members.subscription_not_found',
      subscriptionId,
    });
    captureException(new Error('listFamilyMembers: subscription not found'), {
      extra: {
        context: 'billing.family.list_members.subscription_not_found',
        subscriptionId,
      },
    });
    return [];
  }

  const rows = await db
    .select({
      id: person.id,
      displayName: person.displayName,
      roles: membership.roles,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        eq(membership.organizationId, sub.organizationId),
        isNull(person.archivedAt),
      ),
    )
    .orderBy(
      sql`CASE WHEN 'admin' = ANY(${membership.roles}) THEN 0 ELSE 1 END`,
      asc(person.displayName),
      asc(person.id),
    );

  return rows.map((r) => ({
    profileId: r.id,
    displayName: r.displayName,
    isOwner: r.roles.includes('admin'),
  }));
}

/**
 * v2 of addProfileToSubscription. Same guards (multi-profile tiers only,
 * same-org membership, maxProfiles), re-keyed onto the v2 store.
 */
export async function addProfileToSubscriptionV2(
  db: Database,
  subscriptionId: string,
  profileId: string,
): Promise<{ profileCount: number } | null> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
    columns: { planTier: true, organizationId: true },
  });

  if (!sub) return null;
  const tier = parseSubscriptionV2PlanTier(sub.planTier);
  if (tier !== 'family' && tier !== 'pro') return null;

  const personOrg = await organizationOfPerson(db, profileId);
  // Never re-parent persons across organizations (no invite/claim flow yet).
  if (!personOrg || personOrg !== sub.organizationId) return null;

  const allowed = await canAddProfileV2(db, subscriptionId);
  if (!allowed) return null;

  const count = await getProfileCountForSubscriptionV2(db, subscriptionId);
  return { profileCount: count };
}

export class ProfileRemovalNotImplementedErrorV2 extends Error {
  constructor() {
    super(
      'Profile removal requires an invite/claim flow that is not yet implemented',
    );
    this.name = 'ProfileRemovalNotImplementedError';
  }
}

export class StaleFamilyAccessSnapshotErrorV2 extends Error {
  constructor() {
    super('Family access changed before quota snapshot assembly');
    this.name = 'StaleFamilyAccessSnapshotErrorV2';
  }
}

/**
 * Assemble one billing-access snapshot for quota-bearing routes. Shared-pool
 * readers retry once when the subscription changes between the access read and
 * the locked Family snapshot; the retry is an observable billing recovery.
 */
export async function resolveCoherentBillingAccessV2(
  db: Database,
  subscriptionId: string,
): Promise<
  CoherentBillingAccessResultV2<
    EffectiveSubscriptionAccessV2,
    NonNullable<Awaited<ReturnType<typeof getFamilyPoolStatusV2>>>
  >
> {
  let access = await getEffectiveAccessForSubscriptionV2(db, subscriptionId);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!access) {
      return {
        kind: 'available' as const,
        access: null,
        sharedPoolStatus: null,
      };
    }
    if (
      getTierConfig(access.effectiveAccessTier).quotaModel !== 'shared-pool'
    ) {
      return {
        kind: 'available' as const,
        access,
        sharedPoolStatus: null,
      };
    }

    try {
      const sharedPoolStatus = await getFamilyPoolStatusV2(
        db,
        subscriptionId,
        access,
      );
      if (!sharedPoolStatus) {
        return {
          kind: 'shared-pool-unavailable' as const,
          access,
        };
      }
      return {
        kind: 'available' as const,
        access,
        sharedPoolStatus,
      };
    } catch (error) {
      if (
        !(error instanceof StaleFamilyAccessSnapshotErrorV2) ||
        attempt === 1
      ) {
        throw error;
      }
      logger.warn('[billing] retrying stale Family access snapshot', {
        event: 'billing.family.access_snapshot_retry',
        subscriptionId,
        attempt: attempt + 1,
      });
      captureMessage('billing.family.access_snapshot_retry', {
        level: 'warning',
        extra: { subscriptionId, attempt: attempt + 1 },
        tags: { surface: 'billing.family.v2' },
      });
      access = await getEffectiveAccessForSubscriptionV2(db, subscriptionId);
    }
  }

  return {
    kind: 'shared-pool-unavailable' as const,
    access,
  };
}

/**
 * v2 of removeProfileFromSubscription. Same-org seat removal archives the
 * non-owner person (`person.archived_at`) and revokes their guardianship edges
 * (stamping `revoked_at`, the v2 image of the legacy `family_links` delete).
 * Owner (admin membership) cannot be removed. Cross-org detachment is rejected.
 */
export async function removeProfileFromSubscriptionV2(
  db: Database,
  subscriptionId: string,
  profileId: string,
  newAccountId?: string,
): Promise<{ removedProfileId: string } | null> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
    columns: { planTier: true, organizationId: true },
  });

  if (!sub) return null;
  const tier = parseSubscriptionV2PlanTier(sub.planTier);
  if (tier !== 'family' && tier !== 'pro') return null;

  const membershipRow = await db.query.membership.findFirst({
    where: and(
      eq(membership.personId, profileId),
      eq(membership.organizationId, sub.organizationId),
    ),
  });
  if (!membershipRow) return null;

  const personRow = await db.query.person.findFirst({
    where: and(eq(person.id, profileId), isNull(person.archivedAt)),
    columns: { id: true },
  });
  if (!personRow) return null;

  // Owner (admin) cannot be removed — must cancel the whole subscription.
  if (membershipRow.roles.includes('admin')) return null;

  // Cross-org detachment needs an invite/claim flow. account.id = organization.id,
  // so a newAccountId that differs from the org is a cross-org move — reject.
  if (newAccountId != null && newAccountId !== sub.organizationId) {
    throw new ProfileRemovalNotImplementedErrorV2();
  }

  const [updated] = await db
    .update(person)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(person.id, personRow.id), isNull(person.archivedAt)))
    .returning({ id: person.id });

  if (!updated) return null;

  // Revoke the person's guardianship edges (v2 image of the family_links delete).
  await db
    .update(guardianship)
    .set({ revokedAt: new Date() })
    .where(
      and(
        or(
          eq(guardianship.chargePersonId, personRow.id),
          eq(guardianship.guardianPersonId, personRow.id),
        ),
        isNull(guardianship.revokedAt),
      ),
    );

  return { removedProfileId: updated.id };
}

const MAX_MONTHLY_BOUNDARIES_PER_PERIOD = 24;

function resolveMonthlyCycleStart(
  periodStartAt: string | null,
  cycleResetAt: Date,
): Date | null {
  if (!periodStartAt) return null;

  let cycleStartAt = new Date(periodStartAt);
  const resetTime = cycleResetAt.getTime();
  if (
    !Number.isFinite(cycleStartAt.getTime()) ||
    cycleStartAt.getTime() >= resetTime
  ) {
    return null;
  }

  // Pool resets advance from the previous boundary with the canonical forward
  // clamp. Replaying that sequence is required because reversing a clamped
  // February boundary cannot recover whether the prior month ended on 28–31.
  for (let step = 0; step < MAX_MONTHLY_BOUNDARIES_PER_PERIOD; step += 1) {
    const nextResetAt = addMonthsClamped(cycleStartAt, 1);
    const nextResetTime = nextResetAt.getTime();
    if (nextResetTime === resetTime) return cycleStartAt;
    if (nextResetTime <= cycleStartAt.getTime() || nextResetTime > resetTime) {
      return null;
    }
    cycleStartAt = nextResetAt;
  }

  return null;
}

/**
 * v2 of getFamilyPoolStatus.
 */
export async function getFamilyPoolStatusV2(
  db: Database,
  subscriptionId: string,
  access: EffectiveSubscriptionAccessV2,
): Promise<{
  tier: SubscriptionTier;
  monthlyLimit: number;
  usedThisMonth: number;
  remainingQuestions: number;
  profileCount: number;
  maxProfiles: number;
  /** Only cycleStartAt remains internal and is stripped by the public schema. */
  cycleStartAt: string;
  cycleResetAt: string;
  dailyLimit: number | null;
  usedToday: number;
  /**
   * Current-cycle usage not attributable to an active member row. The family
   * status response strips this internal field; `/v1/usage` exposes it as the
   * owner-visible `familyAggregate.formerMemberUsed` presentation bucket.
   */
  inactiveMemberUsedThisMonth: number;
  memberUsage: Array<{
    profileId: string;
    name: string;
    roles: string[];
    used: number;
  }>;
} | null> {
  // The caller's effective-access read is the authoritative subscription
  // snapshot for the entire response. Do not re-read it here: a plan change
  // between route dispatch and quota assembly must not mix two tiers/cycles.
  if (access.subscription.id !== subscriptionId) return null;
  const tier = access.subscription.tier;
  if (tier !== 'family' && tier !== 'pro') return null;

  const tierConfig = getTierConfig(access.effectiveAccessTier);
  if (tierConfig.quotaModel !== 'shared-pool') return null;

  return db.transaction(async (tx) => {
    // Canonical billing lock order is subscription first, quota second. The
    // caller snapshot was read before this transaction, so revalidate it under
    // the subscription lock before it is allowed to repair enforcement state.
    const [lockedSubscriptionRow] = await tx
      .select()
      .from(subscriptionTable)
      .where(eq(subscriptionTable.id, subscriptionId))
      .for('update')
      .limit(1);
    if (!lockedSubscriptionRow) return null;

    const lockedSubscription = mapSubscriptionV2Row(lockedSubscriptionRow);
    const lockedPolicy = resolveEffectiveAccessTier({
      tier: lockedSubscription.tier,
      status: lockedSubscription.status,
      trialEndsAt: lockedSubscription.trialEndsAt,
      currentPeriodEnd: lockedSubscription.currentPeriodEnd,
    });
    const callerSnapshotIsCurrent =
      lockedSubscription.id === access.subscription.id &&
      lockedSubscription.accountId === access.subscription.accountId &&
      lockedSubscription.tier === access.subscription.tier &&
      lockedSubscription.status === access.subscription.status &&
      lockedSubscription.trialEndsAt === access.subscription.trialEndsAt &&
      lockedSubscription.currentPeriodStart ===
        access.subscription.currentPeriodStart &&
      lockedSubscription.currentPeriodEnd ===
        access.subscription.currentPeriodEnd &&
      lockedSubscription.cancelledAt === access.subscription.cancelledAt &&
      lockedPolicy.effectiveAccessTier === access.effectiveAccessTier &&
      lockedPolicy.billingAccess === access.billingAccess;
    if (!callerSnapshotIsCurrent) {
      throw new StaleFamilyAccessSnapshotErrorV2();
    }

    // Lock the enforcement row before reading events. A concurrent decrement
    // then waits and re-checks its guarded UPDATE after this coherent repair,
    // so the event-derived counter cannot overwrite a newly consumed turn.
    const [pool] = await tx
      .select()
      .from(quotaPools)
      .where(eq(quotaPools.subscriptionId, subscriptionId))
      .for('update')
      .limit(1);
    if (!pool) return null;

    // Family/Pro quotas reset monthly even when the paid subscription period
    // is annual. The locked quota row owns the public reset token, while the
    // locked subscription owns the anchor needed to identify its prior token.
    const resolvedCycleStartAt = resolveMonthlyCycleStart(
      lockedSubscription.currentPeriodStart,
      pool.cycleResetAt,
    );
    if (!resolvedCycleStartAt) {
      const error = new Error('Family quota cycle reset is not anchored');
      logger.warn('[billing] family quota cycle reset is not anchored', {
        event: 'billing.family.quota_cycle_unanchored',
        subscriptionId,
        cycleResetAt: pool.cycleResetAt.toISOString(),
      });
      captureException(error, {
        extra: {
          context: 'billing.family.quota_cycle_unanchored',
          subscriptionId,
          cycleResetAt: pool.cycleResetAt.toISOString(),
        },
      });
      return null;
    }
    const cycleStartAt = resolvedCycleStartAt.toISOString();

    const members = await tx
      .select({
        profileId: person.id,
        name: person.displayName,
        roles: membership.roles,
      })
      .from(person)
      .innerJoin(membership, eq(membership.personId, person.id))
      .where(
        and(
          eq(membership.organizationId, access.subscription.accountId),
          isNull(person.archivedAt),
        ),
      )
      .orderBy(
        sql`CASE WHEN 'admin' = ANY(${membership.roles}) THEN 0 ELSE 1 END`,
        asc(person.displayName),
        asc(person.id),
      );
    const usageRows = await tx
      .select({
        profileId: usageEvents.profileId,
        used: sql<number>`coalesce(sum(${usageEvents.delta}), 0)::int`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.subscriptionId, subscriptionId),
          gte(usageEvents.occurredAt, new Date(cycleStartAt)),
        ),
      )
      .groupBy(usageEvents.profileId);
    const usedByProfile = new Map(
      usageRows.map((row) => [row.profileId, row.used]),
    );
    const memberUsage = members.map((member) => ({
      ...member,
      used: usedByProfile.get(member.profileId) ?? 0,
    }));
    const activeMemberUsedThisMonth = memberUsage.reduce(
      (sum, row) => sum + row.used,
      0,
    );
    const totalEventDelta = usageRows.reduce((sum, row) => sum + row.used, 0);
    const usedThisMonth = Math.max(0, totalEventDelta);
    const inactiveMemberUsedThisMonth = Math.max(
      0,
      usedThisMonth - activeMemberUsedThisMonth,
    );
    // usage_events contains both monthly-plan and top-up consumption. The
    // headline reports all consumption, while monthly enforcement can never
    // exceed the plan-funded allowance.
    const enforcedUsedThisMonth = Math.min(
      usedThisMonth,
      tierConfig.monthlyQuota,
    );

    // Display and enforcement are one state transition: repair both the
    // denominator and the counter to the same locked, current-cycle event sum.
    if (
      pool.monthlyLimit !== tierConfig.monthlyQuota ||
      pool.usedThisMonth !== enforcedUsedThisMonth
    ) {
      await tx
        .update(quotaPools)
        .set({
          monthlyLimit: tierConfig.monthlyQuota,
          usedThisMonth: enforcedUsedThisMonth,
          updatedAt: new Date(),
        })
        .where(eq(quotaPools.id, pool.id));
      logger.warn('[billing] repaired Family quota enforcement counter', {
        event: 'billing.family.quota_counter_repaired',
        subscriptionId,
        previousMonthlyLimit: pool.monthlyLimit,
        monthlyLimit: tierConfig.monthlyQuota,
        previousUsedThisMonth: pool.usedThisMonth,
        usedThisMonth: enforcedUsedThisMonth,
      });
      captureMessage('billing.family.quota_counter_repaired', {
        level: 'warning',
        extra: {
          subscriptionId,
          previousMonthlyLimit: pool.monthlyLimit,
          monthlyLimit: tierConfig.monthlyQuota,
          previousUsedThisMonth: pool.usedThisMonth,
          usedThisMonth: enforcedUsedThisMonth,
        },
        tags: { surface: 'billing.family.v2' },
      });
    }

    return {
      tier,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth,
      remainingQuestions: Math.max(0, tierConfig.monthlyQuota - usedThisMonth),
      profileCount: memberUsage.length,
      maxProfiles: tierConfig.maxProfiles,
      cycleStartAt,
      cycleResetAt: pool.cycleResetAt.toISOString(),
      dailyLimit: pool.dailyLimit,
      usedToday: pool.usedToday,
      inactiveMemberUsedThisMonth,
      memberUsage,
    };
  });
}
