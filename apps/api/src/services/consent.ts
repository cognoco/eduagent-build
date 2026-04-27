// ---------------------------------------------------------------------------
// Parental Consent Service — Story 0.5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, desc, and, sql } from 'drizzle-orm';
import {
  consentStates,
  familyLinks,
  profiles,
  type Database,
} from '@eduagent/database';
import type {
  ConsentType,
  ConsentStatus,
  ConsentRequest,
} from '@eduagent/schemas';
import {
  sendEmail,
  formatConsentRequestEmail,
  type EmailOptions,
} from './notifications';
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
        : 'Consent email could not be delivered. Please check the email address and try again.'
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

/** Approximate age from birth year using the current calendar year. */
function calculateAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/** Minimum age to use the platform (PRD line 386: "Ages 6-10 Out of Scope") */
export const MINIMUM_AGE = 11;

/**
 * Determines whether parental consent is required based on age alone.
 *
 * GDPR-everywhere model (Story 10.19): location is no longer a factor.
 * - Users under 11 are rejected entirely (PRD line 386)
 * - Users ≤ 16 require GDPR consent (conservative: birth-year-only
 *   precision cannot confirm they have turned 17)
 * - Users 17+ do not require consent
 */
export function checkConsentRequired(birthYear: number): {
  required: boolean;
  consentType: ConsentType | null;
  belowMinimumAge?: boolean;
  age: number;
} {
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
  consentType: ConsentType
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
  parentProfileId: string
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
 * Creates a consent request and sends a notification email to the parent.
 */
export interface ConsentRequestResult {
  consentState: ConsentState;
  /** Whether the consent email was successfully delivered. */
  emailDelivered: boolean;
}

export async function requestConsent(
  db: Database,
  input: ConsentRequest,
  appUrl: string,
  emailOptions?: EmailOptions,
  accountId?: string
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
          eq(profiles.accountId, accountId)
        )
      );
    if (!owner) {
      throw new Error('Child profile not found');
    }
  }

  const token = crypto.randomUUID();

  // Token expires in 7 days (PRD line 414)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Atomic upsert with resend limit enforced in the UPDATE WHERE clause.
  // This avoids the TOCTOU race where two concurrent requests both read
  // resendCount=2, both pass the check, and both increment to 3.
  //
  // When the parent email changes, the resend counter resets to 0 — the limit
  // is per-recipient, so switching to a different email should always be allowed.
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
    })
    .onConflictDoUpdate({
      target: [consentStates.profileId, consentStates.consentType],
      set: {
        status: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: input.parentEmail,
        consentToken: token,
        expiresAt,
        resendCount: sql`CASE WHEN ${consentStates.parentEmail} IS NOT DISTINCT FROM ${input.parentEmail} THEN ${consentStates.resendCount} + 1 ELSE 0 END`,
        requestedAt: sql`now()`,
        respondedAt: null,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${consentStates.resendCount} < ${MAX_CONSENT_RESENDS} OR ${consentStates.parentEmail} IS DISTINCT FROM ${input.parentEmail}`,
    })
    .returning();

  // If no row returned, the conflict existed but the setWhere prevented the
  // update — meaning the resend limit was reached for the same email.
  if (!row) {
    throw new ConsentResendLimitError();
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
      tokenUrl
    ),
    emailOptions
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

    // Roll back the resend counter — don't burn attempts when email fails.
    // Use GREATEST to avoid negative values on initial insert (resendCount=0).
    try {
      await db
        .update(consentStates)
        .set({
          resendCount: sql`GREATEST(${consentStates.resendCount} - 1, 0)`,
          updatedAt: sql`now()`,
        })
        .where(eq(consentStates.id, row.id));
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
 * Processes a parent's consent response (approve or deny).
 *
 * Looks up the consent record by its unique token, updates the status,
 * and — if denied — cascade-deletes the child's profile (FR10).
 */
export async function processConsentResponse(
  db: Database,
  token: string,
  approved: boolean
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

  const [updated] = await db
    .update(consentStates)
    .set({
      status: newStatus,
      respondedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(consentStates.id, row.id),
        eq(consentStates.profileId, row.profileId),
        sql`${consentStates.status} NOT IN ('CONSENTED', 'WITHDRAWN')`
      )
    )
    .returning();

  if (!updated) {
    throw new ConsentAlreadyProcessedError();
  }

  // 3. If denied (FR10): cascade-delete the child's profile.
  //    CASCADE FKs handle all child data (subjects, sessions, etc.)
  if (!approved) {
    await db.delete(profiles).where(eq(profiles.id, row.profileId));
  }

  return mapConsentRow({
    ...row,
    status: newStatus,
    respondedAt: now,
  });
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
  profileId: string
): Promise<ConsentStatus | null> {
  const row = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, profileId),
    orderBy: desc(consentStates.requestedAt),
  });
  return row?.status ?? null;
}

/**
 * Looks up a child's display name from a consent token.
 * Used by the web consent page to personalise the approval screen.
 * Returns null if the token is invalid or the profile doesn't exist.
 */
export async function getChildNameByToken(
  db: Database,
  token: string
): Promise<string | null> {
  const consent = await db.query.consentStates.findFirst({
    where: eq(consentStates.consentToken, token),
  });
  if (!consent) return null;

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, consent.profileId),
    columns: { displayName: true },
  });
  return profile?.displayName ?? null;
}

/**
 * Returns the current consent state for a profile including parentEmail.
 *
 * Used by the GET /v1/consent/my-status endpoint so the mobile app can
 * display which email address the consent request was sent to.
 */
export async function getProfileConsentState(
  db: Database,
  profileId: string
): Promise<{
  status: ConsentStatus;
  parentEmail: string | null;
  consentType: ConsentType;
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
  parentProfileId: string
): Promise<ConsentState | null> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.childProfileId, childProfileId),
      eq(familyLinks.parentProfileId, parentProfileId)
    ),
  });
  if (!link) {
    throw new Error('Not authorized to view consent for this profile');
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
  parentProfileId: string
): Promise<ConsentState> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.childProfileId, childProfileId),
      eq(familyLinks.parentProfileId, parentProfileId)
    ),
  });
  if (!link) {
    throw new Error('Not authorized to revoke consent for this profile');
  }

  // Find the consent state
  const existing = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, childProfileId),
    orderBy: desc(consentStates.requestedAt),
  });
  if (!existing) {
    throw new Error('No consent record found for this profile');
  }
  if (existing.status === 'WITHDRAWN') {
    return mapConsentRow(existing);
  }

  const now = new Date();
  const [row] = await db
    .update(consentStates)
    .set({
      status: 'WITHDRAWN',
      respondedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(consentStates.id, existing.id),
        eq(consentStates.profileId, childProfileId)
      )
    )
    .returning();

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
  parentProfileId: string
): Promise<ConsentState> {
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.childProfileId, childProfileId),
      eq(familyLinks.parentProfileId, parentProfileId)
    ),
  });
  if (!link) {
    throw new Error('Not authorized to restore consent for this profile');
  }

  // Find the consent state
  const existing = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, childProfileId),
    orderBy: desc(consentStates.requestedAt),
  });
  if (!existing) {
    throw new Error('No consent record found for this profile');
  }
  if (existing.status !== 'WITHDRAWN') {
    return mapConsentRow(existing);
  }

  const now = new Date();
  const [row] = await db
    .update(consentStates)
    .set({
      status: 'CONSENTED',
      respondedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(consentStates.id, existing.id),
        eq(consentStates.profileId, childProfileId)
      )
    )
    .returning();

  if (!row) throw new Error('Update on consentStates did not return a row');
  return mapConsentRow(row);
}
