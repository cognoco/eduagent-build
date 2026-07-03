// ---------------------------------------------------------------------------
// Family Access Service
// ---------------------------------------------------------------------------
// Shared helper for "can parent X manage child Y?" guards used by routes
// that expose parent-scoped endpoints (e.g., learner-profile child routes).
// Route files must not import ORM primitives or schema tables directly.

import { type Database } from '@eduagent/database';
import { ForbiddenError } from '../errors';
import { calculateAge } from './age-utils';
import type { Context, Env, Input } from 'hono';
import type { ProfileMeta } from '../middleware/profile-scope';
import {
  validateGuardianshipEdgeV2,
  validateGuardianChargeRelationshipV2,
} from './identity-v2/family-bridge-v2';
import { verifyPersonIsOrgAdminV2 } from './identity-v2/ownership-v2';

type ProfileMetaContextEnv = Env & {
  Variables: {
    profileMeta: ProfileMeta | undefined;
  };
};

type CallerOwnerContextEnv = Env & {
  Variables: {
    db: Database;
    account: { id: string } | undefined;
    callerPersonId: string | undefined;
  };
};

/**
 * Returns true if the authenticated parent profile has authority over the
 * given child profile. Delegates to the v2 guardianship edge
 * (`revoked_at IS NULL`). The boolean form for callers that branch on access.
 */
export async function hasParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<boolean> {
  return validateGuardianshipEdgeV2(db, parentProfileId, childProfileId);
}

/**
 * Throws `ForbiddenError` when `parentProfileId` has no authority over
 * `childProfileId`. Preferred over the return-type pattern because a missing
 * check is a compile-time error (unused variable) or runtime crash, not a
 * silent access bypass.
 */
export async function assertParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  return validateGuardianChargeRelationshipV2(
    db,
    parentProfileId,
    childProfileId,
  );
}

/**
 * [CR-2026-05-21-010] Guard for self-routes that mutate consent or collection
 * state on the caller's own learner profile.
 *
 * A non-owner MINOR child (isOwner:false and under 18) must NOT be able to
 * override parental consent decisions — e.g. wipe memory or toggle collection
 * — because the parent-on-behalf routes already require assertOwnerAndParentAccess.
 * Allowing the child to toggle the same switches on self would bypass the parent gate.
 *
 * Permitted callers:
 *   - Account owner profiles (isOwner === true), regardless of age.
 *   - Non-owner profiles that are 18+ adults (birthYear resolves to age >= 18).
 *     An adult sibling on a family plan can manage their own consent.
 *
 * Blocked callers:
 *   - Non-owner profiles under 18 (minor child on a parent's account).
 *   - Any profile where birthYear is missing/null (fail closed).
 *
 * The `c` parameter accepts any Hono Context that exposes `profileMeta`.
 */
export function assertCanManageOwnConsent<
  E extends ProfileMetaContextEnv,
  P extends string,
  I extends Input,
>(c: Context<E, P, I>): void {
  const profileMeta = c.get('profileMeta');
  // [Issue 901] Reject auto-synthesized owner identity. profileScopeMiddleware
  // auto-resolves the account OWNER profile (isOwner:true) when no X-Profile-Id
  // header is sent. Because the synthesized identity IS the owner, BOTH the
  // isOwner early-return below AND the adult-fallthrough would pass for a
  // headerless caller (privilege escalation). Consent management therefore
  // requires an explicitly selected, verified profile. A legit adult non-owner
  // still works: they send their OWN X-Profile-Id → resolvedVia:'explicit-header',
  // isOwner:false → falls to the age check → adult → permitted.
  if (profileMeta?.resolvedVia !== 'explicit-header') {
    throw new ForbiddenError(
      'Consent management requires an explicitly selected profile.',
    );
  }
  if (profileMeta.isOwner === true) {
    // Account owner always allowed to manage own consent.
    return;
  }
  // Non-owner: only allow if they are a verified adult (18+).
  // birthYear is non-null post-Epic 12 (NOT NULL column, migration 0017) but
  // we fail closed if somehow absent.
  const birthYear = profileMeta?.birthYear;
  if (birthYear == null) {
    throw new ForbiddenError(
      'Consent management requires a verified owner or adult profile.',
    );
  }
  // Use the canonical calculateAge() (getUTCFullYear-based) so this consent
  // age-gate shares one definition with calculateAge (age-utils.ts) and
  // getProfileAge (profile.ts). A local getFullYear() could disagree by a
  // year at the 18 boundary depending on host timezone.
  const age = calculateAge(birthYear);
  if (age < 18) {
    throw new ForbiddenError(
      'Minor profiles on a parent account cannot modify consent or collection settings. Ask your parent or guardian to make this change.',
    );
  }
  // Non-owner adult (18+): permitted.
}

