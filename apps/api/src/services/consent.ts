// ---------------------------------------------------------------------------
// Parental Consent Service — Story 0.5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import {
  eq,
  desc,
  and,
  sql,
  inArray,
  isNull,
  isNotNull,
  gte,
  lt,
  notInArray,
} from 'drizzle-orm';
import {
  consentStates,
  familyLinks,
  nudges,
  profiles,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  ConsentType,
  ConsentStatus,
  ConsentRequest,
  ConsentResendRequest,
} from '@eduagent/schemas';
import {
  sendEmail,
  formatConsentRequestEmail,
  type EmailOptions,
} from './notifications/email';
import { calculateAge, calculateAgeFromParts, MINIMUM_AGE } from './age-utils';
import { createLogger } from './logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Custom error classes — used by route layer for reliable instanceof checks
// ---------------------------------------------------------------------------

export class ConsentResendLimitError extends Error {
  constructor() {
    super('Maximum consent resend limit reached');
    this.name = 'ConsentResendLimitError';
  }
}

export class EmailDeliveryError extends Error {
  constructor(reason?: string) {
    super(
      reason
        ? `Consent email could not be delivered (${reason}). Please check the email address and try again.`
        : 'Consent email could not be delivered. Please check the email address and try again.',
    );
    this.name = 'EmailDeliveryError';
  }
}

export class ConsentTokenNotFoundError extends Error {
  constructor() {
    super('Invalid consent token');
    this.name = 'ConsentTokenNotFoundError';
  }
}

export class ConsentAlreadyProcessedError extends Error {
  constructor() {
    super('This consent request has already been processed');
    this.name = 'ConsentAlreadyProcessedError';
  }
}

export class ConsentTokenExpiredError extends Error {
  constructor() {
    super('Consent token has expired');
    this.name = 'ConsentTokenExpiredError';
  }
}

/**
 * [BUG-765] Thrown when a parent attempts to view/revoke/restore consent for a
 * profile that is not linked to them via family_links. The route layer maps
 * this to a 403 Forbidden via `instanceof` — the previous classification used
 * `error.message.includes('Not authorized')`, which silently broke any time
 * the message text was edited or wrapped by an upstream library.
 */
export class ConsentNotAuthorizedError extends Error {
  constructor(action: 'view' | 'revoke' | 'restore') {
    super(`Not authorized to ${action} consent for this profile`);
    this.name = 'ConsentNotAuthorizedError';
  }
}

/**
 * [BUG-765] Thrown when a consent state row is missing for the given profile —
 * route layer maps to 404 Not Found.
 */
export class ConsentRecordNotFoundError extends Error {
  constructor() {
    super('No consent record found for this profile');
    this.name = 'ConsentRecordNotFoundError';
  }
}

/**
 * [WI-374] Thrown when the recipient-change cap is reached. Changing the
 * recipient email is a distinct, separately-capped action from resending, so
 * rotating the recipient cannot be used to reset the resend cap and bomb
 * arbitrary addresses. Route layer maps to 429.
 */
export class ConsentRecipientChangeLimitError extends Error {
  constructor() {
    super('Maximum consent recipient-change limit reached');
    this.name = 'ConsentRecipientChangeLimitError';
  }
}

/**
 * [WI-374] Thrown when a resend is requested but no consent request exists for
 * the profile/type (nothing to resend). Route layer maps to 404.
 */
export class ConsentRequestNotFoundError extends Error {
  constructor() {
    super('No pending consent request to resend');
    this.name = 'ConsentRequestNotFoundError';
  }
}

/**
 * [Bug #871] Thrown when restoreConsent is called more than 7 days after the
 * revocation timestamp. After the grace period the archive-cleanup Inngest
 * function may have already hard-deleted child data; resurrecting the consent
 * row would attach CONSENTED state to an empty profile with no audit trail.
 * Route layer maps to 410 GONE.
 */
