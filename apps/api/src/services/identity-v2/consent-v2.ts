// ---------------------------------------------------------------------------
// CUT-B2 consent WRITE machine (cutover-plan §2.3). The v2 twin of the legacy
// `services/consent.ts` write surface. It splits the legacy single mutable
// `consent_states` row into the ratified two-table model:
//   - `consent_request` — the pre-grant WORKFLOW (pending / requested states,
//     parent-email contact, response token + expiry, WI-374 abuse caps).
//   - `consent_grant`   — the append-only consent EVENT log (the decision).
//
// The READ side (status resolution) ships in CUT-B1's `consent-status-v2.ts`
// and is REUSED here — never re-implemented. This module owns the WRITES:
// request lifecycle, the approval grant, withdrawal, restore, the direct
// parent-created-child grant, and the consent-gated deletion predicates.
//
// Keys: a request is keyed by (charge_person_id × purpose × organization_id ×
// requested_basis); a grant by the same triple with `lawful_basis` recorded.
// person.id = profiles.id and organization.id = accounts.id by the deterministic
// reseed, so ids carry over unchanged from the legacy machine.
//
// Withdrawal persistence model (§2.3 v1.4): withdrawal STAMPS `withdrawn_at`
// (+ prior_value / audit_fact) on the live grant — the ONE sanctioned in-row
// transition. Restore / re-grant / age-transition APPEND a new grant row.
// "Append-only" means no row is ever deleted and no decision rewritten; the
// withdrawn_at stamp is the single in-row state change.
//
// Approval NEVER creates a guardianship edge (inv 14) — it writes a
// consent_grant and back-links it from the request (consent_grant_id).
//
// [WI-868] The identity-v2 flag is gone; these functions are called
// unconditionally now. `consent_request` has no legacy writer
// (single-live-store arg 2).
// ---------------------------------------------------------------------------

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  deletionAudit,
  membership,
  nudges,
  person,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import type {
  ConsentPurpose,
  ConsentStatus,
  ConsentType,
} from '@eduagent/schemas';
import {
  sendEmail,
  formatConsentRequestEmail,
  type EmailOptions,
} from '../notifications/email';
import { createLogger } from '../logger';
import { computeAgeBracketFromDate, CONSENT_PURPOSES } from '@eduagent/schemas';
import { inngest } from '../../inngest/client';
import { safeSend } from '../safe-non-core';
import {
  cancelStripeSubscriptionForErasure,
  type StripeClientLike,
} from '../billing/store-teardown';
import {
  type ConsentBasis,
  resolveLatestConsentSetStatusAnyBasis,
  resolveConsentSetStatus,
} from './consent-status-v2';
import {
  consentPersonLockKey,
  writeFinancialRecordsTx,
  type SubscriptionSnapshot,
} from './deletion-v2';
import { isGuardianOf } from './guardianship';

const logger = createLogger();

/** A pre-purpose-set email token cannot authorize newly introduced purposes. */
export class ConsentReconsentRequiredError extends Error {
  constructor() {
    super('This legacy consent link requires a new consent request');
    this.name = 'ConsentReconsentRequiredError';
  }
}

/**
 * [WI-2547] The caller is not an adult account owner, so they may not record an
 * adult self-consent. Deliberately ONE error for every ineligible shape (minor,
 * non-owner, unknown person, cross-organization) so the route's response cannot
 * be used to enumerate account membership or ages.
 */
export class AdultSelfConsentNotEligibleError extends Error {
  constructor() {
    super('This account is not eligible for adult self-consent');
    this.name = 'AdultSelfConsentNotEligibleError';
  }
}

// ---------------------------------------------------------------------------
// Error classes — re-exported 1:1 from the legacy machine so the route layer's
// `instanceof` checks work identically against either implementation. The v2
// machine throws the SAME error types; route-error mapping is unchanged.
// ---------------------------------------------------------------------------

export {
  ConsentResendLimitError,
  EmailDeliveryError,
  ConsentTokenNotFoundError,
  ConsentAlreadyProcessedError,
  ConsentTokenExpiredError,
  ConsentNotAuthorizedError,
  ConsentRecordNotFoundError,
  ConsentRecipientChangeLimitError,
  ConsentRequestNotFoundError,
  ConsentGracePeriodExpiredError,
  RESTORE_CONSENT_GRACE_PERIOD_MS,
} from '../consent';

import {
  ConsentResendLimitError,
  EmailDeliveryError,
  ConsentTokenNotFoundError,
  ConsentAlreadyProcessedError,
  ConsentTokenExpiredError,
  ConsentNotAuthorizedError,
  ConsentRecordNotFoundError,
  ConsentRecipientChangeLimitError,
  ConsentRequestNotFoundError,
  ConsentGracePeriodExpiredError,
  RESTORE_CONSENT_GRACE_PERIOD_MS,
} from '../consent';

// ---------------------------------------------------------------------------
// Caps (carried 1:1 from the legacy machine — same numbers, same semantics).
// ---------------------------------------------------------------------------

/** Maximum number of consent resends (PRD lines 415, 420). */
const MAX_CONSENT_RESENDS = 3;
/** [WI-374] Maximum recipient-email changes per request — separately capped so
 * rotating the recipient cannot reset the resend budget and bomb addresses. */
const MAX_RECIPIENT_CHANGES = 3;

// ---------------------------------------------------------------------------
// Basis mapping — the legacy ConsentType enum (GDPR / COPPA) maps 1:1 onto the
// v2 requested_basis / lawful_basis value set.
// ---------------------------------------------------------------------------

/** Map the legacy `ConsentType` to the v2 basis value. */
export function consentTypeToBasis(consentType: ConsentType): ConsentBasis {
  return consentType === 'COPPA'
    ? 'coppa_parental_consent'
    : 'gdpr_parental_consent';
}

// ---------------------------------------------------------------------------
// (1) createPendingConsentRequest — legacy createPendingConsentState
// ---------------------------------------------------------------------------

/**
 * Create a PENDING `consent_request` row without sending email — the v2
 * `createPendingConsentState`. Recorded at child-profile creation; the email is
 * sent later via `requestConsentV2` when the parent email is supplied.
 *
 * Idempotent on the basis-keyed unique: a repeat resets only a non-terminal
 * request set to 'pending' and clears stale token/recipient data. A terminal
 * legacy partial remains immutable so the caller must start explicit
 * re-consent instead of creating a mixed terminal/pending purpose set.
 */
export async function createPendingConsentRequest(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  consentType: ConsentType,
): Promise<void> {
  const basis = consentTypeToBasis(consentType);
  await withConsentPersonLock(db, chargePersonId, async (tx) => {
    const existing = await tx.query.consentRequest.findMany({
      where: requestSetKey(chargePersonId, organizationId, basis),
      columns: { status: true },
    });
    // A terminal legacy partial must remain historical as a whole. Inserting
    // only the missing purpose would create a mixed approved/pending set.
    if (
      existing.some(
        (row) => row.status === 'approved' || row.status === 'denied',
      )
    ) {
      return;
    }
    const rows = await tx
      .insert(consentRequest)
      .values(
        CONSENT_PURPOSES.map((purpose) => ({
          chargePersonId,
          organizationId,
          purpose,
          requestedBasis: basis,
          status: 'pending',
        })),
      )
      .onConflictDoUpdate({
        target: [
          consentRequest.chargePersonId,
          consentRequest.purpose,
          consentRequest.organizationId,
          consentRequest.requestedBasis,
        ],
        set: {
          status: 'pending',
          guardianEmail: null,
          token: null,
          tokenExpiresAt: null,
          respondedAt: null,
          updatedAt: sql`now()`,
        },
        // Database-side defense against a writer that does not share the lock.
        setWhere: sql`${consentRequest.status} NOT IN ('approved','denied')`,
      })
      .returning({ id: consentRequest.id });
    if (rows.length !== CONSENT_PURPOSES.length) {
      throw new Error('pending consent purpose-set write was incomplete');
    }
  });
}

// ---------------------------------------------------------------------------
// (2) createDirectConsentGrant — legacy createGrantedConsentState
// ---------------------------------------------------------------------------

/**
 * Parent-created child: write a CONSENTED `consent_grant` directly, with NO
 * request row (the in-app guardian consent needs no email workflow). The v2
 * `createGrantedConsentState`.
 *
 * Crucially, this does NOT create a guardianship edge (inv 14) — the legacy
 * function wrote a `family_links` row, but in the ratified model the edge is
 * owned by the add-child / family-join flow and is a precondition of this call,
 * not a side effect of it. The caller passes the guardian person id only for
 * the audit fact.
 */
export async function createDirectConsentGrant(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  consentType: ConsentType,
  guardianPersonId: string,
  snapshot: { ageAtGrant?: number; jurisdictionAtGrant?: string } = {},
): Promise<void> {
  const basis = consentTypeToBasis(consentType);
  const grantedAt = new Date();
  await db.insert(consentGrant).values(
    CONSENT_PURPOSES.map((purpose) => ({
      chargePersonId,
      organizationId,
      purpose,
      lawfulBasis: basis,
      granted: true,
      grantedAt,
      priorValue: null,
      auditFact: { source: 'parent_created_child', guardianPersonId },
      snapshotAgeAtGrant: snapshot.ageAtGrant ?? null,
      snapshotJurisdictionAtGrant: snapshot.jurisdictionAtGrant ?? null,
    })),
  );
}

// ---------------------------------------------------------------------------
// (2b) [WI-1193] Adult self-consent — record + independent-purpose withdraw.
//
// An adult (age >= 18) self-registering as the account owner has no guardian
// to consent on their behalf and no email workflow to run — the signup action
// itself is the terms-acceptance/consent event (mirrors createDirectConsentGrant's
// "no email workflow" reasoning above). This writes ONE CONSENTED consent_grant
// per purpose in CONSENT_PURPOSES (AC2 purpose split — each purpose
// is its own row, so withdrawing one never touches the other), basis =
// 'art6_1_a'. No consent_request row is written (there is no pre-grant
// workflow for this basis — see the ConsentBasis doc comment).
//
// Withdrawal is deliberately NOT `stampWithdrawal`/`revokeConsentV2`: those are
// GUARDIAN-authorized (isGuardianOf) and purpose-blind (hardcoded to
// the whole guardian purpose set) — neither fits here. An adult withdrawing their OWN
// consent has no guardian to check (authority = caller IS chargePersonId,
// enforced by the route/caller, same as the other self-service onboarding
// paths) and must be able to withdraw ONE purpose independently of the other
// (AC2 "revocable"), so this is a small, self-contained core rather than a
// purpose parameter threaded through the guardian-authorized functions.
// ---------------------------------------------------------------------------

