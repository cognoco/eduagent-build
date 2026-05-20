// ---------------------------------------------------------------------------
// Family Access Service
// ---------------------------------------------------------------------------
// Shared helper for "can parent X manage child Y?" guards used by routes
// that expose parent-scoped endpoints (e.g., learner-profile child routes).
// Route files must not import ORM primitives or schema tables directly.

import { and, eq } from 'drizzle-orm';
import { familyLinks, type Database } from '@eduagent/database';
import { ForbiddenError } from '../errors';
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
 * [CR-2026-05-19-H1] Combined owner + IDOR guard for parent-administrative
 * actions on child profiles.
 *
 * Checks isOwner FIRST so a non-owner profile (child on a parent's account)
 * cannot perform administrative actions even if the family link exists.
 * Delegates to assertParentAccess for the IDOR check after the owner check.
 */
export async function assertOwnerAndParentAccess(
  profileMeta: ProfileMeta | undefined,
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  if (profileMeta?.isOwner !== true) {
    throw new ForbiddenError(
      'Only the account owner can perform administrative actions on child profiles.',
    );
  }
  await assertParentAccess(db, parentProfileId, childProfileId);
}
