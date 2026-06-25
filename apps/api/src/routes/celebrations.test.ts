// ---------------------------------------------------------------------------
// celebrations.test.ts — proxy-mode write-guard regression for WI-143 / DS-054
//
// Scope: this file was added to scaffold the WI-76 batch-2 proxy-mode guard
// test. Broader coverage of celebrations routes lives in integration tests.
// Mirrors the mini-Hono pattern used by parking-lot.test.ts.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { celebrationRoutes } from './celebrations';

function makeProxyApp(opts?: { isOwner?: boolean }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, {});
    c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
    c.set('user' as never, { id: 'test-user' });
    const isOwner = opts?.isOwner ?? false;
    // [Issue 901] Owner write sessions in production carry
    // resolvedVia:'explicit-header' (an explicitly selected, verified owner).
    // The owner gates reject auto-resolved owner identity, so simulate the
    // verified path here for the owner case.
    c.set('profileMeta' as never, {
      isOwner,
      resolvedVia: isOwner ? 'explicit-header' : 'auto',
    });
    await next();
  });
  app.route('/', celebrationRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// [WI-990] pendingCelebrationsQuerySchema — zValidator guard on GET /celebrations/pending
// ---------------------------------------------------------------------------

describe('[WI-990] GET /celebrations/pending viewer query param validation', () => {
  it('returns 400 when viewer query param has an invalid value', async () => {
    const res = await makeProxyApp({ isOwner: true }).request(
      '/celebrations/pending?viewer=invalid_value',
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when viewer query param is an unexpected value (admin)', async () => {
    const res = await makeProxyApp({ isOwner: true }).request(
      '/celebrations/pending?viewer=admin',
    );
    expect(res.status).toBe(400);
  });
});

describe('[WI-143 / DS-054] celebrations proxy-mode guard', () => {
  it('POST /celebrations/seen returns 403 when caller is in proxy mode (isOwner=false)', async () => {
    const res = await makeProxyApp().request('/celebrations/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewer: 'parent' }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /celebrations/seen does NOT 403 for owner profile (isOwner=true) — guard does not block legitimate writes', async () => {
    const res = await makeProxyApp({ isOwner: true }).request(
      '/celebrations/seen',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewer: 'child' }),
      },
    );
    // The stub db will likely throw a different error (markCelebrationsSeen
    // hits an empty object) but crucially not a PROXY_MODE 403.
    expect(res.status).not.toBe(403);
  });
});
