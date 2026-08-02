// ---------------------------------------------------------------------------
// CUT-B person-ownership write guards (WP-1 enumeration §4.2; cutover §3.1).
// The v2 twins of the private `verifyProfileOwnership` guard that fronts every
// write in `services/settings.ts` and `services/learner-profile.ts`.
//
// SECURITY (HIGH — the write-AUTHORITY boundary, NOT mere visibility).
//
// Canon (data-model.md §2A.4, ontology.md inv 8, domain-model.md): membership
// grants **existence-visibility only**; WRITE authority is **self OR
// edge-derived**. A person reads+writes their OWN data intrinsically; writing
// ANOTHER person's data requires an authorized edge. So an org-membership check
// is the WRONG guard for a write — in any org with >1 credentialed person
// (every family org: guardian + charges), a same-org member who supplies
// another member's id would pass a membership-only guard and mutate that
// person's settings or memory. That is the IDOR this guard exists to deny.
//
// The guard therefore takes the AUTHENTICATED caller's own person id
// (`callerPersonId`, resolved from the login→person binding by the account
// middleware — NEVER request-supplied) and authorizes the write only when the
// caller is:
//   - SELF     — callerPersonId === targetPersonId, OR
//   - GUARDIAN — an active guardianship edge caller→target (isGuardianOf),
//     provided the target has no Login. Per domain-model.md §4, Guardianship
//     capability placement — Option A (MMT-ADR-0008), a credentialed charge
//     suppresses guardian operate/write authority. Guardian writes to a
//     credentialed charge are blocked by default (OPQ-32); exceptions may only
//     arrive as future named capabilities with provenance (WI-1765).
// Supporter edges are excluded by canon: §2A.4 makes the supporter edge
// data-access-only (read/visibility), never write.
//
// Org membership is retained as a defense-in-depth invariant (the target must
// still be a member of the caller's org), but it is NOT sufficient on its own.
//
// Parity note: the legacy `verifyProfileOwnership` checks only (profiles.id,
// profiles.accountId) — it does NOT filter `archivedAt`. The v2 guard mirrors
// this: it does not exclude archived persons. (Contrast listProfilesV2, whose
// legacy twin `listProfiles` DID exclude archived rows — so it does too. The
// guards diverge because their legacy twins diverge.)
// ---------------------------------------------------------------------------

import { and, eq, sql } from 'drizzle-orm';
import { login, membership, type Database } from '@eduagent/database';
// ForbiddenError comes from the schema package, which `../errors` re-exports
// verbatim — so route catch-blocks importing from `../errors` and this import
// are the same class; `instanceof` checks match either way.
import { ForbiddenError } from '@eduagent/schemas';
import { isGuardianOf } from './guardianship';

export type PersonOperationAuthorityV2 =
  | 'self'
  | 'managed-charge'
  | 'not-member'
  | 'credentialed-charge'
  | 'no-authority';

/**
 * Resolve whether the authenticated caller may operate as `personId`.
 *
 * Membership only proves that a Person exists in the same organization. It
 * does not grant authority to impersonate that Person. Operation is limited to
 * self, or an active guardian edge to a charge that has no Login.
 */
export async function resolvePersonOperationAuthorityV2(
  db: Database,
  personId: string,
  organizationId: string,
  callerPersonId: string,
): Promise<PersonOperationAuthorityV2> {
  const [member] = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(
      and(
        eq(membership.personId, personId),
        eq(membership.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!member) return 'not-member';

  if (callerPersonId === personId) return 'self';
  if (!(await isGuardianOf(db, callerPersonId, personId))) {
    return 'no-authority';
  }

  const [credential] = await db
    .select({ personId: login.personId })
    .from(login)
    .where(eq(login.personId, personId))
    .limit(1);
  return credential ? 'credentialed-charge' : 'managed-charge';
}

/**
 * Verify the authenticated caller has WRITE authority over `personId` before a
 * settings / learner-profile write. The v2 twin of
 * `verifyProfileOwnership(db, profileId, accountId)`.
 *
 * `organizationId` MUST be the caller's own resolved org id
 * (account.id = organization.id). `callerPersonId` MUST be the authenticated
 * caller's own person id (resolved from the login binding, never
 * request-supplied).
 *
 * Authorizes only when the target is a member of the org AND the caller is the
 * target (self) OR holds an active guardianship edge over a target with no
 * Login. Throws (matching the legacy guard's throw-on-miss contract)
 * otherwise.
 */
export async function verifyPersonOwnershipV2(
  db: Database,
  personId: string,
  organizationId: string,
  callerPersonId: string,
): Promise<void> {
  const authority = await resolvePersonOperationAuthorityV2(
    db,
    personId,
    organizationId,
    callerPersonId,
  );
  if (authority === 'not-member') {
    throw new Error(`Person ${personId} not found for organization`);
  }
  if (authority === 'self' || authority === 'managed-charge') {
    return;
  }
  if (authority === 'credentialed-charge') {
    throw new ForbiddenError(
      `WI-787 credentialed-charge suppression: guardian writes to credentialed charge ${personId} are blocked`,
    );
  }
  throw new Error(
    `Person ${callerPersonId} lacks write authority over person ${personId}`,
  );
}

/**
 * Verify a person is an ADMIN member of the caller's organization. The v2 twin
 * of the legacy `profiles.isOwner` read used by the owner-only settings writes
 * (`upsertWithdrawalArchivePreference`, `getOwnedFamilyPoolBreakdownSharing`,
 * `upsertFamilyPoolBreakdownSharing`). Per data-model.md §2B.3,
 * `is_owner → membership.roles @> '{admin}'`.
 *
 * Returns `true` when the person is an admin member of the org, `false`
 * otherwise (non-member OR member without the admin role) — mirroring the
 * legacy `!profile?.isOwner` check, which the callers convert into a
 * `ForbiddenError`.
 */
export async function verifyPersonIsOrgAdminV2(
  db: Database,
  personId: string,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ roles: membership.roles })
    .from(membership)
    .where(
      and(
        eq(membership.personId, personId),
        eq(membership.organizationId, organizationId),
        sql`${membership.roles} @> ARRAY['admin']::text[]`,
      ),
    )
    .limit(1);
  return !!row;
}
