import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  consentRequestSchema,
  consentRespondRequestSchema,
  consentRequestResultSchema,
  consentRespondResultSchema,
  myConsentStatusSchema,
  childConsentStatusSchema,
  consentActionResultSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireProfileId } from '../middleware/profile-scope';
import { getProfile } from '../services/profile';
import {
  requestConsent,
  processConsentResponse,
  getProfileConsentState,
  getChildConsentForParent,
  revokeConsent,
  restoreConsent,
  ConsentResendLimitError,
  EmailDeliveryError,
  ConsentTokenNotFoundError,
  ConsentAlreadyProcessedError,
  ConsentTokenExpiredError,
  ConsentNotAuthorizedError,
  ConsentRecordNotFoundError,
} from '../services/consent';
import { notFound, forbidden, apiError } from '../errors';
import { inngest } from '../inngest/client';
import { safeSend } from '../services/safe-non-core';

// [BUG-655 / A-11] /consent/respond is unauthenticated (a parent clicks an
// emailed link, no session). The token is a 122-bit UUID so brute-force is
// infeasible, but the endpoint still needs rate limiting to prevent DoS and
// to slow any future weakening of the token format. Same in-memory
// sliding-window pattern as feedback.ts; cap is per source IP.
//
// Worker isolates each maintain independent state — the effective ceiling is
// CONSENT_RESPOND_RATE_LIMIT_MAX × N isolates. For a low-volume parent flow
// this is sufficient; if traffic grows, swap for a KV-backed limiter.
const CONSENT_RESPOND_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CONSENT_RESPOND_RATE_LIMIT_MAX = 30;
const CONSENT_RESPOND_MAP_MAX_ENTRIES = 10_000;
const consentRespondTimestamps = new Map<string, number[]>();

// Exported for tests only — reset Map state between cases.
export function __resetConsentRespondRateLimit(): void {
  consentRespondTimestamps.clear();
}

function isConsentRespondRateLimited(ipKey: string): boolean {
  const now = Date.now();
  const cutoff = now - CONSENT_RESPOND_RATE_LIMIT_WINDOW_MS;
  const existing = consentRespondTimestamps.get(ipKey);
  const timestamps = (existing ?? []).filter((t) => t > cutoff);
  if (timestamps.length === 0 && existing !== undefined) {
    consentRespondTimestamps.delete(ipKey);
  }
  // Only evict when admitting a NEW key would push us past the cap. A
  // returning IP that's already tracked updates in place, so it never
  // punishes an unrelated quiet user. FIFO order (Map insertion order) is
  // fine for abuse prevention — eviction targets keys quiet long enough to
  // age past the head.
  const isNewKey =
    !consentRespondTimestamps.has(ipKey) && timestamps.length === 0;
  if (
    isNewKey &&
    consentRespondTimestamps.size >= CONSENT_RESPOND_MAP_MAX_ENTRIES
  ) {
    const oldest = consentRespondTimestamps.keys().next().value;
    if (oldest !== undefined) consentRespondTimestamps.delete(oldest);
  }
  if (timestamps.length >= CONSENT_RESPOND_RATE_LIMIT_MAX) {
    consentRespondTimestamps.set(ipKey, timestamps);
    return true;
  }
  timestamps.push(now);
  consentRespondTimestamps.set(ipKey, timestamps);
  return false;
}