/**
 * [WI-1193 AC1/AC2] Write the adult self-consent grants — one CONSENTED row per
 * CONSENT_PURPOSES purpose, basis='art6_1_a'. Called once,
 * inside the identity-graph bootstrap transaction, for a self-registered adult
 * owner. `db` may be a transaction handle (passed through unchanged, same
 * pattern as createDirectConsentGrant).
 */
export async function recordAdultSelfConsentV2(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  termsVersion?: string,
): Promise<void> {
  const now = new Date();
  await db.insert(consentGrant).values(
    CONSENT_PURPOSES.map((purpose) => ({
      chargePersonId,
      organizationId,
      purpose,
      lawfulBasis: 'art6_1_a' as const,
      granted: true,
      grantedAt: now,
      // [WI-1193 AC1] audit_fact carries the durable terms-acceptance fact as
      // its OWN keys — the moment the adult accepted plus the consent-policy
      // VERSION then in force — kept SEPARATE from the lawful basis
      // (MMT-ADR-0011: terms acceptance is a distinct, versioned fact, never
      // bundled into the basis). getConsentAccountabilityV2 surfaces these; the
      // withdrawal path MERGES rather than overwrites audit_fact so they survive
      // a withdrawal (Art 5(2)/7(1) must still prove consent WAS validly given).
      auditFact: {
        source: 'adult_self_signup',
        termsAcceptedAt: now.toISOString(),
        termsVersion: termsVersion ?? null,
      },
    })),
  );
}

/**
 * [WI-1193 AC2] Self-service withdrawal of ONE purpose's adult self-consent,
 * independent of any other purpose the same adult holds. The single sanctioned
 * in-row transition — stamp `withdrawn_at` (+ prior_value=true, audit_fact) on
 * the current grant for (chargePersonId, purpose, organizationId,
 * 'art6_1_a') — mirroring `stampWithdrawal`'s shape, but purpose-aware
 * and with no guardian check (the caller IS the consenting adult). Idempotent: a
 * second withdrawal of an already-withdrawn purpose returns the existing
 * `withdrawnAt`. Throws `ConsentRecordNotFoundError` if the purpose was never
 * granted for this person.
 */
export async function withdrawAdultSelfConsentV2(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  purpose: ConsentPurpose,
): Promise<RevokeConsentV2Result> {
  const current = await db.query.consentGrant.findFirst({
    where: and(
      eq(consentGrant.chargePersonId, chargePersonId),
      eq(consentGrant.purpose, purpose),
      eq(consentGrant.organizationId, organizationId),
      eq(consentGrant.lawfulBasis, 'art6_1_a'),
    ),
    orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
    columns: { id: true, withdrawnAt: true, auditFact: true },
  });
  if (!current) {
    throw new ConsentRecordNotFoundError();
  }
  if (current.withdrawnAt) {
    return { chargePersonId, withdrawnAt: current.withdrawnAt };
  }

  const now = new Date();
  // [WI-1193 AC1] MERGE audit_fact rather than overwrite: the durable
  // terms-acceptance fact (termsAcceptedAt/termsVersion) written at signup must
  // SURVIVE the withdrawal so getConsentAccountabilityV2 can still prove consent
  // WAS validly obtained (GDPR Art 5(2)/7(1) outlives the withdrawal). We only
  // flip `source` to the withdrawal marker.
  const priorAuditFact =
    current.auditFact && typeof current.auditFact === 'object'
      ? (current.auditFact as Record<string, unknown>)
      : {};
  // [WI-1193 #5] UPDATE ... RETURNING to learn whether THIS call won the
  // isNull(withdrawnAt) race. A concurrent withdrawal of the same grant leaves
  // exactly one winner; the loser's conditional UPDATE matches zero rows. Never
  // return the local `now` on a lost race — it was never persisted; re-read and
  // return the winner's stamped timestamp instead.
  const updated = await db
    .update(consentGrant)
    .set({
      withdrawnAt: now,
      priorValue: true,
      auditFact: { ...priorAuditFact, source: 'adult_self_withdrawal' },
    })
    .where(
      and(
        eq(consentGrant.id, current.id),
        eq(consentGrant.chargePersonId, chargePersonId),
        isNull(consentGrant.withdrawnAt),
      ),
    )
    .returning({ withdrawnAt: consentGrant.withdrawnAt });

  const won = updated[0]?.withdrawnAt;
  if (won) {
    return { chargePersonId, withdrawnAt: won };
  }

  // Lost the race: a concurrent caller already stamped the row. Return the
  // PERSISTED winner's timestamp, not this call's un-persisted `now`.
  const winner = await db.query.consentGrant.findFirst({
    where: eq(consentGrant.id, current.id),
    columns: { withdrawnAt: true },
  });
  return { chargePersonId, withdrawnAt: winner?.withdrawnAt ?? now };
}

// ---------------------------------------------------------------------------
// (2b) [WI-1193 AC1 — first-use repair] repairOrSignalAdultSelfConsentV2
// ---------------------------------------------------------------------------
// An adult owner who signed up BEFORE the adult self-consent bootstrap existed
// holds no `art6_1_a` grant — recordAdultSelfConsentV2 runs only inside the
// identity-graph bootstrap, which existing adults never re-enter. On an
// authenticated session bootstrap (GET /v1/profiles) we repair-or-signal:
//
//   (a) a genuinely captured VERSIONED terms-acceptance fact exists on a prior
//       grant → write the accountable `art6_1_a` record DERIVED from it, LEGACY
//       purpose only (granular purposes attach at the next REAL consent event,
//       never retroactively), provenance-marked.
//   (c) no versioned fact → write NOTHING and signal `needs_consent`; the client
//       drives a normal (re-)consent write. A version-less record fabricated
//       from the bare signup timestamp is rejected as weak GDPR Art 5(2)/7(1)
//       evidence (pm-ruling amendment 2026-07-18: the hard constraint governs —
//       never mint a consent record without a traceable VERSIONED event).
//
// Applies ONLY to an adult (age >= 18 — the codebase's established adult
// threshold, matching the bootstrap gate) account-OWNER (admin membership). The
// caller's own server-derived person id is passed (never request-supplied), so
// this is self-scoped and carries no cross-profile hazard.

/**
 * [WI-2547] The ONE advisory-lock key every adult self-consent writer takes.
 *
 * Both writers that can create an `art6_1_a` grant — the first-use repair
 * (`repairOrSignalAdultSelfConsentV2`) and the authenticated acceptance
 * (`acceptAdultSelfConsentV2`) — must serialise against EACH OTHER, not just
 * against themselves. They previously used two different namespaces, which left
 * a real duplicate-write race: `POST /consent/self/accept` is an authenticated
 * public contract with no dependency on the mobile gate, so an eligible adult
 * can call it directly while a concurrent `GET /profiles` bootstrap runs repair
 * case (a). With separate locks both transactions could observe no live
 * `platform_use` grant and each insert one, duplicating a canonical compliance
 * row. Sharing one key closes that.
 *
 * Keyed on the PERSON alone, deliberately not person+organization: the rows
 * these writers guard are person-charged (`consent_grant.charge_person_id`), so
 * a person-scoped key is the one that actually covers the invariant. It also
 * serialises the rare cross-organization case for the same person, which is
 * strictly safer and costs nothing real — a person accepting consent in two
 * organizations at the same instant is not a hot path.
 *
 * Exported so tests can queue on the same key without reaching into internals.
 * Deliberately distinct from `consentPersonLockKey` (the deletion/revocation
 * flow's key): merging with that would serialise these small writes behind a
 * heavy multi-table teardown for no invariant either one needs.
 */
export function adultSelfConsentLockKey(chargePersonId: string): string {
  return `adult-self-consent:${chargePersonId}`;
}

export type AdultSelfConsentRepairOutcome =
  | 'not_applicable'
  | 'already_present'
  | 'repaired'
  | 'needs_consent';

interface CapturedVersionedTermsFact {
  termsAcceptedAt: string;
  termsVersion: string;
}

/**
 * A GENUINELY captured versioned terms fact requires BOTH a real acceptance
 * moment AND a non-empty version. An unversioned fact (version null/absent) is
 * NOT a lawful repair source — see repairOrSignalAdultSelfConsentV2.
 */
function parseVersionedTermsFact(
  value: unknown,
): CapturedVersionedTermsFact | null {
  if (!value || typeof value !== 'object') return null;
  const fact = value as Record<string, unknown>;
  const acceptedAt = fact['termsAcceptedAt'];
  const version = fact['termsVersion'];
  if (
    typeof acceptedAt === 'string' &&
    acceptedAt.length > 0 &&
    typeof version === 'string' &&
    version.length > 0
  ) {
    return { termsAcceptedAt: acceptedAt, termsVersion: version };
  }
  return null;
}

/**
 * [WI-2547] The shared adult-account-OWNER gate: `admin` membership in THIS
 * organization AND an adult (18+) birth date. Extracted verbatim from
 * repairOrSignalAdultSelfConsentV2 so the repair path and the acceptance path
 * (acceptAdultSelfConsentV2) can never drift apart on who counts as eligible.
 *
 * Fail-closed on every unknown: absent/non-admin membership (which also covers
 * a CROSS-ORGANIZATION caller — no membership row in the passed org), missing
 * person row, unparseable birth date, or any non-adult bracket.
 *
 * computeAgeBracketFromDate is the canonical feature-gating / safety-adjacent
 * age function AGENTS.md §Profile Shapes names for the adult-owner gate
 * (exact-date UTC math, year-only fallback when month/day are absent — never
 * the year-only computeAgeBracket, which overestimates by up to 11 months and
 * could read a late-in-the-year 17-year-old as 18). `birthDate` is the
 * `YYYY-MM-DD` date column.
 */
