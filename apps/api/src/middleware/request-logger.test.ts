import { Hono } from 'hono';
import { requestLogger } from './request-logger';
import type { LogEntry } from '../services/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RequestLoggerEnv = {
  Bindings: { ENVIRONMENT: string; LOG_LEVEL?: string };
  Variables: { user?: { userId: string; profileId?: string } };
};

function createTestApp(): Hono<RequestLoggerEnv> {
  const app = new Hono<RequestLoggerEnv>().basePath('/v1');
  app.use('*', requestLogger);
  return app;
}

const TEST_ENV = {
  ENVIRONMENT: 'test',
  LOG_LEVEL: 'debug',
};

function captureConsole(): {
  logs: string[];
  warns: string[];
  errors: string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: unknown[]) => logs.push(String(args[0]));
  console.warn = (...args: unknown[]) => warns.push(String(args[0]));
  console.error = (...args: unknown[]) => errors.push(String(args[0]));

  return {
    logs,
    warns,
    errors,
    restore: () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}

function parseEntry(raw: string): LogEntry {
  return JSON.parse(raw) as LogEntry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requestLogger middleware', () => {
  let captured: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    captured = captureConsole();
  });

  afterEach(() => {
    captured.restore();
  });

  // -------------------------------------------------------------------------
  // Status-based log levels
  // -------------------------------------------------------------------------

  it('logs successful requests at info level', async () => {
    const app = createTestApp();
    app.get('/ok', (c) => c.json({ status: 'ok' }));

    await app.request('/v1/ok', {}, TEST_ENV);

    expect(captured.logs).toHaveLength(1);
    const entry = parseEntry(captured.logs[0]);
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Request completed');
    expect(entry.context?.method).toBe('GET');
    expect(entry.context?.path).toBe('/v1/ok');
    expect(entry.context?.status).toBe(200);
    expect(typeof entry.context?.latencyMs).toBe('number');
  });

  it('logs 4xx responses at warn level', async () => {
    const app = createTestApp();
    app.get('/missing', (c) => c.json({ error: 'not found' }, 404));

    await app.request('/v1/missing', {}, TEST_ENV);

    expect(captured.warns).toHaveLength(1);
    const entry = parseEntry(captured.warns[0]);
    expect(entry.level).toBe('warn');
    expect(entry.message).toBe('Client error');
    expect(entry.context?.status).toBe(404);
  });

  it('logs 5xx responses at error level', async () => {
    const app = createTestApp();
    app.get('/fail', (c) => c.json({ error: 'internal' }, 500));

    await app.request('/v1/fail', {}, TEST_ENV);

    expect(captured.errors).toHaveLength(1);
    const entry = parseEntry(captured.errors[0]);
    expect(entry.level).toBe('error');
    expect(entry.message).toBe('Request failed');
    expect(entry.context?.status).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Profile context
  // -------------------------------------------------------------------------

  it('includes profileId when user is set', async () => {
    const app = createTestApp();

    // Simulate auth middleware setting user before request-logger reads it
    app.get('/authed', (c) => {
      // In real app, auth middleware sets this before the handler runs.
      // For this test, we set it inside the handler — the request-logger
      // reads c.get('user') AFTER next(), so it picks it up.
      c.set('user', { userId: 'u1', profileId: 'p1' });
      return c.json({ ok: true });
    });

    await app.request('/v1/authed', {}, TEST_ENV);

    expect(captured.logs).toHaveLength(1);
    const entry = parseEntry(captured.logs[0]);
    expect(entry.context?.profileId).toBe('p1');
  });

  it('omits profileId when user has no profile', async () => {
    const app = createTestApp();
    app.get('/no-profile', (c) => {
      c.set('user', { userId: 'u2' });
      return c.json({ ok: true });
    });

    await app.request('/v1/no-profile', {}, TEST_ENV);

    expect(captured.logs).toHaveLength(1);
    const entry = parseEntry(captured.logs[0]);
    expect(entry.context?.profileId).toBeUndefined();
  });

  it('omits profileId when no user is set', async () => {
    const app = createTestApp();
    app.get('/public', (c) => c.json({ ok: true }));

    await app.request('/v1/public', {}, TEST_ENV);

    expect(captured.logs).toHaveLength(1);
    const entry = parseEntry(captured.logs[0]);
    expect(entry.context?.profileId).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Log level filtering
  // -------------------------------------------------------------------------

  it('respects LOG_LEVEL from environment', async () => {
    const app = createTestApp();
    app.get('/quiet', (c) => c.json({ ok: true }));

    // With LOG_LEVEL=error, info-level request logs should be suppressed
    await app.request('/v1/quiet', {}, { ...TEST_ENV, LOG_LEVEL: 'error' });

    const totalEmitted =
      captured.logs.length + captured.warns.length + captured.errors.length;
    expect(totalEmitted).toBe(0);
  });

  it('defaults to info when LOG_LEVEL is not set', async () => {
    const app = createTestApp();
    app.get('/default', (c) => c.json({ ok: true }));

    await app.request('/v1/default', {}, { ENVIRONMENT: 'test' });

    expect(captured.logs).toHaveLength(1);
    const entry = parseEntry(captured.logs[0]);
    expect(entry.level).toBe('info');
  });
});
