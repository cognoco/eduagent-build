// ---------------------------------------------------------------------------
// Profile Scope Middleware — resolves X-Profile-Id header → verified profileId
// Runs after account middleware. Skips when header is absent (account-level routes).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Account } from '../services/account';
import { getProfile, findOwnerProfile } from '../services/profile';
import type { Database } from '@eduagent/database';
import { forbidden } from '../errors';

/**
 * Profile metadata injected into Hono context by profileScopeMiddleware.
 *
 * `birthYear` is populated from the `birth_year` column.
 *
 * Consumers that depend on `birthYear` being non-null:
 *   - LLM context injection (system prompt age bracketing)
 *   - Sentry age-gating (under-13 PII scrubbing)
 *   - Consent checks (GDPR under-16 / COPPA under-13)
 */
export interface ProfileMeta {
  birthYear: number | null;
  location: 'EU' | 'US' | 'OTHER' | null;
  consentStatus:
    | 'PENDING'
    | 'PARENTAL_CONSENT_REQUESTED'
    | 'CONSENTED'
    | 'WITHDRAWN'
    | null;
  hasPremiumLlm: boolean;
}

export type ProfileScopeEnv = {
  Variables: {
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta;
  };
};

/**
 * Extracts profileId from a value that may be undefined, throwing 400 if absent.
 * Use in route handlers: `const profileId = requireProfileId(c.get('profileId'));`
 */
export function requireProfileId(profileId: string | undefined): string {
  if (!profileId) {
    throw new HTTPException(400, {
      message: 'Profile required — no profile resolved for this request',
    });
  }
  return profileId;
}

export const profileScopeMiddleware = createMiddleware<ProfileScopeEnv>(
  async (c, next) => {
    const profileIdHeader = c.req.header('X-Profile-Id');

    // When X-Profile-Id is absent, auto-resolve to the owner profile.
    // This prevents the broken `?? account.id` fallback in route handlers
    // which silently returns empty results (account.id is not a valid profileId).
    //
    // Account-level routes (billing, account settings, profile list) are unaffected —
    // they read account.id directly and never call c.get('profileId').
    //
    // Auto-resolve is try/catch guarded because this middleware runs on ALL routes
    // including account-level ones. If the DB is down, profile-scoped route handlers
    // will also fail on their own queries (producing 500). The error log below
    // ensures the failure is observable in monitoring.
    if (!profileIdHeader) {
      const db = c.get('db');
      const account = c.get('account');
      if (db && account) {
        try {
          const owner = await findOwnerProfile(db, account.id);
          if (owner) {
            c.set('profileId', owner.id);
            c.set('profileMeta', {
              birthYear: owner.birthYear ?? null,
              location: owner.location,
              consentStatus: owner.consentStatus,
              hasPremiumLlm: owner.hasPremiumLlm ?? false,
            });
          }
        } catch (err) {
          console.error(
            '[profile-scope] Failed to auto-resolve owner profile:',
            err
          );
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
      birthYear: profile.birthYear ?? null,
      location: profile.location,
      consentStatus: profile.consentStatus,
      hasPremiumLlm: profile.hasPremiumLlm ?? false,
    });
    await next();
    return;
  }
);