export async function isAdultAccountOwnerV2(
  db: Database,
  personId: string,
  organizationId: string,
): Promise<boolean> {
  const membershipRow = await db.query.membership.findFirst({
    where: and(
      eq(membership.personId, personId),
      eq(membership.organizationId, organizationId),
    ),
    columns: { roles: true },
  });
  if (!membershipRow?.roles.includes('admin')) return false;

  const personRow = await db.query.person.findFirst({
    where: eq(person.id, personId),
    columns: { birthDate: true },
  });
  if (!personRow) return false;

  const birthDate = String(personRow.birthDate);
  const birthYear = Number(birthDate.slice(0, 4));
  const birthMonth = Number(birthDate.slice(5, 7));
  const birthDay = Number(birthDate.slice(8, 10));
  if (!Number.isFinite(birthYear)) return false;
  return (
    computeAgeBracketFromDate(
      birthYear,
      Number.isFinite(birthMonth) ? birthMonth : undefined,
      Number.isFinite(birthDay) ? birthDay : undefined,
    ) === 'adult'
  );
}

export async function repairOrSignalAdultSelfConsentV2(
  db: Database,
  chargePersonId: string,
  organizationId: string,
): Promise<AdultSelfConsentRepairOutcome> {
  // Gate: adult (18+) account-OWNER only. A non-owner (managed-child login) or a
  // minor owner never receives an adult self-consent record.
  if (!(await isAdultAccountOwnerV2(db, chargePersonId, organizationId))) {
    return 'not_applicable';
  }

  // Fast path: already bootstrapped (case b) or previously repaired — nothing to
  // do. Re-checked authoritatively inside the locked transaction below.
  const existing = await db.query.consentGrant.findFirst({
    where: and(
      eq(consentGrant.chargePersonId, chargePersonId),
      eq(consentGrant.lawfulBasis, 'art6_1_a'),
    ),
    columns: { id: true },
  });
  if (existing) return 'already_present';

  // The ONLY lawful repair source: a genuinely captured VERSIONED terms fact on
  // a prior grant for this person.
  const priorGrants = await db.query.consentGrant.findMany({
    where: eq(consentGrant.chargePersonId, chargePersonId),
    columns: { auditFact: true },
  });
  let versioned: CapturedVersionedTermsFact | null = null;
  for (const g of priorGrants) {
    versioned = parseVersionedTermsFact(g.auditFact);
    if (versioned) break;
  }
  if (!versioned) return 'needs_consent'; // (c) never fabricate
  // const captures the non-null narrowing for the transaction closure below.
  const fact = versioned;

  // Serialise the write per-person with a pg_advisory_xact_lock so two
  // concurrent bootstraps for the same owner cannot both clear the guard and
  // write duplicate art6_1_a rows into this GDPR compliance table. There is no
  // unique constraint on (charge_person_id, lawful_basis) — the AC2 purpose
  // split means a person legitimately holds several art6_1_a grants — so a plain
  // insert cannot be made idempotent by ON CONFLICT here. Same idiom as
  // services/nudge.ts. Double-checked: re-read existing INSIDE the lock so the
  // loser of a race early-outs instead of inserting.
  //
  // [WI-2547] The key is the SHARED adultSelfConsentLockKey, so this also
  // serialises against acceptAdultSelfConsentV2 — the other writer that can
  // create an art6_1_a grant for this person.
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${adultSelfConsentLockKey(
        chargePersonId,
      )}, 0))`,
    );

    const existingLocked = await tx.query.consentGrant.findFirst({
      where: and(
        eq(consentGrant.chargePersonId, chargePersonId),
        eq(consentGrant.lawfulBasis, 'art6_1_a'),
      ),
      columns: { id: true },
    });
    if (existingLocked) return 'already_present';

    // (a) Repair from the captured versioned fact. Legacy purpose only.
    await tx.insert(consentGrant).values({
      chargePersonId,
      organizationId,
      // Existing-account repair can restore only the platform purpose proven
      // by this row's versioned acceptance evidence; it must never infer the
      // independent LLM-disclosure purpose.
      purpose: CONSENT_PURPOSES[0],
      lawfulBasis: 'art6_1_a',
      granted: true,
      grantedAt: new Date(),
      auditFact: {
        source: 'adult_self_consent_repair',
        termsAcceptedAt: fact.termsAcceptedAt,
        termsVersion: fact.termsVersion,
        // Provenance: the ORIGINAL terms-acceptance event this record derives from.
        repairedFromEventAt: fact.termsAcceptedAt,
      },
    });
    return 'repaired'; // (a)
  });
}

// ---------------------------------------------------------------------------
// (2c) [WI-2547] acceptAdultSelfConsentV2 — the user-reachable ACCEPTANCE write
// ---------------------------------------------------------------------------
// repairOrSignalAdultSelfConsentV2 case (c) signals `needs_consent` and writes
// nothing, deliberately: it will not fabricate a consent record without a
// traceable versioned event. This is the function that closes that loop — the
// adult performs a REAL consent event in the app, and we record it.
//
// Why this does NOT reuse repair's `already_present` gate: that gate matches on
// (chargePersonId, lawfulBasis) with NO purpose predicate, while repair inserts
// only CONSENT_PURPOSES[0]. An adult repaired into platform_use alone therefore
// looks "already present" — reusing it here would silently never grant
// llm_disclosure for exactly the legacy population this flow exists to serve.
// Acceptance is decided PER PURPOSE instead.

/**
 * [WI-2547] Record an authenticated adult's acceptance of their OWN processing
 * + LLM-disclosure consent, one `art6_1_a` grant per purpose in CONSENT_PURPOSES.
 *
 * Per-purpose and idempotent under retry AND concurrent submit:
 *   - a LIVE grant (granted, not withdrawn) is left exactly as-is — never
 *     duplicated, never weakened, never re-stamped;
 *   - an ABSENT or WITHDRAWN purpose is granted afresh (the re-consent case).
 * Returns the purposes this call actually wrote, so a replay returns `[]`.
 *
 * Authority: the caller passes their OWN server-derived person id
 * (`callerPersonId` from the verified login binding) — never a request-supplied
 * identifier — so this is self-scoped and carries no cross-profile hazard.
 * Eligibility is the shared adult-account-owner gate; every ineligible shape
 * throws AdultSelfConsentNotEligibleError BEFORE any write.
 *
 * `termsVersion` is the server's CONSENT_POLICY_VERSION, stamped into the
 * versioned acceptance audit fact and kept separate from the lawful basis
 * (MMT-ADR-0011: terms acceptance is a distinct, versioned fact).
 */
export async function acceptAdultSelfConsentV2(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  termsVersion: string,
): Promise<ConsentPurpose[]> {
  if (!(await isAdultAccountOwnerV2(db, chargePersonId, organizationId))) {
    throw new AdultSelfConsentNotEligibleError();
  }

  // Serialise per person on the SHARED adultSelfConsentLockKey, so no two
  // art6_1_a writers can both observe an absent grant and each insert a row.
  // There is no unique constraint to lean on here: a person legitimately holds
  // one art6_1_a row per purpose (the AC2 purpose split), so ON CONFLICT cannot
  // express this idempotency.
  //
  // Scope of the lock. It covers BOTH writers that can create an art6_1_a grant:
  //   - accept vs. accept — the retry / concurrent-submit case the AC names;
  //   - accept vs. first-use REPAIR — repairOrSignalAdultSelfConsentV2 takes the
  //     same key. This is a real race, not a theoretical one: this function
  //     backs an authenticated public API contract, and the mobile gate is a UI
  //     affordance, NOT an authorization precondition on the route. An eligible
  //     adult can call the endpoint directly while a concurrent GET /profiles
  //     bootstrap runs repair case (a); with the two writers on separate keys
  //     both could see no live platform_use grant and each insert one,
  //     duplicating a canonical compliance row and breaking this function's own
  //     "existing valid grants are never duplicated" guarantee. Their write
  //     cases are NOT mutually exclusive, and nothing about the product flow may
  //     be relied on to keep them apart.
  // withdrawAdultSelfConsentV2 takes NO lock and is not given one here: it is
  // already race-safe within itself (a conditional UPDATE ... WHERE
  // withdrawn_at IS NULL ... RETURNING, so concurrent withdrawals leave exactly
  // one winner), and every accept-vs-withdraw interleaving resolves to a
  // legitimate serialisation rather than a lost update:
  //   - accept reads a LIVE grant and skips, then withdraw stamps it → the
  //     accept simply ordered before the withdrawal; withdrawn is correct.
  //   - withdraw commits first, then accept reads WITHDRAWN and re-grants → the
  //     accept ordered after; granted is correct.
  //   - a withdrawal racing an accept on an ALREADY-withdrawn row is a no-op by
  //     design (it returns the existing withdrawnAt), so nothing is lost.
  // Neither order can duplicate a live grant or drop a committed write, so
  // widening the lock to the withdrawal path would add contention to a shipped,
  // separately-tested code path without fixing a demonstrable defect.

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${adultSelfConsentLockKey(
        chargePersonId,
      )}, 0))`,
    );

    const now = new Date();
    const granted: ConsentPurpose[] = [];

    for (const purpose of CONSENT_PURPOSES) {
      const current = await tx.query.consentGrant.findFirst({
        where: and(
          eq(consentGrant.chargePersonId, chargePersonId),
          eq(consentGrant.purpose, purpose),
          eq(consentGrant.organizationId, organizationId),
          eq(consentGrant.lawfulBasis, 'art6_1_a'),
        ),
        orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
        columns: { id: true, granted: true, withdrawnAt: true },
      });

      // Already live → leave untouched (never duplicate or weaken a valid grant).
      if (current?.granted && !current.withdrawnAt) continue;

      await tx.insert(consentGrant).values({
        chargePersonId,
        organizationId,
        purpose,
        lawfulBasis: 'art6_1_a' as const,
        granted: true,
        grantedAt: now,
        auditFact: {
          // Distinct from 'adult_self_signup' / 'adult_self_consent_repair' so
          // getConsentAccountabilityV2 can tell an in-app re-consent acceptance
          // from bootstrap or derived-repair provenance.
          source: 'adult_self_acceptance',
          termsAcceptedAt: now.toISOString(),
          termsVersion,
        },
      });
      granted.push(purpose);
    }

    return granted;
  });
}

