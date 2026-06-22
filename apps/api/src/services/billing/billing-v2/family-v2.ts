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
// Flag-gated: dispatched by routes/billing.ts under IDENTITY_V2_ENABLED. Legacy
// family.ts stays byte-identical.
// ---------------------------------------------------------------------------

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import {
  person,
  membership,
  guardianship,
  subscription as subscriptionTable,
  type Database,
  findQuotaPool__unscoped,
} from '@eduagent/database';
import type { FamilyMember, SubscriptionTier } from '@eduagent/schemas';
import { getTierConfig } from '../../subscription';
import type { SubscriptionRow } from '../types';
import { createLogger } from '../../logger';
import { captureException } from '../../sentry';
import { getSubscriptionByAccountIdV2 } from './subscription-core-v2';
import { getEffectiveAccessForSubscriptionV2 } from './access-v2';
import { parseSubscriptionV2PlanTier } from './types-v2';

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

/**
 * v2 of getFamilyPoolStatus.
 */
export async function getFamilyPoolStatusV2(
  db: Database,
  subscriptionId: string,
): Promise<{
  tier: SubscriptionTier;
  monthlyLimit: number;
  usedThisMonth: number;
  remainingQuestions: number;
  profileCount: number;
  maxProfiles: number;
} | null> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
    columns: { planTier: true },
  });

  if (!sub) return null;
  const tier = parseSubscriptionV2PlanTier(sub.planTier);
  if (tier !== 'family' && tier !== 'pro') return null;

  const pool = await findQuotaPool__unscoped(db, subscriptionId);
  if (!pool) return null;

  const access = await getEffectiveAccessForSubscriptionV2(db, subscriptionId);
  const tierConfig = getTierConfig(access?.effectiveAccessTier ?? tier);
  const profileCount = await getProfileCountForSubscriptionV2(
    db,
    subscriptionId,
  );
  const remaining = Math.max(0, pool.monthlyLimit - pool.usedThisMonth);

  return {
    tier,
    monthlyLimit: pool.monthlyLimit,
    usedThisMonth: pool.usedThisMonth,
    remainingQuestions: remaining,
    profileCount,
    maxProfiles: tierConfig.maxProfiles,
  };
}
