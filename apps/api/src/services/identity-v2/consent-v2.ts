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
// FLAG-GATED: every function here is reachable only when IDENTITY_V2_ENABLED is
// 'true'. `consent_request` has NO flag-off writer (single-live-store arg 2).
// ---------------------------------------------------------------------------

import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  membership,
  nudges,
  person,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import type { ConsentStatus, ConsentType } from '@eduagent/schemas';
import {
  sendEmail,
  formatConsentRequestEmail,
  type EmailOptions,
} from '../notifications/email';
import { createLogger } from '../logger';
import {
  type ConsentBasis,
  DEFAULT_CONSENT_PURPOSE,
  resolveLatestConsentStatusAnyBasis,
} from './consent-status-v2';
import { consentPersonLockKey } from './deletion-v2';
import { isGuardianOf } from './guardianship';

const logger = createLogger();

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
 * Idempotent on the basis-keyed unique: a repeat resets the row to 'pending'
 * and clears any stale token/recipient, matching the legacy onConflictDoUpdate.
 */
export async function createPendingConsentRequest(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  consentType: ConsentType,
): Promise<void> {
  const basis = consentTypeToBasis(consentType);
  await db
    .insert(consentRequest)
    .values({
      chargePersonId,
      organizationId,
      purpose: DEFAULT_CONSENT_PURPOSE,
      requestedBasis: basis,
      status: 'pending',
    })
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
      // Never revive a terminal (approved/denied) request to pending.
      setWhere: sql`${consentRequest.status} NOT IN ('approved','denied')`,
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
  await db.insert(consentGrant).values({
    chargePersonId,
    organizationId,
    purpose: DEFAULT_CONSENT_PURPOSE,
    lawfulBasis: basis,
    granted: true,
    priorValue: null,
    auditFact: { source: 'parent_created_child', guardianPersonId },
    snapshotAgeAtGrant: snapshot.ageAtGrant ?? null,
    snapshotJurisdictionAtGrant: snapshot.jurisdictionAtGrant ?? null,
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

  // Pre-read for error classification + email-failure rollback only — the caps
  // themselves are enforced atomically below, so a stale read cannot let a
  // request exceed a cap.
  const existing = await db.query.consentRequest.findFirst({
    where: requestKey(input.chargePersonId, input.organizationId, basis),
    columns: { guardianEmail: true },
  });
  const isRecipientChange =
    existing != null &&
    existing.guardianEmail != null &&
    existing.guardianEmail !== input.guardianEmail;

  const [row] = await db
    .insert(consentRequest)
    .values({
      chargePersonId: input.chargePersonId,
      organizationId: input.organizationId,
      purpose: DEFAULT_CONSENT_PURPOSE,
      requestedBasis: basis,
      status: 'requested',
      guardianEmail: input.guardianEmail,
      token,
      tokenExpiresAt: expiresAt,
      resendCount: 0,
      recipientChangeCount: 0,
      policyVersion: input.audit?.policyVersion ?? null,
      requestIp: input.audit?.requestIp ?? null,
      userAgent: input.audit?.userAgent ?? null,
      requestedAt: sql`now()`,
    })
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
        policyVersion: input.audit?.policyVersion ?? null,
        requestIp: input.audit?.requestIp ?? null,
        userAgent: input.audit?.userAgent ?? null,
        // Same recipient → resend++; recipient change → reset to 0.
        resendCount: sql`CASE WHEN ${consentRequest.guardianEmail} IS NOT DISTINCT FROM ${input.guardianEmail} THEN ${consentRequest.resendCount} + 1 ELSE 0 END`,
        // Only a change BETWEEN two real recipients consumes a change slot.
        recipientChangeCount: sql`CASE WHEN ${consentRequest.guardianEmail} IS NOT NULL AND ${consentRequest.guardianEmail} IS DISTINCT FROM ${input.guardianEmail} THEN ${consentRequest.recipientChangeCount} + 1 ELSE ${consentRequest.recipientChangeCount} END`,
        requestedAt: sql`now()`,
        respondedAt: null,
        updatedAt: sql`now()`,
      },
      // Terminal-status guard (BUG-791) + the two caps, atomic. A terminal row
      // (approved/denied) can never be revived to 'requested'. Same three
      // branches as legacy: same recipient → resend cap; no recipient yet
      // (NULL) → always allowed (initial assignment); real change → change cap.
      setWhere: sql`${consentRequest.status} NOT IN ('approved','denied') AND ((${consentRequest.guardianEmail} IS NOT DISTINCT FROM ${input.guardianEmail} AND ${consentRequest.resendCount} < ${MAX_CONSENT_RESENDS}) OR ${consentRequest.guardianEmail} IS NULL OR (${consentRequest.guardianEmail} IS NOT NULL AND ${consentRequest.guardianEmail} IS DISTINCT FROM ${input.guardianEmail} AND ${consentRequest.recipientChangeCount} < ${MAX_RECIPIENT_CHANGES}))`,
    })
    .returning();

  if (!row) {
    // Conflict existed but setWhere blocked the update — terminal row or a cap.
    const existingRow = await db.query.consentRequest.findFirst({
      where: requestKey(input.chargePersonId, input.organizationId, basis),
      columns: { status: true },
    });
    if (
      existingRow != null &&
      (existingRow.status === 'approved' || existingRow.status === 'denied')
    ) {
      throw new ConsentRequestNotFoundError();
    }
    throw isRecipientChange
      ? new ConsentRecipientChangeLimitError()
      : new ConsentResendLimitError();
  }

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
    await rollbackCounter(db, row.id, isRecipientChange);
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

  const [row] = await db
    .update(consentRequest)
    .set({
      status: 'requested',
      token,
      tokenExpiresAt: expiresAt,
      resendCount: sql`${consentRequest.resendCount} + 1`,
      requestedAt: sql`now()`,
      respondedAt: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        requestKey(input.chargePersonId, input.organizationId, basis),
        eq(consentRequest.status, 'requested'),
        sql`${consentRequest.guardianEmail} IS NOT NULL`,
        sql`${consentRequest.resendCount} < ${MAX_CONSENT_RESENDS}`,
      ),
    )
    .returning();

  if (!row) {
    const stillExists = await db.query.consentRequest.findFirst({
      where: and(
        requestKey(input.chargePersonId, input.organizationId, basis),
        eq(consentRequest.status, 'requested'),
        sql`${consentRequest.guardianEmail} IS NOT NULL`,
      ),
      columns: { id: true },
    });
    throw stillExists
      ? new ConsentResendLimitError()
      : new ConsentRequestNotFoundError();
  }

  const storedEmail = row.guardianEmail;
  if (!storedEmail) {
    await rollbackCounter(db, row.id, false);
    throw new ConsentRequestNotFoundError();
  }

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
    await rollbackCounter(db, row.id, false);
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
}