// ---------------------------------------------------------------------------
// (3) requestConsentV2 — legacy requestConsent
// ---------------------------------------------------------------------------

export interface RequestConsentV2Input {
  chargePersonId: string;
  organizationId: string;
  consentType: ConsentType;
  guardianEmail: string;
  childName: string;
  appUrl: string;
  audit?: { policyVersion?: string; requestIp?: string; userAgent?: string };
  emailOptions?: EmailOptions;
}

export interface RequestConsentV2Result {
  /** Whether the consent email was successfully delivered. */
  emailDelivered: boolean;
}

/**
 * v2 `requestConsent`: atomic upsert on the basis-keyed unique. Drives the
 * 'pending'→'requested' transition (or a same-row resend / recipient change),
 * mints a 7-day token, and sends the parent email. The WI-374 caps are enforced
 * in the upsert's `setWhere` (race-safe, TOCTOU-free); a cap hit throws
 * `ConsentResendLimitError` / `ConsentRecipientChangeLimitError`. On email
 * delivery failure the burned counter is rolled back, mirroring legacy exactly.
 */
export async function requestConsentV2(
  db: Database,
  input: RequestConsentV2Input,
): Promise<RequestConsentV2Result> {
  const basis = consentTypeToBasis(input.consentType);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const write = await withConsentPersonLock(
    db,
    input.chargePersonId,
    async (tx) => {
      const existing = await tx.query.consentRequest.findMany({
        where: requestSetKey(input.chargePersonId, input.organizationId, basis),
      });
      const representative = existing[0] ?? null;
      const isRecipientChange =
        representative?.guardianEmail != null &&
        representative.guardianEmail !== input.guardianEmail;
      const maxResendCount = Math.max(
        0,
        ...existing.map((row) => row.resendCount),
      );
      const maxRecipientChangeCount = Math.max(
        0,
        ...existing.map((row) => row.recipientChangeCount),
      );
      const currentGrants = await currentGrantSet(
        tx,
        input.chargePersonId,
        input.organizationId,
        basis,
      );
      const isLegacyIncompleteCycle = !hasCompletePurposeSet(existing);
      const terminal = existing.some(
        (row) => row.status === 'approved' || row.status === 'denied',
      );
      const allowLegacyIncompleteReconsent =
        terminal &&
        isLegacyIncompleteCycle &&
        currentGrants.length > 0 &&
        !hasCompletePurposeSet(currentGrants);
      if (terminal && !allowLegacyIncompleteReconsent) {
        throw new ConsentRequestNotFoundError();
      }
      if (isRecipientChange) {
        if (maxRecipientChangeCount >= MAX_RECIPIENT_CHANGES) {
          throw new ConsentRecipientChangeLimitError();
        }
      } else if (
        representative?.guardianEmail != null &&
        maxResendCount >= MAX_CONSENT_RESENDS
      ) {
        throw new ConsentResendLimitError();
      }

      const resendCount =
        representative?.guardianEmail == null || isRecipientChange
          ? 0
          : maxResendCount + 1;
      const recipientChangeCount = isRecipientChange
        ? maxRecipientChangeCount + 1
        : maxRecipientChangeCount;
      const requestedAt = new Date();
      const rows = await tx
        .insert(consentRequest)
        .values(
          CONSENT_PURPOSES.map((purpose) => ({
            chargePersonId: input.chargePersonId,
            organizationId: input.organizationId,
            purpose,
            requestedBasis: basis,
            status: 'requested',
            guardianEmail: input.guardianEmail,
            token,
            tokenExpiresAt: expiresAt,
            resendCount,
            recipientChangeCount,
            policyVersion: input.audit?.policyVersion ?? null,
            requestIp: input.audit?.requestIp ?? null,
            userAgent: input.audit?.userAgent ?? null,
            requestedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [
            consentRequest.chargePersonId,
            consentRequest.purpose,
            consentRequest.organizationId,
            consentRequest.requestedBasis,
          ],
          set: {
            status: 'requested',
            guardianEmail: input.guardianEmail,
            token,
            tokenExpiresAt: expiresAt,
            resendCount,
            recipientChangeCount,
            policyVersion: input.audit?.policyVersion ?? null,
            requestIp: input.audit?.requestIp ?? null,
            userAgent: input.audit?.userAgent ?? null,
            requestedAt,
            respondedAt: null,
            consentGrantId: null,
            updatedAt: requestedAt,
          },
          // Preserve terminal-row immutability in the database predicate too.
          // The sole exception is the explicit existing-data path above: an
          // incomplete legacy event must be able to start a complete P-set
          // re-consent cycle without rewriting the historical grant.
          ...(allowLegacyIncompleteReconsent
            ? {}
            : {
                setWhere: sql`${consentRequest.status} NOT IN ('approved','denied')`,
              }),
        })
        .returning({ id: consentRequest.id });
      if (rows.length !== CONSENT_PURPOSES.length) {
        throw new Error('consent request purpose-set write was incomplete');
      }
      return { requestIds: rows.map((row) => row.id), isRecipientChange };
    },
  );

  const tokenUrl = `${input.appUrl}/v1/consent-page?token=${token}`;
  const emailResult = await sendEmail(
    formatConsentRequestEmail(
      input.guardianEmail,
      input.childName,
      input.consentType,
      tokenUrl,
    ),
    input.emailOptions,
  );

  if (!emailResult.sent) {
    if (emailResult.reason === 'no_api_key') {
      // Config issue, not delivery failure — keep the request row.
      return { emailDelivered: false };
    }
    await rollbackCounter(db, write.requestIds, write.isRecipientChange);
    throw new EmailDeliveryError(emailResult.reason ?? undefined);
  }

  return { emailDelivered: true };
}

// ---------------------------------------------------------------------------
// (4) resendConsentV2 — legacy resendConsent
// ---------------------------------------------------------------------------

export interface ResendConsentV2Input {
  chargePersonId: string;
  organizationId: string;
  consentType: ConsentType;
  childName: string;
  appUrl: string;
  emailOptions?: EmailOptions;
}

/**
 * v2 `resendConsent`: re-sends to the STORED recipient (never a client value),
 * `resend_count++` under cap, fresh token. Atomic cap in the UPDATE WHERE.
 * Throws `ConsentRequestNotFoundError` when no active request exists,
 * `ConsentResendLimitError` when the cap is hit.
 */
export async function resendConsentV2(
  db: Database,
  input: ResendConsentV2Input,
): Promise<RequestConsentV2Result> {
  const basis = consentTypeToBasis(input.consentType);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const write = await withConsentPersonLock(
    db,
    input.chargePersonId,
    async (tx) => {
      const existing = await tx.query.consentRequest.findMany({
        where: requestSetKey(input.chargePersonId, input.organizationId, basis),
      });
      if (
        !hasCompletePurposeSet(existing) ||
        existing.some((row) => row.status !== 'requested' || !row.guardianEmail)
      ) {
        throw new ConsentRequestNotFoundError();
      }
      const storedEmail = existing[0]!.guardianEmail!;
      if (existing.some((row) => row.guardianEmail !== storedEmail)) {
        throw new ConsentRequestNotFoundError();
      }
      const resendCount = Math.max(...existing.map((row) => row.resendCount));
      if (resendCount >= MAX_CONSENT_RESENDS) {
        throw new ConsentResendLimitError();
      }
      const now = new Date();
      const rows = await tx
        .update(consentRequest)
        .set({
          status: 'requested',
          token,
          tokenExpiresAt: expiresAt,
          resendCount: resendCount + 1,
          requestedAt: now,
          respondedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            requestSetKey(input.chargePersonId, input.organizationId, basis),
            eq(consentRequest.status, 'requested'),
          ),
        )
        .returning({ id: consentRequest.id });
      if (rows.length !== CONSENT_PURPOSES.length) {
        throw new Error('consent resend purpose-set write was incomplete');
      }
      return { storedEmail, requestIds: rows.map((row) => row.id) };
    },
  );

  const storedEmail = write.storedEmail;

  const tokenUrl = `${input.appUrl}/v1/consent-page?token=${token}`;
  const emailResult = await sendEmail(
    formatConsentRequestEmail(
      storedEmail,
      input.childName,
      input.consentType,
      tokenUrl,
    ),
    input.emailOptions,
  );

  if (!emailResult.sent) {
    if (emailResult.reason === 'no_api_key') {
      return { emailDelivered: false };
    }
    await rollbackCounter(db, write.requestIds, false);
    throw new EmailDeliveryError(emailResult.reason ?? undefined);
  }

  return { emailDelivered: true };
}

// ---------------------------------------------------------------------------
// (5) processConsentResponseV2 — legacy processConsentResponse
// ---------------------------------------------------------------------------

export interface ProcessConsentResponseV2Result {
  chargePersonId: string;
  approved: boolean;
  /**
   * The org the (charge person × basis) grant belongs to. Surfaced so the
   * approval route can sign the P0 withdrawal token (`cw1:chargePersonId:
   * organizationId`) without re-resolving membership. See spec §5.1.
   */
  organizationId: string;
  /**
   * The `guardian_email` the consent request was sent to (the email-consenting
   * parent). Surfaced so the approval route can address the post-approval
   * confirmation email carrying the durable withdrawal link. Null when the
   * request never recorded one. See spec §5.1.
   */
  guardianEmail: string | null;
  /**
   * [WI-2347] The `withdrawal_token_id` stamped on the newly-inserted grant,
   * for the approval route to embed in the `cw2` withdrawal token it signs.
   * Null on a deny (no grant is created).
   */
  withdrawalTokenId: string | null;
}

/**
 * v2 `processConsentResponse`: looks up the request by token, validates
 * replay/expiry, then:
 *   - approve → tx: request → 'approved' + INSERT consent_grant(granted=true)
 *     + back-link consent_grant_id. (NEVER creates a guardianship edge.)
 *   - deny    → tx: request → 'denied' + [WI-1442] write ONE deletion_audit
 *     row unconditionally BEFORE the person delete below (the sole surviving
 *     GDPR proof-of-consent-denial once the person/request cascade away) +
 *     [WI-1138] if this person owns a subscription (a consent-exempt Stripe
 *     checkout can complete while consent is still pending), snapshot +
 *     ALSO write financial_record BEFORE deleting it, so a payer-deny leaves
 *     a tax/chargeback trail too + delete payer subscription + cascade-delete
 *     the person. Post-commit (outside the tx), cancel the snapshotted Stripe
 *     subscription if any, escalating on failure rather than blocking the
 *     (already-committed) deny.
 *
 * The atomic status transition's WHERE prevents the TOCTOU double-submit race.
 */
export async function processConsentResponseV2(
  db: Database,
  token: string,
  approved: boolean,
  audit?: { policyVersion?: string; requestIp?: string; userAgent?: string },
  billing?: { stripeSecretKey?: string; stripeClient?: StripeClientLike },
): Promise<ProcessConsentResponseV2Result> {
  const request = await db.query.consentRequest.findFirst({
    where: eq(consentRequest.token, token),
  });
  if (!request) {
    throw new ConsentTokenNotFoundError();
  }
  if (request.status === 'approved' || request.status === 'denied') {
    throw new ConsentAlreadyProcessedError();
  }
  if (request.tokenExpiresAt && new Date() > request.tokenExpiresAt) {
    throw new ConsentTokenExpiredError();
  }

  const now = new Date();
  const chargePersonId = request.chargePersonId;
  const basis = request.requestedBasis;

  // [WI-2347] Minted up front (not inside the tx) so it's available to build
  // the return value regardless of which branch below runs.
  const withdrawalTokenId = approved ? crypto.randomUUID() : null;

  if (approved) {
    await withConsentPersonLock(db, chargePersonId, async (tx) => {
      const requests = await tx.query.consentRequest.findMany({
        where: requestSetKey(
          chargePersonId,
          request.organizationId,
          basis as ConsentBasis,
        ),
      });
      if (!hasCompletePurposeSet(requests)) {
        throw new ConsentReconsentRequiredError();
      }
      if (
        requests.some(
          (row) =>
            row.token !== token ||
            row.status === 'approved' ||
            row.status === 'denied',
        )
      ) {
        throw new ConsentAlreadyProcessedError();
      }
      if (
        requests.some(
          (row) => row.tokenExpiresAt && new Date() > row.tokenExpiresAt,
        )
      ) {
        throw new ConsentTokenExpiredError();
      }

      const grants = await tx
        .insert(consentGrant)
        .values(
          CONSENT_PURPOSES.map((purpose) => ({
            chargePersonId,
            organizationId: request.organizationId,
            purpose,
            lawfulBasis: basis,
            granted: true,
            grantedAt: now,
            priorValue: null,
            auditFact: {
              source: 'consent_response_approved',
              policyVersion: audit?.policyVersion ?? request.policyVersion,
            },
            withdrawalTokenId,
          })),
        )
        .returning({ id: consentGrant.id, purpose: consentGrant.purpose });
      if (!hasCompletePurposeSet(grants)) {
        throw new Error('consent grant purpose-set insert was incomplete');
      }

      for (const purpose of CONSENT_PURPOSES) {
        const grant = grants.find((row) => row.purpose === purpose);
        const requestRow = requests.find((row) => row.purpose === purpose);
        if (!grant || !requestRow) {
          throw new Error('consent approval purpose mapping was incomplete');
        }
        const updated = await tx
          .update(consentRequest)
          .set({
            status: 'approved',
            respondedAt: now,
            consentGrantId: grant.id,
            updatedAt: now,
            ...(audit?.policyVersion !== undefined
              ? { policyVersion: audit.policyVersion }
              : {}),
            ...(audit?.requestIp !== undefined
              ? { requestIp: audit.requestIp }
              : {}),
            ...(audit?.userAgent !== undefined
              ? { userAgent: audit.userAgent }
              : {}),
          })
          .where(
            and(
              eq(consentRequest.id, requestRow.id),
              sql`${consentRequest.status} NOT IN ('approved','denied')`,
            ),
          )
          .returning({ id: consentRequest.id });
        if (updated.length !== 1) {
          throw new ConsentAlreadyProcessedError();
        }
      }
    });
  } else {
    let payerSubscriptions: SubscriptionSnapshot[] = [];

    await withConsentPersonLock(db, chargePersonId, async (tx) => {
      const requests = await tx.query.consentRequest.findMany({
        where: requestSetKey(
          chargePersonId,
          request.organizationId,
          basis as ConsentBasis,
        ),
      });
      if (!hasCompletePurposeSet(requests)) {
        throw new ConsentReconsentRequiredError();
      }
      if (
        requests.some(
          (row) =>
            row.token !== token ||
            row.status === 'approved' ||
            row.status === 'denied',
        )
      ) {
        throw new ConsentAlreadyProcessedError();
      }
      const updated = await tx
        .update(consentRequest)
        .set({
          status: 'denied',
          respondedAt: now,
          updatedAt: now,
          ...(audit?.policyVersion !== undefined
            ? { policyVersion: audit.policyVersion }
            : {}),
          ...(audit?.requestIp !== undefined
            ? { requestIp: audit.requestIp }
            : {}),
          ...(audit?.userAgent !== undefined
            ? { userAgent: audit.userAgent }
            : {}),
        })
        .where(
          and(
            requestSetKey(
              chargePersonId,
              request.organizationId,
              basis as ConsentBasis,
            ),
            eq(consentRequest.token, token),
            sql`${consentRequest.status} NOT IN ('approved','denied')`,
          ),
        )
        .returning({ id: consentRequest.id });

      if (updated.length !== CONSENT_PURPOSES.length) {
        throw new ConsentAlreadyProcessedError();
      }

      // [WI-1138] Snapshot the payer's subscription(s) BEFORE the delete
      // below — mirrors deletion-v2.ts's SubscriptionSnapshot. No network
      // calls inside the tx (deletion-v2.ts:471-472 convention); the Stripe
      // cancel runs post-commit, below.
      payerSubscriptions = await tx.query.subscription.findMany({
        where: eq(subscriptionTable.payerPersonId, chargePersonId),
        columns: {
          id: true,
          planTier: true,
          status: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      });

      // [WI-1442] deny hard-deletes the person below (cascade), so the
      // deletion_audit row is the ONLY surviving proof this erasure happened
      // — the consent_request row cascades away with the person, and
      // consent_grant is a no-op re-home target here (ON DELETE RESTRICT on
      // consent_grant.charge_person_id fail-safes: if a live grant existed
      // the person delete below would abort the tx before this could ever
      // run under-audited). Written unconditionally, matching deletion-v2.ts's
      // own unconditional Step 4 audit write — WI-1138's subscription gate
      // below is a billing-scope boundary (financial_record is payer-only),
      // not a GDPR-proof-of-consent boundary.
      await tx.insert(deletionAudit).values({
        personId: chargePersonId,
        // Anonymous token-click, no authenticated actor.
        deletedBy: null,
        // The consent-response token is addressed to
        // request.guardianEmail, so this is guardian-initiated even when
        // the denied person is also the payer.
        reason: 'guardian_initiated',
        retentionPeriod: null,
      });

      // Only a payer-deny gets a financial_record — an ordinary managed-child
      // deny (no subscription row) writes no tax/chargeback retain rows.
      if (payerSubscriptions.length > 0) {
        // [WI-1138 review] Reuse the ONE canonical financial-record write
        // (tax + chargeback retain-tier pair, §4.9 COUNSEL-OWNED) instead of
        // a narrower tax-only insert — the pairing is not a per-caller
        // decision. Full snapshot array, matching deletion-v2.ts's own
        // single-subscription-org call sites.
        await writeFinancialRecordsTx(
          tx,
          chargePersonId,
          request.organizationId,
          payerSubscriptions,
        );
      }

      // A consent-pending owner can already have the launch trial subscription;
      // remove only rows where THIS person is the payer before deleting them.
      // Managed children are not payers, so this is a no-op for ordinary
      // parent-created child consent flows.
      await tx
        .delete(subscriptionTable)
        .where(eq(subscriptionTable.payerPersonId, chargePersonId));

      // Deny cascade-deletes the person (FK cascades handle child data).
      await tx.delete(person).where(eq(person.id, chargePersonId));
    });

    // [WI-1138] Post-commit Stripe teardown, outside the tx (no held DB
    // locks during the network call). A cancel failure (or a missing
    // secret) must never surface as a 500 or log via console.warn (billing
    // silent-recovery ban, AGENTS.md) — escalate via safeSend/Inngest
    // instead. The deny response still returns success: the DB deletion
    // already committed and is not retryable (a second call hits
    // ConsentAlreadyProcessedError).
    for (const snap of payerSubscriptions) {
      if (!snap.stripeSubscriptionId) continue;
      const stripeSubscriptionId = snap.stripeSubscriptionId;
      try {
        await cancelStripeSubscriptionForErasure({
          stripeSubscriptionId,
          stripeSecretKey: billing?.stripeSecretKey,
          stripeClient: billing?.stripeClient,
        });
      } catch (error) {
        await safeSend(
          () =>
            inngest.send({
              // orphan-allow: structured telemetry required by AGENTS.md
              // (silent recovery in billing must emit a structured signal).
              // Resolved in-line; dashboard-queryable failure signal, no
              // handler — the deny already succeeded, this is a
              // billing-ops follow-up.
              name: 'app/billing.consent_deny_stripe_cancel_failed',
              data: {
                chargePersonId,
                organizationId: request.organizationId,
                subscriptionId: snap.id,
                stripeSubscriptionId,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString(),
              },
            }),
          'billing.consent_deny.stripe_cancel_failed',
          { chargePersonId, organizationId: request.organizationId },
        );
      }
    }
  }

  return {
    chargePersonId,
    approved,
    organizationId: request.organizationId,
    guardianEmail: request.guardianEmail ?? null,
    withdrawalTokenId,
  };
}

// ---------------------------------------------------------------------------
// (6) revokeConsentV2 — legacy revokeConsent (withdrawal = stamp withdrawn_at)
// ---------------------------------------------------------------------------

export interface RevokeConsentV2Result {
  chargePersonId: string;
  withdrawnAt: Date;
}

/**
 * v2 `revokeConsent`: the SINGLE sanctioned in-row transition — stamp
 * `withdrawn_at` (+ prior_value=true, audit_fact) on the live grant. NOT a new
 * `granted=false` row. Authority is the active guardianship edge (P3). The
 * current grant = max(granted_at), tiebreak id DESC (the BUG-394 / reducer
 * pattern). Idempotent: a second revoke of an already-withdrawn grant returns
 * the existing withdrawal timestamp. Clears the child's unread nudges, as legacy.
 */
export async function revokeConsentV2(
  db: Database,
  chargePersonId: string,
  guardianPersonId: string,
  organizationId: string,
  consentType: ConsentType,
): Promise<RevokeConsentV2Result> {
  if (!(await isGuardianOf(db, guardianPersonId, chargePersonId))) {
    throw new ConsentNotAuthorizedError('revoke');
  }
  const basis = consentTypeToBasis(consentType);
  return stampWithdrawal(db, chargePersonId, organizationId, basis, {
    source: 'guardian_revocation',
    guardianPersonId,
  });
}

/**
 * Bearer-token withdrawal for the email-consenting parent (P0, MMT-ADR-0027).
 * The email-parent has NO `person` row and NO guardianship edge, so authority
 * cannot be the `isGuardianOf` check `revokeConsentV2` uses — it is possession
 * of the signed withdrawal link, which the web route has already verified
 * before calling this. The mutation is byte-for-byte the same as
 * `revokeConsentV2` (shared `stampWithdrawal` core); only the audit source
 * (`email_parent_revocation`) and the absent edge check differ. The basis is
 * the GDPR parental-consent basis the token encodes by construction.
 *
 * Idempotent: a second call on an already-withdrawn grant returns the existing
 * `withdrawnAt`, inherited from the current-grant short-circuit in
 * `stampWithdrawal`. See
 * docs/specs/2026-06-26-p0-email-consent-withdrawal-design.md §5.3.
 */
export async function withdrawConsentByToken(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  audit?: { requestIp?: string; userAgent?: string },
  /** [WI-2347] The verified token's embedded id: a `cw2` tokenId, or `null`
   * for a legacy `cw1` token (which carries none). Always pass one of these
   * two — never `undefined` — this is always a bearer-token call, unlike
   * `revokeConsentV2`'s edge path, which omits the param entirely to skip
   * the check below. A `cw1` token (`null`) only matches a grant that has
   * never been touched by `cw2` issuance (`withdrawalTokenId` still null);
   * once superseded by a fresh `cw2` mint, the old `cw1` link is unusable —
   * same "no grant found" outcome, non-enumerating. */
  expectedTokenId?: string | null,
): Promise<RevokeConsentV2Result> {
  return stampWithdrawal(
    db,
    chargePersonId,
    organizationId,
    'gdpr_parental_consent',
    {
      source: 'email_parent_revocation',
      ...(audit?.requestIp !== undefined ? { requestIp: audit.requestIp } : {}),
      ...(audit?.userAgent !== undefined ? { userAgent: audit.userAgent } : {}),
    },
    expectedTokenId,
  );
}

/**
 * The post-authorization core of withdrawal: stamp `withdrawn_at` (+
 * prior_value, audit_fact) on the current grant and clear the child's unread
 * nudges, in one transaction. Carries NO authority check — every caller
 * (`revokeConsentV2` via the edge check, `withdrawConsentByToken` via the
 * verified bearer token) authorizes BEFORE calling. Idempotent: a second call
 * on an already-withdrawn grant returns the existing `withdrawnAt`.
 *
 * [WI-2347] `expectedTokenId`, when passed (bearer-token callers always pass
 * one — `string` for `cw2`, `null` for legacy `cw1`; omitted entirely by the
 * edge-authorized `revokeConsentV2` path, which skips this check), must
 * satisfy EXACT equality — `current.withdrawalTokenId === expectedTokenId`
 * — or this throws `ConsentRecordNotFoundError` — the same outcome as "no
 * grant", so a superseded link is indistinguishable from a never-approved
 * one (no enumeration). `null` is a value to match, never a wildcard: a
 * `cw1` token (`expectedTokenId: null`) only passes while the current
 * grant's `withdrawalTokenId` is still null; once a fresh `cw2` mint sets
 * it, the old `cw1` link stops working. Symmetrically — [WI-2434] — a `cw2`
 * token only passes while the current grant's `withdrawalTokenId` still
 * equals that exact id; a newer grant that has reverted to `null` (e.g. a
 * fresh tokenless re-consent) rejects the old `cw2` link too.
 */
async function stampWithdrawal(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
  auditFact: Record<string, unknown>,
  expectedTokenId?: string | null,
): Promise<RevokeConsentV2Result> {
  return withConsentPersonLock(db, chargePersonId, async (tx) => {
    const current = await currentGrantSet(
      tx,
      chargePersonId,
      organizationId,
      basis,
    );
    if (current.length === 0) {
      throw new ConsentRecordNotFoundError();
    }
    if (
      expectedTokenId !== undefined &&
      current.some((grant) => grant.withdrawalTokenId !== expectedTokenId)
    ) {
      throw new ConsentRecordNotFoundError();
    }
    const withdrawn = current.filter((grant) => grant.withdrawnAt !== null);
    if (withdrawn.length === current.length) {
      const timestamps = new Set(
        withdrawn.map((grant) => grant.withdrawnAt!.getTime()),
      );
      if (timestamps.size !== 1) throw new ConsentRecordNotFoundError();
      return { chargePersonId, withdrawnAt: withdrawn[0]!.withdrawnAt! };
    }
    if (withdrawn.length > 0) {
      throw new ConsentRecordNotFoundError();
    }

    const now = new Date();
    const updated = await tx
      .update(consentGrant)
      .set({ withdrawnAt: now, priorValue: true, auditFact })
      .where(
        and(
          inArray(
            consentGrant.id,
            current.map((grant) => grant.id),
          ),
          isNull(consentGrant.withdrawnAt),
        ),
      )
      .returning({ id: consentGrant.id });
    if (updated.length !== current.length) {
      throw new ConsentRecordNotFoundError();
    }

    await tx
      .update(nudges)
      .set({ readAt: now })
      .where(
        and(eq(nudges.toProfileId, chargePersonId), isNull(nudges.readAt)),
      );
    return { chargePersonId, withdrawnAt: now };
  });
}

// ---------------------------------------------------------------------------
// (7) restoreConsentV2 — legacy restoreConsent (re-grant = APPEND a new row)
// ---------------------------------------------------------------------------

export interface RestoreConsentV2Result {
  chargePersonId: string;
}

/**
 * v2 `restoreConsent`: within the 7-day grace window, re-grant by APPENDING a
 * new `consent_grant` row (granted=true, prior_value=false). Never un-stamps the
 * withdrawn grant — restore is a new event. Grace is measured from the current
 * grant's `withdrawn_at`. Also clears the person's `archived_at` so the
 * archive-cleanup sweep cannot race and hard-delete a restored person.
 */
export async function restoreConsentV2(
  db: Database,
  chargePersonId: string,
  guardianPersonId: string,
  organizationId: string,
  consentType: ConsentType,
): Promise<RestoreConsentV2Result> {
  if (!(await isGuardianOf(db, guardianPersonId, chargePersonId))) {
    throw new ConsentNotAuthorizedError('restore');
  }
  const basis = consentTypeToBasis(consentType);
  return appendRestoreGrant(db, chargePersonId, organizationId, basis, {
    source: 'guardian_restore',
    guardianPersonId,
  });
}

/**
 * The post-authorization core of restore: take the per-person advisory lock,
 * re-read the current grant, enforce the grace window, APPEND a new
 * un-withdrawn grant, and clear `archived_at` — all in one serialized
 * transaction. Carries NO authority check; callers authorize first via the
 * authenticated guardian-restore path. Idempotent on an already-restored
 * grant (returns without appending).
 *
 * The appended row always carries the current grant's `withdrawalTokenId`
 * forward — restore is a continuation of the same consent relationship, not
 * a new one, so the one email link stays valid across withdraw/restore
 * cycles.
 */
async function appendRestoreGrant(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
  auditFact: Record<string, unknown>,
): Promise<RestoreConsentV2Result> {
  const now = new Date();
  // WI-583 race guard: the grace-end delete/archive predicates
  // (deletePersonIfConsentWithdrawnV2, deleteArchivedPersonIfStillEligibleV2)
  // read the current grant then re-home/delete. Without serialization, under
  // READ COMMITTED a delete could read the withdrawn grant, then this restore
  // appends + un-archives, then the delete re-homes the just-restored grant and
  // removes the person. Take the SAME per-person advisory lock FIRST and do the
  // grace-check read + append inside the locked tx, so the restore and the
  // delete cannot interleave — whichever takes the lock first wins, and the
  // loser re-reads the other's committed state.
  return withConsentPersonLock(db, chargePersonId, async (tx) => {
    const current = await currentGrantSet(
      tx,
      chargePersonId,
      organizationId,
      basis,
    );
    if (current.length === 0) {
      throw new ConsentRecordNotFoundError();
    }
    const active = current.filter((grant) => grant.withdrawnAt === null);
    if (active.length === current.length) {
      return { chargePersonId };
    }
    if (active.length > 0) {
      throw new ConsentRecordNotFoundError();
    }
    if (
      current.some(
        (grant) =>
          Date.now() - grant.withdrawnAt!.getTime() >
          RESTORE_CONSENT_GRACE_PERIOD_MS,
      )
    ) {
      throw new ConsentGracePeriodExpiredError();
    }

    await tx.insert(consentGrant).values(
      current.map((grant) => ({
        chargePersonId,
        organizationId,
        purpose: grant.purpose,
        lawfulBasis: basis,
        granted: true,
        grantedAt: now,
        priorValue: false,
        auditFact,
        withdrawalTokenId: grant.withdrawalTokenId,
      })),
    );
    await tx
      .update(person)
      .set({ archivedAt: null, updatedAt: now })
      .where(eq(person.id, chargePersonId));

    return { chargePersonId };
  });
}

// ---------------------------------------------------------------------------
// (8) Token refresh (consent-reminders Inngest) — legacy refreshConsentToken*
// ---------------------------------------------------------------------------

/**
 * v2 `refreshConsentToken`: mint a fresh token with a 16-day expiry on the GDPR
 * request row (covers the day-14 reminder window + click buffer, stays within
 * the day-30 auto-delete). Scoped to the GDPR basis so a coexisting COPPA row is
 * never clobbered. Returns the new token. Throws `ConsentRecordNotFoundError`
 * when no GDPR request row exists.
 */
export async function refreshConsentTokenV2(
  db: Database,
  chargePersonId: string,
  organizationId: string,
): Promise<string> {
  const newToken = crypto.randomUUID();
  const newExpiresAt = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
  return withConsentPersonLock(db, chargePersonId, async (tx) => {
    const rows = await tx.query.consentRequest.findMany({
      where: requestSetKey(
        chargePersonId,
        organizationId,
        'gdpr_parental_consent',
      ),
      columns: { purpose: true },
    });
    if (!hasCompletePurposeSet(rows)) {
      throw new ConsentRecordNotFoundError();
    }
    const updated = await tx
      .update(consentRequest)
      .set({
        token: newToken,
        tokenExpiresAt: newExpiresAt,
        updatedAt: new Date(),
      })
      .where(
        requestSetKey(chargePersonId, organizationId, 'gdpr_parental_consent'),
      )
      .returning({ id: consentRequest.id });
    if (updated.length !== CONSENT_PURPOSES.length) {
      throw new ConsentRecordNotFoundError();
    }
    return newToken;
  });
}

export interface RefreshConsentTokenForRequestV2Input {
  chargePersonId: string;
  organizationId: string;
  requestedAt: Date;
  requestedAtUpperBound: Date;
}

export interface RefreshedConsentTokenForRequestV2 {
  guardianEmail: string;
  freshToken: string;
}

/**
 * v2 `refreshConsentTokenForRequest`: refresh the reminder token ONLY when the
 * original request generation is still current (the `requested_at` window) and
 * the request is still open. Stale Inngest runs must not mint a valid token onto
 * a newer request. Returns null when no matching open request is found.
 */
export async function refreshConsentTokenForRequestV2(
  db: Database,
  input: RefreshConsentTokenForRequestV2Input,
): Promise<RefreshedConsentTokenForRequestV2 | null> {
  const freshToken = crypto.randomUUID();
  const newExpiresAt = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
  return withConsentPersonLock(db, input.chargePersonId, async (tx) => {
    const rows = await tx.query.consentRequest.findMany({
      where: requestSetKey(
        input.chargePersonId,
        input.organizationId,
        'gdpr_parental_consent',
      ),
    });
    if (
      !hasCompletePurposeSet(rows) ||
      rows.some(
        (row) =>
          !row.requestedAt ||
          row.requestedAt < input.requestedAt ||
          row.requestedAt >= input.requestedAtUpperBound ||
          row.status === 'approved' ||
          row.status === 'denied' ||
          !row.guardianEmail,
      )
    ) {
      return null;
    }
    const guardianEmail = rows[0]!.guardianEmail!;
    if (rows.some((row) => row.guardianEmail !== guardianEmail)) return null;
    const updated = await tx
      .update(consentRequest)
      .set({
        token: freshToken,
        tokenExpiresAt: newExpiresAt,
        updatedAt: new Date(),
      })
      .where(
        requestSetKey(
          input.chargePersonId,
          input.organizationId,
          'gdpr_parental_consent',
        ),
      )
      .returning({ id: consentRequest.id });
    if (updated.length !== CONSENT_PURPOSES.length) {
      throw new Error('consent token refresh purpose-set write was incomplete');
    }
    return { guardianEmail, freshToken };
  });
}

// ---------------------------------------------------------------------------
// (9) getConsentRequestByToken — legacy getChildNameByToken
// ---------------------------------------------------------------------------

/**
 * v2 `getChildNameByToken`: token lookup with expiry + open-request validation,
 * returning the child's display name. Null when the token is unknown, already
 * responded, or expired.
 */
export async function getChildNameByTokenV2(
  db: Database,
  token: string,
): Promise<string | null> {
  const request = await db.query.consentRequest.findFirst({
    where: eq(consentRequest.token, token),
    columns: {
      chargePersonId: true,
      organizationId: true,
      requestedBasis: true,
      respondedAt: true,
      tokenExpiresAt: true,
    },
  });
  if (!request) return null;
  const requests = await db.query.consentRequest.findMany({
    where: and(
      eq(consentRequest.chargePersonId, request.chargePersonId),
      eq(consentRequest.organizationId, request.organizationId),
      eq(consentRequest.requestedBasis, request.requestedBasis),
      inArray(consentRequest.purpose, [...CONSENT_PURPOSES]),
    ),
  });
  if (
    requests.length === 0 ||
    requests.some(
      (row) =>
        row.token !== token ||
        row.respondedAt !== null ||
        (row.tokenExpiresAt !== null && new Date() > row.tokenExpiresAt),
    )
  ) {
    return null;
  }
  const child = await db.query.person.findFirst({
    where: eq(person.id, request.chargePersonId),
    columns: { displayName: true },
  });
  return child?.displayName ?? null;
}

// ---------------------------------------------------------------------------
// Route-friendly revoke / restore wrappers — resolve org + GDPR basis from the
// child person and return the resulting status, matching the legacy
// revokeConsent/restoreConsent route shape (which returned a ConsentState the
// route mapped to {status}). The route supplies only child + guardian person
// ids; these resolve the rest. GDPR is the basis the parent-dashboard
// revoke/restore acts on (the legacy machine keyed revoke on the latest row,
// which for a child is the GDPR row).
// ---------------------------------------------------------------------------

/**
 * v2 route wrapper for `PUT /v1/consent/:child/revoke`. Resolves the child's
 * org, revokes the GDPR grant (stamp withdrawn_at), returns the resulting
 * status (WITHDRAWN) + the withdrawal timestamp the route's Inngest dispatch
 * needs. Throws ConsentNotAuthorizedError / ConsentRecordNotFoundError as legacy.
 */
export async function revokeChildConsentV2(
  db: Database,
  childPersonId: string,
  guardianPersonId: string,
): Promise<{ status: ConsentStatus; withdrawnAt: string }> {
  const organizationId = await resolveOrgIdOrThrow(db, childPersonId);
  const result = await revokeConsentV2(
    db,
    childPersonId,
    guardianPersonId,
    organizationId,
    'GDPR',
  );
  return { status: 'WITHDRAWN', withdrawnAt: result.withdrawnAt.toISOString() };
}

/**
 * v2 route wrapper for `PUT /v1/consent/:child/restore`. Resolves org, restores
 * the GDPR grant (append a new grant), returns the resulting status (CONSENTED).
 */
export async function restoreChildConsentV2(
  db: Database,
  childPersonId: string,
  guardianPersonId: string,
): Promise<{ status: ConsentStatus }> {
  const organizationId = await resolveOrgIdOrThrow(db, childPersonId);
  await restoreConsentV2(
    db,
    childPersonId,
    guardianPersonId,
    organizationId,
    'GDPR',
  );
  const status = await resolveConsentSetStatus(
    db,
    childPersonId,
    organizationId,
    'gdpr_parental_consent',
  );
  if (status === null) throw new ConsentRecordNotFoundError();
  return { status };
}

// ---------------------------------------------------------------------------
// (10) getProfileConsentStateV2 — legacy getProfileConsentState
// (the GET /v1/consent/my-status read)
// ---------------------------------------------------------------------------

export interface ProfileConsentStateV2 {
  status: ConsentStatus;
  guardianEmail: string | null;
  consentType: ConsentType;
  requestedAt: string;
}

/**
 * v2 `getProfileConsentState`: the my-status read. Returns the latest-any-basis
 * status (the behavior-preserving AnyBasis read — same as legacy
 * `getConsentStatus`'s order-by-requested_at) plus the request row's
 * recipient/basis/timestamp for the winning basis. Null when the person has no
 * consent rows or no membership (pre-graph). The org is resolved from the
 * person's membership (person.id = profileId).
 */
export async function getProfileConsentStateV2(
  db: Database,
  chargePersonId: string,
): Promise<ProfileConsentStateV2 | null> {
  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, chargePersonId),
    columns: { organizationId: true },
  });
  if (!membershipRow) return null;
  const organizationId = membershipRow.organizationId;

  const status = await resolveLatestConsentSetStatusAnyBasis(
    db,
    chargePersonId,
    organizationId,
  );
  if (status === null) return null;

  // The request row carrying the recipient/timestamp — pick the most recently
  // requested across bases (legacy ordered by requested_at desc).
  const request = await db.query.consentRequest.findFirst({
    where: and(
      eq(consentRequest.chargePersonId, chargePersonId),
      eq(consentRequest.organizationId, organizationId),
      inArray(consentRequest.purpose, [...CONSENT_PURPOSES]),
    ),
    orderBy: (r, { desc }) => [desc(r.requestedAt), desc(r.createdAt)],
    columns: {
      requestedBasis: true,
      guardianEmail: true,
      requestedAt: true,
      createdAt: true,
    },
  });

  return {
    status,
    guardianEmail: request?.guardianEmail ?? null,
    consentType:
      request?.requestedBasis === 'coppa_parental_consent' ? 'COPPA' : 'GDPR',
    requestedAt: (
      request?.requestedAt ??
      request?.createdAt ??
      new Date()
    ).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// (11) consent-revocation Inngest reads (v2 of consent.ts revocation helpers)
// ---------------------------------------------------------------------------

/**
 * v2 `isConsentRevocationGenerationCurrent`: true when the current GDPR grant is
 * withdrawn (optionally at a specific withdrawal timestamp). The consent-
 * revocation grace job uses this to detect a restore (which appends a new
 * un-withdrawn grant, so the current grant is no longer withdrawn → false).
 */
export async function isConsentRevocationGenerationCurrentV2(
  db: Database,
  chargePersonId: string,
  revokedAt?: Date,
): Promise<boolean> {
  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, chargePersonId),
    columns: { organizationId: true },
  });
  if (!membershipRow) return false;
  const current = await currentGrantSet(
    db,
    chargePersonId,
    membershipRow.organizationId,
    'gdpr_parental_consent',
  );
  if (current.length === 0 || current.some((grant) => !grant.withdrawnAt)) {
    return false;
  }
  // [WI-973] A missing revokedAt means we cannot confirm the generation;
  // return false so the cascade-delete guard does not pass vacuously.
  if (!revokedAt) return false;
  return current.every(
    (grant) => grant.withdrawnAt!.getTime() === revokedAt.getTime(),
  );
}

