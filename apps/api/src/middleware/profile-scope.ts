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
import { isIdentityV2Enabled } from '../config';
import {
  findOwnerPersonScope,
  getPersonScope,
} from '../services/identity-v2/profile-v2';

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
  conversationLanguage?: string | null;
  // [SEC-2 / BUG-718] Server-derived flag indicating whether the resolved
  // X-Profile-Id is the owner profile for the authenticated account.
  // assertNotProxyMode reads this instead of trusting the client-supplied
  // X-Proxy-Mode header. A non-owner profile being accessed via a parent's
  // account session is treated as a proxy session regardless of any header.
  isOwner: boolean;
}

export type ProfileScopeEnv = {
  Bindings: {
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
    /**
     * [BUG-502 / BUG-487] Set when the auto-resolve path throws a transient
     * error (DB outage). Downstream middleware (consent.ts) reads this sentinel
     * to fail closed rather than treating the absent profileId as an
     * account-level route and skipping enforcement.
     */
    profileScopeError: Error | undefined;
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
  account: T | undefined,
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
          // [CUT-B1] v2 seam: resolve the owner person scope (person.id =
          // profiles.id, account.id = organization.id). The returned meta is
          // byte-identical to the legacy ProfileMeta. NOTE: only the RESOLUTION
          // runs inside this try — `next()` runs after it (the shared call
          // below), so a downstream handler throwing is NOT mis-escalated as a
          // profile-scope transient error, and a transient error HERE still
          // hits the same catch (sets profileScopeError + 503) as legacy.
          if (isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED)) {
            const ownerScope = await findOwnerPersonScope(db, account.id);
            if (ownerScope) {
              c.set('profileId', ownerScope.profileId);
              c.set('profileMeta', ownerScope.meta);
            }
            // fall through to the shared `await next()` below (outside try).
          } else {
            const owner = await findOwnerProfile(db, account.id);
            if (owner) {
              c.set('profileId', owner.id);
              c.set('profileMeta', {
                birthYear: owner.birthYear,
                location: owner.location,
                consentStatus: owner.consentStatus,
                hasPremiumLlm: owner.hasPremiumLlm ?? false,
                conversationLanguage: owner.conversationLanguage,
                // [BUG-410] Propagate the actual isOwner flag from the DB row.
                // Previously hardcoded to true, which silently granted owner
                // privileges when findOwnerProfile fell back to a non-owner row
                // (no is_owner=true row in DB). The service now returns the real
                // flag; the caller must not override it.
                isOwner: owner.isOwner,
              });
            }
          }
        } catch (err) {
          logger.error('profile_scope.auto_resolve_failed', {
            accountId: account.id,
            error: err instanceof Error ? err.message : String(err),
          });
          captureException(err, {
            tags: { surface: 'profile_scope.auto_resolve_failure' },
            extra: {
              context: 'profile-scope.auto_resolve_owner',
              accountId: account.id,
            },
          });
          // [BUG-487 / BUG-502] Distinguish "no owner profile exists" (legit —
          // proceed, downstream requireProfileId will 400 as appropriate) from
          // "DB threw a transient error" (fail closed — never allow a
          // PENDING-consent learner through the consent gate by accident).
          //
          // Set sentinel for belt-and-suspenders: consent.ts reads it and also
          // fails closed if this throw is ever caught by an outer try/catch.
          c.set(
            'profileScopeError',
            err instanceof Error ? err : new Error(String(err)),
          );
          throw new HTTPException(503, {
            message:
              'Profile resolution temporarily unavailable — please retry',
          });
        }
      }
      await next();
      return;
    }

    // Verify explicitly-provided profile belongs to this account.
    // Intentional narrowing: returns 401 when X-Profile-Id is present but no
    // authenticated account exists. All public paths (webhooks, health, billing
    // redirects, consent-page, test-seed) never send X-Profile-Id — verified
    // against PUBLIC_PATHS in auth.ts. If a future public route needs optional
    // profile context, it must be handled before this guard.
    const db = c.get('db');
    const account = c.get('account');
    if (!account) {
      return c.json(
        {
          code: 'UNAUTHORIZED',
          message: 'Authentication required to use X-Profile-Id',
        },
        401,
      );
    }
    // [CUT-B1] v2 seam: verify the person belongs to the org (membership) and
    // build the byte-identical ProfileMeta. account.id = organization.id.
    if (isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED)) {
      const scope = await getPersonScope(db, profileIdHeader, account.id);
      if (!scope) {
        logger.warn('profile_scope.ownership_mismatch', {
          accountId: account.id,
          requestedProfileId: profileIdHeader,
        });
        return forbidden(c, 'Profile does not belong to this account');
      }
      c.set('profileId', scope.profileId);
      c.set('profileMeta', scope.meta);
      await next();
      return;
    }

    const profile = await getProfile(db, profileIdHeader, account.id);
    if (!profile) {
      logger.warn('profile_scope.ownership_mismatch', {
        accountId: account.id,
        requestedProfileId: profileIdHeader,
      });
      return forbidden(c, 'Profile does not belong to this account');
    }
    c.set('profileId', profile.id);
    c.set('profileMeta', {
      birthYear: profile.birthYear,
      location: profile.location,
      consentStatus: profile.consentStatus,
      hasPremiumLlm: profile.hasPremiumLlm ?? false,
      conversationLanguage: profile.conversationLanguage,
      isOwner: profile.isOwner,
    });
    await next();
    return;
  },
);
