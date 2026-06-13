// ---------------------------------------------------------------------------
// CUT-B1 consent-status READ module (cutover-plan §2.3 / §2.3a).
//
// This is the READ side only. The consent WRITE machine (request lifecycle,
// grants, deletion) ships in CUT-B2; profileMeta v2 depends on the read side,
// so it lands here.
//
// The legacy `getConsentStatus` read one mutable `consent_states` row per
// profile (`ORDER BY requested_at DESC`). The ratified model SPLITS that into
// `consent_request` (the pre-grant workflow) and `consent_grant` (the
// append-only event log), so "current status" is a read-time reduction over
// two tables. This module implements that reduction faithfully, preserving
// every legacy mapping — including the deliberately bug-compatible
// latest-any-basis variant (the dual-row ambiguity BUG-466/465 fixed for
// dashboard, which the cutover preserves verbatim outside dashboard).
//
// Two public variants (§2.3a), both built on the same per-basis reducer:
//   - resolveConsentStatus(...basis): basis-EXPLICIT. The basis parameter is
//     REQUIRED, not defaulted — a basis-blind "latest row" read IS the
//     newer-COPPA-masks-GDPR bug. The GDPR-pinned callers pass
//     'gdpr_parental_consent' explicitly.
//   - resolveLatestConsentStatusAnyBasis / ...es (batched): the
//     deliberately-named bug-compatible read — latest row across bases,
//     exactly today's getConsentStatus / listProfiles L7-F1 semantics.
//
// Withdrawal persistence model (§2.3 v1.4): withdrawal stamps `withdrawn_at`
// on the live grant; restore / re-grant / age-transition APPENDS a new grant.
// "Current grant" = max(granted_at), tiebreak id DESC (the BUG-394 pattern).
// Age-transition supersedes the previous grant WITHOUT withdrawing it
// (data-model.md §6.2), so older granted+un-withdrawn rows are normal — only
// the current row's state counts. This windowing is load-bearing in both the
// reducer and the scan-side EXISTS form.
// ---------------------------------------------------------------------------

import { and, eq, sql } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  membership,
  type Database,
} from '@eduagent/database';
import type { ConsentStatus } from '@eduagent/schemas';

/** The default (and currently only) consent purpose. */
export const DEFAULT_CONSENT_PURPOSE = 'platform_use';

/**
 * The two regulatory bases the consent workflow runs per (mirroring the legacy
 * GDPR/COPPA dual-row coexistence). `requested_basis` on consent_request and
 * `lawful_basis` on consent_grant draw from the same value set.
 */
export type ConsentBasis = 'gdpr_parental_consent' | 'coppa_parental_consent';

/**
 * Fixed basis priority for the AnyBasis tiebreak (GDPR first), matching the
 * §2.3a ordering rule. Lower index = higher priority.
 */
const BASIS_PRIORITY: readonly ConsentBasis[] = [
  'gdpr_parental_consent',
  'coppa_parental_consent',
];

// ---------------------------------------------------------------------------
// Per-basis reducer (§2.3a step 1)
// ---------------------------------------------------------------------------

/**
 * The reduced state for one (charge, purpose, org, basis) key, plus the
 * legacy-faithful request-time ordering key used to pick a winner across bases.
 * `orderingKey` is null only when the basis has no rows at all (status null).
 */
interface BasisReduction {
  status: ConsentStatus | null;
  /**
   * Legacy-faithful request-time ordering key (§2.3a step 2):
   * COALESCE(request.requested_at, request.created_at, min(grant.granted_at)).
   * Why request-time and not last-transition time: legacy `getConsentStatus`
   * orders by `consent_states.requested_at`, and revoke/restore mutate
   * `responded_at` while `requested_at` NEVER moves — so a restored older basis
   * must not outrank a newer-requested one. Millisecond epoch; null = no rows.
   */
  orderingKey: number | null;
}

