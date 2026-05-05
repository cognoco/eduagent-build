import { Hono } from 'hono';
import { assertNotProxyMode } from './proxy-guard';
import { bookmarkRoutes } from '../routes/bookmarks';
import { noteRoutes } from '../routes/notes';

function createApp(): InstanceType<typeof Hono> {
  const app = new Hono();
  // [CR-PROXY-GUARD-FAIL-CLOSED] profileScopeMiddleware always sets
  // profileMeta in production; mirror that here so the header-only path
  // remains exercised. A separate suite below covers the fail-closed
  // path when profileMeta is intentionally absent.
  app.use('*', async (c, next) => {
    c.set('profileMeta' as never, { isOwner: true });
    await next();
  });
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

// ---------------------------------------------------------------------------
// [BREAK / BUG-975 / CCR-PR126-H-1] Fail-closed when profileMeta is absent.
//
// Pre-fix, if profileScopeMiddleware did not run (or auto-resolve failed
// silently), profileMeta was undefined and the server-derived check was
// skipped — leaving only the client-controlled X-Proxy-Mode header guarding
// writes. Post-fix, missing profileMeta is itself a 403 because ownership
// cannot be verified server-side.
// ---------------------------------------------------------------------------

describe('assertNotProxyMode — fail-closed when profileMeta is absent [BUG-975]', () => {
  function createAppNoMeta() {
    const app = new Hono();
    app.post('/test', (c) => {
      assertNotProxyMode(c);
      return c.json({ ok: true });
    });
    return app;
  }

  it('[BREAK] throws 403 when profileMeta is undefined and X-Proxy-Mode header is absent', async () => {
    const app = createAppNoMeta();
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Not available in proxy mode');
  });

  it('[BREAK] throws 403 when profileMeta is undefined even when X-Proxy-Mode: false is sent', async () => {
    const app = createAppNoMeta();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'X-Proxy-Mode': 'false' },
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
      c.set('profileMeta' as never, { isOwner: true });
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

  // [CR-PROXY-4 / BREAK] End-to-end coverage for the server-derived path:
  // a non-owner profile injected via profileMeta (the real production code
  // path — set by profileScopeMiddleware after verifying X-Profile-Id) must
  // be blocked from mutating bookmarks even when the X-Proxy-Mode header is
  // omitted. This locks in the SEC-2 fix end-to-end so that a client which
  // simply drops the header cannot regain write access.
  it('[BREAK] returns 403 from bookmarks DELETE when profileMeta.isOwner=false and header is absent', async () => {
    const app = new Hono();
    const dbCalled = jest.fn();

    app.use('*', async (c, next) => {
      c.set('db' as never, new Proxy({}, { get: () => dbCalled }));
      c.set('profileId' as never, 'profile-test');
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    app.route('/', bookmarkRoutes);

    const res = await app.request(
      '/bookmarks/00000000-0000-4000-8000-000000000000',
      {
        method: 'DELETE',
      }
    );

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });

  // [BREAK / BUG-973 / CCR-PR126-C-2] POST /bookmarks must reject proxy
  // sessions just like DELETE. A non-owner profile injected via profileMeta
  // (the production code path — set by profileScopeMiddleware after verifying
  // X-Profile-Id) must be blocked from creating bookmarks even when the
  // X-Proxy-Mode header is omitted, and the DB must never be touched.
  it('[BREAK] returns 403 from bookmarks POST when profileMeta.isOwner=false and header is absent', async () => {
    const app = new Hono();
    const dbCalled = jest.fn();

    app.use('*', async (c, next) => {
      c.set('db' as never, new Proxy({}, { get: () => dbCalled }));
      c.set('profileId' as never, 'profile-test');
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    app.route('/', bookmarkRoutes);

    const res = await app.request('/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: '00000000-0000-4000-8000-000000000000' }),
    });

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });

  it('[BREAK] returns 403 from bookmarks POST when X-Proxy-Mode: true, without touching the DB', async () => {
    const app = new Hono();
    const dbCalled = jest.fn();

    app.use('*', async (c, next) => {
      c.set('db' as never, new Proxy({}, { get: () => dbCalled }));
      c.set('profileId' as never, 'profile-test');
      c.set('profileMeta' as never, { isOwner: true });
      await next();
    });
    app.route('/', bookmarkRoutes);

    const res = await app.request('/bookmarks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Mode': 'true',
      },
      body: JSON.stringify({ eventId: '00000000-0000-4000-8000-000000000000' }),
    });

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });

  // [BUG-973 / CCR-PR145-C-1 / BREAK] Notes write endpoints must reject proxy
  // sessions. A non-owner profile (parent acting on child) must be blocked from
  // creating, updating, or deleting notes on the child's profile.
  it('[BREAK] returns 403 from notes POST when profileMeta.isOwner=false and header is absent', async () => {
    const app = new Hono();
    const dbCalled = jest.fn();

    app.use('*', async (c, next) => {
      c.set('db' as never, new Proxy({}, { get: () => dbCalled }));
      c.set('profileId' as never, 'profile-test');
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    app.route('/', noteRoutes);

    const res = await app.request(
      '/subjects/00000000-0000-4000-8000-000000000001/topics/00000000-0000-4000-8000-000000000002/notes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'note text' }),
      }
    );

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });

  it('[BREAK] returns 403 from notes PATCH when profileMeta.isOwner=false and header is absent', async () => {
    const app = new Hono();
    const dbCalled = jest.fn();

    app.use('*', async (c, next) => {
      c.set('db' as never, new Proxy({}, { get: () => dbCalled }));
      c.set('profileId' as never, 'profile-test');
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    app.route('/', noteRoutes);

    const res = await app.request(
      '/notes/00000000-0000-4000-8000-000000000001',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'updated text' }),
      }
    );

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });

  it('[BREAK] returns 403 from notes DELETE when profileMeta.isOwner=false and header is absent', async () => {
    const app = new Hono();
    const dbCalled = jest.fn();

    app.use('*', async (c, next) => {
      c.set('db' as never, new Proxy({}, { get: () => dbCalled }));
      c.set('profileId' as never, 'profile-test');
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    app.route('/', noteRoutes);

    const res = await app.request(
      '/notes/00000000-0000-4000-8000-000000000001',
      { method: 'DELETE' }
    );

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });
});
