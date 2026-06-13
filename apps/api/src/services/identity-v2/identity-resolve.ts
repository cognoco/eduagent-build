// ---------------------------------------------------------------------------
// CUT-B1 identity resolution (cutover-plan §2.2). The v2 equivalent of
// `findAccountByClerkId` for the account-resolve seam: looks up the identity
// graph by Clerk user id and returns the SAME account-shaped context the legacy
// path sets, so every downstream route/service is insulated.
//
// Legacy: `accounts` by clerk_user_id.
// v2:     `login` by clerk_user_id → `person` (via login.person_id) →
//         `membership` (roles) → `organization` (the account container).
//
// Load-bearing id identities (the deterministic reseed):
//   - account.id  := organization.id  (organization replaces the accounts
//     container; organization.id = accounts.id by the reseed)
//   - account.clerkUserId / email := login.clerk_user_id / login.email
//   - account.timezone := organization.timezone
//
// This module does NOT create anything — the v2 JIT bootstrap is DEFERRED to
// onboarding completion (OQ-1 option c; see identity-graph.ts). When no `login`
// row exists for the Clerk user, this returns null and the account-resolve seam
// sets a graphless identity context instead of provisioning.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  login,
  membership,
  organization,
  type Database,
} from '@eduagent/database';
import type { Account } from '../account';

/**
 * The resolved v2 identity graph for an authenticated Clerk user, shaped for
 * the seam. `account` is the byte-identical legacy `Account` context;
 * `personId` and `isOwner` are surfaced so the seam can build profileMeta
 * without a second round-trip. `roles` is the membership role set.
 */
export interface ResolvedIdentityV2 {
  account: Account;
  personId: string;
  organizationId: string;
  isOwner: boolean;
  roles: string[];
}

/**
 * Resolve the v2 identity graph by Clerk user id. Returns null when no `login`
 * row exists (pre-graph — onboarding not yet completed). NEVER creates rows:
 * v2 provisioning is deferred to the onboarding-completion bootstrap.
 */
export async function resolveIdentityV2(
  db: Database,
  clerkUserId: string,
): Promise<ResolvedIdentityV2 | null> {
  const loginRow = await db.query.login.findFirst({
    where: eq(login.clerkUserId, clerkUserId),
  });
  if (!loginRow) {
    return null;
  }

  // The person's home-org membership (v1: a single home org per person —
  // MMT-ADR-0010). `membership.roles` carries {admin, learner}; isOwner derives
  // from the admin role.
  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, loginRow.personId),
  });
  if (!membershipRow) {
    // A login with a person but no membership is a structurally-broken graph
    // (the bootstrap writes membership in the same transaction). Surface as
    // "unresolvable" rather than fabricating an account shape.
    return null;
  }

  const orgRow = await db.query.organization.findFirst({
    where: eq(organization.id, membershipRow.organizationId),
  });
  if (!orgRow) {
    return null;
  }

  const account: Account = {
    id: orgRow.id, // organization.id = accounts.id by the reseed
    clerkUserId: loginRow.clerkUserId,
    email: loginRow.email,
    timezone: orgRow.timezone,
    createdAt: orgRow.createdAt.toISOString(),
    updatedAt: orgRow.updatedAt.toISOString(),
  };

  return {
    account,
    personId: loginRow.personId,
    organizationId: orgRow.id,
    isOwner: membershipRow.roles.includes('admin'),
    roles: membershipRow.roles,
  };
}
