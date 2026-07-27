import { Hono } from 'hono';
import { assertNotProxyMode } from './proxy-guard';
import { bookmarkRoutes } from '../routes/bookmarks';
import { noteRoutes } from '../routes/notes';

// [WI-2398] assertNotProxyMode now also calls assertCanWriteProfile, which
// calls verifyPersonOwnershipV2 — a raw db.select() membership query this
// file's bare `Hono()` test apps (no @eduagent/database mock at all) cannot
// satisfy. Every "allow" scenario in this file is a caller-self write (the
// header profile equals the authenticated caller's own person id, set
// explicitly in each app's middleware below); the cross-account write attack
// this guard exists to close is covered by the real-DB break test in
// tests/integration/wi2398-write-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's mock-free environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

const CALLER_PERSON_ID = 'test-caller-person-id';

function createApp(): InstanceType<typeof Hono> {
  const app = new Hono();
  // [CR-PROXY-GUARD-FAIL-CLOSED] profileScopeMiddleware always sets
  // profileMeta in production; mirror that here so the header-only path
  // remains exercised. A separate suite below covers the fail-closed
  // path when profileMeta is intentionally absent.
  app.use('*', async (c, next) => {
    // [Issue 901] Production profileScopeMiddleware tags an explicitly selected
    // owner profile with resolvedVia:'explicit-header'; mirror that so the
    // owner-pass path is exercised faithfully.
    c.set('profileMeta' as never, {
      isOwner: true,
      resolvedVia: 'explicit-header',
    });
    // [WI-2398] Caller-self identity — assertCanWriteProfile requires
    // account + callerPersonId; profileId equal to callerPersonId mirrors
    // the legitimate owner-acting-as-self flow (verifyPersonOwnershipV2's
    // self branch is mocked to succeed above regardless of DB).
    c.set('account' as never, { id: 'test-account-id' });
    c.set('callerPersonId' as never, CALLER_PERSON_ID);
    c.set('profileId' as never, CALLER_PERSON_ID);
    await next();
  });
  app.post('/test', async (c) => {
    await assertNotProxyMode(c);
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

function createAppWithProfileMeta(meta: {
  isOwner: boolean;
  resolvedVia?: 'auto' | 'explicit-header';
}) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('profileMeta' as never, meta);
    // [WI-2398] Caller-self identity — see createApp's comment above. Only
    // exercised on the paths that reach assertCanWriteProfile (isOwner:true
    // + resolvedVia:'explicit-header' + no X-Proxy-Mode:true); the BREAK
    // tests below reject earlier and never touch these.
    c.set('account' as never, { id: 'test-account-id' });
    c.set('callerPersonId' as never, CALLER_PERSON_ID);
    c.set('profileId' as never, CALLER_PERSON_ID);
    await next();
  });
  app.post('/test', async (c) => {
    await assertNotProxyMode(c);
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
    const app = createAppWithProfileMeta({
      isOwner: true,
      resolvedVia: 'explicit-header',
    });
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('still honors X-Proxy-Mode:true on owner profile (cannot relax, can only tighten)', async () => {
    const app = createAppWithProfileMeta({
      isOwner: true,
      resolvedVia: 'explicit-header',
    });
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'X-Proxy-Mode': 'true' },
    });
    expect(res.status).toBe(403);
  });

  // [Issue 901 / BREAK] An auto-synthesized owner identity (no X-Profile-Id
  // header → profileScopeMiddleware resolves the account owner with
  // resolvedVia:'auto') must NOT pass the non-proxy gate, even though
  // isOwner is true. Otherwise an authenticated non-owner could omit the
  // header to be auto-resolved to the owner and regain write access.
  it('[BREAK] rejects writes when owner identity was auto-resolved (resolvedVia:auto)', async () => {
    const app = createAppWithProfileMeta({
      isOwner: true,
      resolvedVia: 'auto',
    });
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Not available in proxy mode');
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
    app.post('/test', async (c) => {
      await assertNotProxyMode(c);
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
      },
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
      },
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
      },
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
      },
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
      { method: 'DELETE' },
    );

    expect(res.status).toBe(403);
    expect(dbCalled).not.toHaveBeenCalled();
  });
});