/**
 * Reduce one regulatory basis to a single 4-value status (§2.3a step 1).
 *
 * Current grant (max(granted_at), tiebreak id DESC) wins:
 *   - granted & withdrawn_at IS NULL → CONSENTED
 *   - granted & withdrawn_at IS NOT NULL → WITHDRAWN
 * A direct grant with NO request row (the parent-created-child path) reduces
 * here identically.
 *
 * No grant → the (≤1) request row for the basis-keyed unique:
 *   - 'pending'   → PENDING
 *   - 'requested' → PARENTAL_CONSENT_REQUESTED
 *   - 'denied'    → WITHDRAWN (legacy parity — deny wrote WITHDRAWN; deletion
 *                   in flight)
 *   - 'expired'   → PARENTAL_CONSENT_REQUESTED (legacy parity — legacy has no
 *                   EXPIRED status; an expired cycle stayed
 *                   PARENTAL_CONSENT_REQUESTED until the day-30 delete)
 *   - 'approved' with no grant is unreachable (the approval tx writes both).
 *
 * No rows at all → null.
 */
async function reduceBasisState(
  db: Database,
  chargePersonId: string,
  purpose: string,
  organizationId: string,
  basis: ConsentBasis,
): Promise<BasisReduction> {
  // Current grant for this basis = max(granted_at), tiebreak id DESC.
  const currentGrant = await db.query.consentGrant.findFirst({
    where: and(
      eq(consentGrant.chargePersonId, chargePersonId),
      eq(consentGrant.purpose, purpose),
      eq(consentGrant.organizationId, organizationId),
      eq(consentGrant.lawfulBasis, basis),
    ),
    orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
    columns: { granted: true, withdrawnAt: true, grantedAt: true },
  });

  // The (≤1 by §1.2 basis-keyed unique) request row for this basis.
  const request = await db.query.consentRequest.findFirst({
    where: and(
      eq(consentRequest.chargePersonId, chargePersonId),
      eq(consentRequest.purpose, purpose),
      eq(consentRequest.organizationId, organizationId),
      eq(consentRequest.requestedBasis, basis),
    ),
    columns: { status: true, requestedAt: true, createdAt: true },
  });

  // Ordering key: request requested_at → request created_at → min(grant.granted_at).
  let orderingKey: number | null = null;
  if (request) {
    const reqTs = request.requestedAt ?? request.createdAt;
    orderingKey = reqTs ? reqTs.getTime() : null;
  }
  if (orderingKey === null && currentGrant) {
    // No request row carrying a legacy requested_at — a post-cutover direct
    // grant. Use the earliest grant moment (row-creation), matching legacy's
    // requestedAt default-now. Grant appends (restore, age-transition) never
    // move the key — so use MIN, not the current grant's granted_at.
    const [minRow] = await db
      .select({
        // The Neon driver returns aggregate timestamps as ISO strings, not
        // Date objects — coerce explicitly (a `.getTime()` on the raw string
        // would throw, which the reducer integration test caught).
        minGrantedAt: sql<string | null>`min(${consentGrant.grantedAt})`,
      })
      .from(consentGrant)
      .where(
        and(
          eq(consentGrant.chargePersonId, chargePersonId),
          eq(consentGrant.purpose, purpose),
          eq(consentGrant.organizationId, organizationId),
          eq(consentGrant.lawfulBasis, basis),
        ),
      );
    orderingKey = minRow?.minGrantedAt
      ? new Date(minRow.minGrantedAt).getTime()
      : null;
  }

  let status: ConsentStatus | null;
  if (currentGrant) {
    status = currentGrant.withdrawnAt ? 'WITHDRAWN' : 'CONSENTED';
  } else if (request) {
    status = mapRequestStatus(request.status);
  } else {
    status = null;
  }

  return { status, orderingKey };
}

/** Legacy-parity mapping of a request.status with no current grant. */
function mapRequestStatus(requestStatus: string): ConsentStatus {
  switch (requestStatus) {
    case 'pending':
      return 'PENDING';
    case 'requested':
      return 'PARENTAL_CONSENT_REQUESTED';
    case 'denied':
      // Legacy parity: deny wrote WITHDRAWN (child deletion in flight).
      return 'WITHDRAWN';
    case 'expired':
      // Legacy parity: no EXPIRED status existed; an expired cycle stayed
      // PARENTAL_CONSENT_REQUESTED until the day-30 delete.
      return 'PARENTAL_CONSENT_REQUESTED';
    case 'approved':
      // Unreachable: the approval transaction writes the grant too, so a
      // current grant would have won above. Fall back conservatively.
      return 'CONSENTED';
    default:
      // An unknown status should never resolve to a permissive state.
      return 'PARENTAL_CONSENT_REQUESTED';
  }
}

// ---------------------------------------------------------------------------
// Basis-explicit variant (§2.3a)
// ---------------------------------------------------------------------------

