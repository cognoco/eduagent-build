const { createInngestTransportCapture } =
  require('../test-utils/inngest-transport-capture') as typeof import('../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();
const mockCaptureException = jest.fn();

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return { ...actual, ...mockInngestTransport.module };
});

jest.mock(
  '../services/sentry' /* gc1-allow: Sentry service is the external observability boundary for this route test */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

import { Hono } from 'hono';
import { maintenanceRoutes } from './maintenance';

type TestEnv = {
  Bindings: {
    ENVIRONMENT?: string;
    MAINTENANCE_SECRET?: string;
    SENTRY_DSN?: string;
  };
};

function createTestApp(bindings: TestEnv['Bindings']) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.env = bindings;
    await next();
  });
  app.route('/', maintenanceRoutes);
  return app;
}

describe('maintenanceRoutes', () => {
  beforeEach(() => {
    mockInngestTransport.clear();
    mockCaptureException.mockClear();
  });

  it('rejects sentry smoke without the maintenance secret', async () => {
    const app = createTestApp({ MAINTENANCE_SECRET: 'secret' });

    const res = await app.request('/maintenance/sentry-smoke', {
      method: 'POST',
    });

    expect(res.status).toBe(403);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('captures a sentry smoke exception with a valid secret', async () => {
    const app = createTestApp({
      ENVIRONMENT: 'production',
      MAINTENANCE_SECRET: 'secret',
      SENTRY_DSN: 'https://example@sentry.io/123',
    });

    const res = await app.request('/maintenance/sentry-smoke', {
      method: 'POST',
      headers: { 'X-Maintenance-Secret': 'secret' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      captured: boolean;
      smokeId: string;
      sentryConfigured: boolean;
    };
    expect(body).toEqual({
      captured: true,
      smokeId: expect.any(String),
      sentryConfigured: true,
    });
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      requestPath: '/maintenance/sentry-smoke',
      extra: {
        surface: 'maintenance.sentry-smoke',
        smokeId: body.smokeId,
        environment: 'production',
        sentryConfigured: true,
      },
    });
  });

  it('rejects memory facts backfill without the maintenance secret', async () => {
    const app = createTestApp({ MAINTENANCE_SECRET: 'secret' });

    const res = await app.request('/maintenance/memory-facts-backfill', {
      method: 'POST',
    });

    expect(res.status).toBe(403);
    expect(mockInngestTransport.sentEvents).toHaveLength(0);
  });

  it('dispatches the memory facts backfill event with a valid secret', async () => {
    const app = createTestApp({
      ENVIRONMENT: 'staging',
      MAINTENANCE_SECRET: 'secret',
    });

    const res = await app.request('/maintenance/memory-facts-backfill', {
      method: 'POST',
      headers: { 'X-Maintenance-Secret': 'secret' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: true });
    expect(mockInngestTransport.sentPayloads()).toEqual([
      {
        name: 'admin/memory-facts-backfill.requested',
        data: {
          requestedAt: expect.any(String),
          environment: 'staging',
        },
      },
    ]);
  });

  it('rejects self progress backfill without the maintenance secret', async () => {
    const app = createTestApp({ MAINTENANCE_SECRET: 'secret' });

    const res = await app.request(
      '/maintenance/progress-self-reports-backfill',
      {
        method: 'POST',
      },
    );

    expect(res.status).toBe(403);
    expect(mockInngestTransport.sentEvents).toHaveLength(0);
  });

  it('dispatches the self progress backfill event with a valid secret', async () => {
    const app = createTestApp({
      ENVIRONMENT: 'staging',
      MAINTENANCE_SECRET: 'secret',
    });

    const res = await app.request(
      '/maintenance/progress-self-reports-backfill',
      {
        method: 'POST',
        headers: { 'X-Maintenance-Secret': 'secret' },
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: true });
    expect(mockInngestTransport.sentPayloads()).toEqual([
      {
        name: 'admin/progress-self-reports-backfill.requested',
        data: {
          requestedAt: expect.any(String),
          environment: 'staging',
        },
      },
    ]);
  });
});
