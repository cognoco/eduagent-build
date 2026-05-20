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
import type { ProfileMeta } from '../middleware/profile-scope';
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
// [BUG-99 / A1-MED — ACCEPTED LIMITATION] Worker isolates each maintain
// independent state. The effective ceiling is
// CONSENT_RESPOND_RATE_LIMIT_MAX × N isolates per hour per IP. For this
// endpoint we accept this as a known limitation because:
//   1. The token is a 122-bit UUID — brute-forcing it at any rate is
//      computationally infeasible. The rate limiter is defense-in-depth
//      against a hypothetical future weakening of the token format, not a
//      load-bearing security control.
//   2. The endpoint is single-use — once a token is consumed (approved or
//      denied), all subsequent attempts return 409 CONFLICT regardless of
//      rate. The attack surface per IP is bounded by the number of issued
//      tokens that are still pending in the 24h consent window.
//   3. Cross-isolate accuracy requires Durable Objects (or a heavy-weight
//      KV fixed-window counter that pays an extra round-trip per request
//      and is still racy due to KV's eventual consistency, up to 60s).
//      Neither is justified for a low-volume parent flow.
//   4. Failure mode is bounded: even with 100 active isolates, the
//      effective ceiling is 3000 attempts/IP/hr — still hostile to
//      enumeration if the token format is ever weakened.
// If traffic grows or the token format changes, revisit with a Durable
// Object-backed limiter (CF Workers RPC pattern).
const CONSENT_RESPOND_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CONSENT_RESPOND_RATE_LIMIT_MAX = 30;
const CONSENT_RESPOND_MAP_MAX_ENTRIES = 10_000;
const consentRespondTimestamps = new Map<string, number[]>();

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

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const atIdx = email.lastIndexOf('@');
  if (atIdx <= 0) return null;
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
    profileMeta: ProfileMeta | undefined;
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
        parentEmail: maskEmail(state?.parentEmail ?? null),
        consentType: state?.consentType ?? null,
      }),
    );
  })

  .get('/consent/:childProfileId/status', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    // [CR-2026-05-19-H1] Only the account owner can read child consent status.
    const activeProfileMetaStatus = c.get('profileMeta');
    if (activeProfileMetaStatus?.isOwner !== true) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Only the account owner can manage child consent.',
      );
    }

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

  .put('/consent/:childProfileId/revoke', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    // [CR-2026-05-19-H1] Only the account owner can revoke child consent.
    const activeProfileMetaRevoke = c.get('profileMeta');
    if (activeProfileMetaRevoke?.isOwner !== true) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Only the account owner can revoke child consent.',
      );
    }

    try {
      const state = await revokeConsent(db, childProfileId, parentProfileId);

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

  .put('/consent/:childProfileId/restore', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    // [CR-2026-05-19-H1] Only the account owner can restore child consent.
    const activeProfileMetaRestore = c.get('profileMeta');
    if (activeProfileMetaRestore?.isOwner !== true) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Only the account owner can restore child consent.',
      );
    }

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
