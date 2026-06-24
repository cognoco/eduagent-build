// ---------------------------------------------------------------------------
// [WI-586 C4] Account email update — v2 twin of `updateAccountEmailFromClerk`.
//
// The legacy writer targets `accounts.email WHERE clerkUserId = ?`.
// The v2 writer targets `login.email WHERE clerkUserId = ?`, which is the
// equivalent credential binding in the v2 identity graph.
//
// SECURITY: the caller identity (clerkUserId from the JWT) is the ownership
// proof — only the person whose login row carries that clerkUserId can
// update their email. There is no cross-org / cross-person attack surface:
// `login.clerkUserId` is unique, so the UPDATE WHERE clause naturally scopes
// to exactly one row and only the authenticated caller can trigger it
// (the route-level `assertOwnerProfile` guard enforces the owner gate before
// this service is called — see routes/account.ts:PATCH /account/email).
//
// The flow mirrors the legacy function:
//  1. Force a Clerk API lookup to confirm the requested email is verified.
//  2. Conflict check (same email already bound to another login row).
//  3. Capture the prior email for the security notification.
//  4. Update login.email in a transaction.
//  5. Invalidate Clerk cache.
//  6. Non-core security notification to the old address.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { login, type Database } from '@eduagent/database';
import {
  invalidateVerifiedClerkEmailCache,
  resolveVerifiedClerkEmail,
} from '../clerk-user';
import { notifyAccountSecurityEvent } from '../account';
import { isUniqueViolation } from '../db-errors';
import { BadRequestError, ConflictError, NotFoundError } from '../../errors';

/**
 * v2 twin of `updateAccountEmailFromClerk` — updates `login.email` for the
 * person identified by `clerkUserId`. Returns the updated email on success.
 * Throws `BadRequestError` / `ConflictError` / `NotFoundError` with the same
 * messages as the legacy function for transparent route-handler parity.
 *
 * `organizationId` = the caller's resolved org (account.id = organization.id);
 * passed through for the security-notification accountId field.
 */
export async function updateLoginEmailFromClerk(
  db: Database,
  args: {
    clerkUserId: string;
    requestedEmail: string;
    organizationId: string;
    clerkSecretKey?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<{ email: string }> {
  const requestedEmail = normalizeEmail(args.requestedEmail);

  // Step 1: Clerk verification — same flow as legacy.
  invalidateVerifiedClerkEmailCache(args.clerkUserId);
  const verified = await resolveVerifiedClerkEmail({
    userId: args.clerkUserId,
    clerkSecretKey: args.clerkSecretKey,
    fetchImpl: args.fetchImpl,
  });

  if (!verified.ok) {
    throw new BadRequestError(verified.message);
  }

  if (normalizeEmail(verified.email) !== requestedEmail) {
    throw new BadRequestError(
      'Requested email does not match the verified Clerk primary email.',
    );
  }

  try {
    const { updatedEmail, previousEmail } = await db.transaction(async (tx) => {
      // Step 2: Conflict check — another login row already holds this email.
      const existingByEmail = await tx.query.login.findFirst({
        where: eq(login.email, requestedEmail),
      });

      if (existingByEmail && existingByEmail.clerkUserId !== args.clerkUserId) {
        throw new ConflictError(
          'An account with this email already exists. Contact support to recover access.',
        );
      }

      // Step 3: Capture prior email for the security notification.
      const current = await tx.query.login.findFirst({
        where: eq(login.clerkUserId, args.clerkUserId),
      });

      // Step 4: Update login.email.
      const [row] = await tx
        .update(login)
        .set({ email: requestedEmail, updatedAt: new Date() })
        .where(eq(login.clerkUserId, args.clerkUserId))
        .returning({ email: login.email, personId: login.personId });

      if (!row) {
        throw new NotFoundError('Login');
      }

      return {
        updatedEmail: row.email,
        previousEmail: current?.email ?? null,
      };
    });

    // Step 5: Invalidate cache (same as legacy).
    invalidateVerifiedClerkEmailCache(args.clerkUserId);

    // Step 6: Non-core security notification to old address.
    // `organizationId` = account.id (identity-resolve.ts parity). The Inngest
    // function that consumes this event reads Clerk for display fields and does
    // not touch the legacy accounts table, so the v2 path is safe here.
    if (previousEmail && normalizeEmail(previousEmail) !== requestedEmail) {
      await notifyAccountSecurityEvent({
        accountId: args.organizationId,
        to: previousEmail,
        type: 'email_changed',
        profileId: null,
      });
    }

    return { email: updatedEmail };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'An account with this email already exists. Contact support to recover access.',
      );
    }
    throw error;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