/**
 * v2 `getProfileForConsentRevocation`: the person's displayName + birthYear +
 * archivedAt the revocation grace job reads (for the age/archive decision).
 * Null when the person is gone.
 */
export async function getPersonForConsentRevocationV2(
  db: Database,
  chargePersonId: string,
): Promise<{
  displayName: string;
  birthYear: number;
  // [WI-367] full-date components for exact-age COPPA boundary; null = unknown.
  birthMonth: number | null;
  birthDay: number | null;
  archivedAt: Date | null;
} | null> {
  const row = await db.query.person.findFirst({
    where: eq(person.id, chargePersonId),
    columns: { displayName: true, birthDate: true, archivedAt: true },
  });
  if (!row) return null;
  // [WI-367] `person.birth_date` materializes to `${year}-01-01` when full-date
  // parts were absent at create (child-profile-v2 / identity-graph). That `01-01`
  // is a year-only sentinel, NOT a known Jan-1 birthday — treat it as unknown so
  // the exact-age boundary stays conservative (falls back to year-only). A real
  // Jan-1 birthday is indistinguishable here and also gets year-only treatment;
  // resolving that needs a `birth_date_precision` flag on `person` (follow-up).
  const month = Number(row.birthDate.slice(5, 7));
  const day = Number(row.birthDate.slice(8, 10));
  const isYearOnlySentinel = month === 1 && day === 1;
  return {
    displayName: row.displayName,
    birthYear: Number(row.birthDate.slice(0, 4)),
    birthMonth: isYearOnlySentinel ? null : month,
    birthDay: isYearOnlySentinel ? null : day,
    archivedAt: row.archivedAt ?? null,
  };
}

