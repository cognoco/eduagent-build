// ---------------------------------------------------------------------------
// Account Service — find-or-create account from Clerk JWT claims
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { accounts, type Database } from '@eduagent/database';
import { isUniqueViolation } from './db-errors';
import {
  invalidateVerifiedClerkEmailCache,
  resolveVerifiedClerkEmail,
} from './clerk-user';

import { safeSend } from './safe-non-core';
import type { SecurityNotificationType } from '@eduagent/schemas';
import { inngest } from '../inngest/client';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';
import { resolveIdentityV2 } from './identity-v2/identity-resolve';

/**
 * [CRITICAL-2a] Dispatch a non-core account-security event so the
 * `account-security-notification` Inngest function can email the affected
 * address out-of-band. Failures are captured but never thrown — a notification
 * problem must not break the credential change the user just made.
 */
export async function notifyAccountSecurityEvent(args: {
  accountId: string;
  to: string;
  type: SecurityNotificationType;
  /**
   * Null for the server-side `email_changed` dispatch
   * (`updateAccountEmailFromClerk` runs without a profile context).
   */
  profileId: string | null;
}): Promise<void> {
  await safeSend(
    () =>
      inngest.send({
        name: 'app/account.security-event',
        data: {
          type: args.type,
          to: args.to,
          accountId: args.accountId,
          profileId: args.profileId,
          timestamp: new Date().toISOString(),
        },
      }),
    `account.security_event.${args.type}`,
    { accountId: args.accountId },
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  clerkUserId: string;
  email: string;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapAccountRow(row: typeof accounts.$inferSelect): Account {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId,
    email: row.email,
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Finds an existing account by its Clerk user ID.
 *
 * [WI-1254] v2 read: resolves via the login→membership→organization identity
 * graph (`resolveIdentityV2`, the same resolver `accountMiddleware` runs on
 * every authenticated request) rather than the legacy `accounts` table, which
 * is being dropped (WI-1128). Its one live caller is the
 * account-reclaim-attempt Inngest handler, which looks up the already-verified
 * existing owner by clerkUserId to send them a security notification.
 */
export async function findAccountByClerkId(
  db: Database,
  clerkUserId: string,
): Promise<Account | null> {
  const resolved = await resolveIdentityV2(db, clerkUserId);
  return resolved?.account ?? null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function updateAccountEmailFromClerk(
  db: Database,
  args: {
    clerkUserId: string;
    requestedEmail: string;
    clerkSecretKey?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<Account> {
  const requestedEmail = normalizeEmail(args.requestedEmail);

  // The caller may still hold a JWT with the old email claim immediately after
  // Clerk promotion. Force a Clerk API lookup by omitting token claims, and
  // drop any stale cache entry before and after the sync.
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
    const { account: updated, previousEmail } = await db.transaction(
      async (tx) => {
        const existingByEmail = await tx.query.accounts.findFirst({
          where: eq(accounts.email, requestedEmail),
        });

        if (
          existingByEmail &&
          existingByEmail.clerkUserId !== args.clerkUserId
        ) {
          throw new ConflictError(
            'An account with this email already exists. Contact support to recover access.',
          );
        }

        // Capture the prior login email before overwriting it so the
        // security-notification can be sent to the address losing access.
        const current = await tx.query.accounts.findFirst({
          where: eq(accounts.clerkUserId, args.clerkUserId),
        });

        const [row] = await tx
          .update(accounts)
          .set({ email: requestedEmail, updatedAt: new Date() })
          .where(eq(accounts.clerkUserId, args.clerkUserId))
          .returning();

        if (!row) {
          throw new NotFoundError('Account');
        }

        return {
          account: mapAccountRow(row),
          previousEmail: current?.email ?? null,
        };
      },
    );

    invalidateVerifiedClerkEmailCache(args.clerkUserId);

    // [CRITICAL-2a] Alert the OLD address out-of-band that the login email
    // changed. Non-core (safeSend): a delivery failure must never undo a
    // completed email change.
    if (previousEmail && normalizeEmail(previousEmail) !== requestedEmail) {
      await notifyAccountSecurityEvent({
        accountId: updated.id,
        to: previousEmail,
        type: 'email_changed',
        profileId: null,
      });
    }

    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'An account with this email already exists. Contact support to recover access.',
      );
    }
    throw error;
  }
}
