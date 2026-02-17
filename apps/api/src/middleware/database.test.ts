// ---------------------------------------------------------------------------
// Database Middleware Tests
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({ mock: true }),
}));

import { Hono } from 'hono';
import { databaseMiddleware } from './database';
import { createDatabase } from '@eduagent/database';

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

describe('databaseMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls createDatabase with DATABASE_URL from env', async () => {
    const app = new Hono<{
      Bindings: { DATABASE_URL: string };
      Variables: { db: unknown };
    }>();
    app.use('*', databaseMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test', {}, TEST_ENV);

    expect(createDatabase).toHaveBeenCalledWith(TEST_ENV.DATABASE_URL);
  });

  it('stores db instance in context variables', async () => {
    let dbFromContext: unknown;

    const app = new Hono<{
      Bindings: { DATABASE_URL: string };
      Variables: { db: unknown };
    }>();
    app.use('*', databaseMiddleware);
    app.get('/test', (c) => {
      dbFromContext = c.get('db');
      return c.json({ ok: true });
    });

    await app.request('/test', {}, TEST_ENV);

    expect(dbFromContext).toEqual({ mock: true });
  });

  it('skips database creation when DATABASE_URL is missing', async () => {
    let dbFromContext: unknown = 'sentinel';

    const app = new Hono<{
      Bindings: { DATABASE_URL: string };
      Variables: { db: unknown };
    }>();
    app.use('*', databaseMiddleware);
    app.get('/test', (c) => {
      dbFromContext = c.get('db');
      return c.json({ ok: true });
    });

    const res = await app.request('/test', {}, {});

    expect(res.status).toBe(200);
    expect(createDatabase).not.toHaveBeenCalled();
    expect(dbFromContext).toBeUndefined();
  });
});