/** v2 `getProfileDisplayName`: a person's display name, or null. */
export async function getPersonDisplayNameV2(
  db: Database,
  chargePersonId: string,
): Promise<string | null> {
  const row = await db.query.person.findFirst({
    where: eq(person.id, chargePersonId),
    columns: { displayName: true },
  });
  return row?.displayName ?? null;
}

/**
 * Edge-free read for the P0 withdrawal web routes (MMT-ADR-0027): the current
 * GDPR grant's withdrawal stamp for (charge person × org). Returns `null` when
 * no grant exists (never approved, or already deleted past grace) so the GET
 * `/consent-page/withdraw` route can render "nothing to withdraw"; otherwise
 * `{ withdrawnAt }` lets it choose between the confirm page (not withdrawn) and
 * the informational withdrawn landing (withdrawn). Carries NO authority check —
 * the route has already verified the signed bearer token. Bearer-token restore
 * is removed (MMT-ADR-0029, amended, WI-2348): the surviving restore mechanism
 * is `appendRestoreGrant`, reached only via the authenticated `restoreConsentV2`
 * path, not this read.
 */
export async function getGdprGrantWithdrawalStateV2(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  /** [WI-2347] Same non-enumerating supersession check as `stampWithdrawal`
   * (`string` for `cw2`, `null` for legacy `cw1`, `undefined` only to skip
   * the check entirely) — EXACT equality against the current grant's
   * `withdrawalTokenId` ([WI-2434]; `null` matches only `null`, never a
   * wildcard for any id); a mismatch returns `null`, identical to
   * "no grant". */
  expectedTokenId?: string | null,
): Promise<{ withdrawnAt: Date | null } | null> {
  const current = await currentGrantSet(
    db,
    chargePersonId,
    organizationId,
    'gdpr_parental_consent',
  );
  if (current.length === 0) return null;
  if (
    expectedTokenId !== undefined &&
    current.some((grant) => grant.withdrawalTokenId !== expectedTokenId)
  ) {
    return null;
  }
  const withdrawn = current.map((grant) => grant.withdrawnAt);
  if (withdrawn.every((value) => value === null)) return { withdrawnAt: null };
  if (
    withdrawn.some((value) => value === null) ||
    new Set(withdrawn.map((value) => value!.getTime())).size !== 1
  ) {
    return null;
  }
  return { withdrawnAt: withdrawn[0]! };
}

