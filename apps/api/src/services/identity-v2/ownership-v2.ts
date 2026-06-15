// ---------------------------------------------------------------------------
// CUT-B person-ownership write guards (WP-1 enumeration §4.2; cutover §3.1).
// The v2 twins of the private `verifyProfileOwnership` guard that fronts every
// write in `services/settings.ts` and `services/learner-profile.ts`.
//
// SECURITY (HIGH — the write-ownership boundary). The legacy guard
// `verifyProfileOwnership(db, profileId, accountId)` scoped a write to a
// profile owned by `accounts.id`. The v2 guard scopes the write to a person who
// is a MEMBER of the caller's organization, via the `membership` join. The org
// id is ALWAYS the caller's own resolved org (identity-resolve.ts:
// account.id = organization.id, resolved from the caller's
// login→membership→organization chain), NEVER a request parameter — so the
// membership-scoped predicate IS the ownership boundary: a caller resolved to
// org A can never mutate a person of org B, because a person in org B has no
// membership row with organization_id = A.
//
// This is the parent-chain pattern (direct db.select() enforcing the owning
// ancestor — membership.organizationId — in WHERE), the sanctioned alternative
// to the scoped repo for a guard that joins through a parent (AGENTS.md
// "Non-Negotiable Engineering Rules": writes verify ownership through the
// parent chain before mutating child records).
//
// Parity note: the legacy `verifyProfileOwnership` checks only (profiles.id,
// profiles.accountId) — it does NOT filter `archivedAt`. Ownership is a
// structural membership fact, not a lifecycle state, so the v2 guard mirrors
// this: it checks membership existence and does NOT exclude archived persons.
// (Contrast listProfilesV2, whose legacy twin `listProfiles` DID exclude
// archived rows — so it does too. The guards diverge because their legacy
// twins diverge.)
// ---------------------------------------------------------------------------

import { and, eq, sql } from 'drizzle-orm';
import { membership, type Database } from '@eduagent/database';

/**
 * Verify a person is a member of the caller's organization before a write.
 * The v2 twin of `verifyProfileOwnership(db, profileId, accountId)`.
 *
 * `organizationId` MUST be the caller's own resolved org id
 * (account.id = organization.id); the `membership` join scopes the guard to
 * that org and is the ownership boundary against cross-org writes. Throws
 * (matching the legacy guard's throw-on-miss contract) when the person has no
 * membership in this org.
 */
export async function verifyPersonOwnershipV2(
  db: Database,
  personId: string,
  organizationId: string,
): Promise<void> {
  const [owner] = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(
      and(
        eq(membership.personId, personId),
        eq(membership.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!owner) {
    throw new Error(`Person ${personId} not found for organization`);
  }
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
