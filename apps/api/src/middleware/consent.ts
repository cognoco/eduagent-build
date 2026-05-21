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
    profileMeta: ProfileMeta | undefined;
    /**
     * [BUG-502] Sentinel set by profileScopeMiddleware when auto-resolve throws
     * a transient error. When present, consent must fail closed — absent profileId
     * must NOT be treated as "account-level route, skip enforcement".
     */
    profileScopeError: Error | undefined;
  };
};

/** Paths that are always allowed regardless of consent status */
const EXEMPT_PREFIXES = [
  '/v1/health',
  '/v1/auth/',
  '/v1/consent/',
  '/v1/profiles',
  '/v1/onboarding/',
  '/v1/billing/',
  '/v1/stripe/',
  '/v1/revenuecat/webhook',
  '/v1/inngest',
  '/v1/__test/',
  '/v1/maintenance/',
];

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export const consentMiddleware = createMiddleware<ConsentEnv>(
  async (c, next) => {
    // [BUG-502] Belt-and-suspenders: if profileScopeMiddleware set the error
    // sentinel (transient DB failure during auto-resolve), fail closed even
    // though profileId is absent. The primary defence is the 503 throw in
    // profile-scope.ts; this guard catches any future regression where that
    // throw is suppressed by an outer try/catch.
    const profileScopeError = c.get('profileScopeError');
    if (profileScopeError) {
      return c.json(
        {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Profile resolution temporarily unavailable — please retry',
        },
        503,
      );
    }

    // No profileId → account-level route, skip
    const profileId = c.get('profileId');
    if (!profileId) {
      await next();
      return;
    }

    // [BUG-408] profileId is set but profileMeta is absent — this is an
    // unexpected state. profileScopeMiddleware sets both together when it
    // resolves a profile; if profileId is present but meta is missing, something
    // went wrong (no owner row in DB, edge input, middleware ordering bug).
    //
    // Fail closed: we cannot evaluate consent without meta, and we must not
    // allow the request to continue — a PENDING-consent learner would slip
    // through. Return 500 (not 503 — this is not a transient DB outage; the
    // profileScopeError sentinel covers that path above).
    const meta = c.get('profileMeta');
    if (!meta) {
      return c.json(
        {
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Profile metadata unavailable — cannot evaluate consent. Request rejected.',
        },
        500,
      );
    }

    if (isExempt(c.req.path)) {
      await next();
      return;
    }

    // /v1/support/ (outbox) is exempt for all non-WITHDRAWN consent states —
    // failed messages must be escalatable when consent is pending.
    // GDPR Art. 7(3) forbids new data processing after withdrawal.
    if (
      c.req.path.startsWith('/v1/support/') &&
      meta.consentStatus !== 'WITHDRAWN'
    ) {
      await next();
      return;
    }

    // Check if consent is required for this profile's age (GDPR-everywhere)
    const { required, consentType } = checkConsentRequired(meta.birthYear);

    // GDPR Art. 7(3): block WITHDRAWN profiles regardless of age — must come
    // before the !required guard so adult profiles with WITHDRAWN status are
    // also enforced (not bypassed by the age check).
    if (meta.consentStatus === 'WITHDRAWN') {
      return c.json(
        {
          code: ERROR_CODES.CONSENT_WITHDRAWN,
          message:
            'Consent has been withdrawn. Account data deletion is pending.',
          details: { consentType },
        },
        403,
      );
    }

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
        403,
      );
    }

    await next();
    return;
  },
);