export const RESTORE_CONSENT_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export class ConsentGracePeriodExpiredError extends Error {
  constructor() {
    super(
      'Restore window has expired. The 7-day grace period to restore consent has passed and the data may have already been deleted.',
    );
    this.name = 'ConsentGracePeriodExpiredError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsentState {
  id: string;
  profileId: string;
  consentType: ConsentType;
  status: ConsentStatus;
  parentEmail: string | null;
  requestedAt: string;
  respondedAt: string | null;
}

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapConsentRow(row: typeof consentStates.$inferSelect): ConsentState {
  return {
    id: row.id,
    profileId: row.profileId,
    consentType: row.consentType,
    status: row.status,
    parentEmail: row.parentEmail ?? null,
    requestedAt: row.requestedAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// calculateAge, calculateAgeFromParts, and MINIMUM_AGE live in ./age-utils
// (WI-572: moved to break the family-access→consent→notifications SCC).
// Re-exported here for backwards compatibility with existing callers that
// import these from consent.ts directly.
export { calculateAge, calculateAgeFromParts, MINIMUM_AGE } from './age-utils';

/**
 * Determines whether parental consent is required using an exact birth date
 * when month and day are available, falling back to year-only otherwise.
 *
 * Applies the same thresholds as checkConsentRequired():
 * - age < MINIMUM_AGE  → belowMinimumAge + GDPR required
 * - age <= 16          → GDPR required
 * - age > 16           → not required
 *
 * [F-029-sem] Fail-closed: null / undefined / 0 birthYear is treated as
 * unknown age → required=true, belowMinimumAge=true.
 */
export function checkConsentRequiredFromDate(
  birthYear: number | null | undefined,
  birthMonth?: number,
  birthDay?: number,
): {
  required: boolean;
  consentType: ConsentType | null;
  belowMinimumAge?: boolean;
  age: number;
} {
  // [F-029-sem] Fail closed: unknown age treated as sub-minimum.
  if (!birthYear) {
    return {
      required: true,
      consentType: 'GDPR',
      belowMinimumAge: true,
      age: 0,
    };
  }
  const age = calculateAgeFromParts(birthYear, birthMonth, birthDay);
  if (age < MINIMUM_AGE) {
    return { required: true, consentType: 'GDPR', belowMinimumAge: true, age };
  }
  if (age <= 16) {
    return { required: true, consentType: 'GDPR', age };
  }
  return { required: false, consentType: null, age };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Determines whether parental consent is required based on age alone.
 *
 * GDPR-everywhere model (Story 10.19): location is no longer a factor.
 * - Users under 11 are rejected entirely (PRD line 386)
 * - Users ≤ 16 require GDPR consent (conservative: birth-year-only
 *   precision cannot confirm they have turned 17)
 * - Users 17+ do not require consent
 *
 * [F-029-sem] Fail-closed: null / undefined / 0 birthYear is treated as
 * unknown age → required=true, belowMinimumAge=true. This closes the semantic
 * gap where a caller passes a sentinel value and receives "not required" back.
 */
export function checkConsentRequired(birthYear: number | null | undefined): {
  required: boolean;
  consentType: ConsentType | null;
  belowMinimumAge?: boolean;
  age: number;
} {
  // [F-029-sem] Fail closed: unknown age treated as sub-minimum.
  if (!birthYear) {
    return {
      required: true,
      consentType: 'GDPR',
      belowMinimumAge: true,
      age: 0,
    };
  }
  const age = calculateAge(birthYear);
  if (age < MINIMUM_AGE) {
    return { required: true, consentType: 'GDPR', belowMinimumAge: true, age };
  }
  // With birth-year-only inputs, treat the "turning 16 this year" cohort as
  // requiring consent until we have a more precise date.
  if (age <= 16) {
    return { required: true, consentType: 'GDPR', age };
  }
  return { required: false, consentType: null, age };
}

/**
 * Creates a PENDING consent state row without sending email.
 *
 * Used during profile creation to record that consent is required.
 * The actual email is sent later via `requestConsent()` when the parent
 * email is provided by the client.
 */
export async function createPendingConsentState(
  db: Database,
  profileId: string,
  consentType: ConsentType,
): Promise<ConsentState> {
  const [row] = await db
    .insert(consentStates)
    .values({
      profileId,
      consentType,
      status: 'PENDING',
    })
    .onConflictDoUpdate({
      target: [consentStates.profileId, consentStates.consentType],
      set: {
        status: 'PENDING',
        respondedAt: null,
        parentEmail: null,
        consentToken: null,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  if (!row) throw new Error('Insert into consentStates did not return a row');
  return mapConsentRow(row);
}

/**
 * Creates a CONSENTED consent state row immediately (no email required).
 *
 * Used when a parent directly creates a child profile — the parent IS the
 * consenting adult, so consent is recorded inline. This avoids the
 * child-initiated consent request loop (BUG-239).
 *
 * GDPR compliance: persists consentType, timestamp (requestedAt + respondedAt),
 * and the consenting parent's profileId via the familyLinks row.
 */
export async function createGrantedConsentState(
  db: Database,
  profileId: string,
  consentType: ConsentType,
  parentProfileId: string,
): Promise<ConsentState> {
  const now = new Date();

  // Wrap consent state + family link in a transaction so they succeed or
  // fail atomically. Without this, a familyLinks failure would leave the
  // child CONSENTED but with no parent link for revocation/management.
  //
  // [BUG-863] The old neon-http driver silently fell back to non-atomic
  // execution inside db.transaction(). The driver was migrated to
  // neon-serverless (WebSocket Pool) in Phase 0.0 — db.transaction() now
  // opens a genuine Postgres BEGIN/COMMIT and is fully ACID.
  const row = await db.transaction(async (tx) => {
    const [consentRow] = await tx
      .insert(consentStates)
      .values({
        profileId,
        consentType,
        status: 'CONSENTED',
        respondedAt: now,
      })
      .onConflictDoUpdate({
        target: [consentStates.profileId, consentStates.consentType],
        set: {
          status: 'CONSENTED',
          respondedAt: now,
          // Clear stale token/email from any prior PARENTAL_CONSENT_REQUESTED row
          consentToken: null,
          expiresAt: null,
          parentEmail: null,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    // Create family link so parent can manage consent (revocation, etc.)
    await tx
      .insert(familyLinks)
      .values({
        parentProfileId,
        childProfileId: profileId,
      })
      .onConflictDoNothing();

    return consentRow;
  });

  if (!row) throw new Error('Insert into consentStates did not return a row');
  return mapConsentRow(row);
}

/** Maximum number of consent resends (PRD lines 415, 420) */
const MAX_CONSENT_RESENDS = 3;

/**
 * [WI-374] Maximum number of recipient-email changes per consent request.
 * Changing the recipient resets the resend budget (legitimate "I typed the
 * wrong email" correction), so it MUST be separately capped — otherwise an
 * abuser rotates the recipient to reset the resend cap indefinitely and bombs
 * arbitrary addresses. The total email ceiling per request is therefore
 * bounded: 1 initial + MAX_CONSENT_RESENDS resends + MAX_RECIPIENT_CHANGES ×
 * (1 + MAX_CONSENT_RESENDS).
 */
const MAX_RECIPIENT_CHANGES = 3;

/**
 * Creates a consent request and sends a notification email to the parent.
 */
export interface ConsentRequestResult {
  consentState: ConsentState;
  /** Whether the consent email was successfully delivered. */
  emailDelivered: boolean;
}

/**
 * [Bug #872] Audit metadata captured at the route boundary and persisted on
 * each consent_states row so consent records remain re-derivable after
 * Cloudflare access logs roll over. `policyVersion` is the value of
 * `env.CONSENT_POLICY_VERSION` at the moment of the request/response.
 * `requestIp` is the parent's IP (cf-connecting-ip with x-forwarded-for
 * fallback). `userAgent` is the parent's User-Agent header. Any field may be
 * undefined in test/dev environments where the header is unavailable; the
 * column accepts NULL.
 */
export interface ConsentAuditMetadata {
  policyVersion?: string;
  requestIp?: string;
  userAgent?: string;
}

export async function requestConsent(
  db: Database,
  input: ConsentRequest,
  appUrl: string,
  emailOptions?: EmailOptions,
  accountId?: string,
  audit?: ConsentAuditMetadata,
): Promise<ConsentRequestResult> {
  // Verify childProfileId belongs to the calling account when accountId is provided.
  // Defense-in-depth: the route layer also enforces this via getProfile() before calling here.
  if (accountId) {
    const [owner] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.id, input.childProfileId),
          eq(profiles.accountId, accountId),
        ),
      );
    if (!owner) {
      throw new Error('Child profile not found');
    }
  }

  const token = crypto.randomUUID();

  // Token expires in 7 days (PRD line 414)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // [WI-374] Pre-read the existing request to classify this call as a
  // resend-to-same-email vs a recipient change. This only drives error
  // classification and which counter to roll back on email failure — the caps
  // themselves are enforced atomically in the setWhere below (race-safe), so a
  // stale read here can never let a request exceed a cap.
  const existing = await db.query.consentStates.findFirst({
    where: and(
      eq(consentStates.profileId, input.childProfileId),
      eq(consentStates.consentType, input.consentType),
    ),
    columns: { parentEmail: true },
  });
  // A null stored recipient means no email has been assigned yet (e.g. a
  // PENDING row from createPendingConsentState). The first real email is the
  // INITIAL request, NOT a recipient change — it must not consume a
  // recipient-change slot.
  const isRecipientChange =
    existing != null &&
    existing.parentEmail != null &&
    existing.parentEmail !== input.parentEmail;

  // Atomic upsert with both caps enforced in the UPDATE WHERE clause.
  // This avoids the TOCTOU race where two concurrent requests both read a
  // counter, both pass the check, and both increment past the cap.
  //
  // [WI-374] The resend cap is request-keyed (same email → resendCount + 1).
  // Changing the recipient resets the resend budget but is SEPARATELY capped
  // via recipientChangeCount, so rotating the recipient cannot reset the
  // resend cap to bomb arbitrary addresses.
  const [row] = await db
    .insert(consentStates)
    .values({
      profileId: input.childProfileId,
      consentType: input.consentType,
      status: 'PARENTAL_CONSENT_REQUESTED',
      parentEmail: input.parentEmail,
      consentToken: token,
      expiresAt,
      resendCount: 0,
      recipientChangeCount: 0,
      // [Bug #872] Capture audit metadata at request time.
      policyVersion: audit?.policyVersion ?? null,
      requestIp: audit?.requestIp ?? null,
      userAgent: audit?.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: [consentStates.profileId, consentStates.consentType],
      set: {
        status: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: input.parentEmail,
        consentToken: token,
        expiresAt,
        // [Bug #872] Refresh audit metadata on each request — a re-request
        // (e.g. recipient correction) is itself a parent action that should
        // be auditable.
        policyVersion: audit?.policyVersion ?? null,
        requestIp: audit?.requestIp ?? null,
        userAgent: audit?.userAgent ?? null,
        resendCount: sql`CASE WHEN ${consentStates.parentEmail} IS NOT DISTINCT FROM ${input.parentEmail} THEN ${consentStates.resendCount} + 1 ELSE 0 END`,
        // Only a change BETWEEN two real recipients consumes a change slot. A
        // null→email first assignment (IS NULL) is the initial request.
        recipientChangeCount: sql`CASE WHEN ${consentStates.parentEmail} IS NOT NULL AND ${consentStates.parentEmail} IS DISTINCT FROM ${input.parentEmail} THEN ${consentStates.recipientChangeCount} + 1 ELSE ${consentStates.recipientChangeCount} END`,
        requestedAt: sql`now()`,
        respondedAt: null,
        updatedAt: sql`now()`,
      },
      // Three branches: (1) same recipient → resend cap; (2) no recipient yet
      // (NULL) → always allowed, this is the initial assignment; (3) real
      // recipient change → recipient-change cap. Caps are enforced here
      // atomically so concurrent requests cannot exceed them.
      //
      // [BUG-791] Terminal-status guard: a CONSENTED or WITHDRAWN row is an
      // already-decided consent and must NEVER be revived back to
      // PARENTAL_CONSENT_REQUESTED by this upsert. Without this guard a
      // parent-created child (whose row is CONSENTED with parentEmail = NULL)
      // would match the `parentEmail IS NULL` branch and get flipped back to
      // "requested", letting a same-account sibling disrupt a decided consent
      // and re-email an arbitrary address. resendConsent already enforces the
      // same guard via its WHERE clause; this closes the request-upsert path.
      setWhere: sql`${consentStates.status} NOT IN ('CONSENTED', 'WITHDRAWN') AND ((${consentStates.parentEmail} IS NOT DISTINCT FROM ${input.parentEmail} AND ${consentStates.resendCount} < ${MAX_CONSENT_RESENDS}) OR ${consentStates.parentEmail} IS NULL OR (${consentStates.parentEmail} IS NOT NULL AND ${consentStates.parentEmail} IS DISTINCT FROM ${input.parentEmail} AND ${consentStates.recipientChangeCount} < ${MAX_RECIPIENT_CHANGES}))`,
    })
    .returning();

  // If no row returned, the conflict existed but the setWhere prevented the
  // update — either a terminal (CONSENTED/WITHDRAWN) row blocked revival, or a
  // cap was reached. Disambiguate by re-reading the row: an already-decided
  // consent surfaces as "no pending request" rather than a misleading cap
  // error.
  if (!row) {
    const existingRow = await db.query.consentStates.findFirst({
      where: and(
        eq(consentStates.profileId, input.childProfileId),
        eq(consentStates.consentType, input.consentType),
      ),
      columns: { status: true },
    });
    if (
      existingRow != null &&
      (existingRow.status === 'CONSENTED' || existingRow.status === 'WITHDRAWN')
    ) {
      throw new ConsentRequestNotFoundError();
    }
    // Otherwise a cap was reached. Classify by intent: a same-email resend hit
    // the resend cap; a recipient change hit the recipient-change cap.
    throw isRecipientChange
      ? new ConsentRecipientChangeLimitError()
      : new ConsentResendLimitError();
  }

  // Look up child's display name for personalized email
  const childProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, input.childProfileId),
    columns: { displayName: true },
  });
  const childName = childProfile?.displayName ?? 'your child';

  const tokenUrl = `${appUrl}/v1/consent-page?token=${token}`;

  const emailResult = await sendEmail(
    formatConsentRequestEmail(
      input.parentEmail,
      childName,
      input.consentType,
      tokenUrl,
    ),
    // Pass db so sendEmail skips permanently-dead (suppressed) parent addresses
    // instead of re-burning quota on every consent attempt.
    { ...emailOptions, db },
  );

  if (!emailResult.sent) {
    // Missing API key is a config issue, not a delivery failure — return
    // gracefully so the consent state is still created (email can be resent).
    if (emailResult.reason === 'no_api_key') {
      return {
        consentState: mapConsentRow(row),
        emailDelivered: false,
      };
    }

    // Roll back the counter that was just incremented — don't burn attempts
    // when email fails. A recipient change incremented recipientChangeCount
    // (and reset resendCount to 0); a same-email resend incremented
    // resendCount. GREATEST avoids negative values on initial insert.
    try {
      await db
        .update(consentStates)
        .set(
          isRecipientChange
            ? {
                recipientChangeCount: sql`GREATEST(${consentStates.recipientChangeCount} - 1, 0)`,
                updatedAt: sql`now()`,
              }
            : {
                resendCount: sql`GREATEST(${consentStates.resendCount} - 1, 0)`,
                updatedAt: sql`now()`,
              },
        )
        // [BUG-660] profile-scoped rollback (matches the scoped upsert above).
        .where(
          and(
            eq(consentStates.id, row.id),
            eq(consentStates.profileId, row.profileId),
          ),
        );
    } catch (rollbackError) {
      // If rollback fails we still throw the delivery error — losing one
      // counter slot is better than silently claiming the email was sent.
      logger.warn('[consent] Failed to rollback resend counter', {
        error:
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
      });
    }
    throw new EmailDeliveryError(emailResult.reason ?? undefined);
  }

  return {
    consentState: mapConsentRow(row),
    emailDelivered: true,
  };
}

/**
 * [WI-374] Resends the consent email for an EXISTING request, reusing the
 * stored parent email server-side. The caller never supplies an email, so a
 * masked or arbitrary address can never be sent on resend (WI-261), and the
 * resend cap is bound to the request (childProfileId + consentType), not the
 * recipient string — rotating the recipient cannot reset it (WI-146/262/309).
 *
 * Distinct from {@link requestConsent}, which handles the initial request and
 * the (separately-capped) recipient change.
 */
export async function resendConsent(
  db: Database,
  input: ConsentResendRequest,
  appUrl: string,
  emailOptions?: EmailOptions,
  accountId?: string,
): Promise<ConsentRequestResult> {
  // Verify childProfileId belongs to the calling account when accountId is
  // provided. Defense-in-depth: the route layer also enforces this.
  if (accountId) {
    const [owner] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.id, input.childProfileId),
          eq(profiles.accountId, accountId),
        ),
      );
    if (!owner) {
      throw new Error('Child profile not found');
    }
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Atomic conditional UPDATE: increment resendCount and enforce the cap in
  // the WHERE clause (race-safe). No INSERT — a resend requires an existing
  // request. The stored parentEmail is left untouched and reused below.
  const [row] = await db
    .update(consentStates)
    .set({
      status: 'PARENTAL_CONSENT_REQUESTED',
      consentToken: token,
      expiresAt,
      resendCount: sql`${consentStates.resendCount} + 1`,
      requestedAt: sql`now()`,
      respondedAt: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(consentStates.profileId, input.childProfileId),
        eq(consentStates.consentType, input.consentType),
        // [CodeRabbit] Only an ACTIVE request can be resent. Without this guard
        // a resend could overwrite a terminal CONSENTED/WITHDRAWN row back to
        // PARENTAL_CONSENT_REQUESTED (and re-email the parent), corrupting an
        // already-decided consent. isNotNull(parentEmail) ensures a recipient
        // exists to resend to.
        eq(consentStates.status, 'PARENTAL_CONSENT_REQUESTED'),
        isNotNull(consentStates.parentEmail),
        sql`${consentStates.resendCount} < ${MAX_CONSENT_RESENDS}`,
      ),
    )
    .returning();

  // No row updated → either no active request exists (nothing to resend) or
  // the cap was hit. Disambiguate with a follow-up read scoped to the same
  // active-request predicate (read does not affect the cap decision, which was
  // atomic above).
  if (!row) {
    const stillExists = await db.query.consentStates.findFirst({
      where: and(
        eq(consentStates.profileId, input.childProfileId),
        eq(consentStates.consentType, input.consentType),
        eq(consentStates.status, 'PARENTAL_CONSENT_REQUESTED'),
        isNotNull(consentStates.parentEmail),
      ),
      columns: { id: true },
    });
    throw stillExists
      ? new ConsentResendLimitError()
      : new ConsentRequestNotFoundError();
  }

  // Reuse the STORED recipient — never a client-supplied value (AC1/WI-261).
  const storedEmail = row.parentEmail;
  if (!storedEmail) {
    // A request row with no recipient on record cannot be resent. Roll back
    // the burned attempt and surface as "nothing to resend".
    try {
      await db
        .update(consentStates)
        .set({
          resendCount: sql`GREATEST(${consentStates.resendCount} - 1, 0)`,
          updatedAt: sql`now()`,
        })
        // [BUG-660] profile-scoped rollback (matches the scoped update above).
        .where(
          and(
            eq(consentStates.id, row.id),
            eq(consentStates.profileId, row.profileId),
          ),
        );
    } catch (rollbackError) {
      // best-effort rollback — match the sibling catch blocks at :608 and :784
      logger.warn('[consent] Failed to rollback resend counter', {
        event: 'consent.resend.rollback_failed',
        error:
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
      });
    }
    throw new ConsentRequestNotFoundError();
  }

  const childProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, input.childProfileId),
    columns: { displayName: true },
  });
  const childName = childProfile?.displayName ?? 'your child';

  const tokenUrl = `${appUrl}/v1/consent-page?token=${token}`;

  const emailResult = await sendEmail(
    formatConsentRequestEmail(
      storedEmail,
      childName,
      row.consentType,
      tokenUrl,
    ),
    // Pass db so sendEmail skips permanently-dead (suppressed) parent addresses
    // instead of re-burning quota on every consent re-send.
    { ...emailOptions, db },
  );

  if (!emailResult.sent) {
    if (emailResult.reason === 'no_api_key') {
      return {
        consentState: mapConsentRow(row),
        emailDelivered: false,
      };
    }

    // Roll back the resend counter — don't burn attempts when email fails.
    // Use GREATEST to avoid negative values on initial insert (resendCount=0).
    // [BUG-660 / FCR-2026-05-23-L3.L3.1] Include profileId in WHERE as
    // defense-in-depth: the preceding upsert was profile-scoped, so this
    // rollback must be profile-scoped too. Without the explicit profileId
    // guard, a stale/wrong row.id could affect an unrelated profile's
    // consent record.
    try {
      await db
        .update(consentStates)
        .set({
          resendCount: sql`GREATEST(${consentStates.resendCount} - 1, 0)`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(consentStates.id, row.id),
            eq(consentStates.profileId, row.profileId),
          ),
        );
    } catch (rollbackError) {
      logger.warn('[consent] Failed to rollback resend counter', {
        error:
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
      });
    }
    throw new EmailDeliveryError(emailResult.reason ?? undefined);
  }

  return {
    consentState: mapConsentRow(row),
    emailDelivered: true,
  };
}

