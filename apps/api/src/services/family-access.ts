// ---------------------------------------------------------------------------
// Family Access Service
// ---------------------------------------------------------------------------
// Shared helper for "can parent X manage child Y?" guards used by routes
// that expose parent-scoped endpoints (e.g., learner-profile child routes).
// Route files must not import ORM primitives or schema tables directly.

import { and, eq } from 'drizzle-orm';
import { familyLinks, type Database } from '@eduagent/database';
import { ForbiddenError } from '../errors';

/**
 * Returns true if the authenticated parent profile has a family link to the
 * given child profile. Used by parent-only routes to guard cross-family
 * access (IDOR protection).
 */
export async function hasParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<boolean> {
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
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
  childProfileId: string
): Promise<void> {
  if (!(await hasParentAccess(db, parentProfileId, childProfileId))) {
    throw new ForbiddenError('You do not have access to this child profile.');
  }
}
