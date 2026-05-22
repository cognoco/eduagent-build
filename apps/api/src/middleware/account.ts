// ---------------------------------------------------------------------------
// Account Middleware — resolves Clerk user → local Account
// Runs after auth + database middleware. Skips public routes (no user set).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import { findOrCreateAccount, type Account } from '../services/account';
import { resolveVerifiedClerkEmail } from '../services/clerk-user';
import { withTransientDatabaseRetry } from '../services/transient-db-retry';
import { createLogger } from '../services/logger';
import type { AuthUser } from './auth';
import type { Database } from '@eduagent/database';

const logger = createLogger();

export type AccountEnv = {
  Bindings: { CLERK_SECRET_KEY?: string };
  Variables: { user: AuthUser; db: Database; account: Account };
};

export const accountMiddleware = createMiddleware<AccountEnv>(
  async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return next();
    }

    // [BUG-497 / BUG-1016] The account email must be verified, but the API
    // must not depend on a fragile custom Clerk session-token claim for that
    // fact. Prefer the signed JWT fast path when it explicitly attests
    // email_verified=true; otherwise fall back to Clerk's Backend API by the
    // already-verified JWT subject. This keeps identity safe while making
    // preview/staging resilient to Clerk token-template drift.
    const verifiedEmail = await resolveVerifiedClerkEmail({
      userId: user.userId,
      tokenEmail: user.email,
      tokenEmailVerified: user.emailVerified,
      clerkSecretKey: c.env?.CLERK_SECRET_KEY,
    });

    if (!verifiedEmail.ok) {
      logger.info('account.middleware.email_not_verified', {
        clerkUserId: user.userId,
        emailVerified: user.emailVerified,
        reason: verifiedEmail.reason,
      });
      if (verifiedEmail.reason === 'lookup-unavailable') {
        return c.json(
          {
            code: ERROR_CODES.SERVICE_UNAVAILABLE,
            message: verifiedEmail.message,
          },
          503,
        );
      }
      return c.json(
        {
          code:
            verifiedEmail.reason === 'email-missing'
              ? ERROR_CODES.EMAIL_NOT_AVAILABLE
              : ERROR_CODES.EMAIL_NOT_VERIFIED,
          message: verifiedEmail.message,
        },
        401,
      );
    }

    const db = c.get('db');
    if (verifiedEmail.source !== 'jwt') {
      logger.info('account.middleware.email_verified_via_clerk_backend', {
        clerkUserId: user.userId,
        source: verifiedEmail.source,
      });
    }

    const account = await withTransientDatabaseRetry(
      'accountMiddleware.findOrCreateAccount',
      () => findOrCreateAccount(db, user.userId, verifiedEmail.email),
      // findOrCreateAccount uses INSERT … ON CONFLICT DO UPDATE (upsert) —
      // safe to retry if the connection drops mid-flight.
      { idempotent: true },
    );
    c.set('account', account);
    return next();
  },
);
