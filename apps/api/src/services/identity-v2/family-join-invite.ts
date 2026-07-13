// ---------------------------------------------------------------------------
// WI-1753 — family-join INVITE service (Phase 2, "join-my-family v1").
//
// The parent-issued side of the cross-account existing-teen family join. A
// parent (adult owner/admin of their family org — enforced at the route) invites
// an existing solo teen by email. This module owns the invite WRITE: it upserts
// the `family_join_invite` row, mints a 7-day token, and sends the invite email
// out-of-band. The teen later ACCEPTS via `acceptFamilyJoin` (family-join-v2.ts).
//
// ANTI-ENUM (AC-1) — the whole design turns on this:
//   The invite WRITE never branches on whether `invited_email` matches a real
//   account. There is NO "does this email belong to a teen" query here at all.
//   The row is keyed to the parent's own (inviter, family-org) slot, the token
//   email is sent to the typed address REGARDLESS of account existence, and the
//   response the route returns is byte-identical in every case. Teen resolution
//   happens only at ACCEPT time (the recipient authenticates). Consequently this
//   endpoint leaks nothing about who has an account — a stronger guarantee than
//   consent-v2, which at least keys on a known charge person.
//   Corollary: there is deliberately NO timing padding / constant-time wrapper.
//   Timing-safety here comes from the ABSENCE of the match/no-match branch, not
//   from equalizing latency; we mirror consent-v2's plain synchronous sendEmail.
//
// R2 model (orchestrator ruling 2026-07-12): natural key (inviter_person_id,
// family_org_id); `invited_email` is a MUTABLE recipient. This mirrors
// consent-v2's requestConsentV2 (guardian_email mutable on a charge-keyed row)
// 1:1, so the WI-374 atomic compare-and-increment abuse caps carry over exactly:
//   - resend_count       — same-email resends (cap MAX_FAMILY_JOIN_RESENDS)
//   - recipient_change_count — retargeting to a different email (cap
//     MAX_FAMILY_JOIN_RECIPIENT_CHANGES)
// Both caps are enforced INSIDE the upsert's setWhere (race-safe, TOCTOU-free) —
// a stale pre-read can never let a request exceed a cap. Unlike consent, the
// recipient is NOT NULL (an invite always names a recipient — there is no
// pre-`pending` state), so the consent upsert's initial-assignment (NULL) branch
// is omitted here.
// ---------------------------------------------------------------------------

import { and, eq, sql } from 'drizzle-orm';
import {
  familyJoinInvite,
  membership,
  person,
  type Database,
} from '@eduagent/database';
import { computeAgeBracketFromDate } from '@eduagent/schemas';

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  RateLimitedError,
} from '../../errors';
import {
  sendEmail,
  formatFamilyJoinInviteEmail,
  type EmailOptions,
} from '../notifications/email';
import { createLogger } from '../logger';
import { birthMonthDayFromDate, birthYearFromDate } from './profile-v2';

const logger = createLogger();

/** Max same-recipient resends before a fresh invite cycle is required. */
const MAX_FAMILY_JOIN_RESENDS = 3;
/** Max retargets to a different email on one (inviter, family-org) slot. */
const MAX_FAMILY_JOIN_RECIPIENT_CHANGES = 3;

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InitiateFamilyJoinInviteInput {
  /** The authenticated inviting parent (adult owner/admin — route-enforced). */
  inviterPersonId: string;
  /** The parent's family org (resolved server-side from the caller's admin
   * membership — never a client value). */
  familyOrgId: string;
  /** The out-of-band recipient the parent typed. */
  invitedEmail: string;
  emailOptions?: EmailOptions;
}

export interface InitiateFamilyJoinInviteResult {
  /** Whether the invite email was successfully delivered. */
  emailDelivered: boolean;
}

/**
 * Issue (or resend / retarget) a family-join invite. Atomic upsert on the R2
 * (inviter, family-org) unique, mirroring requestConsentV2:
 *   - same recipient  → resend_count++ (capped)
 *   - different email  → recipient_change_count++ and resend_count reset to 0
 *     (capped)
 *   - an already-accepted slot is terminal and never re-issued
 * A cap hit throws `RateLimitedError` (429 — about the inviter's own slot, NOT a
 * signal about the recipient, so anti-enum stays intact). On email delivery
 * failure the burned counter is rolled back, mirroring consent-v2.
 */
