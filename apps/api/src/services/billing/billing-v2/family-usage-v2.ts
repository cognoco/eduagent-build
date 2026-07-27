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
// Dispatched by routes/billing.ts when a profile-scoped breakdown is
// requested. [WI-868] The identity-v2 flag is gone; legacy family.ts still
// runs in parallel — convergence tracked in WI-1239.
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
    /**
     * Current-cycle usage retained from removed profiles. Kept separate from
     * memberUsage so no active profile inherits a former member's questions.
     */
    inactiveMemberUsedThisMonth?: number;
    /**
     * Optional member/cycle snapshot assembled by getFamilyPoolStatusV2.
     * Routes pass this for Family reads so the visible rows and aggregate use
     * the exact same member set and monthly event totals as the headline.
     */
    memberUsage?: Array<{
      profileId: string;
      name: string;
      roles: string[];
      used: number;
    }>;
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
  const viewer = input.memberUsage
    ? (() => {
        const row = input.memberUsage.find(
          (member) => member.profileId === input.activeProfileId,
        );
        return row
          ? { id: row.profileId, displayName: row.name, roles: row.roles }
          : undefined;
      })()
    : (
        await db
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
          .where(
            and(
              eq(person.id, input.activeProfileId),
              isNull(person.archivedAt),
            ),
          )
          .limit(1)
      )[0];

  if (!viewer) {
    return EMPTY_BREAKDOWN;
  }
  const viewerIsOwner = viewer.roles.includes('admin');

  // (3) org members — the v2 image of `profiles WHERE account_id = …`. Carries
  // the family-owner lookup (admin-role member) AND the per-profile rows the
  // breakdown enumerates, in one org scan.
  const orgMembers = input.memberUsage
    ? input.memberUsage.map((row) => ({
        id: row.profileId,
        name: row.name,
        roles: row.roles,
        used: row.used,
      }))
    : (
        await db
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
          .where(isNull(person.archivedAt))
      ).map((row) => ({ ...row, used: undefined }));

  const familyOwnerPersonId =
    orgMembers.find((m) => m.roles.includes('admin'))?.id ?? null;

  // (4) family-edge state via the CUT-B2 guardianship reader (NO family_links).
  // hasChildLink: viewer holds ≥1 active edge over an IN-ORG charge.
  // isChild:      viewer is the charge of ≥1 active edge from an IN-ORG guardian.
  //
  // The guardianship reader returns GLOBAL edges (across all orgs, including
  // edges whose other endpoint is non-member or archived). The legacy
  // family_links predicate only counted a link whose OTHER endpoint was a
  // non-archived profile in `viewer.accountId` (the EXISTS subquery — see
  // family.ts:346-368: `account_id = viewer.accountId AND archived_at IS NULL`).
  // So we intersect the edge endpoints with the same-org non-archived member
  // set before deriving the booleans. `orgMembers` already enforces BOTH legacy
  // conditions (same org via the membership join, non-archived via
  // `isNull(person.archivedAt)`), so this restores byte-for-byte equivalence and
  // closes the entitlement leak (an out-of-org edge must NOT flip these flags).
  const orgMemberIds = new Set(orgMembers.map((m) => m.id));
  const chargeIds = await getChargePersonIds(db, viewer.id);
  const guardianIds = await getGuardianPersonIds(db, viewer.id);
  const hasChildLink = chargeIds.some((id) => orgMemberIds.has(id));
  const isChild = guardianIds.some((id) => orgMemberIds.has(id));
  const formerMemberUsed = Math.max(0, input.inactiveMemberUsedThisMonth ?? 0);

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
    used: m.used ?? usageByPerson.get(m.id)?.used ?? 0,
    usedToday: usageByPerson.get(m.id)?.usedToday ?? 0,
  }));

  // (6) sharing setting — familyPreferences is account-scoped, not an identity
  // table; familyOwnerPersonId = person.id = profiles.id, so no v2 twin needed.
  const sharingEnabled =
    familyOwnerPersonId != null
      ? await getFamilyPoolBreakdownSharing(db, familyOwnerPersonId)
      : false;

  // An authenticated organization owner may always inspect their own
  // shared-pool breakdown, including before the first child is linked. The
  // sharing branch remains edge-gated, so this does not widen non-owner access.
  const isOwnerBreakdownViewer =
    viewerIsOwner ||
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
      ? {
          used: familyUsed + formerMemberUsed,
          limit: input.monthlyLimit,
          ...(formerMemberUsed > 0 ? { formerMemberUsed } : {}),
        }
      : null,
    isOwnerBreakdownViewer,
    selfUsedToday: isOwnerBreakdownViewer ? null : (selfRow?.usedToday ?? 0),
    selfUsedThisMonth: isOwnerBreakdownViewer ? null : (selfRow?.used ?? 0),
  };
}
