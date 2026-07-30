// ---------------------------------------------------------------------------
// Profile Scope Middleware — resolves X-Profile-Id header → verified profileId
// Runs after account middleware. Skips when header is absent (account-level routes).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Account } from '../services/account';
import type { Database } from '@eduagent/database';
import { forbidden } from '../errors';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';
import { getPersonScope } from '../services/identity-v2/profile-v2';

const logger = createLogger();

/**
 * Profile metadata injected into Hono context by profileScopeMiddleware.
 *
 * `birthYear` is populated from the `birth_year` column, which is NOT NULL
 * post-Epic 12 (migration 0017). Consumers can rely on it being a real year.
 *
 * Consumers that depend on `birthYear`:
 *   - LLM context injection (system prompt age bracketing)
 *   - Mobile Sentry age-gating (under-13 events disabled unless consented —
 *     `apps/mobile/src/lib/sentry.ts`). API-side Sentry has no age gate; its
 *     PII backstop is the field-denylist `beforeSend` scrubber
 *     (`apps/api/src/services/sentry.ts`'s `scrubSentryEvent`) [WI-1990].
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
  // Server-derived profile shape used by owner/admin capability gates.
  // Proxy mode is separately derived from callerPersonId !== profileId;
  // isOwner:false is also the normal shape for a credentialed learner acting
  // as self.
  isOwner: boolean;
  // [Issue 901] How the profile identity was resolved by profileScopeMiddleware:
  //   - 'explicit-header': X-Profile-Id was supplied and verified to belong to
  //     the authenticated caller's operation set.
  //   - 'auto': no X-Profile-Id header was sent, so the middleware synthesized
  //     the authenticated caller's own login-bound Person.
  //
  // Owner-only gates still require an explicitly selected owner profile; an
  // auto-resolved self is valid for learner/self reads but not an affirmative
  // transition into owner capabilities.
  resolvedVia: 'auto' | 'explicit-header';
}

export type ProfileScopeEnv = {
  Variables: {
    db: Database;
    account: Account;
    callerPersonId: string | undefined;
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

    // When X-Profile-Id is absent, auto-resolve to the authenticated caller's
    // own Person. Never substitute the organization's owner: Person authority
    // comes from the server-resolved login binding, not family membership.
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
      const callerPersonId = c.get('callerPersonId');
      if (db && account && callerPersonId) {
        try {
          const callerScope = await getPersonScope(
            db,
            callerPersonId,
            account.id,
            callerPersonId,
          );
          if (callerScope) {
            c.set('profileId', callerScope.profileId);
            c.set('profileMeta', {
              ...callerScope.meta,
              resolvedVia: 'auto',
            });
          } else {
            // [WI-2128] An authenticated account with a login-bound caller but
            // no operable caller scope is an identity-graph mismatch. Do not
            // silently downgrade it to an account-level request: downstream
            // routes could otherwise infer capability from organization
            // membership. Emit categories only; Person/account identifiers are
            // deliberately excluded.
            logger.warn('profile_scope.authority_mismatch', {
              resolutionPath: 'auto',
              reason: 'caller-scope-not-operable',
            });
            return forbidden(c, 'Profile authority could not be resolved');
          }
          // fall through to the shared `await next()` below (outside try).
        } catch (err) {
          logger.error('profile_scope.auto_resolve_failed', {
            errorType: err instanceof Error ? err.name : 'unknown',
          });
          const resolutionFailure = new Error(
            'Profile scope auto-resolution failed',
            {
              cause:
                err instanceof Error
                  ? { errorType: err.name }
                  : { errorType: 'unknown' },
            },
          );
          captureException(resolutionFailure, {
            tags: { surface: 'profile_scope.auto_resolve_failure' },
            extra: {
              context: 'profile-scope.auto_resolve_caller',
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
    const callerPersonId = c.get('callerPersonId');
    if (!callerPersonId) {
      return forbidden(c, 'Profile authority could not be resolved');
    }
    // Membership is visibility, not operation authority. The caller may
    // install only self or an uncredentialed charge they actively guard as
    // request context. Route-specific write/elevation gates remain additional
    // constraints; they never widen this central operation boundary.
    const scope = await getPersonScope(
      db,
      profileIdHeader,
      account.id,
      callerPersonId,
    );
    if (!scope) {
      logger.warn('profile_scope.ownership_mismatch', {
        reason: 'not-operable',
      });
      return forbidden(c, 'Profile does not belong to this account');
    }
    c.set('profileId', scope.profileId);
    // [Issue 901] Explicitly selected + verified profile — eligible for the
    // owner-only gates if it is in fact the owner.
    c.set('profileMeta', { ...scope.meta, resolvedVia: 'explicit-header' });
    await next();
    return;
  },
);
