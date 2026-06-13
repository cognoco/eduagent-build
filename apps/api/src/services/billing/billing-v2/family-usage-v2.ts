// ---------------------------------------------------------------------------
// WI-722 — v2 twin of getUsageBreakdownForProfile (family.ts).
//
// CUT-B3 (WI-693) twinned the billing-REST surface but deliberately left
// getUsageBreakdownForProfile on the legacy path: it reads `family_links`
// (parent/child guardianship — CUT-B2's domain) interleaved with
// `usage_events`. The B3 executor declined to re-derive family-edge logic.
// This twin completes the cutover for that one function before the WI-586
// convergence flip freezes and drops `family_links`.
//
// The family-edge reads re-point onto the CUT-B2 guardianship reader
// (services/identity-v2/guardianship.ts) — there is NO duplicated family-edge
// logic here. The profile enumeration re-points from `profiles` (by
// account_id) onto person × membership (by organization_id), exactly as the
// other family-v2 twins do. `usage_events` is unchanged: profileId = person.id
// = profiles.id by the reseed contract, so the same usage rows aggregate.
//
// SEMANTIC EQUIVALENCE (the crux — see family-usage-v2.integration.test.ts):
// "behavior-preserving" is a trap when the new schema models the relationship
// differently. The legacy function's family-edge reads answer two booleans:
//   hasChildLink — viewer is a PARENT of ≥1 same-account child (family_links
//     where parent_profile_id = viewer, child in same account, not archived)
//   isChild      — viewer is a CHILD of ≥1 same-account parent (family_links
//     where child_profile_id = viewer, parent in same account, not archived)
// The guardianship edge (guardian_person_id × charge_person_id, revoked_at IS
// NULL) is the ratified image of family_links, and person.id = profiles.id, so:
//   hasChildLink ≡ getChargePersonIds(viewer).length > 0  (viewer is guardian)
//   isChild      ≡ getGuardianPersonIds(viewer).length > 0 (viewer is charge)
// The org-membership scope (organization_id) is the v2 image of the legacy
// same-account scope (account_id), so the edge sets are equivalent for the
// reseeded family. The integration test seeds ONE real family into BOTH stores
// and asserts the two functions return an equal breakdown.
//
// Flag-gated: dispatched by routes/billing.ts under IDENTITY_V2_ENABLED, the
// same per-route `v2 ? fnV2 : fn` ternary CUT-B3 established for every other
// billing-v2 seam. Legacy family.ts stays byte-identical when the flag is off.
// ---------------------------------------------------------------------------

import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import {
  person,
  membership,
  subscription as subscriptionTable,
  usageEvents,
  type Database,
} from '@eduagent/database';
import type { UsageBreakdown } from '../family';
import { getFamilyPoolBreakdownSharing } from '../../settings';
import {
  getChargePersonIds,
  getGuardianPersonIds,
} from '../../identity-v2/guardianship';

const EMPTY_BREAKDOWN: UsageBreakdown = {
  byProfile: [],
  familyAggregate: null,
  isOwnerBreakdownViewer: false,
  selfUsedToday: null,
  selfUsedThisMonth: null,
};

/**
 * v2 twin of getUsageBreakdownForProfile.
 *
 * @param input.subscriptionId Caller MUST verify ownership of this subscription
 *   before calling (same contract as the legacy function — the routes/billing.ts
 *   caller resolves the subscription from the authenticated account). This
 *   function does not enforce that the subscription belongs to the caller; it
 *   scopes every read to the subscription's organization.
 */
