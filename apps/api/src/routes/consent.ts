import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  consentRequestSchema,
  consentResendSchema,
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
import { requireProfileId, requireAccount } from '../middleware/profile-scope';
import { withProfile } from '../route-utils/route-context';
import type { ProfileMeta } from '../middleware/profile-scope';
import type { Context } from 'hono';
import {
  ConsentResendLimitError,
  ConsentRecipientChangeLimitError,
  ConsentRequestNotFoundError,
  EmailDeliveryError,
  ConsentTokenNotFoundError,
  ConsentAlreadyProcessedError,
  ConsentTokenExpiredError,
  ConsentNotAuthorizedError,
  ConsentRecordNotFoundError,
  ConsentGracePeriodExpiredError,
} from '../services/consent';
import { notFound, forbidden, apiError } from '../errors';
import {
  assertOwnerProfile,
  assertOwnerAndParentAccess,
} from '../services/family-access';
import {
  requestConsentV2,
  resendConsentV2,
  processConsentResponseV2,
  revokeChildConsentV2,
  restoreChildConsentV2,
  getProfileConsentStateV2,
  getOrgMemberDisplayNameV2,
} from '../services/identity-v2/consent-v2';
import { getChildConsentForParentV2 } from '../services/identity-v2/family-v2';
import { inngest } from '../inngest/client';
import { safeSend } from '../services/safe-non-core';
import {
  createSlidingWindowRateLimiter,
  resolveRateLimitIp,
} from '../services/rate-limit';

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
export const CONSENT_RESPOND_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CONSENT_RESPOND_RATE_LIMIT_MAX = 30;
const CONSENT_RESPOND_MAP_MAX_ENTRIES = 10_000;

// Shared windowed-Map limiter (see services/rate-limit.ts). The LRU-by-touch
// eviction policy and IP-resolution rationale documented above now live in the
// service; this route just configures and calls it.
const consentRespondLimiter = createSlidingWindowRateLimiter({
  windowMs: CONSENT_RESPOND_RATE_LIMIT_WINDOW_MS,
  max: CONSENT_RESPOND_RATE_LIMIT_MAX,
  maxEntries: CONSENT_RESPOND_MAP_MAX_ENTRIES,
});

export function __resetConsentRespondRateLimit(): void {
  consentRespondLimiter.reset();
}

// Re-exported so existing consumers (consent-web route, tests) keep their
// `from './consent'` import path while the implementation lives in the service.
export { resolveRateLimitIp };

