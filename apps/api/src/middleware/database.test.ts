// ---------------------------------------------------------------------------
// Database Middleware Tests
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  db: { mock: true },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const mockCaptureException = jest.fn();
jest.mock('../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
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

  it('calls createDatabase with DATABASE_URL and onTransactionFallback from env [P-6]', async () => {
    const app = new Hono<{
      Bindings: { DATABASE_URL: string };
      Variables: { db: unknown };
    }>();
    app.use('*', databaseMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test', {}, TEST_ENV);

    // [P-6] Middleware must pass onTransactionFallback so the neon-http
    // transaction fallback is queryable in production (not just console.warn).
    expect(createDatabase).toHaveBeenCalledWith(
      TEST_ENV.DATABASE_URL,
      expect.objectContaining({
        onTransactionFallback: expect.any(Function),
      })
    );
  });

  it('[P-6] onTransactionFallback invokes captureException for observability', async () => {
    const app = new Hono<{
      Bindings: { DATABASE_URL: string };
      Variables: { db: unknown };
    }>();
    app.use('*', databaseMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test', {}, TEST_ENV);

    const [, options] = (createDatabase as jest.Mock).mock.calls[0];
    const fallbackError = new Error(
      'No transactions support in neon-http driver'
    );
    options.onTransactionFallback(fallbackError);

    expect(mockCaptureException).toHaveBeenCalledWith(
      fallbackError,
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'neon-http.transaction-fallback',
        }),
      })
    );
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
