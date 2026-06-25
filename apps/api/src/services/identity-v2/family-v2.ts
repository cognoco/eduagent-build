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

import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  consentGrant,
  membership,
  person,
  type Database,
} from '@eduagent/database';
import type { ConsentStatus } from '@eduagent/schemas';
import {
  DEFAULT_CONSENT_PURPOSE,
  resolveConsentStatusAndWithdrawnAt,
  resolveConsentStatusesForBasis,
} from './consent-status-v2';
import { getChargePersonIds, isGuardianOf } from './guardianship';
import { findOwnerPersonId } from './helpers';
import { ConsentNotAuthorizedError } from '../consent';

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
): Promise<{ status: ConsentStatus; withdrawnAt: Date | null } | null> {
  const organizationId = await resolveOrgId(db, childPersonId);
  if (!organizationId) return null;
  return resolveConsentStatusAndWithdrawnAt(
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
): Promise<Map<string, { status: ConsentStatus; withdrawnAt: Date | null }>> {
  return resolveConsentStatusesForBasis(
    db,
    childPersonIds,
    organizationId,
    DEFAULT_CONSENT_PURPOSE,
    GDPR_BASIS,
  );
}

/**
 * v2 `getChildConsentForParent`: the parent-dashboard child-status read
 * (`GET /v1/consent/:child/status`). Verifies the active guardianship edge
 * (throws ConsentNotAuthorizedError('view') on no edge — same as legacy), then
 * returns the child's GDPR consent status + the latest grant response
 * timestamp. Null when the child has no consent rows.
 */
export async function getChildConsentForParentV2(
  db: Database,
  childPersonId: string,
  guardianPersonId: string,
): Promise<{
  status: ConsentStatus;
  respondedAt: string | null;
  consentType: 'GDPR';
} | null> {
  if (!(await isGuardianOf(db, guardianPersonId, childPersonId))) {
    throw new ConsentNotAuthorizedError('view');
  }
  const consentRow = await getChildGdprConsentStatusV2(db, childPersonId);
  if (consentRow === null) return null;
  const { status } = consentRow;

  // respondedAt: the current GDPR grant's withdrawn_at (if withdrawn) or
  // granted_at, mirroring the legacy responded_at the dashboard countdown reads.
  const organizationId = await resolveOrgId(db, childPersonId);
  let respondedAt: string | null = null;
  if (organizationId) {
    const grant = await db.query.consentGrant.findFirst({
      where: and(
        eq(consentGrant.chargePersonId, childPersonId),
        eq(consentGrant.purpose, DEFAULT_CONSENT_PURPOSE),
        eq(consentGrant.lawfulBasis, GDPR_BASIS),
      ),
      orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
      columns: { grantedAt: true, withdrawnAt: true },
    });
    if (grant) {
      respondedAt = (grant.withdrawnAt ?? grant.grantedAt).toISOString();
    }
  }
  return { status, respondedAt, consentType: 'GDPR' };
}

/** The org a person belongs to (v1 single home org). Null when no membership. */
export async function resolveOrgIdForPerson(
  db: Database,
  personId: string,
): Promise<string | null> {
  return resolveOrgId(db, personId);
}

/**
 * v2 `resolveProfileRole`: 'guardian' when the person holds at least one active
 * guardianship edge over a charge, else 'self_learner'. The legacy version read
 * family_links by parent; v2 reads active guardianship edges.
 */
export async function resolveProfileRoleV2(
  db: Database,
  personId: string,
): Promise<'guardian' | 'self_learner'> {
  const charges = await getChargePersonIds(db, personId);
  return charges.length > 0 ? 'guardian' : 'self_learner';
}

/**
 * v2 of the recall-nudge-send guardian-child-name lookup: the display name of a
 * guardian's first active, non-archived child. The legacy version read the first
 * family_links child; v2 reads the first active guardianship charge. Null when
 * the guardian has no active non-archived child.
 */
export async function getFirstActiveChildNameV2(
  db: Database,
  guardianPersonId: string,
): Promise<string | null> {
  // [WI-959] Single bounded query: fetch all charge ids then resolve the first
  // active (non-archived) person in one IN-clause lookup instead of N serial
  // findFirst calls. Null when the guardian has no charges or all are archived.
  const charges = await getChargePersonIds(db, guardianPersonId);
  if (charges.length === 0) return null;
  const child = await db.query.person.findFirst({
    where: and(inArray(person.id, charges), isNull(person.archivedAt)),
    columns: { displayName: true },
  });
  return child?.displayName ?? null;
}

/**
 * v2 `getFamilyOwnerProfileId`: the org owner (admin membership) person id for a
 * child's home org — the consent-revocation notice recipient. The legacy version
 * resolved the owner via family_links → owner profile; v2 resolves via the
 * child's org → admin membership. Falls back to `fallbackGuardianPersonId` when
 * no org/owner is found (matching legacy's fallback to the event-sender).
 */
export async function getFamilyOwnerPersonIdV2(
  db: Database,
  childPersonId: string,
  fallbackGuardianPersonId: string,
): Promise<string> {
  const organizationId = await resolveOrgId(db, childPersonId);
  if (!organizationId) return fallbackGuardianPersonId;
  const ownerId = await findOwnerPersonId(db, organizationId);
  return ownerId ?? fallbackGuardianPersonId;
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
