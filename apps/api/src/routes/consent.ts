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
  selfConsentWithdrawRequestSchema,
  selfConsentAcceptResultSchema,
  consentAccountabilityReportSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireProfileId, requireAccount } from '../middleware/profile-scope';
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
import {
  ForbiddenError,
  notFound,
  forbidden,
  unauthorized,
  apiError,
} from '../errors';
import {
  assertOwnerProfile,
  assertCallerIsAccountOwner,
  assertCanReadProfile,
  hasParentAccess,
} from '../services/family-access';
import {
  requestConsentV2,
  resendConsentV2,
  processConsentResponseV2,
  revokeChildConsentV2,
  restoreChildConsentV2,
  withdrawAdultSelfConsentV2,
  acceptAdultSelfConsentV2,
  getProfileConsentStateV2,
  getOrgMemberDisplayNameV2,
  ConsentReconsentRequiredError,
  AdultSelfConsentNotEligibleError,
} from '../services/identity-v2/consent-v2';
import { getChildConsentForParentV2 } from '../services/identity-v2/family-v2';
import { getConsentAccountabilityV2 } from '../services/identity-v2/consent-status-v2';
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

const CONSENT_WRITE_FORBIDDEN_MESSAGE =
  'Not authorized to request consent for this profile';

// [BUG-791] Authorization gate for /consent/request and /consent/resend.
//
// Account-level membership of childProfileId is NOT sufficient: every person in
// a family org shares that org, and X-Profile-Id is a request-supplied profile
// selection rather than caller identity. Authorization therefore uses only the
// server-resolved callerPersonId:
//
//   - Self-service: the caller is requesting consent for THEMSELVES
//     (input.childProfileId === callerPersonId). A minor mid-onboarding
//     legitimately triggers their own parent's consent email. The terminal-
//     status guard in requestConsent/resendConsent prevents reviving an
//     already-decided (CONSENTED/WITHDRAWN) row, so self-service can only act on
//     a pending/requested row.
//   - Parent-on-behalf: that same server-bound caller is an org admin and has an
//     active guardianship edge to the target child.
//
// Every unauthorized relationship receives the same non-enumerating 403 before
// the consent service or event dispatch runs.
async function assertCanRequestConsentForChild<E extends ConsentRouteEnv>(
  c: Context<E>,
  db: Database,
  childProfileId: string,
): Promise<void> {
  const callerPersonId = c.get('callerPersonId');

  if (callerPersonId && childProfileId === callerPersonId) {
    return;
  }

  await assertCallerIsAccountOwner(c, CONSENT_WRITE_FORBIDDEN_MESSAGE);
  if (
    !callerPersonId ||
    !(await hasParentAccess(db, callerPersonId, childProfileId))
  ) {
    throw new ForbiddenError(CONSENT_WRITE_FORBIDDEN_MESSAGE);
  }
}

type ConsentRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    API_ORIGIN?: string;
    CONSENT_POLICY_VERSION: string;
    // [WI-1138] Consent-deny Stripe teardown when the denied person is
    // themselves the payer.
    STRIPE_SECRET_KEY?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
    // [WI-774/WI-1302] The authenticated caller's own person id, resolved
    // server-side by accountMiddleware from the Clerk JWT (never request-
    // supplied, unlike X-Profile-Id). Used by the adult self-consent withdrawal
    // + accountability routes to bind to the caller's OWN person.
    callerPersonId: string | undefined;
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
        return forbidden(c, CONSENT_WRITE_FORBIDDEN_MESSAGE);
      }
      const childName = displayName;

      // [WI-2516] Bind self/admin+guardian authorization to callerPersonId;
      // X-Profile-Id is selection context only and cannot grant write access.
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
        return forbidden(c, CONSENT_WRITE_FORBIDDEN_MESSAGE);
      }
      const childName = displayName;

      // [WI-2516] Bind self/admin+guardian authorization to callerPersonId;
      // X-Profile-Id is selection context only and cannot grant write access.
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
        await processConsentResponseV2(db, input.token, input.approved, audit, {
          stripeSecretKey: c.env.STRIPE_SECRET_KEY,
        });
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
        if (error instanceof ConsentReconsentRequiredError) {
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
    // [WI-2416] Header-resolved profileId is only org-checked; verify caller
    // authority (self or guardian of an uncredentialed charge) before reading.
    await assertCanReadProfile(c, profileId);
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
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can manage child consent.',
    );

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
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can revoke child consent.',
    );

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

  // [WI-2547] Authenticated adult self-consent ACCEPTANCE — the write behind the
  // mobile AdultSelfConsentGate, for an adult owner whose session bootstrap
  // signalled `needsAdultConsent` (GET /v1/profiles). This is the ONLY
  // user-reachable path that records an adult's own art6_1_a lawful basis;
  // POST /learner-profile/consent is mentor-memory consent and is NOT this.
  //
  // The contract takes NO caller-supplied identifiers — no person, profile,
  // organization, lawful basis, or policy version:
  //   - `callerPersonId` is the login→person binding accountMiddleware resolves
  //     server-side from the Clerk JWT (WI-774/WI-1302). Deliberately NOT
  //     withProfile(c).profileId, which is the X-Profile-Id-SELECTABLE active
  //     profile — binding there would let an account member write ANOTHER
  //     in-account profile's adult consent (the WI-1193 IDOR).
  //   - the organization is the authenticated account;
  //   - the lawful basis is fixed at art6_1_a inside the service;
  //   - termsVersion is the server's CONSENT_POLICY_VERSION binding.
  // A cross-organization caller holds no membership row in `account.id` and so
  // fails the eligibility gate with no write.
  .post('/consent/self/accept', async (c) => {
    const db = c.get('db');
    const chargePersonId = c.get('callerPersonId');
    if (!chargePersonId) {
      return unauthorized(c, 'No identity is provisioned for this login.');
    }

    // Binding to `callerPersonId` already makes a spoofed X-Profile-Id
    // harmless — it cannot change WHOSE consent is written. But "harmless" is
    // not what this route promises: an attempt to record consent while
    // *presenting as someone else* is an authorization failure, not a silently
    // rewritten request, so it fails CLOSED rather than succeeding against the
    // caller's own record. The header is optional (the client normally sends
    // none and the owner is auto-resolved); when present it must name the
    // caller themselves. Checked BEFORE the service call, so a spoof never
    // opens a write transaction.
    const presentedProfileId = c.req.header('X-Profile-Id');
    if (presentedProfileId && presentedProfileId !== chargePersonId) {
      return forbidden(c, 'This account is not eligible for self-consent.');
    }

    const account = requireAccount(c.get('account'));

    // A blank/whitespace policy version would mint an UNVERSIONED acceptance
    // fact — precisely the weak GDPR Art 5(2)/7(1) evidence
    // repairOrSignalAdultSelfConsentV2 refuses to fabricate. The response
    // schema's `.min(1)` would catch it only AFTER the transaction committed,
    // leaving a written-but-unreportable grant, so it is refused up front with
    // no service call at all.
    const termsVersion = c.env.CONSENT_POLICY_VERSION?.trim();
    if (!termsVersion) {
      return apiError(
        c,
        503,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Consent policy version is not configured.',
      );
    }

    try {
      const purposesGranted = await acceptAdultSelfConsentV2(
        db,
        chargePersonId,
        account.id,
        termsVersion,
      );
      return c.json(
        selfConsentAcceptResultSchema.parse({
          message: 'Consent recorded.',
          purposesGranted,
          termsVersion,
        }),
      );
    } catch (error) {
      // Uniform fail-closed response. Deliberately does NOT distinguish minor
      // from non-owner from unknown-person from cross-org, so the route cannot
      // be used to enumerate account membership or ages.
      if (error instanceof AdultSelfConsentNotEligibleError) {
        return forbidden(c, 'This account is not eligible for self-consent.');
      }
      throw error;
    }
  })

  // [WI-1193 AC2] Authenticated self-service withdrawal of ONE adult
  // self-consent purpose. An adult acts on their OWN lawful basis, so the
  // charge is bound to `callerPersonId` — the login→person binding
  // accountMiddleware resolves server-side from the Clerk JWT (WI-774/WI-1302),
  // NOT withProfile(c).profileId, which is the X-Profile-Id-selectable active
  // profile. Binding to the active profile would let an account member withdraw
  // ANOTHER in-account profile's adult consent (IDOR); callerPersonId cannot be
  // retargeted by the caller. Purposes are independently revocable: withdrawing
  // one purpose never touches the other's grant. This is the user-reachable path
  // that makes the per-purpose grants (AC2) actually revocable.
  .put(
    '/consent/self/withdraw',
    zValidator('json', selfConsentWithdrawRequestSchema),
    async (c) => {
      const db = c.get('db');
      const chargePersonId = c.get('callerPersonId');
      if (!chargePersonId) {
        return unauthorized(c, 'No identity is provisioned for this login.');
      }
      const account = requireAccount(c.get('account'));
      const { purpose } = c.req.valid('json');

      try {
        await withdrawAdultSelfConsentV2(
          db,
          chargePersonId,
          account.id,
          purpose,
        );

        return c.json(
          consentActionResultSchema.parse({
            message: 'Consent withdrawn for the selected purpose.',
            consentStatus: 'WITHDRAWN',
          }),
        );
      } catch (error) {
        if (error instanceof ConsentRecordNotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )

  // [WI-1193 AC3] Authenticated accountability report for the caller's OWN
  // consent record — the production caller for getConsentAccountabilityV2 and
  // the GDPR Art 5(2)/7(1) "demonstrate consent on request" surface. Bound to
  // callerPersonId (server-resolved from the JWT), mirroring the withdrawal
  // route: a caller retrieves only their own lawful basis + versioned
  // terms-acceptance + accepted purposes (+ any withdrawal), never another
  // profile's. One query per charge (DISTINCT ON purpose/lawful_basis).
  .get('/consent/self/accountability', async (c) => {
    const db = c.get('db');
    const chargePersonId = c.get('callerPersonId');
    if (!chargePersonId) {
      return unauthorized(c, 'No identity is provisioned for this login.');
    }
    const account = requireAccount(c.get('account'));
    const records = await getConsentAccountabilityV2(
      db,
      chargePersonId,
      account.id,
    );
    return c.json(
      consentAccountabilityReportSchema.parse({
        records: records.map((r) => ({
          purpose: r.purpose,
          lawfulBasis: r.lawfulBasis,
          granted: r.granted,
          termsAcceptedAt: r.termsAcceptedAt,
          termsVersion: r.termsVersion,
          withdrawnAt: r.withdrawnAt,
        })),
      }),
    );
  })

  .put('/consent/:childProfileId/restore', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    // [CR-2026-05-19-H1] Only the account owner can restore child consent.
    assertOwnerProfile(c, 'Only the account owner can restore child consent.');
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can restore child consent.',
    );

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