/**
 * [WI-809] v2 org-scoped display-name read for the consent request/resend flow —
 * the replacement for the legacy `getProfile(db, childProfileId, account.id)`
 * gate (which collapsed existence + account-ownership + not-archived). Returns
 * the person's display name ONLY when they are an ACTIVE (non-archived) member of
 * `organizationId` (= the caller's account.id). Returns null for a non-member, an
 * archived person, OR a non-existent id — a single, indistinguishable outcome, so
 * a caller cannot (a) enumerate whether an arbitrary id is a real person,
 * (b) target an out-of-org child, or (c) target an archived child legacy rejected.
 * Unlike `getPersonDisplayNameV2` (global, existence-only), this preserves the
 * legacy scoping the cutover must not weaken.
 */
export async function getOrgMemberDisplayNameV2(
  db: Database,
  personId: string,
  organizationId: string,
): Promise<string | null> {
  const rows = await db
    .select({ displayName: person.displayName })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(
      and(
        eq(membership.personId, personId),
        eq(membership.organizationId, organizationId),
        isNull(person.archivedAt),
      ),
    )
    .limit(1);
  return rows[0]?.displayName ?? null;
}

/**
 * v2 archive-on-revocation: atomically stamp `person.archived_at` ONLY when the
 * current GDPR grant is withdrawn (optionally at the given timestamp) and the
 * person isn't already archived and the guardian holds an active edge — the v2
 * of the consent-revocation `UPDATE profiles SET archived_at` CTE (the BUG-662
 * account-guard becomes the guardianship-edge guard). Returns true when archived.
 */
