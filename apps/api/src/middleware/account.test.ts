import { Hono } from 'hono';
import { accountMiddleware } from './account';
import type { AppVariables } from '../types/hono';

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('accountMiddleware', () => {
  it('sets account in context for authenticated requests', async () => {
    const app = new Hono<{ Variables: AppVariables }>();

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
    const app = new Hono<{ Variables: AppVariables }>();

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
    const app = new Hono<{ Variables: AppVariables }>();

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
    const app = new Hono<{ Variables: AppVariables }>();

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
    const app = new Hono<{ Variables: AppVariables }>();

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

  it('[BREAK][BUG-497] rejects with 401 when email_verified claim is absent from JWT', async () => {
    const app = new Hono<{ Variables: AppVariables }>();

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
    const app = new Hono<{ Variables: AppVariables }>();

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
});