/**
 * Processes a parent's consent response (approve or deny).
 *
 * Looks up the consent record by its unique token, updates the status,
 * and — if denied — cascade-deletes the child's profile (FR10).
 */
export async function processConsentResponse(
  db: Database,
  token: string,
  approved: boolean,
  audit?: ConsentAuditMetadata,
): Promise<ConsentState> {
  // 1. Look up consent record by token
  const row = await db.query.consentStates.findFirst({
    where: eq(consentStates.consentToken, token),
  });

  if (!row) {
    throw new ConsentTokenNotFoundError();
  }

  // 1b. Replay protection — reject if already processed
  if (row.status === 'CONSENTED' || row.status === 'WITHDRAWN') {
    throw new ConsentAlreadyProcessedError();
  }

  // 1c. Token expiry check (PRD line 414: 7-day link expiry)
  if (row.expiresAt && new Date() > row.expiresAt) {
    throw new ConsentTokenExpiredError();
  }

  // 2. Atomic status transition — WHERE clause prevents TOCTOU race.
  //    Two concurrent submissions both pass the in-memory guard above,
  //    but only the first UPDATE will match the non-terminal status.
  const newStatus = approved ? 'CONSENTED' : 'WITHDRAWN';
  const now = new Date();
  const consentStateId = row.id;
  const consentProfileId = row.profileId;

  async function updateStatus(
    executor: Pick<Database, 'update'>,
  ): Promise<void> {
    const [updated] = await executor
      .update(consentStates)
      .set({
        status: newStatus,
        respondedAt: now,
        updatedAt: now,
        // [Bug #872] Capture the IP/UA/policy version at the moment the
        // parent clicked approve or deny — distinct from the request-time
        // metadata captured by requestConsent (e.g. the request was issued
        // from the mobile app on cellular, the response was clicked from the
        // parent's laptop on home WiFi). Only overwrite when supplied so a
        // call from a code path that doesn't yet plumb audit context (tests,
        // batch reprocessing) leaves the prior values intact.
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
          eq(consentStates.id, consentStateId),
          eq(consentStates.profileId, consentProfileId),
          sql`${consentStates.status} NOT IN ('CONSENTED', 'WITHDRAWN')`,
        ),
      )
      .returning();

    if (!updated) {
      throw new ConsentAlreadyProcessedError();
    }
  }

  if (approved) {
    await updateStatus(db);
  } else {
    // 3. If denied (FR10): cascade-delete the child's profile.
    //    CASCADE FKs handle all child data (subjects, sessions, etc.).
    //    The denial status and destructive delete must commit or roll back
    //    together; otherwise a delete failure can leave a withdrawn-but-live
    //    child profile without a recovery path.
    await db.transaction(async (tx) => {
      await updateStatus(tx);
      await tx.delete(profiles).where(eq(profiles.id, consentProfileId));
    });
  }

  return mapConsentRow({
    ...row,
    status: newStatus,
    respondedAt: now,
  });
}