export async function getUsageBreakdownForProfileV2(
  db: Database,
  input: {
    subscriptionId: string;
    activeProfileId: string;
    monthlyLimit: number;
    cycleStartAt: string;
    dayStartAt: string;
  },
): Promise<UsageBreakdown> {
  // (1) subscription → organization. The v2 image of the legacy
  // findSubscriptionById__unscoped existence check; organizationId is the
  // scope key (legacy used sub.accountId).
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, input.subscriptionId),
    columns: { organizationId: true },
  });
  if (!sub) {
    return EMPTY_BREAKDOWN;
  }

  // (2) viewer membership — the v2 image of the legacy
  // `profiles WHERE account_id = sub.accountId AND id = activeProfileId AND
  // archived_at IS NULL` spoofing guard. Scoped to the subscription's org so a
  // profileId from another org cannot read this family's breakdown.
  const [viewer] = await db
    .select({
      id: person.id,
      displayName: person.displayName,
      roles: membership.roles,
    })
    .from(person)
    .innerJoin(
      membership,
      and(
        eq(membership.personId, person.id),
        eq(membership.organizationId, sub.organizationId),
      ),
    )
    .where(and(eq(person.id, input.activeProfileId), isNull(person.archivedAt)))
    .limit(1);

  if (!viewer) {
    return EMPTY_BREAKDOWN;
  }
  const viewerIsOwner = viewer.roles.includes('admin');

  // (3) org members — the v2 image of `profiles WHERE account_id = …`. Carries
  // the family-owner lookup (admin-role member) AND the per-profile rows the
  // breakdown enumerates, in one org scan.
  const orgMembers = await db
    .select({
      id: person.id,
      name: person.displayName,
      roles: membership.roles,
    })
    .from(person)
    .innerJoin(
      membership,
      and(
        eq(membership.personId, person.id),
        eq(membership.organizationId, sub.organizationId),
      ),
    )
    .where(isNull(person.archivedAt));

  const familyOwnerPersonId =
    orgMembers.find((m) => m.roles.includes('admin'))?.id ?? null;

  // (4) family-edge state via the CUT-B2 guardianship reader (NO family_links).
  // hasChildLink: viewer holds ≥1 active edge as guardian.
  // isChild:      viewer is the charge of ≥1 active edge.
  const chargeIds = await getChargePersonIds(db, viewer.id);
  const guardianIds = await getGuardianPersonIds(db, viewer.id);
  const hasChildLink = chargeIds.length > 0;
  const isChild = guardianIds.length > 0;

  // (5) usage aggregation. profileId = person.id, so the same usage_events rows
  // aggregate as in legacy. The legacy LEFT JOIN (profiles ⟕ usage_events)
  // becomes an org-member enumeration + an in-process join on the per-profile
  // usage sums, since the v2 member set comes from person × membership.
  const usageRows = await db
    .select({
      profileId: usageEvents.profileId,
      used: sql<number>`coalesce(sum(${usageEvents.delta}), 0)::int`,
      usedToday: sql<number>`coalesce(sum(case when ${
        usageEvents.occurredAt
      } >= ${new Date(input.dayStartAt)} then ${
        usageEvents.delta
      } else 0 end), 0)::int`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.subscriptionId, input.subscriptionId),
        gte(usageEvents.occurredAt, new Date(input.cycleStartAt)),
      ),
    )
    .groupBy(usageEvents.profileId);

  const usageByPerson = new Map(
    usageRows.map((r) => [
      r.profileId,
      { used: r.used, usedToday: r.usedToday },
    ]),
  );
  const profileRows = orgMembers.map((m) => ({
    profileId: m.id,
    name: m.name,
    used: usageByPerson.get(m.id)?.used ?? 0,
    usedToday: usageByPerson.get(m.id)?.usedToday ?? 0,
  }));

  // (6) sharing setting — familyPreferences is account-scoped, not an identity
  // table; familyOwnerPersonId = person.id = profiles.id, so no v2 twin needed.
  const sharingEnabled =
    familyOwnerPersonId != null
      ? await getFamilyPoolBreakdownSharing(db, familyOwnerPersonId)
      : false;

  // The gating logic below is byte-identical to the legacy function — only the
  // INPUTS (org members + guardianship edges) are sourced from the v2 store.
  const isOwnerBreakdownViewer =
    (viewerIsOwner && hasChildLink) ||
    (sharingEnabled && familyOwnerPersonId != null && hasChildLink && !isChild);
  const visibleRows = isOwnerBreakdownViewer
    ? profileRows
    : isChild
      ? []
      : profileRows.filter((row) => row.profileId === input.activeProfileId);
  const familyUsed = profileRows.reduce((sum, row) => sum + row.used, 0);
  const selfRow = profileRows.find(
    (row) => row.profileId === input.activeProfileId,
  );

  return {
    byProfile: visibleRows.map((row) => ({
      profile_id: row.profileId,
      name: row.name,
      used: row.used,
      usedToday: row.usedToday,
      is_self: row.profileId === input.activeProfileId,
    })),
    familyAggregate: isOwnerBreakdownViewer
      ? { used: familyUsed, limit: input.monthlyLimit }
      : null,
    isOwnerBreakdownViewer,
    selfUsedToday: isOwnerBreakdownViewer ? null : (selfRow?.usedToday ?? 0),
    selfUsedThisMonth: isOwnerBreakdownViewer ? null : (selfRow?.used ?? 0),
  };
}
