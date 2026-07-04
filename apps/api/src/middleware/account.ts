// ---------------------------------------------------------------------------
// Account Middleware — resolves Clerk user → local Account
// Runs after auth + database middleware. Skips public routes (no user set).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import type { Account } from '../services/account';
import { resolveVerifiedClerkEmail } from '../services/clerk-user';
import { withTransientDatabaseRetry } from '../services/transient-db-retry';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';
import { resolveIdentityV2 } from '../services/identity-v2/identity-resolve';
import { ensureInitialTrialSubscriptionV2 } from '../services/billing/billing-v2';
import type { AuthUser } from './auth';
import type { Database } from '@eduagent/database';

const logger = createLogger();

/**
 * [CUT-B1 §2.2a] The pre-graph identity context. When no `login` row exists
 * yet (onboarding not completed), accountMiddleware
 * does NOT JIT-create an account — it sets this graphless context and leaves
 * `account` unset. The bootstrap route (POST /v1/profiles) reads it to create
 * the graph. The legacy path never sets this.
 */
export interface ClerkIdentity {
  clerkUserId: string;
  verifiedEmail: string;
}

export type AccountEnv = {
  Bindings: {
    CLERK_SECRET_KEY?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    // [CUT-B1] Set only on the v2 pre-graph path (no login row yet).
    clerkIdentity: ClerkIdentity | undefined;
    // [WI-774] The authenticated caller's own person id, resolved from the
    // login→person binding on the v2 path. Used by the write-authority guard
    // (verifyPersonOwnershipV2) to prove self-or-edge authority. Unset on the
    // legacy path and pre-graph.
    callerPersonId: string | undefined;
  };
};

/**
 * [CUT-B1 §2.2a] Routes reachable BEFORE the identity graph exists (flag-on).
 * `requireAccountMiddleware` v2 keeps the hard 401 for everything except these
 * — they return their documented default shapes pre-graph:
 *   - GET  /v1/profiles            → empty list
 *   - POST /v1/profiles            → the bootstrap (creates the graph)
 *   - GET  /v1/billing/status      → free-tier defaults
 *   - GET  /v1/subscription/status → free-tier defaults
 *   - GET  /v1/consent/my-status   → null consent status
 *   - POST /v1/activation-events   → [WI-1504] app_opened / signup_started
 *     fire before the identity graph exists; the write is profileId-nullable
 *     (see packages/database/src/schema/activation-events.ts)
 * Matched against the post-basePath path (includes /v1), like auth.ts.
 */
interface PreGraphRoute {
  method: string;
  path: string;
}
const PRE_GRAPH_ALLOWLIST: readonly PreGraphRoute[] = [
  { method: 'GET', path: '/v1/profiles' },
  { method: 'POST', path: '/v1/profiles' },
  { method: 'GET', path: '/v1/billing/status' },
  { method: 'GET', path: '/v1/subscription/status' },
  { method: 'GET', path: '/v1/consent/my-status' },
  { method: 'POST', path: '/v1/activation-events' },
];

function isPreGraphAllowed(method: string, path: string): boolean {
  return PRE_GRAPH_ALLOWLIST.some(
    (r) => r.method === method && r.path === path,
  );
}

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
        // Retained: only available Clerk audit join key — no accountId at this point
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
        // Retained: only available Clerk audit join key — no accountId at this point
        clerkUserId: user.userId,
        source: verifiedEmail.source,
      });
    }

    // [CUT-B1 §2.2a] v2: resolve the identity graph and DEFER provisioning
    // (no JIT create). When the graph exists, set the byte-identical account
    // context; when it does not (pre-graph — onboarding not completed), set the
    // graphless clerkIdentity and leave `account` unset for the pre-graph
    // allowlist to handle.
    const resolved = await withTransientDatabaseRetry(
      'accountMiddleware.resolveIdentityV2',
      () => resolveIdentityV2(db, user.userId),
      // Pure read — safe to retry on a dropped connection.
      { idempotent: true },
    );
    if (resolved) {
      c.set('account', resolved.account);
      // [WI-774] Surface the authenticated caller's own person id for the
      // write-authority guard. resolved.personId is the login→person binding,
      // never request-supplied.
      c.set('callerPersonId', resolved.personId);
      try {
        await withTransientDatabaseRetry(
          'accountMiddleware.ensureInitialTrialSubscriptionV2',
          () => ensureInitialTrialSubscriptionV2(db, resolved.account.id),
          { idempotent: true },
        );
      } catch (error) {
        logger.error('billing.v2.initial_trial_missing_repair_failed', {
          accountId: resolved.account.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        captureException(error, {
          tags: { surface: 'billing.v2.initial_trial_repair' },
        });
      }
    } else {
      c.set('clerkIdentity', {
        clerkUserId: user.userId,
        verifiedEmail: verifiedEmail.email,
      });
    }
    return next();
  },
);

/**
 * [CR-353] Centralized account-presence enforcement middleware.
 *
 * authMiddleware sets `user` for all non-public paths and returns 401 for
 * unauthenticated requests. accountMiddleware then resolves user → account.
 * If middleware ordering ever regresses (a route mounts outside the chain,
 * or accountMiddleware is conditionally skipped), `c.get('account')` is
 * undefined at the route handler and `account.id` throws TypeError → 500.
 *
 * This middleware is the single centralized enforcement point: it runs after
 * accountMiddleware and returns a structured 401 if user is set but account
 * is not, ensuring every authenticated route handler can trust `c.get('account')`.
 *
 * Public routes (no user set by authMiddleware) are transparently skipped.
 *
 * Mount in index.ts immediately after accountMiddleware:
 *   api.use('*', accountMiddleware);
 *   api.use('*', requireAccountMiddleware);
 */
export const requireAccountMiddleware = createMiddleware<AccountEnv>(
  async (c, next) => {
    const user = c.get('user');
    // Public routes — authMiddleware did not set user; allow through.
    if (!user) {
      return next();
    }
    // Authenticated route — account MUST be set by accountMiddleware.
    // If it is not, middleware ordering has regressed; return a structured
    // 401 rather than letting the route handler crash with TypeError → 500.
    const account = c.get('account');
    if (!account) {
      // [CUT-B1 §2.2a] v2 pre-graph allowlist: a freshly-signed-up user has no
      // graph yet (accountMiddleware set clerkIdentity instead of account). The
      // bootstrap + a small set of status routes must be reachable pre-graph;
      // everything else keeps the hard 401.
      const clerkIdentity = c.get('clerkIdentity');
      if (clerkIdentity && isPreGraphAllowed(c.req.method, c.req.path)) {
        return next();
      }
      return c.json(
        {
          code: ERROR_CODES.UNAUTHORIZED,
          message:
            'Account required — authenticated user has no resolved account. This is a server-side middleware ordering fault.',
        },
        401,
      );
    }
    return next();
  },
);
