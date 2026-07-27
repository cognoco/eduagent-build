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
import type { Database } from '@eduagent/database';
import {
  familyJoinAcceptRequestSchema,
  familyJoinInviteRequestSchema,
} from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { withProfile } from '../route-utils/route-context';
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

type FamilyJoinRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
    callerPersonId: string | undefined;
  };
};

// [WI-1753] The launch gate (FAMILY_JOIN_ENABLED) lives in
// middleware/family-join-gate.ts, mounted ahead of the global stack in index.ts —
// NOT here. A handler-level check runs after auth, database, account resolution
// and this route's zValidator have all already answered, so it cannot make the
// surface dark: probes still get 401/400 and the server still does identity work
// for a switched-off feature. See that middleware for the full rationale.

function withCaller(c: Context<FamilyJoinRouteEnv>): {
  db: Database;
  callerPersonId: string;
} {
  // withProfile performs the validated profileId unwrap — route handlers must
  // not inline that unwrap themselves (route-context.guard ratchet).
  const { db } = withProfile(c);
  const callerPersonId = c.get('callerPersonId');
  if (!callerPersonId) {
    throw new BadRequestError('Identity v2 caller person is required.');
  }
  return { db, callerPersonId };
}

export const familyJoinRoutes = new Hono<FamilyJoinRouteEnv>()
  .post(
    '/family-join/invite',
    zValidator('json', familyJoinInviteRequestSchema),
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

      // No API_ORIGIN needed: the invite email carries no action link (operator
      // ruling 2026-07-12 — the accept surface it would point at does not exist
      // yet). The env binding returns when the accept surface lands.
      await initiateFamilyJoinInvite(db, {
        inviterPersonId: callerPersonId,
        familyOrgId,
        invitedEmail,
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
    zValidator('json', familyJoinAcceptRequestSchema),
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
        // The RAW presented token — re-matched at claim time inside the accept
        // transaction. The read above cannot authorize the redemption on its own:
        // a concurrent resend/retarget can rotate the token, or it can expire,
        // between that read and the write.
        inviteToken: token,
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