/**
 * Resolve the 4-value consent status for ONE explicit regulatory basis.
 *
 * The basis parameter is REQUIRED, not defaulted — the GDPR-pinned call sites
 * (dashboard BUG-466/465, isGdprProcessingAllowed, the revocation-generation
 * check) pass 'gdpr_parental_consent' explicitly. A basis-blind latest-row read
 * is exactly the newer-COPPA-masks-GDPR bug those fixes closed; this resolver
 * cannot express it.
 */
export async function resolveConsentStatus(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  purpose: string,
  basis: ConsentBasis,
): Promise<ConsentStatus | null> {
  const { status } = await reduceBasisState(
    db,
    chargePersonId,
    purpose,
    organizationId,
    basis,
  );
  return status;
}

// ---------------------------------------------------------------------------
// AnyBasis variant — the deliberately-named bug-compatible read (§2.3a)
// ---------------------------------------------------------------------------

/**
 * Resolve the latest-across-bases consent status for ONE person — the
 * deliberately-named bug-compatible read reproducing today's `getConsentStatus`
 * semantics (a newer COPPA row shadows GDPR status; preserved on purpose per
 * the behavior-preserving mandate). The name carries the warning: no caller may
 * reach for it without meaning it. Converging these surfaces onto explicit
 * bases is a named post-cutover follow-up, never smuggled into a cutover PR.
 *
 * Winner = the basis whose reduction is non-null with the greatest
 * legacy-faithful request-time ordering key; tie → fixed basis priority (GDPR
 * first), then the basis order.
 */
export async function resolveLatestConsentStatusAnyBasis(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  purpose: string = DEFAULT_CONSENT_PURPOSE,
): Promise<ConsentStatus | null> {
  const reductions = await Promise.all(
    BASIS_PRIORITY.map(async (basis) => ({
      basis,
      reduction: await reduceBasisState(
        db,
        chargePersonId,
        purpose,
        organizationId,
        basis,
      ),
    })),
  );

  return pickAnyBasisWinner(reductions);
}

/**
 * Pick the AnyBasis winner from a per-basis reduction set. Pure — extracted so
 * the batched form reuses the exact tiebreak logic.
 */
function pickAnyBasisWinner(
  reductions: ReadonlyArray<{ basis: ConsentBasis; reduction: BasisReduction }>,
): ConsentStatus | null {
  let winner: { basis: ConsentBasis; reduction: BasisReduction } | null = null;
  for (const candidate of reductions) {
    if (candidate.reduction.status === null) continue;
    if (winner === null) {
      winner = candidate;
      continue;
    }
    const winnerKey = winner.reduction.orderingKey ?? -Infinity;
    const candidateKey = candidate.reduction.orderingKey ?? -Infinity;
    if (candidateKey > winnerKey) {
      winner = candidate;
    } else if (candidateKey === winnerKey) {
      // Tie → fixed basis priority (GDPR first).
      if (
        BASIS_PRIORITY.indexOf(candidate.basis) <
        BASIS_PRIORITY.indexOf(winner.basis)
      ) {
        winner = candidate;
      }
    }
  }
  return winner ? winner.reduction.status : null;
}

/**
 * Batched AnyBasis resolution over many persons — the listProfiles L7-F1
 * replacement. Returns a Map keyed by chargePersonId; persons with no consent
 * rows are absent from the map (caller treats absent as null, matching the
 * legacy per-profile lookup that returned null).
 *
 * Implemented as the same per-basis reduction run per person. Pre-launch row
 * counts are tiny; correctness parity with the single form (identical reducer +
 * tiebreak) is worth more than a hand-rolled window-function query that could
 * drift from the single-person path. If profiling later shows this is hot, the
 * §2.3a window form (row_number() OVER (PARTITION BY charge_person_id, basis))
 * is the drop-in set-based equivalent.
 */
export async function resolveLatestConsentStatusesAnyBasis(
  db: Database,
  chargePersonIds: readonly string[],
  organizationId: string,
  purpose: string = DEFAULT_CONSENT_PURPOSE,
): Promise<Map<string, ConsentStatus>> {
  const result = new Map<string, ConsentStatus>();
  await Promise.all(
    chargePersonIds.map(async (personId) => {
      const status = await resolveLatestConsentStatusAnyBasis(
        db,
        personId,
        organizationId,
        purpose,
      );
      if (status !== null) {
        result.set(personId, status);
      }
    }),
  );
  return result;
}

