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

type ProfileMetaContextEnv = Env & {
  Variables: {
    profileMeta: ProfileMeta | undefined;
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
