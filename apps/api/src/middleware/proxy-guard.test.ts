import { Hono } from 'hono';
import { assertNotProxyMode } from './proxy-guard';
import { bookmarkRoutes } from '../routes/bookmarks';

function createApp(): InstanceType<typeof Hono> {
  const app = new Hono();
  app.post('/test', (c) => {
    assertNotProxyMode(c);
    return c.json({ ok: true });
  });
  return app;
}

describe('assertNotProxyMode', () => {
  it('throws 403 when X-Proxy-Mode: true', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'X-Proxy-Mode': 'true' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Not available in proxy mode');
  });

  it('allows requests without X-Proxy-Mode', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('allows requests with X-Proxy-Mode set to anything other than "true"', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'X-Proxy-Mode': 'false' },
    });
    expect(res.status).toBe(200);
  });
});

describe('assertNotProxyMode - real route integration', () => {
  it('returns 403 from bookmarks DELETE when X-Proxy-Mode: true, without touching the DB', async () => {
    const app = new Hono();
    const dbCalled = jest.fn();

    app.use('*', async (c, next) => {
      c.set('db' as never, new Proxy({}, { get: () => dbCalled }));
      c.set('profileId' as never, 'profile-test');
      await next();
    });
    app.route('/', bookmarkRoutes);

    const res = await app.request(
      '/bookmarks/00000000-0000-4000-8000-000000000000',
      {
        method: 'DELETE',
        headers: { 'X-Proxy-Mode': 'true' },
      }
    );

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });
});