// ---------------------------------------------------------------------------
// GDPR processing gate (§2.5 (i)) — the shared re-point for isGdprProcessingAllowed
// ---------------------------------------------------------------------------

/**
 * v2 of `isGdprProcessingAllowed(db, profileId)` — the GDPR-pinned consent gate
 * that 7+ Inngest callers share. Legacy semantics: processing is allowed when
 * there is NO GDPR consent row OR the latest GDPR row is CONSENTED.
 *
 * Basis is pinned to 'gdpr_parental_consent' (basis-EXPLICIT — a basis-blind
 * read would be the BUG-466/465 bug). The org is resolved from the person's
 * membership (person.id = profileId); when the person has no membership (a
 * pre-graph or orphaned id), processing is allowed (matching legacy's "no row →
 * allowed" — there is nothing to gate on).
 */
export async function isGdprProcessingAllowedV2(
  db: Database,
  profileId: string,
): Promise<boolean> {
  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, profileId),
    columns: { organizationId: true },
  });
  if (!membershipRow) {
    // No org to anchor consent on — nothing to gate (legacy "no row → allowed").
    return true;
  }
  const status = await resolveConsentStatus(
    db,
    profileId,
    membershipRow.organizationId,
    DEFAULT_CONSENT_PURPOSE,
    'gdpr_parental_consent',
  );
  return status == null || status === 'CONSENTED';
}

// ---------------------------------------------------------------------------
// Scan-side EXISTS forms (§2.3a step 4)
// ---------------------------------------------------------------------------

/**
 * SQL predicate (for raw `db.select().where(...)` scans) that is true when SOME
 * basis's CURRENT grant for `personColumn` is granted and un-withdrawn.
 *
 * The windowing is load-bearing (§2.3a step 4): after grant₁ → age-transition
 * grant₂ → withdrawal of grant₂, grant₁ is still granted+un-withdrawn
 * (superseded, NOT withdrawn — canon §6.2). A naive
 * `EXISTS(granted AND withdrawn_at IS NULL)` would re-allow the scan. The
 * predicate therefore correlates each candidate grant to the per-basis
 * max(granted_at) so only the current row counts.
 *
 * @param personColumn a Drizzle SQL fragment for the scanned person id column
 *   (e.g. `sql\`${person.id}\``), correlated into the subquery.
 */
export function consentedExistsSql(personColumn: ReturnType<typeof sql>) {
  // Select the CURRENT grant by the exact BUG-394 ordering key the reducer
  // uses (granted_at DESC, id DESC) and require THAT row to be granted +
  // un-withdrawn. A `granted_at = max(granted_at)` correlation alone is
  // ambiguous when two grants share a timestamp: an older un-withdrawn row
  // could satisfy EXISTS even when the true current (higher-id) row is
  // withdrawn — incorrectly passing the gate. Keying on the id of the
  // tie-broken current row closes that.
  return sql`EXISTS (
    SELECT 1 FROM consent_grant cg
    WHERE cg.charge_person_id = ${personColumn}
      AND cg.purpose = ${DEFAULT_CONSENT_PURPOSE}
      AND cg.granted AND cg.withdrawn_at IS NULL
      AND cg.id = (
        SELECT cg2.id FROM consent_grant cg2
        WHERE cg2.charge_person_id = cg.charge_person_id
          AND cg2.purpose = cg.purpose
          AND cg2.organization_id = cg.organization_id
          AND cg2.lawful_basis = cg.lawful_basis
        ORDER BY cg2.granted_at DESC, cg2.id DESC
        LIMIT 1
      )
  )`;
}

/**
 * The legacy review-due-scan adult branch (`review-due-scan.ts:99`:
 * `…CONSENTED EXISTS … OR notExists(any consent rows)`). v2 form: the consent
 * gate is satisfied either when the current grant is CONSENTED (above) OR when
 * the person has NO consent rows at all (the adult who never needed consent).
 */
export function consentGateSatisfiedSql(personColumn: ReturnType<typeof sql>) {
  return sql`(
    ${consentedExistsSql(personColumn)}
    OR (
      NOT EXISTS (
        SELECT 1 FROM consent_request cr WHERE cr.charge_person_id = ${personColumn}
      )
      AND NOT EXISTS (
        SELECT 1 FROM consent_grant cg WHERE cg.charge_person_id = ${personColumn}
      )
    )
  )`;
}
