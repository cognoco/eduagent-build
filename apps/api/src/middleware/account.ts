// ---------------------------------------------------------------------------
// Account Middleware — resolves Clerk user → local Account
// Runs after auth + database middleware. Skips public routes (no user set).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import {
  findAccountById,
  findOrCreateAccount,
  type Account,
} from '../services/account';
import { isIdentityV1Enabled } from '../config';
import { ensureIdentityV1, resolvePersonByClerkId } from '../services/identity';
import { resolveVerifiedClerkEmail } from '../services/clerk-user';
import { withTransientDatabaseRetry } from '../services/transient-db-retry';
import { createLogger } from '../services/logger';
import type { AuthUser } from './auth';
import type { Database } from '@eduagent/database';

const logger = createLogger();

export type AccountEnv = {
  Bindings: { CLERK_SECRET_KEY?: string; MODE_IDENTITY_V1_ENABLED?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    personId: string | undefined;
    organizationId: string | undefined;
  };
};

export const ACCOUNT_PROVISION_EXEMPT_PATHS = new Set([
  '/invitations/claims/redeem',
]);

export function isAccountProvisionExemptPath(pathname: string): boolean {
  if (ACCOUNT_PROVISION_EXEMPT_PATHS.has(pathname)) {
    return true;
  }
  if (pathname.startsWith('/v1/')) {
    return ACCOUNT_PROVISION_EXEMPT_PATHS.has(pathname.slice(3));
  }
  return false;
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

    if (isIdentityV1Enabled(c.env?.MODE_IDENTITY_V1_ENABLED)) {
      const person = await withTransientDatabaseRetry(
        'accountMiddleware.resolvePersonByClerkId',
        () => resolvePersonByClerkId(db, user.userId),
        { idempotent: true },
      );
      if (person) {
        const account = await withTransientDatabaseRetry(
          'accountMiddleware.findAccountById',
          () => findAccountById(db, person.accountId),
          { idempotent: true },
        );
        await withTransientDatabaseRetry(
          'accountMiddleware.ensureIdentityV1',
          () => ensureIdentityV1(db, account),
          { idempotent: true },
        );
        c.set('account', account);
        c.set('personId', person.id);
        c.set('organizationId', account.id);
        return next();
      }

      if (isAccountProvisionExemptPath(new URL(c.req.url).pathname)) {
        return next();
      }

      const account = await withTransientDatabaseRetry(
        'accountMiddleware.findOrCreateAccount.identityV1',
        () => findOrCreateAccount(db, user.userId, verifiedEmail.email),
        { idempotent: true },
      );
      c.set('account', account);
      c.set('organizationId', account.id);
      return next();
    }

    const account = await withTransientDatabaseRetry(
      'accountMiddleware.findOrCreateAccount',
      () => findOrCreateAccount(db, user.userId, verifiedEmail.email),
      // findOrCreateAccount uses INSERT … ON CONFLICT DO UPDATE (upsert) —
      // safe to retry if the connection drops mid-flight.
      { idempotent: true },
    );
    c.set('account', account);
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
      if (
        isIdentityV1Enabled(c.env?.MODE_IDENTITY_V1_ENABLED) &&
        isAccountProvisionExemptPath(new URL(c.req.url).pathname)
      ) {
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