/**
 * [CR-2026-05-19-H1] Combined owner + parent-access guard for routes that
 * perform parent-administrative actions on a child profile.
 *
 * 1. Checks that the active profile is the account owner (isOwner === true).
 *    A non-owner profile (child on a parent's account) cannot perform
 *    administrative actions even if a family link exists.
 * 2. Then delegates to assertParentAccess to verify the parent->child link
 *    (IDOR protection -- the owner cannot touch an unrelated child).
 *
 * Use this instead of bare assertParentAccess on all parent-admin routes so
 * that both guards fire at every call site without callers remembering to
 * add the isOwner check manually.
 *
 * The `c` parameter accepts any Hono Context whose route env exposes
 * `profileMeta`. Each route file keeps its own env type while this helper
 * preserves the concrete Bindings/Variables/Input shape at the call site.
 */
export async function assertOwnerAndParentAccess<
  E extends ProfileMetaContextEnv,
  P extends string,
  I extends Input,
>(
  c: Context<E, P, I>,
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  const profileMeta = c.get('profileMeta');
  if (profileMeta?.isOwner !== true) {
    throw new ForbiddenError(
      'Only the account owner can perform administrative actions on child profiles.',
    );
  }
  // [Issue 901] Reject auto-synthesized owner identity. profileScopeMiddleware
  // auto-resolves the account OWNER (isOwner:true) when no X-Profile-Id header
  // is sent — so an authenticated NON-OWNER caller could omit the header to
  // satisfy the isOwner check above (privilege escalation). Parent-admin actions
  // on child profiles require an explicitly selected, verified owner profile.
  if (profileMeta.resolvedVia !== 'explicit-header') {
    throw new ForbiddenError(
      'Only the account owner can perform administrative actions on child profiles.',
    );
  }
  await assertParentAccess(db, parentProfileId, childProfileId);
}

export function assertOwnerProfile<
  E extends ProfileMetaContextEnv,
  P extends string,
  I extends Input,
>(
  c: Context<E, P, I>,
  message = 'Only the account owner can view this surface.',
): void {
  const profileMeta = c.get('profileMeta');
  if (profileMeta?.isOwner !== true) {
    throw new ForbiddenError(message);
  }
  // [Issue 901] Reject auto-synthesized owner identity. profileScopeMiddleware
  // auto-resolves the account OWNER profile (isOwner:true) when no X-Profile-Id
  // header is sent — so an authenticated NON-OWNER caller could omit the header
  // to satisfy the isOwner check above (privilege escalation). Owner privileges
  // require an explicitly selected, verified owner profile.
  if (profileMeta.resolvedVia !== 'explicit-header') {
    throw new ForbiddenError(message);
  }
}

/**
 * [WI-1301 — R1 IDOR] Caller-identity owner gate for /account/* and
 * /billing/* surfaces.
 *
 * SECURITY (P1). assertOwnerProfile (above) derives owner authority from
 * `profileMeta.isOwner`, which reflects the profile RESOLVED FROM the
 * client-supplied X-Profile-Id header. profileScopeMiddleware verifies that
 * X-Profile-Id belongs to the caller's organization, but NOT that it is the
 * caller's OWN identity — in any multi-person org (every family org: owner +
 * non-owner children), an authenticated non-owner member can set
 * X-Profile-Id to a DIFFERENT member's id (e.g. the owner's) and pass
 * assertOwnerProfile's isOwner + resolvedVia checks while acting as
 * themselves. That is the exact IDOR this guard closes: it derives authority
 * from `callerPersonId` — resolved server-side from the authenticated
 * login->person binding by accountMiddleware, NEVER request-supplied — via
 * verifyPersonIsOrgAdminV2 (the v2 twin of the legacy `profiles.isOwner`
 * read, scoped to the caller's OWN person id, not the X-Profile-Id-selected
 * one).
 *
 * Deviation note: the WI-1301 AC names verifyPersonOwnershipV2 as the
 * reference primitive. That guard authorizes write authority over a TARGET
 * person (self-or-guardian) and requires a target person id; account/billing
 * routes act on the account/org itself, not on a target person, so
 * verifyPersonOwnershipV2(callerPersonId, callerPersonId) would be a
 * self===self tautology. verifyPersonIsOrgAdminV2(callerPersonId,
 * organizationId) is the primitive that actually expresses "is the caller an
 * org admin" and satisfies the AC's underlying requirement (authority from
 * server callerPersonId, never client X-Profile-Id).
 *
 * Used ALONGSIDE assertOwnerProfile / assertNotProxyMode at every
 * /account/* and /billing/* owner-or-proxy gate — both checks must pass.
 * assertOwnerProfile's own body is intentionally untouched (its X-Profile-Id
 * based pattern is shared by ~30 other route files outside this WI's AC
 * scope; a repo-wide sweep is a separate, tracked follow-up).
 */
export async function assertCallerIsAccountOwner<
  E extends CallerOwnerContextEnv,
  P extends string,
  I extends Input,
>(
  c: Context<E, P, I>,
  message = 'Only the account owner can perform this action.',
): Promise<void> {
  const account = c.get('account');
  const callerPersonId = c.get('callerPersonId');
  if (!account || !callerPersonId) {
    throw new ForbiddenError(message);
  }
  const db = c.get('db');
  const isCallerAdmin = await verifyPersonIsOrgAdminV2(
    db,
    callerPersonId,
    account.id,
  );
  if (!isCallerAdmin) {
    throw new ForbiddenError(message);
  }
}
