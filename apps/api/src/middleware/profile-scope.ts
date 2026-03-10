// ---------------------------------------------------------------------------
// Profile Scope Middleware — resolves X-Profile-Id header → verified profileId
// Runs after account middleware. Skips when header is absent (account-level routes).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import type { Account } from '../services/account';
import { getProfile, findOwnerProfile } from '../services/profile';
import type { Database } from '@eduagent/database';
import { forbidden } from '../errors';

export interface ProfileMeta {
  birthDate: string | null;
  location: 'EU' | 'US' | 'OTHER' | null;
  consentStatus:
    | 'PENDING'
    | 'PARENTAL_CONSENT_REQUESTED'
    | 'CONSENTED'
    | 'WITHDRAWN'
    | null;
}

export type ProfileScopeEnv = {
  Variables: {
    db: Database;
    account: Account;
    profileId: string;
    profileMeta: ProfileMeta;
  };
};

export const profileScopeMiddleware = createMiddleware<ProfileScopeEnv>(
  async (c, next) => {
    const profileIdHeader = c.req.header('X-Profile-Id');

    // When X-Profile-Id is absent, auto-resolve to the owner profile.
    // This prevents the broken `?? account.id` fallback in route handlers
    // which silently returns empty results (account.id is not a valid profileId).
    if (!profileIdHeader) {
      const db = c.get('db');
      const account = c.get('account');
      if (db && account) {
        try {
          const owner = await findOwnerProfile(db, account.id);
          if (owner) {
            c.set('profileId', owner.id);
            c.set('profileMeta', {
              birthDate: owner.birthDate,
              location: owner.location,
              consentStatus: owner.consentStatus,
            });
          }
        } catch {
          // Profile auto-resolve is best-effort; routes still have ?? account.id fallback
        }
      }
      await next();
      return;
    }

    // Verify explicitly-provided profile belongs to this account
    const db = c.get('db');
    const account = c.get('account');
    if (!account) {
      await next();
      return;
    }
    const profile = await getProfile(db, profileIdHeader, account.id);
    if (!profile) {
      return forbidden(c, 'Profile does not belong to this account');
    }
    c.set('profileId', profile.id);
    c.set('profileMeta', {
      birthDate: profile.birthDate,
      location: profile.location,
      consentStatus: profile.consentStatus,
    });
    await next();
    return;
  }
);