export async function initiateFamilyJoinInvite(
  db: Database,
  input: InitiateFamilyJoinInviteInput,
): Promise<InitiateFamilyJoinInviteResult> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

  // Pre-read for error classification + email-failure rollback ONLY. This does
  // not weaken anti-enum: it reads the parent's OWN invite row (keyed to the
  // authenticated inviter + their org), never anything about the recipient's
  // account. The caps themselves are enforced atomically below.
  const existing = await db.query.familyJoinInvite.findFirst({
    where: inviteKey(input.inviterPersonId, input.familyOrgId),
    columns: { invitedEmail: true },
  });
  const isRecipientChange =
    existing != null && existing.invitedEmail !== input.invitedEmail;

  const [row] = await db
    .insert(familyJoinInvite)
    .values({
      inviterPersonId: input.inviterPersonId,
      familyOrgId: input.familyOrgId,
      invitedEmail: input.invitedEmail,
      status: 'pending',
      token,
      tokenExpiresAt: expiresAt,
      resendCount: 0,
      recipientChangeCount: 0,
    })
    .onConflictDoUpdate({
      target: [familyJoinInvite.inviterPersonId, familyJoinInvite.familyOrgId],
      set: {
        status: 'pending',
        invitedEmail: input.invitedEmail,
        token,
        tokenExpiresAt: expiresAt,
        // Same recipient → resend++; recipient change → reset to 0.
        resendCount: sql`CASE WHEN ${familyJoinInvite.invitedEmail} IS NOT DISTINCT FROM ${input.invitedEmail} THEN ${familyJoinInvite.resendCount} + 1 ELSE 0 END`,
        // A change between two real recipients consumes a change slot.
        recipientChangeCount: sql`CASE WHEN ${familyJoinInvite.invitedEmail} IS DISTINCT FROM ${input.invitedEmail} THEN ${familyJoinInvite.recipientChangeCount} + 1 ELSE ${familyJoinInvite.recipientChangeCount} END`,
        updatedAt: sql`now()`,
      },
      // Terminal-status guard + the two caps, atomic. An accepted slot can never
      // be revived to 'pending'. `invited_email` is NOT NULL so there is no
      // initial-assignment branch: same recipient → resend cap; real change →
      // change cap.
      setWhere: sql`${familyJoinInvite.status} <> 'accepted' AND ((${familyJoinInvite.invitedEmail} IS NOT DISTINCT FROM ${input.invitedEmail} AND ${familyJoinInvite.resendCount} < ${MAX_FAMILY_JOIN_RESENDS}) OR (${familyJoinInvite.invitedEmail} IS DISTINCT FROM ${input.invitedEmail} AND ${familyJoinInvite.recipientChangeCount} < ${MAX_FAMILY_JOIN_RECIPIENT_CHANGES}))`,
    })
    .returning();

  if (!row) {
    // Conflict existed but setWhere blocked the update — terminal (accepted) or
    // a cap. Re-read status to classify (all reads are of the parent's OWN slot).
    const existingRow = await db.query.familyJoinInvite.findFirst({
      where: inviteKey(input.inviterPersonId, input.familyOrgId),
      columns: { status: true },
    });
    if (existingRow?.status === 'accepted') {
      throw new ConflictError('This family invite has already been accepted.');
    }
    throw new RateLimitedError(
      isRecipientChange
        ? 'Too many recipient changes for this family invite.'
        : 'Too many resends for this family invite.',
    );
  }

  // The invite email carries NO action link (operator ruling 2026-07-12) — the
  // accept surface it would have to point at does not exist yet. The token is
  // still minted and stored on the row above; only its DELIVERY is deferred to
  // the accept-surface work. See formatFamilyJoinInviteEmail.
  const emailResult = await sendEmail(
    formatFamilyJoinInviteEmail(input.invitedEmail),
    input.emailOptions,
  );

  if (!emailResult.sent) {
    if (emailResult.reason === 'no_api_key') {
      // Config issue, not a delivery failure — keep the invite row.
      return { emailDelivered: false };
    }
    await rollbackCounter(db, row.id, isRecipientChange);
    // Anti-enum: a delivery failure is surfaced identically regardless of
    // recipient — the route maps this to the same neutral response as success
    // (the email pipeline's own failure is not a signal about the recipient).
    return { emailDelivered: false };
  }

  return { emailDelivered: true };
}

export interface FamilyJoinInviterContext {
  /** The caller's OWN family org (resolved from their admin membership). */
  familyOrgId: string;
}

/**
 * Resolve + authorize the inviting parent SERVER-SIDE (route delegates all DB
 * access here per the route/service boundary rule). Throws:
 *   - ForbiddenError — caller has no membership; OR is not an admin (owner) of
 *     their org (blast-radius gate: an inviter can only invite into their OWN
 *     org); OR is a minor (AC-7: a minor must not initiate a family-join invite,
 *     the quasi-guardianship action).
 *   - BadRequestError — caller person row missing.
 * Returns the caller's own family org id — never a client value.
 */
