// ---------------------------------------------------------------------------
// WI-1753 — family-join routes (cross-account existing-teen family join).
//
// Two authenticated endpoints:
//   POST /family-join/invite  — a parent (adult owner/admin of their family org)
//                               issues an invite by email. ANTI-ENUM (AC-1):
//                               byte-identical neutral response in every case.
//   POST /family-join/accept  — the invited teen accepts via the emailed token,
//                               repointing their membership into the family org
//                               (delegates to acceptFamilyJoin — family-join-v2).
//
// Route/service boundary: these handlers own auth + validation + error mapping
// only. ALL DB access (inviter resolution + gates, token lookup, invite consume)
// lives in services/identity-v2/family-join-invite.ts.
// ---------------------------------------------------------------------------

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { Database } from '@eduagent/database';

import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { BadRequestError, NotFoundError, RateLimitedError } from '../errors';
import {
  initiateFamilyJoinInvite,
  resolveFamilyJoinInviteByToken,
  resolveFamilyJoinInviter,
} from '../services/identity-v2/family-join-invite';
import { acceptFamilyJoin } from '../services/identity-v2/family-join-v2';
import {
  createSlidingWindowRateLimiter,
  resolveRateLimitIp,
} from '../services/rate-limit';

// AC-1 rate-limit parity: the invite endpoint is IP-rate-limited with the SAME
// sliding-window pattern and cap as the consent surface (consent.ts), so invite
// attempts cannot be used to probe timing/volume. Per-IP; the BUG-99 isolate
// limitation applies identically and is acceptable for the same reasons (the
// 122-bit token is the load-bearing control; the limiter is defense-in-depth).
const FAMILY_JOIN_INVITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const FAMILY_JOIN_INVITE_RATE_LIMIT_MAX = 30;
const FAMILY_JOIN_INVITE_MAP_MAX_ENTRIES = 10_000;

const familyJoinInviteLimiter = createSlidingWindowRateLimiter({
  windowMs: FAMILY_JOIN_INVITE_RATE_LIMIT_WINDOW_MS,
  max: FAMILY_JOIN_INVITE_RATE_LIMIT_MAX,
  maxEntries: FAMILY_JOIN_INVITE_MAP_MAX_ENTRIES,
});

/** Test-only reset of the in-memory invite limiter (mirrors consent). */
export function __resetFamilyJoinInviteRateLimit(): void {
  familyJoinInviteLimiter.reset();
}

const inviteBodySchema = z.object({
  invitedEmail: z.string().email(),
});

const acceptBodySchema = z.object({
  token: z.string().min(1),
  optInSupportership: z.boolean(),
});

type FamilyJoinRouteEnv = {
  Bindings: {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    API_ORIGIN?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    callerPersonId: string | undefined;
  };
};

function withCaller(c: Context<FamilyJoinRouteEnv>): {
  db: Database;
  callerPersonId: string;
} {
  requireProfileId(c.get('profileId'));
  const callerPersonId = c.get('callerPersonId');
  if (!callerPersonId) {
    throw new BadRequestError('Identity v2 caller person is required.');
  }
  return { db: c.get('db'), callerPersonId };
}

export const familyJoinRoutes = new Hono<FamilyJoinRouteEnv>()
  .post(
    '/family-join/invite',
    zValidator('json', inviteBodySchema),
    async (c) => {
      const { db, callerPersonId } = withCaller(c);

      // AC-1 rate-limit parity (same limiter shape as the consent surface).
      const ipKey = resolveRateLimitIp(
        c.req.header('cf-connecting-ip'),
        c.req.header('x-forwarded-for'),
      );
      if (familyJoinInviteLimiter.isLimited(ipKey)) {
        throw new RateLimitedError(
          'Too many family invite attempts. Try again later.',
        );
      }

      const { invitedEmail } = c.req.valid('json');

      // Resolve + authorize the inviter server-side: caller must be an ADMIN
      // owner (blast-radius gate) AND an adult (AC-7 — a minor may not initiate).
      // familyOrgId is derived from the caller's own membership, never a client
      // value. Throws Forbidden/BadRequest, mapped centrally.
      const { familyOrgId } = await resolveFamilyJoinInviter(
        db,
        callerPersonId,
      );

      const apiOrigin = c.env.API_ORIGIN;
      if (!apiOrigin) {
        throw new Error('API_ORIGIN env var is required');
      }

      await initiateFamilyJoinInvite(db, {
        inviterPersonId: callerPersonId,
        familyOrgId,
        invitedEmail,
        appUrl: apiOrigin,
        emailOptions: {
          resendApiKey: c.env.RESEND_API_KEY,
          emailFrom: c.env.EMAIL_FROM,
        },
      });

      // ANTI-ENUM (AC-1): byte-identical neutral ack in EVERY case — a real or
      // absent account, a delivered or failed email. The service's
      // `emailDelivered` detail is deliberately NOT surfaced. The only non-2xx
      // exits are the inviter's OWN-slot states (cap → 429, already-accepted →
      // 409) and the caller-authority gates above — none of which depend on
      // whether `invitedEmail` matches an account.
      return c.json({ status: 'sent' as const });
    },
  )
  .post(
    '/family-join/accept',
    zValidator('json', acceptBodySchema),
    async (c) => {
      const { db, callerPersonId } = withCaller(c);
      const { token, optInSupportership } = c.req.valid('json');

      // TODO(WI-1753 AC-1 accept-authorization — human security gate): accept is
      // token-possession only for v1. ONE residual question is parked for the
      // AC-1 review and MUST be ruled before close:
      //   (a) email-equality — should the authenticated teen's login email be
      //       required to equal the invite's invited_email? Token-possession
      //       proves inbox access; email-equality is stricter but breaks when the
      //       teen's MentoMate login differs from the invited address.
      // The former (b) — single-token-MULTIPLE-teen — is CLOSED: the invite is now
      // claimed atomically inside acceptFamilyJoin's transaction (a conditional
      // `status='pending'` update whose rowcount decides the winner), so a
      // forwarded token admits exactly one teen even under a concurrent race. This
      // token lookup is therefore advisory: it classifies the 404 and supplies the
      // invite, but it does NOT authorize the redemption — the in-tx claim does.
      // NOTE (constant-time): resolveFamilyJoinInviteByToken uses an exact indexed
      // lookup, NOT a constant-time compare. The token is a 122-bit
      // crypto.randomUUID; a DB index-timing differential does not measurably
      // reduce that search space. This mirrors reviewed consent-v2 token handling.
      // Flagged for AC-1 to ratify or require an HMAC/constant-time scheme.
      const invite = await resolveFamilyJoinInviteByToken(db, token);
      if (!invite) {
        throw new NotFoundError('Invite not found or expired.');
      }

      const result = await acceptFamilyJoin(db, {
        teenPersonId: callerPersonId,
        inviteId: invite.inviteId,
        familyOrgId: invite.familyOrgId,
        parentPersonId: invite.inviterPersonId,
        optInSupportership,
      });

      return c.json({
        familyOrgId: result.familyOrgId,
        alreadyMember: result.alreadyMember,
        storeCancelNudge: result.storeCancelNudge,
      });
    },
  );
