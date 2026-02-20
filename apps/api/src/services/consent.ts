// ---------------------------------------------------------------------------
// Parental Consent Service — Story 0.5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, desc } from 'drizzle-orm';
import { consentStates, profiles, type Database } from '@eduagent/database';
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

/** Calculate age from birth date string (YYYY-MM-DD) */
function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Determines whether parental consent is required based on age and location.
 *
 * - EU children under 16 require GDPR consent
 * - US children under 13 require COPPA consent
 * - All others do not require consent
 */
export function checkConsentRequired(
  birthDate: string,
  location: 'EU' | 'US' | 'OTHER'
): { required: boolean; consentType: ConsentType | null } {
  const age = calculateAge(birthDate);
  if (location === 'EU' && age < 16)
    return { required: true, consentType: 'GDPR' };
  if (location === 'US' && age < 13)
    return { required: true, consentType: 'COPPA' };
  return { required: false, consentType: null };
}

/**
 * Creates a consent request and sends a notification email to the parent.
 */
export async function requestConsent(
  db: Database,
  input: ConsentRequest,
  appUrl: string,
  emailOptions?: EmailOptions
): Promise<ConsentState> {
  const token = crypto.randomUUID();

  const [row] = await db
    .insert(consentStates)
    .values({
      profileId: input.childProfileId,
      consentType: input.consentType,
      status: 'PARENTAL_CONSENT_REQUESTED',
      parentEmail: input.parentEmail,
      consentToken: token,
    })
    .returning();

  const tokenUrl = `${appUrl}/consent?token=${token}`;

  await sendEmail(
    formatConsentRequestEmail(
      input.parentEmail,
      'your child', // TODO: Look up child's display name from profileId
      input.consentType,
      tokenUrl
    ),
    emailOptions
  );

  return mapConsentRow(row);
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
    throw new Error('Invalid consent token');
  }

  // 2. Update status
  const newStatus = approved ? 'CONSENTED' : 'WITHDRAWN';
  const now = new Date();

  await db
    .update(consentStates)
    .set({
      status: newStatus,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(consentStates.id, row.id));

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