/**
 * Refreshes the consent token and its expiry for a profile.
 *
 * Called by the consent-reminder workflow before embedding an approval link
 * in each reminder email. Tokens minted by `requestConsent` expire after 7
 * days (PRD line 414). The day-7 reminder link is race-prone and the day-14
 * link is always expired without this refresh — parents who click a stale
 * link receive a ConsentTokenExpiredError and cannot approve (DS-020).
 *
 * Sets expiresAt to 16 days from now so the link is valid for the full
 * reminder window (day-14 reminder + 2-day click buffer) without running
 * past the day-30 auto-delete cutoff.
 *
 * Returns the new token so the caller can build the approval URL without a
 * second round-trip. Reads no PII from the event payload (invariant upheld).
 */
export async function refreshConsentToken(
  db: Database,
  profileId: string,
): Promise<string> {
  const newToken = crypto.randomUUID();
  // 16 days: covers day-14 reminder window plus a 2-day click buffer,
  // and stays well within the day-30 auto-delete cutoff.
  const newExpiresAt = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);

  const updated = await db
    .update(consentStates)
    .set({
      consentToken: newToken,
      expiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    // Scope to the GDPR row: (profileId, consentType) is unique, so without the
    // consentType predicate this would clobber a coexisting COPPA row and write
    // the same token to both, breaking the token-uniqueness the lookup relies on.
    .where(
      and(
        eq(consentStates.profileId, profileId),
        eq(consentStates.consentType, 'GDPR'),
      ),
    )
    .returning({ id: consentStates.id });

  // Fail fast if no GDPR row was updated: returning the token anyway would
  // embed a link in the reminder email that points to a token never persisted
  // (dead on arrival). Callers (consent reminders) only run while a PENDING
  // GDPR row exists, so this is a defensive guard against an unexpected state.
  if (updated.length === 0) {
    throw new ConsentRecordNotFoundError();
  }

  return newToken;
}

export interface RefreshConsentTokenForRequestInput {
  profileId: string;
  requestedAt: Date;
  requestedAtUpperBound: Date;
}

export interface RefreshedConsentTokenForRequest {
  parentEmail: string;
  freshToken: string;
}

/**
 * Refreshes a reminder token only if the original consent-request generation
 * is still current. Stale Inngest runs must not mint a valid token onto a newer
 * request, because token possession authorizes the consent response.
 */
export async function refreshConsentTokenForRequest(
  db: Database,
  input: RefreshConsentTokenForRequestInput,
): Promise<RefreshedConsentTokenForRequest | null> {
  const freshToken = crypto.randomUUID();
  // 16 days: covers day-14 reminder window plus a 2-day click buffer,
  // and stays well within the day-30 auto-delete cutoff.
  const newExpiresAt = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);

  const updated = await db
    .update(consentStates)
    .set({
      consentToken: freshToken,
      expiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(consentStates.profileId, input.profileId),
        eq(consentStates.consentType, 'GDPR'),
        gte(consentStates.requestedAt, input.requestedAt),
        lt(consentStates.requestedAt, input.requestedAtUpperBound),
        notInArray(consentStates.status, ['CONSENTED', 'WITHDRAWN']),
        isNotNull(consentStates.parentEmail),
      ),
    )
    .returning({ parentEmail: consentStates.parentEmail });

  const parentEmail = updated[0]?.parentEmail;
  if (!parentEmail) return null;
  return { parentEmail, freshToken };
}

