// ---------------------------------------------------------------------------
// Account Middleware — resolves Clerk user → local Account
// Runs after auth + database middleware. Skips public routes (no user set).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import { findOrCreateAccount, type Account } from '../services/account';
import type { AuthUser } from './auth';
import type { Database } from '@eduagent/database';

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
        401
      );
    }

    const db = c.get('db');
    const account = await findOrCreateAccount(db, user.userId, user.email);
    c.set('account', account);
    return next();
  }
);
