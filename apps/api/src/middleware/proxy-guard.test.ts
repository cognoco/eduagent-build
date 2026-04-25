import { Hono } from 'hono';
import { assertNotProxyMode } from './proxy-guard';

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

// Break test: verify a real guarded route returns 403 when X-Proxy-Mode is set.
// Targets bookmarks.delete because it is the smallest guarded handler
// (no request body, no path-parameter coupling to a seeded DB record).
import { bookmarkRoutes } from '../routes/bookmarks';

describe('assertNotProxyMode — real route integration', () => {
  it('returns 403 from bookmarks DELETE when X-Proxy-Mode: true, without touching the DB', async () => {
    const app = new Hono();
    // Mock the middleware chain the route expects (db, profileId) — these
    // should NOT be called, because the guard must short-circuit first.
    const dbCalled = jest.fn();
    app.use('*', async (c, next) => {
      c.set('db', new Proxy({}, { get: () => dbCalled }));
      c.set('profileId', 'profile-test');
      await next();
    });
    app.route('/', bookmarkRoutes);

    const res = await app.request(
      '/bookmarks/00000000-0000-0000-0000-000000000000',
      {
        method: 'DELETE',
        headers: { 'X-Proxy-Mode': 'true' },
      }
    );

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });
});