/**
 * Returns the current consent status for a profile (latest consent record).
 *
 * Uses raw db query with explicit profileId filter because the consent flow
 * operates cross-profile (parent approves for child). The scoped repository
 * also provides consentStates for standard reads.
 */
export async function getConsentStatus(
  db: Database,
  profileId: string,
): Promise<ConsentStatus | null> {
  const row = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, profileId),
    orderBy: desc(consentStates.requestedAt),
  });
  return row?.status ?? null;
}

export async function isConsentRevocationGenerationCurrent(
  db: Database,
  profileId: string,
  revokedAt?: Date,
): Promise<boolean> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.consentStates.findFirst(
    eq(consentStates.consentType, 'GDPR'),
    desc(consentStates.requestedAt),
  );
  if (row?.status !== 'WITHDRAWN') return false;
  if (!revokedAt) return true;

  const currentRespondedAt = row.respondedAt?.getTime();
  const eventRespondedAt = revokedAt.getTime();
  return (
    currentRespondedAt !== undefined &&
    !Number.isNaN(currentRespondedAt) &&
    !Number.isNaN(eventRespondedAt) &&
    currentRespondedAt === eventRespondedAt
  );
}

/**
 * Whether async/background processing of a profile's learner data is currently
 * permitted by GDPR consent state.
 *
 * Centralizes the guard that was previously duplicated inline across cron and
 * notification paths (WI-82). Background jobs run outside the HTTP consent
 * middleware, so each must re-check current consent at execution time before
 * sending learner data to an LLM/external provider or persisting derived data.
 *
 * Semantics (matches the pre-existing inline guards):
 * - no GDPR consent row ⇒ allowed (pre-consent-flow account, treated as not
 *   yet gated)
 * - latest GDPR row is `CONSENTED` ⇒ allowed
 * - `PENDING` / `PARENTAL_CONSENT_REQUESTED` / `WITHDRAWN` ⇒ blocked
 */