/**
 * v2 `processConsentResponse`: looks up the request by token, validates
 * replay/expiry, then:
 *   - approve → tx: request → 'approved' + INSERT consent_grant(granted=true)
 *     + back-link consent_grant_id. (NEVER creates a guardianship edge.)
 *   - deny    → tx: request → 'denied' + delete payer subscription if this
 *     person owns one + cascade-delete the person.
 *
 * The atomic status transition's WHERE prevents the TOCTOU double-submit race.
 */
export async function processConsentResponseV2(
  db: Database,
  token: string,
  approved: boolean,
  audit?: { policyVersion?: string; requestIp?: string; userAgent?: string },
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
  const requestId = request.id;
  const chargePersonId = request.chargePersonId;
  const basis = request.requestedBasis;

  if (approved) {
    await db.transaction(async (tx) => {
      // Atomic guard against a concurrent second submit.
      const [grant] = await tx
        .insert(consentGrant)
        .values({
          chargePersonId,
          organizationId: request.organizationId,
          purpose: request.purpose,
          lawfulBasis: basis,
          granted: true,
          grantedAt: now,
          priorValue: null,
          auditFact: {
            source: 'consent_response_approved',
            policyVersion: audit?.policyVersion ?? request.policyVersion,
          },
        })
        .returning({ id: consentGrant.id });
      if (!grant) {
        throw new Error('consent_grant insert did not return a row');
      }

      const [updated] = await tx
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
            eq(consentRequest.id, requestId),
            sql`${consentRequest.status} NOT IN ('approved','denied')`,
          ),
        )
        .returning({ id: consentRequest.id });

      if (!updated) {
        // The concurrent submitter won; abort so the grant insert rolls back.
        throw new ConsentAlreadyProcessedError();
      }
    });
  } else {
    await db.transaction(async (tx) => {
      const [updated] = await tx
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
            eq(consentRequest.id, requestId),
            sql`${consentRequest.status} NOT IN ('approved','denied')`,
          ),
        )
        .returning({ id: consentRequest.id });

      if (!updated) {
        throw new ConsentAlreadyProcessedError();
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
  }

  return { chargePersonId, approved };
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

  const current = await currentGrant(db, chargePersonId, organizationId, basis);
  if (!current) {
    throw new ConsentRecordNotFoundError();
  }
  if (current.withdrawnAt) {
    return { chargePersonId, withdrawnAt: current.withdrawnAt };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(consentGrant)
      .set({
        withdrawnAt: now,
        priorValue: true,
        auditFact: { source: 'guardian_revocation', guardianPersonId },
      })
      .where(
        and(eq(consentGrant.id, current.id), isNull(consentGrant.withdrawnAt)),
      );

    await tx
      .update(nudges)
      .set({ readAt: now })
      .where(
        and(eq(nudges.toProfileId, chargePersonId), isNull(nudges.readAt)),
      );
  });

  return { chargePersonId, withdrawnAt: now };
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
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(chargePersonId)}, 0))`,
    );

    const current = await tx.query.consentGrant.findFirst({
      where: and(
        eq(consentGrant.chargePersonId, chargePersonId),
        eq(consentGrant.purpose, DEFAULT_CONSENT_PURPOSE),
        eq(consentGrant.organizationId, organizationId),
        eq(consentGrant.lawfulBasis, basis),
      ),
      orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
      columns: { id: true, withdrawnAt: true },
    });
    if (!current) {
      throw new ConsentRecordNotFoundError();
    }
    // Not withdrawn → nothing to restore (idempotent no-op).
    if (!current.withdrawnAt) {
      return { chargePersonId };
    }
    if (
      Date.now() - current.withdrawnAt.getTime() >
      RESTORE_CONSENT_GRACE_PERIOD_MS
    ) {
      throw new ConsentGracePeriodExpiredError();
    }

    await tx.insert(consentGrant).values({
      chargePersonId,
      organizationId,
      purpose: DEFAULT_CONSENT_PURPOSE,
      lawfulBasis: basis,
      granted: true,
      grantedAt: now,
      priorValue: false,
      auditFact: { source: 'guardian_restore', guardianPersonId },
    });
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
  const updated = await db
    .update(consentRequest)
    .set({
      token: newToken,
      tokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(requestKey(chargePersonId, organizationId, 'gdpr_parental_consent'))
    .returning({ id: consentRequest.id });
  if (updated.length === 0) {
    throw new ConsentRecordNotFoundError();
  }
  return newToken;
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
  const updated = await db
    .update(consentRequest)
    .set({
      token: freshToken,
      tokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        requestKey(
          input.chargePersonId,
          input.organizationId,
          'gdpr_parental_consent',
        ),
        sql`${consentRequest.requestedAt} >= ${input.requestedAt}`,
        sql`${consentRequest.requestedAt} < ${input.requestedAtUpperBound}`,
        sql`${consentRequest.status} NOT IN ('approved','denied')`,
        sql`${consentRequest.guardianEmail} IS NOT NULL`,
      ),
    )
    .returning({ guardianEmail: consentRequest.guardianEmail });
  const guardianEmail = updated[0]?.guardianEmail;
  if (!guardianEmail) return null;
  return { guardianEmail, freshToken };
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
      respondedAt: true,
      tokenExpiresAt: true,
    },
  });
  if (!request) return null;
  if (request.respondedAt) return null;
  if (request.tokenExpiresAt && new Date() > request.tokenExpiresAt) {
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
  return { status: 'CONSENTED' };
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

  const status = await resolveLatestConsentStatusAnyBasis(
    db,
    chargePersonId,
    organizationId,
    DEFAULT_CONSENT_PURPOSE,
  );
  if (status === null) return null;

  // The request row carrying the recipient/timestamp — pick the most recently
  // requested across bases (legacy ordered by requested_at desc).
  const request = await db.query.consentRequest.findFirst({
    where: and(
      eq(consentRequest.chargePersonId, chargePersonId),
      eq(consentRequest.purpose, DEFAULT_CONSENT_PURPOSE),
      eq(consentRequest.organizationId, organizationId),
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
  const current = await currentGrant(
    db,
    chargePersonId,
    membershipRow.organizationId,
    'gdpr_parental_consent',
  );
  if (!current?.withdrawnAt) return false;
  // [WI-973] A missing revokedAt means we cannot confirm the generation;
  // return false so the cascade-delete guard does not pass vacuously.
  if (!revokedAt) return false;
  return current.withdrawnAt.getTime() === revokedAt.getTime();
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
  archivedAt: Date | null;
} | null> {
  const row = await db.query.person.findFirst({
    where: eq(person.id, chargePersonId),
    columns: { displayName: true, birthDate: true, archivedAt: true },
  });
  if (!row) return null;
  return {
    displayName: row.displayName,
    birthYear: Number(row.birthDate.slice(0, 4)),
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
  return db.transaction(async (tx) => {
    const current = await tx.query.consentGrant.findFirst({
      where: and(
        eq(consentGrant.chargePersonId, chargePersonId),
        eq(consentGrant.purpose, DEFAULT_CONSENT_PURPOSE),
        eq(consentGrant.lawfulBasis, 'gdpr_parental_consent'),
      ),
      orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
      columns: { withdrawnAt: true },
    });
    if (!current?.withdrawnAt) return false;
    if (
      withdrawnAt &&
      current.withdrawnAt.getTime() !== withdrawnAt.getTime()
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

/** The basis-keyed request unique predicate. */
function requestKey(
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
) {
  return and(
    eq(consentRequest.chargePersonId, chargePersonId),
    eq(consentRequest.purpose, DEFAULT_CONSENT_PURPOSE),
    eq(consentRequest.organizationId, organizationId),
    eq(consentRequest.requestedBasis, basis),
  );
}

/** The current grant for a basis = max(granted_at), tiebreak id DESC. */
async function currentGrant(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  basis: ConsentBasis,
): Promise<{ id: string; withdrawnAt: Date | null } | null> {
  const row = await db.query.consentGrant.findFirst({
    where: and(
      eq(consentGrant.chargePersonId, chargePersonId),
      eq(consentGrant.purpose, DEFAULT_CONSENT_PURPOSE),
      eq(consentGrant.organizationId, organizationId),
      eq(consentGrant.lawfulBasis, basis),
    ),
    orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
    columns: { id: true, withdrawnAt: true },
  });
  return row ?? null;
}

/** Roll back a burned resend/recipient counter after an email delivery failure. */
async function rollbackCounter(
  db: Database,
  requestId: string,
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
      .where(eq(consentRequest.id, requestId));
  } catch (rollbackError) {
    logger.warn('[consent-v2] Failed to rollback resend counter', {
      error:
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError),
    });
  }
}