export async function resolveFamilyJoinInviter(
  db: Database,
  inviterPersonId: string,
): Promise<FamilyJoinInviterContext> {
  const callerMembership = await db.query.membership.findFirst({
    where: eq(membership.personId, inviterPersonId),
  });
  if (!callerMembership) {
    throw new ForbiddenError('Caller has no organization membership.');
  }
  if (!callerMembership.roles.includes('admin')) {
    throw new ForbiddenError(
      'Only an organization owner can invite a family member.',
    );
  }
  const callerPerson = await db.query.person.findFirst({
    where: eq(person.id, inviterPersonId),
  });
  if (!callerPerson) {
    throw new BadRequestError('Caller person not found.');
  }
  const { birthMonth, birthDay } = birthMonthDayFromDate(
    callerPerson.birthDate,
  );
  const bracket = computeAgeBracketFromDate(
    birthYearFromDate(callerPerson.birthDate),
    birthMonth ?? undefined,
    birthDay ?? undefined,
  );
  if (bracket !== 'adult') {
    throw new ForbiddenError('Only an adult can invite a family member.');
  }
  return { familyOrgId: callerMembership.organizationId };
}

export interface ResolvedFamilyJoinInvite {
  inviteId: string;
  inviterPersonId: string;
  familyOrgId: string;
  invitedEmail: string;
}

/**
 * Resolve a PENDING, unexpired invite by token — exact indexed lookup on the
 * 122-bit random token (family_join_invite_token_idx). Returns null when no
 * pending, unexpired invite matches. See the accept route for the constant-time
 * / accept-authorization notes (deferred to the AC-1 security review).
 */
export async function resolveFamilyJoinInviteByToken(
  db: Database,
  token: string,
): Promise<ResolvedFamilyJoinInvite | null> {
  const invite = await db.query.familyJoinInvite.findFirst({
    where: and(
      eq(familyJoinInvite.token, token),
      eq(familyJoinInvite.status, 'pending'),
    ),
  });
  if (
    !invite ||
    !invite.tokenExpiresAt ||
    invite.tokenExpiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  return {
    inviteId: invite.id,
    inviterPersonId: invite.inviterPersonId,
    familyOrgId: invite.familyOrgId,
    invitedEmail: invite.invitedEmail,
  };
}

/**
 * CLAIM an invite — the single in-row terminal transition. A conditional update
 * guarded by `status='pending'`: the row is claimed ONLY if this statement is
 * the one that flips it, which the returned rowcount reports. Callers MUST treat
 * `false` as "someone else already redeemed this token" and abort.
 *
 * Single-use is enforced by WHERE, not by a prior read: a stale
 * `resolveFamilyJoinInviteByToken` result can never authorize a second
 * redemption, because the claim re-evaluates `status` at write time. Callers
 * pass a `tx` so the claim shares the accept transaction — the claim is then
 * serialized by that tx's family-org advisory lock, and a later rollback
 * releases the token rather than stranding it. This is the same
 * compare-and-set discipline the invite caps use in `initiateFamilyJoinInvite`'s
 * `setWhere`.
 */
export async function claimFamilyJoinInvite(
  db: Database,
  inviteId: string,
): Promise<boolean> {
  const claimed = await db
    .update(familyJoinInvite)
    .set({
      status: 'accepted',
      acceptedAt: sql`now()`,
      token: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(familyJoinInvite.id, inviteId),
        eq(familyJoinInvite.status, 'pending'),
      ),
    )
    .returning({ id: familyJoinInvite.id });

  return claimed.length === 1;
}

/** The R2 natural key: one outstanding invite slot per (inviter, family-org). */
function inviteKey(inviterPersonId: string, familyOrgId: string) {
  return and(
    eq(familyJoinInvite.inviterPersonId, inviterPersonId),
    eq(familyJoinInvite.familyOrgId, familyOrgId),
  );
}

/** Roll back a burned resend/recipient counter after an email delivery failure. */
async function rollbackCounter(
  db: Database,
  inviteId: string,
  isRecipientChange: boolean,
): Promise<void> {
  try {
    await db
      .update(familyJoinInvite)
      .set(
        isRecipientChange
          ? {
              recipientChangeCount: sql`GREATEST(${familyJoinInvite.recipientChangeCount} - 1, 0)`,
              updatedAt: sql`now()`,
            }
          : {
              resendCount: sql`GREATEST(${familyJoinInvite.resendCount} - 1, 0)`,
              updatedAt: sql`now()`,
            },
      )
      .where(eq(familyJoinInvite.id, inviteId));
  } catch (rollbackError) {
    logger.warn('[family-join-invite] Failed to rollback counter', {
      error:
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError),
    });
  }
}
