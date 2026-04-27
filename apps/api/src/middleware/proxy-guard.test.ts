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

// ---------------------------------------------------------------------------
// [BREAK / SEC-2 / BUG-718] Server-derived proxy-mode break tests.
//
// Pre-fix, the X-Proxy-Mode header was the only signal: a client could omit
// it to gain write access on a child profile. Post-fix, profileMeta.isOwner
// (set server-side after verifying X-Profile-Id ownership) is authoritative.
// ---------------------------------------------------------------------------

function createAppWithProfileMeta(meta: { isOwner: boolean }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('profileMeta' as never, meta);
    await next();
  });
  app.post('/test', (c) => {
    assertNotProxyMode(c);
    return c.json({ ok: true });
  });
  return app;
}

describe('assertNotProxyMode — server-derived proxy mode [BUG-718]', () => {
  it('[BREAK] rejects writes for non-owner profile EVEN when X-Proxy-Mode header is omitted', async () => {
    const app = createAppWithProfileMeta({ isOwner: false });
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Not available in proxy mode');
  });

  it('[BREAK] rejects writes for non-owner profile EVEN when X-Proxy-Mode: false is sent', async () => {
    const app = createAppWithProfileMeta({ isOwner: false });
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'X-Proxy-Mode': 'false' },
    });
    expect(res.status).toBe(403);
  });

  it('allows writes for owner profile when X-Proxy-Mode header is absent', async () => {
    const app = createAppWithProfileMeta({ isOwner: true });
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('still honors X-Proxy-Mode:true on owner profile (cannot relax, can only tighten)', async () => {
    const app = createAppWithProfileMeta({ isOwner: true });
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'X-Proxy-Mode': 'true' },
    });
    expect(res.status).toBe(403);
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