export async function isGdprProcessingAllowed(
  db: Database,
  profileId: string,
): Promise<boolean> {
  const row = await db.query.consentStates.findFirst({
    where: and(
      eq(consentStates.profileId, profileId),
      eq(consentStates.consentType, 'GDPR'),
    ),
    orderBy: desc(consentStates.requestedAt),
  });
  return row == null || row.status === 'CONSENTED';
}

/**
 * Looks up a child's display name from a consent token.
 * Used by the web consent page to personalise the approval screen.
 * Returns null if the token is invalid or the profile doesn't exist.
 */
export async function getChildNameByToken(
  db: Database,
  token: string,
): Promise<string | null> {
  const consent = await db.query.consentStates.findFirst({
    where: eq(consentStates.consentToken, token),
  });
  if (!consent) return null;
  if (consent.respondedAt) return null;
  if (consent.expiresAt && new Date() > consent.expiresAt) return null;

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, consent.profileId),
    columns: { displayName: true },
  });
  return profile?.displayName ?? null;
}

export async function getProfileDisplayName(
  db: Database,
  profileId: string,
): Promise<string | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { displayName: true },
  });
  return profile?.displayName ?? null;
}

export async function getProfileForConsentRevocation(
  db: Database,
  profileId: string,
): Promise<{
  displayName: string;
  birthYear: number;
  archivedAt: Date | null;
} | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { displayName: true, birthYear: true, archivedAt: true },
  });

  return profile ?? null;
}

