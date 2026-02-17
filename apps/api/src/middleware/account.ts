// ---------------------------------------------------------------------------
// Account Middleware — resolves Clerk user → local Account
// Runs after auth + database middleware. Skips public routes (no user set).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
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
      await next();
      return;
    }
    const db = c.get('db');
    const account = await findOrCreateAccount(
      db,
      user.userId,
      user.email ?? ''
    );
    c.set('account', account);
    await next();
  }
);
