// ---------------------------------------------------------------------------
// CUT-B2 family-service read twins (cutover-plan §2.6 P3/P4). The family-facing
// services (family-access, family-bridge, dashboard, nudge, notifications,
// solo-progress-reports, weekly-digest) share a small set of identity reads:
//   - parent→child authority (family_links → guardianship)
//   - child enumeration for a parent (family_links → guardianship)
//   - per-child GDPR consent status (consent_states → the basis-explicit
//     resolver; the BUG-466/465 dashboard path)
//   - GDPR processing gate (isGdprProcessingAllowed → isGdprProcessingAllowedV2)
//
// Rather than re-deriving these in each service twin, this module is the single
// v2 read seam the family services dispatch to. It composes the CUT-B1
// consent-status read module and the CUT-B2 guardianship reads — never
// re-implementing either. The consent reads here are basis-EXPLICIT
// (gdpr_parental_consent) because every family/dashboard consent surface is a
// GDPR-protection decision (a basis-blind read is the BUG-466/465 bug).
//
// person.id = profiles.id throughout. FLAG-GATED via the calling seam.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { membership, type Database } from '@eduagent/database';
import type { ConsentStatus } from '@eduagent/schemas';
import {
  DEFAULT_CONSENT_PURPOSE,
  resolveConsentStatus,
  resolveConsentStatusesForBasis,
} from './consent-status-v2';
import { getChargePersonIds, isGuardianOf } from './guardianship';

/** The GDPR basis — every family/dashboard consent read is a GDPR decision. */
const GDPR_BASIS = 'gdpr_parental_consent' as const;

/**
 * v2 `hasParentAccess`: the parent→child authority check via the active
 * guardianship edge. The family-access IDOR guard re-point.
 */
export async function hasParentAccessV2(
  db: Database,
  guardianPersonId: string,
  chargePersonId: string,
): Promise<boolean> {
  return isGuardianOf(db, guardianPersonId, chargePersonId);
}

/**
 * v2 "children of parent": the active charge person ids a guardian holds edges
 * over (family_links → guardianship). The dashboard / nudge / notification
 * child-enumeration re-point.
 */
export async function getChildPersonIdsForParentV2(
  db: Database,
  guardianPersonId: string,
): Promise<string[]> {
  return getChargePersonIds(db, guardianPersonId);
}

/**
 * v2 per-child GDPR consent status — the dashboard `getLatestConsentStatus` /
 * BUG-466 / BUG-465 re-point. The org is resolved from the child's membership
 * (person.id = profileId). Basis is pinned to GDPR (explicit — a basis-blind
 * read is the masked-GDPR bug those fixes closed). Returns null when no GDPR row
 * exists OR the child has no membership (an orphaned/pre-graph id).
 */
export async function getChildGdprConsentStatusV2(
  db: Database,
  childPersonId: string,
): Promise<ConsentStatus | null> {
  const organizationId = await resolveOrgId(db, childPersonId);
  if (!organizationId) return null;
  return resolveConsentStatus(
    db,
    childPersonId,
    organizationId,
    DEFAULT_CONSENT_PURPOSE,
    GDPR_BASIS,
  );
}

/**
 * v2 batched per-child GDPR consent status for ONE parent's children — the
 * dashboard `getChildrenForParent` batch `consentByProfile` re-point
 * (`dashboard.ts:840`). All children share the parent's org (v1 single home
 * org), so a single org resolution covers the batch. Returns a Map keyed by
 * child person id; children with no GDPR row are absent (caller treats absent as
 * null, matching legacy).
 */
export async function getChildrenGdprConsentStatusesV2(
  db: Database,
  organizationId: string,
  childPersonIds: readonly string[],
): Promise<Map<string, ConsentStatus>> {
  return resolveConsentStatusesForBasis(
    db,
    childPersonIds,
    organizationId,
    DEFAULT_CONSENT_PURPOSE,
    GDPR_BASIS,
  );
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** The org a person belongs to (v1 single home org). Null when no membership. */
async function resolveOrgId(
  db: Database,
  personId: string,
): Promise<string | null> {
  const row = await db.query.membership.findFirst({
    where: eq(membership.personId, personId),
    columns: { organizationId: true },
  });
  return row?.organizationId ?? null;
}
