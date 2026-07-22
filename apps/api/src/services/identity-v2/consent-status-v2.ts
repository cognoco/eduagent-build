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

import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  membership,
  type Database,
} from '@eduagent/database';
// [WI-2396] Direct reach-in (not the `services/session` barrel) — the barrel
// re-exports session-exchange.ts, which imports this module; importing the
// barrel here would cycle. session-crud.ts has no dependency back on this
// module. Precedented elsewhere (dashboard.ts, recaps.ts reach into
// session-crud.ts directly).
import { ConsentWithdrawnError } from '../session/session-crud';
import type {
  ConsentPurpose,
  ConsentStatus,
  ConsentAccountabilityRecord,
} from '@eduagent/schemas';
import { CONSENT_PURPOSES, consentPurposeSchema } from '@eduagent/schemas';

/**
 * The regulatory/lawful bases the consent workflow runs per (mirroring the
 * legacy GDPR/COPPA dual-row coexistence, plus the [WI-1193] adult self-consent
 * basis). `requested_basis` on consent_request and `lawful_basis` on
 * consent_grant draw from the same value set.
 *
 * `art6_1_a`: an adult (age >= 18) processing their OWN data with no guardian
 * in the picture — the GDPR Art 6(1)(a) data-subject-consent lawful basis, the
 * ratified MMT-ADR-0011 §3 `lawful_basis` value for adult self-processing.
 * `consent_request` has NO writer for this basis (see createIdentityGraph /
 * recordAdultSelfConsentV2 in consent-v2.ts): the acceptance IS the signup
 * action, so there is no pre-grant workflow to model.
 */
export type ConsentBasis =
  | 'gdpr_parental_consent'
  | 'coppa_parental_consent'
  | 'art6_1_a';

/**
 * Fixed basis priority for the AnyBasis tiebreak (GDPR first), matching the
 * §2.3a ordering rule. Lower index = higher priority.
 *
 * [WI-1193] Deliberately excludes `art6_1_a`: this list is the
 * bug-compatible legacy PARENTAL-consent reduction (see
 * `resolveLatestConsentStatusAnyBasis` below) that existing dashboard/family
 * call sites depend on verbatim. Adding the adult basis here would change
 * their output for every adult who now holds a self-consent grant — callers
 * that want the adult's status use the basis-explicit `resolveConsentStatus`
 * with `basis: 'art6_1_a'` instead.
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
  /**
   * The current grant's withdrawn_at timestamp — non-null when status is
   * WITHDRAWN. Surfaced here so dashboard callers can populate respondedAt
   * without an extra query (the grant row is already in hand). [WI-826]
   */
  withdrawnAt: Date | null;
}

/**
 * The per-(person, basis) facts a reduction needs, after I/O. Extracted so the
 * single-person and batched paths reduce IDENTICAL inputs through one pure
 * function (`reduceBasisFromRows`) — no second reduction implementation to drift.
 */
interface BasisRows {
  /** Current grant (max(granted_at), tiebreak id DESC), or null if none. */
  currentGrant: {
    granted: boolean;
    withdrawnAt: Date | null;
    grantedAt: Date;
  } | null;
  /** The (≤1 basis-keyed-unique) request row, or null if none. */
  request: {
    status: string;
    requestedAt: Date | null;
    createdAt: Date;
  } | null;
  /**
   * min(grant.granted_at) for the (person, purpose, org, basis) key — the
   * direct-grant ordering-key fallback. The Neon driver returns aggregate
   * timestamps as ISO strings; null when there are no grant rows.
   */
  minGrantedAt: string | null;
}

/**
 * Pure §2.3a reduction over already-fetched rows. The single-person and batched
 * paths both call this so their results are byte-identical — the only difference
 * is how the rows were fetched (per-person findFirst vs. set-based window query).
 */
function reduceBasisFromRows(rows: BasisRows): BasisReduction {
  const { currentGrant, request, minGrantedAt } = rows;

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
    orderingKey = minGrantedAt ? new Date(minGrantedAt).getTime() : null;
  }

  let status: ConsentStatus | null;
  if (currentGrant) {
    status = currentGrant.withdrawnAt ? 'WITHDRAWN' : 'CONSENTED';
  } else if (request) {
    status = mapRequestStatus(request.status);
  } else {
    status = null;
  }

  return {
    status,
    orderingKey,
    withdrawnAt: currentGrant?.withdrawnAt ?? null,
  };
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
 *
 * The I/O wrapper around `reduceBasisFromRows`: fetches the (≤1) current grant,
 * the (≤1) request row, and lazily the MIN(granted_at) fallback, then reduces.
 */
