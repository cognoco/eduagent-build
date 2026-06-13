// ---------------------------------------------------------------------------
// CUT-B2 guardianship reads (cutover-plan §2.6 P3). The legacy `family_links`
// table (parent_profile_id × child_profile_id) is replaced by the ratified
// `guardianship` edge (guardian_person_id × charge_person_id, with revoked_at
// for history). A single active edge per (guardian, charge) pair is the live
// authority; `revoked_at IS NULL` is the liveness filter on every read.
//
// person.id = profiles.id, so guardian/charge ids are the legacy parent/child
// profile ids unchanged. These helpers re-point all P3 callers (family-access,
// family-bridge, dashboard, nudge, notifications, solo-progress-reports,
// weekly-digest, and the B2 Inngest functions) through one place.
//
// Approval of a consent request NEVER creates a guardianship edge (inv 14):
// edge creation stays with the add-child / family-join flows. These are reads
// only; the cutover does not introduce a v2 guardianship WRITE path (the legacy
// family_links writes live in the add-child flow, re-pointed at grep-clean).
// ---------------------------------------------------------------------------

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { guardianship, type Database } from '@eduagent/database';

/**
 * True when `guardianPersonId` holds an ACTIVE guardianship edge over
 * `chargePersonId` (`revoked_at IS NULL`). The v2 `hasParentAccess` /
 * family-link-existence replacement.
 */
export async function isGuardianOf(
  db: Database,
  guardianPersonId: string,
  chargePersonId: string,
): Promise<boolean> {
  const row = await db.query.guardianship.findFirst({
    where: and(
      eq(guardianship.guardianPersonId, guardianPersonId),
      eq(guardianship.chargePersonId, chargePersonId),
      isNull(guardianship.revokedAt),
    ),
    columns: { id: true },
  });
  return row != null;
}

/**
 * The active charge (child) person ids a guardian holds edges over. The v2
 * replacement for "list children of parent" reads (`family_links` where
 * `parent_profile_id = …`). Empty array when none.
 */
export async function getChargePersonIds(
  db: Database,
  guardianPersonId: string,
): Promise<string[]> {
  const rows = await db.query.guardianship.findMany({
    where: and(
      eq(guardianship.guardianPersonId, guardianPersonId),
      isNull(guardianship.revokedAt),
    ),
    columns: { chargePersonId: true },
  });
  return rows.map((r) => r.chargePersonId);
}

/**
 * The active guardian (parent) person ids that hold edges over a charge. The v2
 * replacement for "list parents of child" reads (`family_links` where
 * `child_profile_id = …`). Empty array when none.
 */
export async function getGuardianPersonIds(
  db: Database,
  chargePersonId: string,
): Promise<string[]> {
  const rows = await db.query.guardianship.findMany({
    where: and(
      eq(guardianship.chargePersonId, chargePersonId),
      isNull(guardianship.revokedAt),
    ),
    columns: { guardianPersonId: true },
  });
  return rows.map((r) => r.guardianPersonId);
}

/** One active guardianship edge: the v2 shape of a `family_links` row. */
export interface GuardianshipEdge {
  guardianPersonId: string;
  chargePersonId: string;
  grantedAt: Date;
}

/**
 * The active edges touching any of `personIds` as guardian OR charge — the v2
 * replacement for the `export.ts` `family_links` enumeration (which reads links
 * where the person is either parent or child). `grantedAt` stands in for the
 * legacy `created_at` the export carried.
 */
export async function getActiveEdgesForPersons(
  db: Database,
  personIds: readonly string[],
): Promise<GuardianshipEdge[]> {
  if (personIds.length === 0) return [];
  const ids = [...personIds];
  const rows = await db.query.guardianship.findMany({
    where: isNull(guardianship.revokedAt),
    columns: { guardianPersonId: true, chargePersonId: true, grantedAt: true },
  });
  // Filter in-process to the union of guardian-side and charge-side membership.
  // Pre-launch row counts are tiny; an OR(inArray, inArray) is the SQL form if
  // this ever needs to be pushed down.
  const idSet = new Set(ids);
  return rows.filter(
    (r) => idSet.has(r.guardianPersonId) || idSet.has(r.chargePersonId),
  );
}

/**
 * Batched "which of these charges does this guardian hold an active edge over?"
 * — returns the subset of `chargePersonIds` with a live edge from
 * `guardianPersonId`. Used by dashboard/notification fan-outs that already have
 * a candidate child set and need to filter to the ones under this guardian.
 */
export async function filterChargesUnderGuardian(
  db: Database,
  guardianPersonId: string,
  chargePersonIds: readonly string[],
): Promise<string[]> {
  if (chargePersonIds.length === 0) return [];
  const rows = await db.query.guardianship.findMany({
    where: and(
      eq(guardianship.guardianPersonId, guardianPersonId),
      inArray(guardianship.chargePersonId, [...chargePersonIds]),
      isNull(guardianship.revokedAt),
    ),
    columns: { chargePersonId: true },
  });
  return rows.map((r) => r.chargePersonId);
}
