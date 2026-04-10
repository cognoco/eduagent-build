// ---------------------------------------------------------------------------
// Family Access Service
// ---------------------------------------------------------------------------
// Shared helper for "can parent X manage child Y?" guards used by routes
// that expose parent-scoped endpoints (e.g., learner-profile child routes).
// Route files must not import ORM primitives or schema tables directly.

import { and, eq } from 'drizzle-orm';
import { familyLinks, type Database } from '@eduagent/database';

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
