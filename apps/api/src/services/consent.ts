// ---------------------------------------------------------------------------
// Parental Consent Service — Story 0.5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, desc, and, inArray } from 'drizzle-orm';
import { consentStates, type Database } from '@eduagent/database';
import type { ConsentType, ConsentStatus } from '@eduagent/schemas';
import { calculateAge, calculateAgeFromParts, MINIMUM_AGE } from './age-utils';

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
 * Latest GDPR consent disposition per profile, batched.
 *
 * Issues a SINGLE findMany (no N+1) covering all profileIds, applies the
 * BUG-394 desc(id) tiebreak so deduplication is stable when two rows share the
 * same requestedAt, and returns the latest row's `{ status, respondedAt }` per
 * profile.
 *
 * Behaviour-preserving contract for callers:
 * - **Profiles with NO GDPR row are ABSENT from the map** (not pre-populated).
 *   This mirrors the original dashboard code, where a pre-consent-flow child
 *   had no `consentByProfile` entry and therefore reported `consentStatus: null`.
 * - The map carries the real `respondedAt` for every present profile (used by
 *   the WithdrawalCountdownBanner grace-period countdown).
 *
 * [WI-489] Consolidates the two previously-inline batch GDPR-consent queries
 * (dashboard.ts legacy path and solo-progress-reports.ts) behind one query.
 */
export async function getLatestGdprConsentByProfile(
  db: Database,
  profileIds: string[],
): Promise<Map<string, { status: ConsentStatus; respondedAt: Date | null }>> {
  const result = new Map<
    string,
    { status: ConsentStatus; respondedAt: Date | null }
  >();
  if (profileIds.length === 0) return result;

  const rows = await db.query.consentStates.findMany({
    where: and(
      inArray(consentStates.profileId, profileIds),
      eq(consentStates.consentType, 'GDPR'),
    ),
    // [BUG-394] Stable tiebreak on id when two rows share the same requestedAt.
    orderBy: [desc(consentStates.requestedAt), desc(consentStates.id)],
    columns: { profileId: true, status: true, respondedAt: true },
  });

  // Keep only the first (latest) row per profileId. No-row profiles stay absent.
  for (const row of rows) {
    if (!result.has(row.profileId)) {
      result.set(row.profileId, {
        status: row.status,
        respondedAt: row.respondedAt ?? null,
      });
    }
  }

  return result;
}

/**
 * Batch variant of isGdprProcessingAllowed — thin boolean wrapper over
 * getLatestGdprConsentByProfile. Same single-query, BUG-394-tiebreak semantics:
 *   - no row ⇒ allowed (pre-consent-flow account)
 *   - latest GDPR row is CONSENTED ⇒ allowed
 *   - PENDING / PARENTAL_CONSENT_REQUESTED / WITHDRAWN ⇒ blocked
 *
 * Profiles with no consent row are pre-populated `true` so a simple
 * `map.get(id)` is sufficient (no `?? true` needed at the call site).
 *
 * [WI-489]
 */
export async function isGdprProcessingAllowedBatch(
  db: Database,
  profileIds: string[],
): Promise<Map<string, boolean>> {
  const latest = await getLatestGdprConsentByProfile(db, profileIds);
  const result = new Map<string, boolean>();
  for (const id of profileIds) {
    const row = latest.get(id);
    result.set(id, row == null || row.status === 'CONSENTED');
  }
  return result;
}
