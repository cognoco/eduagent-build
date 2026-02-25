// ---------------------------------------------------------------------------
// Consent Enforcement Middleware — AUDIT-001
// Blocks data-collecting API calls for profiles with pending/no consent.
// Runs after profileScopeMiddleware (reads profileId + profileMeta from context).
// Zero additional DB queries — reuses data already fetched by profile-scope.
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import { checkConsentRequired } from '../services/consent';
import type { ProfileMeta } from './profile-scope';
import type { Database } from '@eduagent/database';
import type { Account } from '../services/account';

type ConsentEnv = {
  Variables: {
    db: Database;
    account: Account;
    profileId: string;
    profileMeta: ProfileMeta;
  };
};

/** Paths that are always allowed regardless of consent status */
const EXEMPT_PREFIXES = [
  '/v1/health',
  '/v1/auth/',
  '/v1/consent/',
  '/v1/profiles',
  '/v1/billing/',
  '/v1/stripe/',
  '/v1/inngest',
  '/v1/__test/',
];

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export const consentMiddleware = createMiddleware<ConsentEnv>(
  async (c, next) => {
    // No profileId → account-level route, skip
    const profileId = c.get('profileId');
    if (!profileId) {
      await next();
      return;
    }

    // No profileMeta → cannot evaluate consent, skip (defensive)
    const meta = c.get('profileMeta');
    if (!meta) {
      await next();
      return;
    }

    // Exempt paths always pass through
    if (isExempt(c.req.path)) {
      await next();
      return;
    }

    // If we don't have birthDate or location, we can't determine consent → allow
    if (!meta.birthDate || !meta.location) {
      await next();
      return;
    }

    // Check if consent is required for this profile's age + location
    const { required, consentType } = checkConsentRequired(
      meta.birthDate,
      meta.location
    );

    if (!required) {
      await next();
      return;
    }

    // Block if consent status is PENDING or PARENTAL_CONSENT_REQUESTED
    if (
      meta.consentStatus === 'PENDING' ||
      meta.consentStatus === 'PARENTAL_CONSENT_REQUESTED'
    ) {
      return c.json(
        {
          code: ERROR_CODES.CONSENT_REQUIRED,
          message:
            'Parental consent is required before accessing this resource',
          details: { consentType },
        },
        403
      );
    }

    await next();
    return;
  }
);
