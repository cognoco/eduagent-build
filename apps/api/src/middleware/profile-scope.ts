// ---------------------------------------------------------------------------
// Profile Scope Middleware — resolves X-Profile-Id header → verified profileId
// Runs after account middleware. Skips when header is absent (account-level routes).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import type { Account } from '../services/account';
import { getProfile } from '../services/profile';
import type { Database } from '@eduagent/database';
import { forbidden } from '../errors';

export type ProfileScopeEnv = {
  Variables: { db: Database; account: Account; profileId: string };
};

export const profileScopeMiddleware = createMiddleware<ProfileScopeEnv>(
  async (c, next) => {
    const profileIdHeader = c.req.header('X-Profile-Id');
    if (!profileIdHeader) {
      await next();
      return;
    }
    const db = c.get('db');
    const account = c.get('account');
    if (!account) {
      await next();
      return;
    }
    // Verify profile belongs to this account
    const profile = await getProfile(db, profileIdHeader, account.id);
    if (!profile) {
      return forbidden(c, 'Profile does not belong to this account');
    }
    c.set('profileId', profile.id);
    await next();
    return;
  }
);
