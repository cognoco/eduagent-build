// ---------------------------------------------------------------------------
// Account Service — find-or-create account from Clerk JWT claims
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { type Database } from '@eduagent/database';
import { safeSend } from './safe-non-core';
import type { SecurityNotificationType } from '@eduagent/schemas';
import { inngest } from '../inngest/client';
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
   * (`updateLoginEmailFromClerk` runs without a profile context).
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