async function reduceBasisState(
  db: Database,
  chargePersonId: string,
  purpose: ConsentPurpose,
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

  // The direct-grant ordering-key fallback (MIN(granted_at)) is only consulted
  // when the request row supplies no ordering key — i.e. there is a grant but no
  // request (consent_request.created_at is NOT NULL, so a present request always
  // yields a key). Fetch it lazily so the common path stays at two round-trips.
  let minGrantedAt: string | null = null;
  const needsMin = currentGrant != null && request == null;
  if (needsMin) {
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
    minGrantedAt = minRow?.minGrantedAt ?? null;
  }

  return reduceBasisFromRows({
    currentGrant: currentGrant ?? null,
    request: request ?? null,
    minGrantedAt,
  });
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
      // Unreachable in a healthy write: approval atomically writes the grant.
      // A missing grant is not auditable consent, so fail closed.
      return 'PENDING';
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
  purpose: ConsentPurpose,
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

/**
 * Like resolveConsentStatus but also surfaces the current grant's withdrawn_at
 * so dashboard callers can populate respondedAt without an extra DB query.
 * Returns null when there are no consent rows for the basis. [WI-826]
 */
export async function resolveConsentStatusAndWithdrawnAt(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  purpose: ConsentPurpose,
  basis: ConsentBasis,
): Promise<{ status: ConsentStatus; withdrawnAt: Date | null } | null> {
  const { status, withdrawnAt } = await reduceBasisState(
    db,
    chargePersonId,
    purpose,
    organizationId,
    basis,
  );
  if (status === null) return null;
  return { status, withdrawnAt };
}

/**
 * Reduce one basis across the complete consent-purpose contract. No rows means
 * the workflow has never applied. Once any purpose has state, the relationship
 * fails closed until every purpose has a current unwithdrawn grant.
 */
function reduceConsentPurposeSet(
  reductions: readonly BasisReduction[],
): BasisReduction {
  const present = reductions.filter((row) => row.status !== null);
  if (present.length === 0) {
    return { status: null, orderingKey: null, withdrawnAt: null };
  }

  const orderingKeys = present
    .map((row) => row.orderingKey)
    .filter((value): value is number => value !== null);
  const orderingKey =
    orderingKeys.length > 0 ? Math.max(...orderingKeys) : null;
  const withdrawnTimes = present
    .map((row) => row.withdrawnAt?.getTime() ?? null)
    .filter((value): value is number => value !== null);
  const withdrawnAt =
    withdrawnTimes.length > 0 ? new Date(Math.max(...withdrawnTimes)) : null;

  if (present.some((row) => row.status === 'WITHDRAWN')) {
    return { status: 'WITHDRAWN', orderingKey, withdrawnAt };
  }
  if (
    present.length !== CONSENT_PURPOSES.length ||
    present.some((row) => row.status === 'PENDING')
  ) {
    return { status: 'PENDING', orderingKey, withdrawnAt: null };
  }
  if (present.some((row) => row.status === 'PARENTAL_CONSENT_REQUESTED')) {
    return {
      status: 'PARENTAL_CONSENT_REQUESTED',
      orderingKey,
      withdrawnAt: null,
    };
  }
  if (present.every((row) => row.status === 'CONSENTED')) {
    return { status: 'CONSENTED', orderingKey, withdrawnAt: null };
  }
  return { status: 'PENDING', orderingKey, withdrawnAt: null };
}

async function reduceConsentSetBasisState(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
): Promise<BasisReduction> {
  const reductions = await Promise.all(
    CONSENT_PURPOSES.map((purpose) =>
      reduceBasisState(db, chargePersonId, purpose, organizationId, basis),
    ),
  );
  return reduceConsentPurposeSet(reductions);
}

/** Resolve the complete guardian/non-adult purpose set for one explicit basis. */
export async function resolveConsentSetStatus(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
): Promise<ConsentStatus | null> {
  const { status } = await reduceConsentSetBasisState(
    db,
    chargePersonId,
    organizationId,
    basis,
  );
  return status;
}

/** Set-aware status plus the current withdrawal timestamp for dashboards. */
export async function resolveConsentSetStatusAndWithdrawnAt(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
): Promise<{ status: ConsentStatus; withdrawnAt: Date | null } | null> {
  const { status, withdrawnAt } = await reduceConsentSetBasisState(
    db,
    chargePersonId,
    organizationId,
    basis,
  );
  return status === null ? null : { status, withdrawnAt };
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
  purpose: ConsentPurpose,
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

/** Resolve the latest parental basis after reducing each basis across P. */
export async function resolveLatestConsentSetStatusAnyBasis(
  db: Database,
  chargePersonId: string,
  organizationId: string,
): Promise<ConsentStatus | null> {
  const reductions = await Promise.all(
    BASIS_PRIORITY.map(async (basis) => ({
      basis,
      reduction: await reduceConsentSetBasisState(
        db,
        chargePersonId,
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
 * The §2.3a window form: two set-based queries (one over consent_grant, one over
 * consent_request) fetch every (person × basis) fact at once, then the SAME pure
 * reducer (`reduceBasisFromRows`) and tiebreak (`pickAnyBasisWinner`) the
 * single-person path uses assemble each result — so the batched and per-person
 * forms are byte-identical, just with 2 round-trips instead of N×(2–3). This
 * replaced the per-person Promise.all fan-out (WI-797: a 4-person family issued
 * 16–24 parallel Neon queries and timed out the mobile profiles fetch).
 *
 * `fetchConsentBasisRows` keys per (person, basis) and feeds correct, isolated
 * inputs to the reducer — a cross-person key bug here would leak one person's
 * consent status onto another, so its isolation is covered by the
 * mixed-batch / no-cross-leakage integration tests.
 */
export async function resolveLatestConsentStatusesAnyBasis(
  db: Database,
  chargePersonIds: readonly string[],
  organizationId: string,
  purpose: ConsentPurpose,
): Promise<Map<string, ConsentStatus>> {
  const result = new Map<string, ConsentStatus>();
  if (chargePersonIds.length === 0) return result;

  const rowsByKey = await fetchConsentBasisRows(
    db,
    chargePersonIds,
    organizationId,
    purpose,
  );

  for (const personId of chargePersonIds) {
    const reductions = BASIS_PRIORITY.map((basis) => ({
      basis,
      reduction: reduceBasisFromRows(
        rowsByKey.get(basisRowKey(personId, basis)) ?? EMPTY_BASIS_ROWS,
      ),
    }));
    const status = pickAnyBasisWinner(reductions);
    if (status !== null) result.set(personId, status);
  }
  return result;
}

/** Batched latest-basis resolution for the complete guardian purpose set. */
export async function resolveLatestConsentSetStatusesAnyBasis(
  db: Database,
  chargePersonIds: readonly string[],
  organizationId: string,
): Promise<Map<string, ConsentStatus>> {
  const result = new Map<string, ConsentStatus>();
  if (chargePersonIds.length === 0) return result;

  const rowsByPurpose = await Promise.all(
    CONSENT_PURPOSES.map((purpose) =>
      fetchConsentBasisRows(db, chargePersonIds, organizationId, purpose),
    ),
  );
  for (const personId of chargePersonIds) {
    const reductions = BASIS_PRIORITY.map((basis) => ({
      basis,
      reduction: reduceConsentPurposeSet(
        rowsByPurpose.map((rows) =>
          reduceBasisFromRows(
            rows.get(basisRowKey(personId, basis)) ?? EMPTY_BASIS_ROWS,
          ),
        ),
      ),
    }));
    const status = pickAnyBasisWinner(reductions);
    if (status !== null) result.set(personId, status);
  }
  return result;
}

/**
 * Composite map key for a (person, basis) pair. The NUL separator is
 * collision-proof: a uuid and the two fixed ConsentBasis strings can never
 * contain a NUL byte, so no two distinct pairs map to the same key.
 */
function basisRowKey(chargePersonId: string, basis: ConsentBasis): string {
  return `${chargePersonId}\u0000${basis}`;
}

/** A (person, basis) pair with no grant and no request rows. */
const EMPTY_BASIS_ROWS: BasisRows = {
  currentGrant: null,
  request: null,
  minGrantedAt: null,
};

/**
 * Set-based fetch of the per-(person, basis) facts for many persons in one org.
 * Two queries:
 *   - grants: row_number() OVER (PARTITION BY charge_person_id, lawful_basis
 *     ORDER BY granted_at DESC, id DESC) picks the CURRENT grant (rn=1) — the
 *     same (granted_at DESC, id DESC) windowing the per-person findFirst uses —
 *     and min(granted_at) OVER the same partition supplies the ordering-key
 *     fallback in one pass.
 *   - requests: the ≤1 (basis-keyed-unique) request row per (person, basis).
 * Keyed per (person, basis) so each reduction sees only its own rows.
 */
async function fetchConsentBasisRows(
  db: Database,
  chargePersonIds: readonly string[],
  organizationId: string,
  purpose: ConsentPurpose,
): Promise<Map<string, BasisRows>> {
  const ids = [...chargePersonIds];
  const bases = [...BASIS_PRIORITY] as string[];

  const grantRows = await db
    .select({
      chargePersonId: consentGrant.chargePersonId,
      lawfulBasis: consentGrant.lawfulBasis,
      granted: consentGrant.granted,
      withdrawnAt: consentGrant.withdrawnAt,
      grantedAt: consentGrant.grantedAt,
      // Cast to int: row_number() is bigint, which the pg/Neon driver returns as
      // a string ("1") — the `rn === 1` comparison below would silently never
      // match without the cast (the equivalence guard caught exactly this).
      rn: sql<number>`(row_number() OVER (
        PARTITION BY ${consentGrant.chargePersonId}, ${consentGrant.lawfulBasis}
        ORDER BY ${consentGrant.grantedAt} DESC, ${consentGrant.id} DESC
      ))::int`,
      // min over the partition — same value on every row, read off the rn=1 row.
      minGrantedAt: sql<string>`min(${consentGrant.grantedAt}) OVER (
        PARTITION BY ${consentGrant.chargePersonId}, ${consentGrant.lawfulBasis}
      )`,
    })
    .from(consentGrant)
    .where(
      and(
        inArray(consentGrant.chargePersonId, ids),
        eq(consentGrant.purpose, purpose),
        eq(consentGrant.organizationId, organizationId),
        inArray(consentGrant.lawfulBasis, bases),
      ),
    );

  const requestRows = await db
    .select({
      chargePersonId: consentRequest.chargePersonId,
      requestedBasis: consentRequest.requestedBasis,
      status: consentRequest.status,
      requestedAt: consentRequest.requestedAt,
      createdAt: consentRequest.createdAt,
    })
    .from(consentRequest)
    .where(
      and(
        inArray(consentRequest.chargePersonId, ids),
        eq(consentRequest.purpose, purpose),
        eq(consentRequest.organizationId, organizationId),
        inArray(consentRequest.requestedBasis, bases),
      ),
    );

  const byKey = new Map<string, BasisRows>();
  const ensure = (key: string): BasisRows => {
    let rows = byKey.get(key);
    if (!rows) {
      rows = { currentGrant: null, request: null, minGrantedAt: null };
      byKey.set(key, rows);
    }
    return rows;
  };

  for (const g of grantRows) {
    const key = basisRowKey(g.chargePersonId, g.lawfulBasis as ConsentBasis);
    const rows = ensure(key);
    // min(granted_at) is constant across the partition — capture from any row.
    rows.minGrantedAt = g.minGrantedAt;
    if (g.rn === 1) {
      rows.currentGrant = {
        granted: g.granted,
        withdrawnAt: g.withdrawnAt,
        grantedAt: g.grantedAt,
      };
    }
  }

  for (const r of requestRows) {
    const key = basisRowKey(r.chargePersonId, r.requestedBasis as ConsentBasis);
    const rows = ensure(key);
    rows.request = {
      status: r.status,
      requestedAt: r.requestedAt,
      createdAt: r.createdAt,
    };
  }

  return byKey;
}

/**
 * Batched basis-EXPLICIT resolution over many persons for ONE org — the v2 of
 * the dashboard BUG-466/465 batch read (`dashboard.ts:840`, the GDPR-pinned
 * `consentByProfile` map). Pass `basis = 'gdpr_parental_consent'` for the
 * dashboard sites — a basis-blind read IS the newer-COPPA-masks-GDPR bug, so
 * this batched form is also basis-required. Returns a Map keyed by person id;
 * persons with no rows for the basis are absent (caller treats absent as null).
 */
export async function resolveConsentStatusesForBasis(
  db: Database,
  chargePersonIds: readonly string[],
  organizationId: string,
  purpose: ConsentPurpose,
  basis: ConsentBasis,
): Promise<Map<string, { status: ConsentStatus; withdrawnAt: Date | null }>> {
  const result = new Map<
    string,
    { status: ConsentStatus; withdrawnAt: Date | null }
  >();
  await Promise.all(
    chargePersonIds.map(async (personId) => {
      const row = await resolveConsentStatusAndWithdrawnAt(
        db,
        personId,
        organizationId,
        purpose,
        basis,
      );
      if (row !== null) result.set(personId, row);
    }),
  );
  return result;
}

/** Batched basis-explicit status for the complete guardian purpose set. */
export async function resolveConsentSetStatusesForBasis(
  db: Database,
  chargePersonIds: readonly string[],
  organizationId: string,
  basis: ConsentBasis,
): Promise<Map<string, { status: ConsentStatus; withdrawnAt: Date | null }>> {
  const result = new Map<
    string,
    { status: ConsentStatus; withdrawnAt: Date | null }
  >();
  await Promise.all(
    chargePersonIds.map(async (personId) => {
      const row = await resolveConsentSetStatusAndWithdrawnAt(
        db,
        personId,
        organizationId,
        basis,
      );
      if (row !== null) result.set(personId, row);
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
  const status = await resolveConsentSetStatus(
    db,
    profileId,
    membershipRow.organizationId,
    'gdpr_parental_consent',
  );
  return status == null || status === 'CONSENTED';
}

/**
 * [WI-2372] Consent gate for the live LLM/exchange pipeline (canon R5).
 *
 * `isGdprProcessingAllowedV2` is basis-pinned to `gdpr_parental_consent` — it
 * covers the child/parental-consent leg but says nothing about an adult's
 * independently-withdrawable self-consent (`art6_1_a`, purposes
 * `platform_use` + `llm_disclosure`, reachable via `PUT
 * /consent/self/withdraw`). This predicate checks BOTH legs: parental
 * withdrawal (via `isGdprProcessingAllowedV2`) OR either adult self-consent
 * purpose withdrawn denies processing.
 *
 * "No rows → allowed" per leg (matching `isGdprProcessingAllowedV2`'s legacy
 * semantics) — only an explicit WITHDRAWN status denies, so an adult with no
 * self-consent grant row (or no org membership) is never false-positived.
 */
export async function isLlmExchangeConsentAllowed(
  db: Database,
  profileId: string,
): Promise<boolean> {
  if (!(await isGdprProcessingAllowedV2(db, profileId))) return false;

  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, profileId),
    columns: { organizationId: true },
  });
  if (!membershipRow) return true;

  for (const purpose of CONSENT_PURPOSES) {
    const status = await resolveConsentStatus(
      db,
      profileId,
      membershipRow.organizationId,
      purpose,
      'art6_1_a',
    );
    if (status === 'WITHDRAWN') return false;
  }
  return true;
}

/**
 * [WI-2396] Consent-withdrawal gate for request-time LLM routes OUTSIDE the
 * exchange pipeline (canon R5) — curriculum, dictation, filing, subjects,
 * assessments, book-suggestions. Mirrors `assertExchangeConsent`'s placement
 * pattern (session-exchange.ts) so a withdrawn-consent profile's request
 * never reaches LLM dispatch. Reuses `isLlmExchangeConsentAllowed`, which
 * already checks both legs (parental withdrawal + adult self-consent
 * withdrawal), so a single call covers both. Thrown `ConsentWithdrawnError`
 * is mapped to 403 CONSENT_WITHDRAWN by the global onError handler
 * (index.ts).
 */
export async function assertLlmConsent(
  db: Database,
  profileId: string,
): Promise<void> {
  if (!(await isLlmExchangeConsentAllowed(db, profileId))) {
    throw new ConsentWithdrawnError();
  }
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
  const requiredPurposes = sql.join(
    CONSENT_PURPOSES.map((purpose) => sql`(${purpose})`),
    sql`, `,
  );
  return sql`EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT organization_id, lawful_basis
      FROM consent_grant
      WHERE charge_person_id = ${personColumn}
    ) consent_key
    WHERE NOT EXISTS (
      SELECT 1
      FROM (VALUES ${requiredPurposes}) AS required(purpose)
      WHERE NOT EXISTS (
        SELECT 1 FROM consent_grant cg
        WHERE cg.charge_person_id = ${personColumn}
          AND cg.organization_id = consent_key.organization_id
          AND cg.lawful_basis = consent_key.lawful_basis
          AND cg.purpose = required.purpose
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
      )
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

// ---------------------------------------------------------------------------
// [WI-1193] Accountability report (AC3 — GDPR Art 5(2)/7(1))
// ---------------------------------------------------------------------------

/**
 * [WI-1193 AC3] The CURRENT consent_grant row per (purpose, lawful_basis) for a
 * charge — lawful basis + the durable, versioned terms-acceptance fact +
 * accepted purposes, in ONE query, satisfying GDPR Art 5(2)/7(1) accountability
 * (must be able to demonstrate consent on request).
 *
 * [WI-1193 AC1] `termsAcceptedAt`/`termsVersion` come from the grant's
 * `audit_fact` (the durable terms-acceptance fact recorded at signup, kept
 * SEPARATE from the lawful basis per MMT-ADR-0011), NOT a rename of
 * `granted_at`. `termsAcceptedAt` falls back to `granted_at` and `termsVersion`
 * to null for grants written before the fact was captured, so pre-existing rows
 * still resolve. The withdrawal path MERGES `audit_fact`, so these survive a
 * withdrawal — the report proves consent WAS validly obtained even after it is
 * withdrawn.
 *
 * `DISTINCT ON (purpose, lawful_basis) ... ORDER BY purpose, lawful_basis,
 * granted_at DESC, id DESC` reuses the exact (granted_at DESC, id DESC)
 * tiebreak the reducer/window queries above use to pick the CURRENT grant per
 * key — this is that windowing expressed as a single-query DISTINCT ON instead
 * of per-basis round-trips, since a report spans every purpose/basis a charge
 * has ever held, not one basis at a time.
 */
export async function getConsentAccountabilityV2(
  db: Database,
  chargePersonId: string,
  organizationId: string,
): Promise<ConsentAccountabilityRecord[]> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (purpose, lawful_basis)
      purpose, lawful_basis, granted, granted_at, withdrawn_at, audit_fact
    FROM consent_grant
    WHERE charge_person_id = ${chargePersonId}
      AND organization_id = ${organizationId}
    ORDER BY purpose, lawful_basis, granted_at DESC, id DESC
  `)) as unknown as
    | Array<AccountabilityRow>
    | {
        rows: Array<AccountabilityRow>;
      };
  const list = Array.isArray(rows) ? rows : rows.rows;
  // The Neon driver returns raw `db.execute` timestamp columns as ISO strings,
  // not Date objects (the Drizzle query builder's type parsers don't apply to
  // a bare `sql` execute) — coerce explicitly, same pattern as the
  // `minGrantedAt` aggregate above.
  return list.map((r) => {
    const audit = parseAuditFact(r.audit_fact);
    const acceptedAt =
      typeof audit?.['termsAcceptedAt'] === 'string'
        ? (audit['termsAcceptedAt'] as string)
        : null;
    return {
      purpose: consentPurposeSchema.parse(r.purpose),
      lawfulBasis: r.lawful_basis,
      granted: r.granted,
      // Durable terms-acceptance moment; fall back to granted_at for grants
      // written before the fact was captured.
      termsAcceptedAt: acceptedAt
        ? new Date(acceptedAt)
        : new Date(r.granted_at),
      termsVersion:
        typeof audit?.['termsVersion'] === 'string'
          ? (audit['termsVersion'] as string)
          : null,
      withdrawnAt: r.withdrawn_at ? new Date(r.withdrawn_at) : null,
    };
  });
}

interface AccountabilityRow {
  purpose: string;
  lawful_basis: string;
  granted: boolean;
  granted_at: string | Date;
  withdrawn_at: string | Date | null;
  audit_fact: Record<string, unknown> | string | null;
}

/**
 * The Neon driver returns a jsonb column from a bare `sql` execute as a parsed
 * object, but be defensive against a string (some drivers return raw text) so
 * the accountability read never throws on a malformed row.
 */
function parseAuditFact(
  value: Record<string, unknown> | string | null,
): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