export async function getFamilyOwnerProfileId(
  db: Database,
  childProfileId: string,
  fallbackParentProfileId: string,
): Promise<string> {
  const links = await db.query.familyLinks.findMany({
    where: eq(familyLinks.childProfileId, childProfileId),
    columns: { parentProfileId: true },
  });
  const parentProfileIds = links.map((link) => link.parentProfileId);
  if (parentProfileIds.length === 0) return fallbackParentProfileId;

  const owners = await db.query.profiles.findMany({
    where: and(
      inArray(profiles.id, parentProfileIds),
      eq(profiles.isOwner, true),
    ),
    columns: { id: true },
  });

  return owners[0]?.id ?? fallbackParentProfileId;
}

/**
 * Returns the current consent state for a profile including parentEmail.
 *
 * Used by the GET /v1/consent/my-status endpoint so the mobile app can
 * display which email address the consent request was sent to.
 */
export async function getProfileConsentState(
  db: Database,
  profileId: string,
): Promise<{
  status: ConsentStatus;
  parentEmail: string | null;
  consentType: ConsentType;
  requestedAt: string;
} | null> {
  const row = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, profileId),
    orderBy: desc(consentStates.requestedAt),
  });
  if (!row) return null;
  return {
    status: row.status,
    parentEmail: row.parentEmail ?? null,
    consentType: row.consentType,
    requestedAt: row.requestedAt.toISOString(),
  };
}

