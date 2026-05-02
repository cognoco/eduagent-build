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
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';

const logger = createLogger();

/**
 * Profile metadata injected into Hono context by profileScopeMiddleware.
 *
 * `birthYear` is populated from the `birth_year` column, which is NOT NULL
 * post-Epic 12 (migration 0017). Consumers can rely on it being a real year.
 *
 * Consumers that depend on `birthYear`:
 *   - LLM context injection (system prompt age bracketing)
 *   - Sentry age-gating (under-13 PII scrubbing)
 *   - Consent checks (GDPR under-16 / COPPA under-13)
 */
export interface ProfileMeta {
  birthYear: number;
  location: 'EU' | 'US' | 'OTHER' | null;
  consentStatus:
    | 'PENDING'
    | 'PARENTAL_CONSENT_REQUESTED'
    | 'CONSENTED'
    | 'WITHDRAWN'
    | null;
  hasPremiumLlm: boolean;
  // [SEC-2 / BUG-718] Server-derived flag indicating whether the resolved
  // X-Profile-Id is the owner profile for the authenticated account.
  // assertNotProxyMode reads this instead of trusting the client-supplied
  // X-Proxy-Mode header. A non-owner profile being accessed via a parent's
  // account session is treated as a proxy session regardless of any header.
  isOwner: boolean;
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

/**
 * [CR-657] Defensive unwrap for `c.get('account')` in route handlers. Mirrors
 * `requireProfileId`. Although the Hono context types declare `account` as
 * non-nullable, that guarantee depends on accountMiddleware running before the
 * route — if middleware order changes or accountMiddleware silently skips
 * (e.g. unauthenticated path that still mounts the route), `c.get('account')`
 * is `undefined` at runtime and `c.get('account').id` throws TypeError. Use:
 *   `const account = requireAccount(c.get('account'));`
 */
export function requireAccount<T extends { id: string }>(
  account: T | undefined
): T {
  if (!account) {
    throw new HTTPException(401, {
      message:
        'Account required — no authenticated account resolved for this request',
    });
  }
  return account;
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
    // will also fail on their own queries (producing 500). The structured log +
    // Sentry capture below escalate per the "no silent recovery without escalation"
    // rule for auth-scoping code (CR-SILENT-RECOVERY-1).
    if (!profileIdHeader) {
      const db = c.get('db');
      const account = c.get('account');
      if (db && account) {
        try {
          const owner = await findOwnerProfile(db, account.id);
          if (owner) {
            c.set('profileId', owner.id);
            c.set('profileMeta', {
              birthYear: owner.birthYear,
              location: owner.location,
              consentStatus: owner.consentStatus,
              hasPremiumLlm: owner.hasPremiumLlm ?? false,
              // The auto-resolve path always returns the owner profile.
              isOwner: true,
            });
          }
        } catch (err) {
          logger.error('profile_scope.auto_resolve_failed', {
            accountId: account.id,
            error: err instanceof Error ? err.message : String(err),
          });
          captureException(err, {
            extra: {
              context: 'profile-scope.auto_resolve_owner',
              accountId: account.id,
            },
          });
        }
      }
      await next();
      return;
    }

    // Verify explicitly-provided profile belongs to this account
    const db = c.get('db');
    const account = c.get('account');
    if (!account) {
      return c.json(
        {
          code: 'UNAUTHORIZED',
          message: 'Authentication required to use X-Profile-Id',
        },
        401
      );
    }
    const profile = await getProfile(db, profileIdHeader, account.id);
    if (!profile) {
      return forbidden(c, 'Profile does not belong to this account');
    }
    c.set('profileId', profile.id);
    c.set('profileMeta', {
      birthYear: profile.birthYear,
      location: profile.location,
      consentStatus: profile.consentStatus,
      hasPremiumLlm: profile.hasPremiumLlm ?? false,
      isOwner: profile.isOwner,
    });
    await next();
    return;
  }
);
