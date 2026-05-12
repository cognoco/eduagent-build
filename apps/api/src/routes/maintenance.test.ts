jest.mock('../inngest/client' /* gc1-allow: unit test boundary */, () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { Hono } from 'hono';
import { inngest } from '../inngest/client';
import { maintenanceRoutes } from './maintenance';

type TestEnv = {
  Bindings: {
    ENVIRONMENT?: string;
    MAINTENANCE_SECRET?: string;
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
    jest.clearAllMocks();
  });

  it('rejects memory facts backfill without the maintenance secret', async () => {
    const app = createTestApp({ MAINTENANCE_SECRET: 'secret' });

    const res = await app.request('/maintenance/memory-facts-backfill', {
      method: 'POST',
    });

    expect(res.status).toBe(403);
    expect(inngest.send).not.toHaveBeenCalled();
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
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'admin/memory-facts-backfill.requested',
      data: {
        requestedAt: expect.any(String),
        environment: 'staging',
      },
    });
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
    expect(inngest.send).not.toHaveBeenCalled();
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
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'admin/progress-self-reports-backfill.requested',
      data: {
        requestedAt: expect.any(String),
        environment: 'staging',
      },
    });
  });
});
