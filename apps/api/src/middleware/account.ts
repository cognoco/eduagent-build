// ---------------------------------------------------------------------------
// Account Middleware — resolves Clerk user → local Account
// Runs after auth + database middleware. Skips public routes (no user set).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import { findOrCreateAccount, type Account } from '../services/account';
import { withTransientDatabaseRetry } from '../services/transient-db-retry';
import { createLogger } from '../services/logger';
import type { AuthUser } from './auth';
import type { Database } from '@eduagent/database';

const logger = createLogger();

export type AccountEnv = {
  Variables: { user: AuthUser; db: Database; account: Account };
};

export const accountMiddleware = createMiddleware<AccountEnv>(
  async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return next();
    }

    // Clerk JWTs may omit the email claim (e.g. before email verification
    // completes or if the session template doesn't include it). Reject early
    // rather than inserting an empty-string email which violates the unique
    // constraint and corrupts the accounts table.
    if (!user.email) {
      return c.json(
        {
          code: ERROR_CODES.UNAUTHORIZED,
          message:
            'Email not available in session. Please verify your email and try again.',
        },
        401,
      );
    }

    // [BUG-497] Reject when Clerk has not explicitly attested the email as
    // verified. An unverified email may reflect an attacker-controlled value
    // injected via a session template, or a mid-session email change before
    // the token was reissued. Using an unverified email to create or look up
    // an account row risks identity confusion: clerkUserId is the canonical
    // identity anchor; email is supplementary and MUST be attested.
    //
    // Note: emailVerified === undefined means the claim was absent from the
    // JWT (e.g. session template omits it). We treat absence as unverified.
    if (user.emailVerified !== true) {
      logger.info('account.middleware.email_not_verified', {
        clerkUserId: user.userId,
        emailVerified: user.emailVerified,
      });
      return c.json(
        {
          code: ERROR_CODES.UNAUTHORIZED,
          message:
            'Email not verified. Please verify your email address and try again.',
        },
        401,
      );
    }

    const db = c.get('db');
    // email is verified (emailVerified === true) and non-empty (guarded above)
    const verifiedEmail = user.email;

    const account = await withTransientDatabaseRetry(
      'accountMiddleware.findOrCreateAccount',
      () => findOrCreateAccount(db, user.userId, verifiedEmail),
    );
    c.set('account', account);
    return next();
  },
);
