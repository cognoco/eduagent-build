// ---------------------------------------------------------------------------
// Database Middleware Tests
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  db: { mock: true },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

import { Hono } from 'hono';
import { databaseMiddleware } from './database';
import { closeDatabase, createDatabase } from '@eduagent/database';

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

    // Phase 0.0: neon-serverless driver — createDatabase only needs the URL.
    // onTransactionFallback no longer exists; the WS driver throws natively.
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

  it('closes the request database handle after the handler finishes', async () => {
    const app = new Hono<{
      Bindings: { DATABASE_URL: string };
      Variables: { db: unknown };
    }>();
    app.use('*', databaseMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test', {}, TEST_ENV);

    expect(closeDatabase).toHaveBeenCalledWith(mockDatabaseModule.db);
  });

  it('keeps the request database handle open until SSE body consumption finishes', async () => {
    const app = new Hono<{
      Bindings: { DATABASE_URL: string };
      Variables: { db: unknown };
    }>();
    app.use('*', databaseMiddleware);
    app.get('/stream', () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: ok\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const res = await app.request('/stream', {}, TEST_ENV);

    expect(closeDatabase).not.toHaveBeenCalled();
    await expect(res.text()).resolves.toBe('data: ok\n\n');
    expect(closeDatabase).toHaveBeenCalledWith(mockDatabaseModule.db);
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
    expect(closeDatabase).not.toHaveBeenCalled();
    expect(dbFromContext).toBeUndefined();
  });
});
