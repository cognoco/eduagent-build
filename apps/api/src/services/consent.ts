// ---------------------------------------------------------------------------
// Parental Consent Service — Story 0.5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type {
  ConsentType,
  ConsentStatus,
  ConsentRequest,
} from '@eduagent/schemas';
import { sendEmail, formatConsentRequestEmail } from './notifications';

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
 *
 * TODO: Insert into consentStates table
 * TODO: Generate signed token (crypto.randomUUID + HMAC)
 */
export async function requestConsent(
  input: ConsentRequest
): Promise<ConsentState> {
  const consentId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = new Date().toISOString();

  // TODO: Build consent URL from token using app config
  const tokenUrl = `https://app.eduagent.com/consent?token=${token}`;

  await sendEmail(
    formatConsentRequestEmail(
      input.parentEmail,
      'your child', // TODO: Look up child's display name from profileId
      input.consentType,
      tokenUrl
    )
  );

  return {
    id: consentId,
    profileId: input.childProfileId,
    consentType: input.consentType,
    status: 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: input.parentEmail,
    requestedAt: now,
    respondedAt: null,
  };
}

/**
 * Processes a parent's consent response (approve or deny).
 *
 * TODO: Look up consent record by token from DB
 * TODO: If denied, cascade-delete profile (FR10)
 */
export async function processConsentResponse(
  token: string,
  approved: boolean
): Promise<ConsentState> {
  void token;
  const now = new Date().toISOString();

  // Stub response — in production, this would query the DB
  return {
    id: 'mock-consent-id',
    profileId: 'mock-profile-id',
    consentType: 'GDPR',
    status: approved ? 'CONSENTED' : 'WITHDRAWN',
    parentEmail: 'parent@example.com',
    requestedAt: now,
    respondedAt: now,
  };
}

/**
 * Returns the current consent status for a profile.
 *
 * TODO: Query consentStates table for profileId
 */
export async function getConsentStatus(
  profileId: string
): Promise<ConsentStatus | null> {
  void profileId;
  return null;
}
