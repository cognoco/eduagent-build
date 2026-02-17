import { Hono } from 'hono';
import { accountMiddleware } from './account';
import type { Account } from '../services/account';

// Mock the account service
const mockAccount: Account = {
  id: 'test-account-id',
  clerkUserId: 'user_test',
  email: 'test@example.com',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

import { findOrCreateAccount } from '../services/account';

describe('accountMiddleware', () => {
  it('sets account in context for authenticated requests', async () => {
    const app = new Hono();

    // Simulate auth middleware setting user
    app.use('*', async (c, next) => {
      c.set('user' as never, {
        userId: 'user_test',
        email: 'test@example.com',
      });
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
    const app = new Hono();

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

  it('passes correct clerkUserId and email to findOrCreateAccount', async () => {
    const app = new Hono();

    app.use('*', async (c, next) => {
      c.set('user' as never, { userId: 'clerk_abc', email: 'user@test.com' });
      c.set('db' as never, {});
      await next();
    });
    app.use('*', accountMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');

    expect(findOrCreateAccount).toHaveBeenCalledWith(
      {},
      'clerk_abc',
      'user@test.com'
    );
  });
});
