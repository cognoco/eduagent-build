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

// ---------------------------------------------------------------------------
// [F-144] GET /progress/milestones backfill suppression — fail-closed mapping.
//
// The route maps ownership to listRecentMilestones' allowBackfill arg. The
// backfill (write) path begins with getLatestSnapshot → progressSnapshots
// .findFirst; the always-run read is milestones.findMany. We stub the db so
// progressSnapshots.findFirst records whether the BACKFILL path was entered.
//
// This is the break-test for the FAIL-CLOSED choice (`isOwner === true`):
// an absent/undefined profileMeta.isOwner must suppress the write. Under the
// previous `!== false`, undefined isOwner would (wrongly) ALLOW backfill, so
// findFirst would be called and this test fails — proper red-green.
// ---------------------------------------------------------------------------
describe('[F-144] GET /progress/milestones backfill is fail-closed on ownership', () => {
  function makeMilestonesApp(profileMeta: unknown) {
    const snapshotFindFirst = jest.fn().mockResolvedValue(undefined);
    const stubDb = {
      query: {
        progressSnapshots: { findFirst: snapshotFindFirst },
        milestones: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('db' as never, stubDb);
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('account' as never, { id: 'test-account-id' });
      c.set('user' as never, { id: 'test-user' });
      // profileMeta may be undefined (the fail-closed case) — do not default it.
      c.set('profileMeta' as never, profileMeta);
      await next();
    });
    app.route('/', snapshotProgressRoutes);
    return { app, snapshotFindFirst };
  }

  it('suppresses backfill (write) when profileMeta is undefined (fail closed)', async () => {
    const { app, snapshotFindFirst } = makeMilestonesApp(undefined);
    const res = await app.request('/progress/milestones', { method: 'GET' });
    expect(res.status).toBe(200);
    // Backfill path (getLatestSnapshot) must NOT have been entered.
    expect(snapshotFindFirst).not.toHaveBeenCalled();
  });

  it('suppresses backfill when isOwner is false (proxy)', async () => {
    const { app, snapshotFindFirst } = makeMilestonesApp({ isOwner: false });
    const res = await app.request('/progress/milestones', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(snapshotFindFirst).not.toHaveBeenCalled();
  });

  it('allows backfill when isOwner is true (legitimate self-read)', async () => {
    const { app, snapshotFindFirst } = makeMilestonesApp({ isOwner: true });
    const res = await app.request('/progress/milestones', { method: 'GET' });
    expect(res.status).toBe(200);
    // Backfill path entered — getLatestSnapshot queried the snapshot.
    expect(snapshotFindFirst).toHaveBeenCalled();
  });
});
