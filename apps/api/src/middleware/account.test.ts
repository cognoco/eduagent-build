import { Hono } from 'hono';
import { accountMiddleware, requireAccountMiddleware } from './account';
import { clearVerifiedClerkEmailCacheForTest } from '../services/clerk-user';
import type { AppVariables } from '../types/hono';

jest.mock('../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return { ...actual, captureException: jest.fn() };
});

const mockResolveIdentityV2 = jest.fn();
jest.mock(
  '../services/identity-v2/identity-resolve' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/identity-v2/identity-resolve',
    ) as typeof import('../services/identity-v2/identity-resolve');
    return {
      ...actual,
      resolveIdentityV2: (...args: unknown[]) => mockResolveIdentityV2(...args),
    };
  },
);

const mockEnsureInitialTrialSubscriptionV2 = jest.fn();
jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/billing/billing-v2',
    ) as typeof import('../services/billing/billing-v2');
    return {
      ...actual,
      ensureInitialTrialSubscriptionV2: (...args: unknown[]) =>
        mockEnsureInitialTrialSubscriptionV2(...args),
    };
  },
);

import { captureException } from '../services/sentry';

// Mock the account service
jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

import { findOrCreateAccount } from '../services/account';

type TestEnv = {
  Bindings: { CLERK_SECRET_KEY?: string };
  Variables: AppVariables;
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  clearVerifiedClerkEmailCacheForTest();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearVerifiedClerkEmailCacheForTest();
});