// [BUG-625 / A-10] Mask third-party PII before returning to a profile that
// may not own the address. Format: keep first character + last character of
// the local part, replace middle with "***", keep domain. Empty/short locals
// fall back to "***@domain". Returns null for null/undefined input.
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const atIdx = email.lastIndexOf('@');
  if (atIdx <= 0) return null; // malformed — don't echo
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (!domain) return null;
  if (local.length <= 2) return `***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

type ConsentRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    API_ORIGIN?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
  };
};

export const consentRoutes = new Hono<ConsentRouteEnv>()
  .post(
    '/consent/request',
    zValidator('json', consentRequestSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const input = c.req.valid('json');

      // Verify the childProfileId belongs to the authenticated user's account
      const childProfile = await getProfile(
        db,
        input.childProfileId,
        account.id,
      );
      if (!childProfile) {
        return forbidden(
          c,
          'Not authorized to request consent for this profile',
        );
      }

      // Guard: child cannot send consent email to their own account email
      if (
        account.email.toLowerCase() === input.parentEmail.trim().toLowerCase()
      ) {
        return apiError(
          c,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Parent email must be different from your account email',
        );
      }

      // BUG-240: Consent page is served by THIS API worker at /v1/consent-page.
      // API_ORIGIN must be set — falling back to c.req.url would allow Host header
      // injection (OWASP A03) since Cloudflare Workers populate it from the
      // attacker-supplied Host header.
      const apiOrigin = c.env.API_ORIGIN;
      if (!apiOrigin) {
        throw new Error('API_ORIGIN env var is required');
      }
      let result;
      try {
        result = await requestConsent(
          db,
          input,
          apiOrigin,
          {
            resendApiKey: c.env.RESEND_API_KEY,
            emailFrom: c.env.EMAIL_FROM,
          },
          account.id,
        );
      } catch (error) {
        if (error instanceof ConsentResendLimitError) {
          return apiError(c, 429, ERROR_CODES.RATE_LIMITED, error.message);
        }
        if (error instanceof EmailDeliveryError) {
          return apiError(c, 502, ERROR_CODES.INTERNAL_ERROR, error.message);
        }
        throw error;
      }

      // Dispatch Inngest event for reminder workflow
      // NOTE: parentEmail is intentionally omitted — PII must not be in event payloads.
      // The consent-reminders function looks up parentEmail from the DB.
      // safeSend wrapper: consent request must succeed even if Inngest is unreachable
      // (same pattern as session close — BUG-54). [A-23] escalates failures to Sentry
      // so we can query how often the GDPR reminder workflow is permanently skipped.
      await safeSend(
        () =>
          inngest.send({
            name: 'app/consent.requested',
            data: {
              profileId: result.consentState.profileId,
              consentType: result.consentState.consentType,
              timestamp: new Date().toISOString(),
            },
          }),
        'consent.requested',
        { profileId: result.consentState.profileId },
      );

      return c.json(
        consentRequestResultSchema.parse({
          message: 'Consent request sent to parent',
          consentType: input.consentType,
          emailStatus: result.emailDelivered ? 'sent' : 'failed',
        }),
        201,
      );
    },
  )
  .post(
    '/consent/respond',
    zValidator('json', consentRespondRequestSchema),
    async (c) => {
      const db = c.get('db');
      const input = c.req.valid('json');

      // [BUG-655 / A-11] Rate-limit by source IP — endpoint is intentionally
      // unauthenticated so a parent can act from an email link without a
      // session. CF-Connecting-IP is set by Cloudflare's edge from the real
      // client; fall back to a single shared bucket only when absent
      // (local/test). 30 attempts / IP / hour is generous for legit double-
      // taps yet hostile to enumeration / spray.
      const ipKey =
        c.req.header('cf-connecting-ip') ??
        c.req.header('x-forwarded-for') ??
        'unknown';
      if (isConsentRespondRateLimited(ipKey)) {
        const retryAfterSecs = Math.ceil(
          CONSENT_RESPOND_RATE_LIMIT_WINDOW_MS / 1000,
        );
        c.header('Retry-After', String(retryAfterSecs));
        return apiError(
          c,
          429,
          ERROR_CODES.RATE_LIMITED,
          'Too many consent attempts. Please try again later.',
        );
      }

      try {
        await processConsentResponse(db, input.token, input.approved);
        return c.json(
          consentRespondResultSchema.parse({
            message: input.approved ? 'Consent granted' : 'Consent denied',
          }),
        );
      } catch (error) {
        if (error instanceof ConsentTokenNotFoundError) {
          return notFound(c, error.message);
        }
        if (error instanceof ConsentAlreadyProcessedError) {
          return apiError(c, 409, ERROR_CODES.CONFLICT, error.message);
        }
        if (error instanceof ConsentTokenExpiredError) {
          return apiError(c, 410, ERROR_CODES.GONE, error.message);
        }
        throw error;
      }
    },
  )
  .get('/consent/my-status', async (c) => {
    // This route intentionally works without a profile —
    // returns null values when no profile is resolved.
    const profileId = c.get('profileId');
    if (!profileId) {
      return c.json(
        myConsentStatusSchema.parse({
          consentStatus: null,
          parentEmail: null,
          consentType: null,
        }),
      );
    }
    const db = c.get('db');
    const state = await getProfileConsentState(db, profileId);
    return c.json(
      myConsentStatusSchema.parse({
        consentStatus: state?.status ?? null,
        // [BUG-625 / A-10] parentEmail is third-party PII (the parent's address,
        // not the requesting profile's). The mobile reminder banner needs *some*
        // identifier to confirm "consent request sent to <X>", but returning the
        // full address lets a child session enumerate the parent's email.
        // Mask to "p***@example.com" — preserves verification UX, reduces leak.
        parentEmail: maskEmail(state?.parentEmail ?? null),
        consentType: state?.consentType ?? null,
      }),
    );
  })

  // Get consent status for a child (parent view, includes respondedAt for countdown)
  .get('/consent/:childProfileId/status', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    try {
      const state = await getChildConsentForParent(
        db,
        childProfileId,
        parentProfileId,
      );
      if (!state) {
        return c.json(
          childConsentStatusSchema.parse({
            consentStatus: null,
            respondedAt: null,
            consentType: null,
          }),
        );
      }
      return c.json(
        childConsentStatusSchema.parse({
          consentStatus: state.status,
          respondedAt: state.respondedAt,
          consentType: state.consentType,
        }),
      );
    } catch (error) {
      if (error instanceof ConsentNotAuthorizedError) {
        return forbidden(c, error.message);
      }
      throw error;
    }
  })

  // Revoke consent for a child (parent-initiated, GDPR Art. 7(3))
  .put('/consent/:childProfileId/revoke', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    try {
      const state = await revokeConsent(db, childProfileId, parentProfileId);

      // Schedule 7-day grace period deletion via Inngest
      // safeSend wrapper: revocation must succeed even if Inngest is unreachable
      // (same pattern as consent request — BUG-64, session close — BUG-54). [A-23]
      // escalates failures to Sentry so we can query how often the GDPR 7-day
      // deletion grace period job is skipped.
      await safeSend(
        () =>
          inngest.send({
            name: 'app/consent.revoked',
            data: {
              childProfileId,
              parentProfileId,
              timestamp: new Date().toISOString(),
            },
          }),
        'consent.revoked',
        { childProfileId, parentProfileId },
      );

      return c.json(
        consentActionResultSchema.parse({
          message:
            'Consent revoked. Data will be deleted after 7-day grace period.',
          consentStatus: state.status,
        }),
      );
    } catch (error) {
      if (error instanceof ConsentNotAuthorizedError) {
        return forbidden(c, error.message);
      }
      if (error instanceof ConsentRecordNotFoundError) {
        return notFound(c, error.message);
      }
      throw error;
    }
  })

  // Restore consent (cancel revocation, within 7-day grace period)
  .put('/consent/:childProfileId/restore', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    try {
      const state = await restoreConsent(db, childProfileId, parentProfileId);
      return c.json(
        consentActionResultSchema.parse({
          message: 'Consent restored. Deletion cancelled.',
          consentStatus: state.status,
        }),
      );
    } catch (error) {
      if (error instanceof ConsentNotAuthorizedError) {
        return forbidden(c, error.message);
      }
      if (error instanceof ConsentRecordNotFoundError) {
        return notFound(c, error.message);
      }
      throw error;
    }
  });
