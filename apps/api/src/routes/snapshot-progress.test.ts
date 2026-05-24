// ---------------------------------------------------------------------------
// snapshot-progress.test.ts — proxy-mode write-guard regression for WI-174 / DS-085
//
// Scope: this file was added to scaffold the WI-76 batch-2 proxy-mode guard
// test. Broader coverage of snapshot-progress routes lives in integration tests.
// Mirrors the mini-Hono pattern used by parking-lot.test.ts.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { snapshotProgressRoutes } from './snapshot-progress';

function makeProxyApp(opts?: { isOwner?: boolean }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, {});
    c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
    c.set('account' as never, { id: 'test-account-id' });
    c.set('user' as never, { id: 'test-user' });
    c.set('profileMeta' as never, { isOwner: opts?.isOwner ?? false });
    await next();
  });
  app.route('/', snapshotProgressRoutes);
  return app;
}

describe('[WI-174 / DS-085] snapshot-progress proxy-mode guard', () => {
  it('POST /progress/refresh returns 403 when caller is in proxy mode (isOwner=false)', async () => {
    const res = await makeProxyApp().request('/progress/refresh', {
      method: 'POST',
    });
    expect(res.status).toBe(403);
  });

  it('POST /progress/refresh does NOT 403 for owner profile — guard does not block legitimate writes', async () => {
    const res = await makeProxyApp({ isOwner: true }).request(
      '/progress/refresh',
      { method: 'POST' },
    );
    expect(res.status).not.toBe(403);
  });
});