/**
 * Returns the consent state for a child profile, verifiable by the parent.
 *
 * Used by `GET /v1/consent/:childProfileId/status` so the parent dashboard
 * can show revocation state and grace-period countdown.
 */
export async function getChildConsentForParent(
  db: Database,
  childProfileId: string,
  parentProfileId: string,
): Promise<ConsentState | null> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.childProfileId, childProfileId),
      eq(familyLinks.parentProfileId, parentProfileId),
    ),
  });
  if (!link) {
    throw new ConsentNotAuthorizedError('view');
  }

  const row = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, childProfileId),
    orderBy: desc(consentStates.requestedAt),
  });
  if (!row) return null;
  return mapConsentRow(row);
}

// ---------------------------------------------------------------------------
// Consent Revocation (GDPR Art. 7(3))
// ---------------------------------------------------------------------------

/**
 * Revokes consent for a child profile. Sets status to WITHDRAWN.
 * Caller must verify the requesting user is the parent (via familyLinks).
 *
 * Returns the updated consent state. The caller should dispatch an Inngest
 * event to schedule the 7-day grace period deletion.
 */
export async function revokeConsent(
  db: Database,
  childProfileId: string,
  parentProfileId: string,
): Promise<ConsentState> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.childProfileId, childProfileId),
      eq(familyLinks.parentProfileId, parentProfileId),
    ),
  });
  if (!link) {
    throw new ConsentNotAuthorizedError('revoke');
  }

  // Find the consent state
  const existing = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, childProfileId),
    orderBy: desc(consentStates.requestedAt),
  });
  if (!existing) {
    throw new ConsentRecordNotFoundError();
  }
  if (existing.status === 'WITHDRAWN') {
    return mapConsentRow(existing);
  }

  const now = new Date();
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(consentStates)
      .set({
        status: 'WITHDRAWN',
        respondedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(consentStates.id, existing.id),
          eq(consentStates.profileId, childProfileId),
        ),
      )
      .returning();

    await tx
      .update(nudges)
      .set({ readAt: now })
      .where(
        and(eq(nudges.toProfileId, childProfileId), isNull(nudges.readAt)),
      );

    return updated;
  });

  if (!row) throw new Error('Update on consentStates did not return a row');
  return mapConsentRow(row);
}

/**
 * Restores consent that was previously revoked (within 7-day grace period).
 * Sets status back to CONSENTED.
 */
export async function restoreConsent(
  db: Database,
  childProfileId: string,
  parentProfileId: string,
): Promise<ConsentState> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.childProfileId, childProfileId),
      eq(familyLinks.parentProfileId, parentProfileId),
    ),
  });
  if (!link) {
    throw new ConsentNotAuthorizedError('restore');
  }

  // Find the consent state
  const existing = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, childProfileId),
    orderBy: desc(consentStates.requestedAt),
  });
  if (!existing) {
    throw new ConsentRecordNotFoundError();
  }
  if (existing.status !== 'WITHDRAWN') {
    return mapConsentRow(existing);
  }

  // [Bug #871] Enforce the 7-day grace period referenced by the revoke route
  // copy ("Data will be deleted after 7-day grace period.") and this function's
  // docstring. Without this check restoreConsent would silently flip
  // WITHDRAWN→CONSENTED and clear profiles.archivedAt even after the
  // archive-cleanup Inngest function has already hard-deleted child data,
  // leaving a CONSENTED row attached to an effectively-empty profile.
  // existing.respondedAt is the revocation timestamp (revokeConsent sets it).
  if (
    existing.respondedAt &&
    Date.now() - existing.respondedAt.getTime() >
      RESTORE_CONSENT_GRACE_PERIOD_MS
  ) {
    throw new ConsentGracePeriodExpiredError();
  }

  const now = new Date();

  // Atomically flip consent status AND clear archivedAt so the archive-cleanup
  // Inngest function cannot race and hard-delete a restored profile (C1).
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(consentStates)
      .set({
        status: 'CONSENTED',
        respondedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(consentStates.id, existing.id),
          eq(consentStates.profileId, childProfileId),
        ),
      )
      .returning();

    await tx
      .update(profiles)
      .set({ archivedAt: null })
      .where(eq(profiles.id, childProfileId));

    return updated;
  });

  if (!row) throw new Error('Update on consentStates did not return a row');
  return mapConsentRow(row);
}