export async function archivePersonOnRevocationV2(
  db: Database,
  chargePersonId: string,
  guardianPersonId: string,
  archivedAt: Date,
  withdrawnAt?: Date,
): Promise<boolean> {
  if (!(await isGuardianOf(db, guardianPersonId, chargePersonId))) {
    return false;
  }
  return withConsentPersonLock(db, chargePersonId, async (tx) => {
    const organizationId = await resolveOrgIdOrThrow(tx, chargePersonId);
    const current = await currentGrantSet(
      tx,
      chargePersonId,
      organizationId,
      'gdpr_parental_consent',
    );
    if (current.length === 0 || current.some((grant) => !grant.withdrawnAt)) {
      return false;
    }
    if (
      withdrawnAt &&
      current.some(
        (grant) => grant.withdrawnAt!.getTime() !== withdrawnAt.getTime(),
      )
    ) {
      return false;
    }
    const updated = await tx
      .update(person)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(and(eq(person.id, chargePersonId), isNull(person.archivedAt)))
      .returning({ id: person.id });
    return updated.length > 0;
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve a person's org (v1 single home org). Throws if no membership. */
async function resolveOrgIdOrThrow(
  db: Database,
  personId: string,
): Promise<string> {
  const row = await db.query.membership.findFirst({
    where: eq(membership.personId, personId),
    columns: { organizationId: true },
  });
  if (!row) throw new ConsentRecordNotFoundError();
  return row.organizationId;
}

/** The person/org/basis request-set predicate (purpose is intentionally set-wide). */
function requestSetKey(
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
) {
  return and(
    eq(consentRequest.chargePersonId, chargePersonId),
    eq(consentRequest.organizationId, organizationId),
    eq(consentRequest.requestedBasis, basis),
    inArray(consentRequest.purpose, [...CONSENT_PURPOSES]),
  );
}

/** The current grant for one explicit purpose and basis. */
async function currentGrant(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  purpose: ConsentPurpose,
  basis: ConsentBasis,
): Promise<{
  id: string;
  purpose: ConsentPurpose;
  withdrawnAt: Date | null;
  withdrawalTokenId: string | null;
} | null> {
  const row = await db.query.consentGrant.findFirst({
    where: and(
      eq(consentGrant.chargePersonId, chargePersonId),
      eq(consentGrant.purpose, purpose),
      eq(consentGrant.organizationId, organizationId),
      eq(consentGrant.lawfulBasis, basis),
    ),
    orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
    columns: {
      id: true,
      purpose: true,
      withdrawnAt: true,
      withdrawalTokenId: true,
    },
  });
  return row ? { ...row, purpose: row.purpose as ConsentPurpose } : null;
}

type CurrentConsentGrant = NonNullable<
  Awaited<ReturnType<typeof currentGrant>>
>;

async function currentGrantSet(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
): Promise<CurrentConsentGrant[]> {
  const rows = await Promise.all(
    CONSENT_PURPOSES.map((purpose) =>
      currentGrant(db, chargePersonId, organizationId, purpose, basis),
    ),
  );
  return rows.filter((row): row is CurrentConsentGrant => row !== null);
}

function hasCompletePurposeSet(rows: readonly { purpose: string }[]): boolean {
  return (
    rows.length === CONSENT_PURPOSES.length &&
    CONSENT_PURPOSES.every((purpose) =>
      rows.some((row) => row.purpose === purpose),
    )
  );
}

async function withConsentPersonLock<T>(
  db: Database,
  chargePersonId: string,
  operation: (
    tx: Database & Parameters<Parameters<Database['transaction']>[0]>[0],
  ) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(chargePersonId)}, 0))`,
    );
    return operation(
      tx as unknown as Database &
        Parameters<Parameters<Database['transaction']>[0]>[0],
    );
  });
}

/** Roll back a burned resend/recipient counter after an email delivery failure. */
async function rollbackCounter(
  db: Database,
  requestIds: readonly string[],
  isRecipientChange: boolean,
): Promise<void> {
  try {
    await db
      .update(consentRequest)
      .set(
        isRecipientChange
          ? {
              recipientChangeCount: sql`GREATEST(${consentRequest.recipientChangeCount} - 1, 0)`,
              updatedAt: sql`now()`,
            }
          : {
              resendCount: sql`GREATEST(${consentRequest.resendCount} - 1, 0)`,
              updatedAt: sql`now()`,
            },
      )
      .where(inArray(consentRequest.id, [...requestIds]));
  } catch (rollbackError) {
    logger.warn('[consent-v2] Failed to rollback resend counter', {
      error:
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError),
    });
  }
}