export function isConsentRespondRateLimited(ipKey: string): boolean {
  return consentRespondLimiter.isLimited(ipKey);
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

// [BUG-791] Authorization gate for /consent/request and /consent/resend.
//
// Account-level ownership of childProfileId (the previous getProfile() check)
// is NOT sufficient: every profile on a family account shares the account, so a
// non-owner sibling could post another child's profileId (and, on /request, an
// arbitrary parentEmail) and disrupt that child's consent state. We gate on the
// ACTIVE profile, not just the account:
//
//   - Self-service: the active profile is requesting consent for ITSELF
//     (input.childProfileId === activeProfileId). A minor mid-onboarding
//     legitimately triggers their own parent's consent email. The terminal-
//     status guard in requestConsent/resendConsent prevents reviving an
//     already-decided (CONSENTED/WITHDRAWN) row, so self-service can only act on
//     a pending/requested row.
//   - Parent-on-behalf: the active profile is the account OWNER and has a
//     family link to the target child. Reuses assertOwnerAndParentAccess
//     (isOwner gate + IDOR parent-link check) — the same guard used by the
//     dashboard / learner-profile parent-admin routes.
//
// Any other caller (non-owner sibling targeting another profile) is rejected
// with 403 before the service runs.
async function assertCanRequestConsentForChild<E extends ConsentRouteEnv>(
  c: Context<E>,
  db: Database,
  childProfileId: string,
): Promise<void> {
  const { profileId: activeProfileId } = withProfile(c);

  // Self-service: acting on the caller's own profile.
  if (childProfileId === activeProfileId) {
    return;
  }

  // Parent-on-behalf: owner with a family link to the target child.
  // assertOwnerAndParentAccess throws ForbiddenError (→ 403) for a non-owner
  // profile or an owner with no link to this child (IDOR).
  // [WI-786] Flag-gated: flag-on resolves via guardianship, flag-off via family_links.
  await assertOwnerAndParentAccess(c, db, activeProfileId, childProfileId);
}

type ConsentRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    API_ORIGIN?: string;
    CONSENT_POLICY_VERSION: string;
    IDENTITY_V2_ENABLED?: string;
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
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const input = c.req.valid('json');

      const displayName = await getOrgMemberDisplayNameV2(
        db,
        input.childProfileId,
        account.id,
      );
      if (displayName === null) {
        return forbidden(
          c,
          'Not authorized to request consent for this profile',
        );
      }
      const childName = displayName;

      // [BUG-791] Account ownership alone is insufficient — gate on the active
      // profile (self-service for own profile, or owner-with-parent-link for a
      // child). Throws ForbiddenError → 403 for a non-owner sibling targeting
      // another profile.
      await assertCanRequestConsentForChild(c, db, input.childProfileId);

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
      // [Bug #872] Audit metadata — re-derivable after CF access logs roll over.
      const audit = {
        policyVersion: c.env.CONSENT_POLICY_VERSION,
        requestIp:
          c.req.header('cf-connecting-ip') ??
          c.req.header('x-forwarded-for') ??
          undefined,
        userAgent: c.req.header('user-agent') ?? undefined,
      };
      let emailDelivered: boolean;
      let eventRequestedAt: string;
      try {
        {
          const res = await requestConsentV2(db, {
            chargePersonId: input.childProfileId,
            organizationId: account.id,
            consentType: input.consentType,
            guardianEmail: input.parentEmail,
            childName,
            appUrl: apiOrigin,
            audit,
            emailOptions: {
              resendApiKey: c.env.RESEND_API_KEY,
              emailFrom: c.env.EMAIL_FROM,
            },
          });
          emailDelivered = res.emailDelivered;
          eventRequestedAt = new Date().toISOString();
        }
      } catch (error) {
        // [WI-374] Both the resend cap (same email) and the recipient-change
        // cap (rotating email) surface as 429 — rotating the recipient can no
        // longer be used to reset the resend cap and bomb arbitrary addresses.
        if (
          error instanceof ConsentResendLimitError ||
          error instanceof ConsentRecipientChangeLimitError
        ) {
          return apiError(c, 429, ERROR_CODES.RATE_LIMITED, error.message);
        }
        // [BUG-791] An already-decided (CONSENTED/WITHDRAWN) consent cannot be
        // re-requested — the service surfaces this as ConsentRequestNotFoundError.
        if (error instanceof ConsentRequestNotFoundError) {
          return notFound(c, error.message);
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
              profileId: input.childProfileId,
              consentType: input.consentType,
              requestedAt: eventRequestedAt,
              timestamp: new Date().toISOString(),
            },
          }),
        'consent.requested',
        { profileId: input.childProfileId },
      );

      return c.json(
        consentRequestResultSchema.parse({
          message: 'Consent request sent to parent',
          consentType: input.consentType,
          emailStatus: emailDelivered ? 'sent' : 'failed',
        }),
        201,
      );
    },
  )
  // [WI-374] Resend is a distinct endpoint from request/change-recipient. Its
  // schema carries NO email (strict), so the client cannot send a masked or
  // arbitrary address on resend — the server reuses the stored recipient and
  // the resend cap stays bound to the request.
  .post(
    '/consent/resend',
    zValidator('json', consentResendSchema),
    async (c) => {
      const db = c.get('db');
      const account = requireAccount(c.get('account'));
      const input = c.req.valid('json');

      const displayName = await getOrgMemberDisplayNameV2(
        db,
        input.childProfileId,
        account.id,
      );
      if (displayName === null) {
        return forbidden(
          c,
          'Not authorized to request consent for this profile',
        );
      }
      const childName = displayName;

      // [BUG-791] Account ownership alone is insufficient — gate on the active
      // profile (self-service for own profile, or owner-with-parent-link for a
      // child). Throws ForbiddenError → 403 for a non-owner sibling targeting
      // another profile.
      await assertCanRequestConsentForChild(c, db, input.childProfileId);

      const apiOrigin = c.env.API_ORIGIN;
      if (!apiOrigin) {
        throw new Error('API_ORIGIN env var is required');
      }

      let emailDelivered: boolean;
      let resultConsentType: typeof input.consentType;
      let eventRequestedAt: string;
      try {
        const res = await resendConsentV2(db, {
          chargePersonId: input.childProfileId,
          organizationId: account.id,
          consentType: input.consentType,
          childName,
          appUrl: apiOrigin,
          emailOptions: {
            resendApiKey: c.env.RESEND_API_KEY,
            emailFrom: c.env.EMAIL_FROM,
          },
        });
        emailDelivered = res.emailDelivered;
        resultConsentType = input.consentType;
        eventRequestedAt = new Date().toISOString();
      } catch (error) {
        if (error instanceof ConsentResendLimitError) {
          return apiError(c, 429, ERROR_CODES.RATE_LIMITED, error.message);
        }
        if (error instanceof ConsentRequestNotFoundError) {
          return notFound(c, error.message);
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
              profileId: input.childProfileId,
              consentType: resultConsentType,
              requestedAt: eventRequestedAt,
              timestamp: new Date().toISOString(),
            },
          }),
        'consent.requested',
        { profileId: input.childProfileId },
      );

      return c.json(
        consentRequestResultSchema.parse({
          message: 'Consent request sent to parent',
          consentType: resultConsentType,
          emailStatus: emailDelivered ? 'sent' : 'failed',
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

      const ipKey = resolveRateLimitIp(
        c.req.header('cf-connecting-ip'),
        c.req.header('x-forwarded-for'),
      );
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
        // [Bug #872] Audit metadata captured at response time.
        const audit = {
          policyVersion: c.env.CONSENT_POLICY_VERSION,
          requestIp:
            c.req.header('cf-connecting-ip') ??
            c.req.header('x-forwarded-for') ??
            undefined,
          userAgent: c.req.header('user-agent') ?? undefined,
        };
        await processConsentResponseV2(db, input.token, input.approved, audit);
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
      // Caller without active profile (mid-onboarding) has no consent record;
      // null fields mean "no consent required"; intentionally NOT an error —
      // callers should not interpret as failure.
      return c.json(
        myConsentStatusSchema.parse({
          consentStatus: null,
          parentEmail: null,
          consentType: null,
        }),
      );
    }
    const db = c.get('db');
    const state = await getProfileConsentStateV2(db, profileId);
    const recipient = state?.guardianEmail ?? null;
    return c.json(
      myConsentStatusSchema.parse({
        consentStatus: state?.status ?? null,
        parentEmail: maskEmail(recipient ?? null),
        consentType: state?.consentType ?? null,
      }),
    );
  })

  .get('/consent/:childProfileId/status', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    // [CR-2026-05-19-H1] Only the account owner can read child consent status.
    assertOwnerProfile(c, 'Only the account owner can manage child consent.');

    try {
      const state = await getChildConsentForParentV2(
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
    assertOwnerProfile(c, 'Only the account owner can revoke child consent.');

    try {
      const { status, revokedAt } = await revokeChildConsentV2(
        db,
        childProfileId,
        parentProfileId,
      ).then((r) => ({ status: r.status, revokedAt: r.withdrawnAt }));

      await safeSend(
        () =>
          inngest.send({
            name: 'app/consent.revoked',
            data: {
              childProfileId,
              parentProfileId,
              revokedAt,
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
          consentStatus: status,
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
    assertOwnerProfile(c, 'Only the account owner can restore child consent.');

    try {
      const state = await restoreChildConsentV2(
        db,
        childProfileId,
        parentProfileId,
      );
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
      // [Bug #871] 7-day grace period expired — data may already be
      // hard-deleted by archive-cleanup. Surface as 410 GONE rather than
      // silently flipping consent to CONSENTED on an empty profile.
      if (error instanceof ConsentGracePeriodExpiredError) {
        return apiError(c, 410, ERROR_CODES.GONE, error.message);
      }
      throw error;
    }
  });