describe('accountMiddleware', () => {
  it('sets account in context for authenticated requests', async () => {
    const app = new Hono<TestEnv>();

    // Simulate auth middleware setting user (email_verified = true for happy path)
    app.use('*', async (c, next) => {
      c.set('user', {
        userId: 'user_test',
        email: 'test@example.com',
        emailVerified: true,
      } as AppVariables['user']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => {
      const account = c.get('account');
      return c.json({ accountId: account?.id });
    });

    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accountId).toBe('test-account-id');
  });

  it('skips for unauthenticated requests', async () => {
    const app = new Hono<TestEnv>();

    // No auth middleware — user is not set
    app.use('*', accountMiddleware);
    app.get('/test', (c) => {
      const account = c.get('account');
      return c.json({ hasAccount: !!account });
    });

    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasAccount).toBe(false);
  });

  it('rejects with 401 when email is missing from JWT claims', async () => {
    const app = new Hono<TestEnv>();

    app.use('*', async (c, next) => {
      c.set('user', { userId: 'clerk_no_email' } as AppVariables['user']);
      c.set('db', {} as AppVariables['db']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.message).toMatch(/email/i);
    expect(findOrCreateAccount).not.toHaveBeenCalled();
  });

  it('passes correct clerkUserId and email to findOrCreateAccount', async () => {
    const app = new Hono<TestEnv>();

    app.use('*', async (c, next) => {
      c.set('user', {
        userId: 'clerk_abc',
        email: 'user@test.com',
        emailVerified: true,
      } as AppVariables['user']);
      c.set('db', {} as AppVariables['db']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');

    expect(findOrCreateAccount).toHaveBeenCalledWith(
      {},
      'clerk_abc',
      'user@test.com',
    );
  });

  // [BREAK — BUG-497] Middleware must reject requests where the JWT carries
  // an email that Clerk has NOT marked as verified. Using an unverified email
  // to create/look up accounts is an account-identity risk (attacker can
  // inject an email via session template before verification completes).
  it('[BREAK][BUG-497] rejects with 401 when email is present but email_verified is false', async () => {
    const app = new Hono<TestEnv>();

    app.use('*', async (c, next) => {
      c.set('user', {
        userId: 'clerk_unverified',
        email: 'attacker@evil.com',
        emailVerified: false,
      } as AppVariables['user']);
      c.set('db', {} as AppVariables['db']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.message).toMatch(/not verified/i);
    // findOrCreateAccount must never be called with an unverified email
    expect(findOrCreateAccount).not.toHaveBeenCalled();
  });

  it('[BREAK][BUG-1016] accepts when email_verified is absent but Clerk backend confirms primary email', async () => {
    const app = new Hono<TestEnv>();

    globalThis.fetch = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          primary_email_address_id: 'email_primary',
          email_addresses: [
            {
              id: 'email_primary',
              email_address: 'verified@example.com',
              verification: { status: 'verified' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof globalThis.fetch;

    app.use('*', async (c, next) => {
      c.set('user', {
        userId: 'clerk_no_verified_claim',
        email: 'someone@example.com',
      } as AppVariables['user']);
      c.set('db', {} as AppVariables['db']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', undefined, {
      CLERK_SECRET_KEY: 'sk_test_123',
    });

    expect(res.status).toBe(200);
    expect(findOrCreateAccount).toHaveBeenCalledWith(
      {},
      'clerk_no_verified_claim',
      'verified@example.com',
    );
  });

  it('[BREAK][BUG-497] rejects with 401 when email_verified claim is absent and Clerk fallback is unavailable', async () => {
    const app = new Hono<TestEnv>();

    app.use('*', async (c, next) => {
      // emailVerified is deliberately omitted — simulates JWT without the claim
      c.set('user', {
        userId: 'clerk_no_verified_claim',
        email: 'someone@example.com',
      } as AppVariables['user']);
      c.set('db', {} as AppVariables['db']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.message).toMatch(/not verified/i);
    expect(findOrCreateAccount).not.toHaveBeenCalled();
  });

  it('accepts request when email is present and email_verified is true', async () => {
    const app = new Hono<TestEnv>();

    app.use('*', async (c, next) => {
      c.set('user', {
        userId: 'clerk_verified',
        email: 'user@example.com',
        emailVerified: true,
      } as AppVariables['user']);
      c.set('db', {} as AppVariables['db']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(findOrCreateAccount).toHaveBeenCalledWith(
      {},
      'clerk_verified',
      'user@example.com',
    );
  });

  // [WI-820 MUST-FIX] Silent recovery without escalation is banned in
  // billing/auth/webhook code. When ensureInitialTrialSubscriptionV2 fails
  // the catch block must call captureException (not just logger.error) so the
  // failure reaches Sentry. The request must still proceed — the repair failure
  // must not break the user action.
  it('[BREAK][WI-820] escalates to Sentry when billing repair fails, and still calls next()', async () => {
    const repairError = new Error('billing-repair-boom');
    mockEnsureInitialTrialSubscriptionV2.mockRejectedValue(repairError);
    mockResolveIdentityV2.mockResolvedValue({
      account: {
        id: 'acct-v2',
        clerkUserId: 'clerk_v2',
        email: 'v2@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      personId: 'person-v2',
    });

    const app = new Hono<{
      Bindings: { IDENTITY_V2_ENABLED?: string };
      Variables: AppVariables;
    }>();
    app.use('*', async (c, next) => {
      c.set('user', {
        userId: 'clerk_v2',
        email: 'v2@example.com',
        emailVerified: true,
      } as AppVariables['user']);
      c.set('db', {} as AppVariables['db']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', undefined, {
      IDENTITY_V2_ENABLED: 'true',
    });

    // Request must succeed — repair failure must not break the user action.
    expect(res.status).toBe(200);
    // Failure must be escalated to Sentry (not just logged).
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      repairError,
      expect.objectContaining({
        tags: expect.objectContaining({
          surface: 'billing.v2.initial_trial_repair',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// [CR-353] requireAccountMiddleware — break test
//
// The bug: 17+ route handlers use c.get('account') without requireAccount().
// If middleware ordering regresses (accountMiddleware skipped or reordered),
// c.get('account') is undefined and account.id throws TypeError → 500.
//
// The fix: requireAccountMiddleware runs after accountMiddleware and returns a
// structured 401 when user is set but account is not, so all 43+ call sites
// are protected centrally without per-handler changes.
//
// Red-green protocol (manual verification done; preserved here as documentation):
//   1. With fix: test passes (requireAccountMiddleware returns 401)
//   2. Without fix (requireAccountMiddleware removed from chain): route handler
//      throws TypeError "Cannot read properties of undefined (reading 'id')"
//      → 500 instead of 401 — test fails on expect(res.status).toBe(401).
// ---------------------------------------------------------------------------

describe('[CR-353] requireAccountMiddleware — middleware-ordering regression guard', () => {
  it('[BREAK] returns 401 when user is set but account was never resolved (middleware ordering regression)', async () => {
    // Simulate the regression: authMiddleware ran and set user, but
    // accountMiddleware was skipped/removed/reordered and never set account.
    // The route handler would normally crash: c.get('account').id → TypeError.
    const app = new Hono<{ Variables: AppVariables }>();

    // Inject user (authMiddleware did its job)
    app.use('*', async (c, next) => {
      c.set('user', {
        userId: 'user_regression',
        email: 'regression@example.com',
      } as AppVariables['user']);
      await next();
    });

    // Deliberately SKIP accountMiddleware (the regression scenario).
    // requireAccountMiddleware must catch this and return 401.
    app.use('*', requireAccountMiddleware);

    // Route handler — would crash with TypeError if requireAccountMiddleware
    // did not short-circuit. The route should never be reached.
    // Note: TypeScript types account as non-nullable (AppVariables['account']),
    // but at runtime c.get('account') is undefined when accountMiddleware is
    // skipped. The runtime crash is precisely what requireAccountMiddleware prevents.
    app.get('/profiles', (c) => {
      const account = c.get('account');
      return c.json({ accountId: account.id });
    });

    const res = await app.request('/profiles');

    // Must be 401 — NOT 500 (TypeError crash)
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(body.message).toMatch(/account required/i);
  });

  it('passes through transparently when account is correctly set', async () => {
    // Happy path: both accountMiddleware and requireAccountMiddleware in correct order.
    const app = new Hono<{ Variables: AppVariables }>();

    app.use('*', async (c, next) => {
      c.set('user', {
        userId: 'user_happy',
        email: 'happy@example.com',
        emailVerified: true,
      } as AppVariables['user']);
      await next();
    });
    app.use('*', accountMiddleware);
    app.use('*', requireAccountMiddleware);
    app.get('/profiles', (c) => {
      const account = c.get('account');
      return c.json({ accountId: account.id });
    });

    const res = await app.request('/profiles');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accountId).toBe('test-account-id');
  });

  it('skips transparently for public routes where user is not set', async () => {
    // Public path scenario: authMiddleware did not set user (public route).
    // requireAccountMiddleware must let the request through unchanged.
    const app = new Hono<{ Variables: AppVariables }>();

    // No user set — simulates a public route that bypassed authMiddleware
    app.use('*', requireAccountMiddleware);
    app.get('/health', (c) => c.json({ ok: true }));

    const res = await app.request('/health');

    expect(res.status).toBe(200);
  });
});
