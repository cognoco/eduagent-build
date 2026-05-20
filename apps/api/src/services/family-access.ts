// ---------------------------------------------------------------------------
// Family Access Service
// ---------------------------------------------------------------------------
// Shared helper for "can parent X manage child Y?" guards used by routes
// that expose parent-scoped endpoints (e.g., learner-profile child routes).
// Route files must not import ORM primitives or schema tables directly.

import { and, eq } from 'drizzle-orm';
import { familyLinks, type Database } from '@eduagent/database';
import { ForbiddenError } from '../errors';
import type { Context } from 'hono';
import type { ProfileMeta } from '../middleware/profile-scope';

/**
 * Returns true if the authenticated parent profile has a family link to the
 * given child profile. Used by parent-only routes to guard cross-family
 * access (IDOR protection).
 */
export async function hasParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<boolean> {
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId),
    ),
  });
  return Boolean(link);
}

/**
 * Throws `ForbiddenError` when `parentProfileId` has no family link to
 * `childProfileId`. Preferred over the return-type pattern because a missing
 * check is a compile-time error (unused variable) or runtime crash, not a
 * silent access bypass.
 */
export async function assertParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  if (!(await hasParentAccess(db, parentProfileId, childProfileId))) {
    throw new ForbiddenError('You do not have access to this child profile.');
  }
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
 * The `c` parameter accepts any Hono Context that exposes `profileMeta` via
 * `c.get(...)`. The loose `Context` type is intentional -- each route file
 * declares its own env type, and asserting the narrowest common shape here
 * would require a shared env union that buys nothing over this pattern.
 */
export async function assertOwnerAndParentAccess(
  c: Context & { get(key: 'profileMeta'): ProfileMeta | undefined },
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<void> {
  const profileMeta = c.get('profileMeta');
  if (profileMeta?.isOwner !== true) {
    throw new ForbiddenError(
      'Only the account owner can perform administrative actions on child profiles.',
    );
  }
  await assertParentAccess(db, parentProfileId, childProfileId);
}
