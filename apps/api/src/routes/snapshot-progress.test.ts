// ---------------------------------------------------------------------------
// snapshot-progress.test.ts — proxy-mode write-guard regression for WI-174 / DS-085
//
// Scope: this file was added to scaffold the WI-76 batch-2 proxy-mode guard
// test. Broader coverage of snapshot-progress routes lives in integration tests.
// Mirrors the mini-Hono pattern used by parking-lot.test.ts.
// ---------------------------------------------------------------------------

// [WI-774] Capture checkAndLogRateLimit call args so the flag-on test can assert
// the identity opts the route threads. requireActual + targeted override (GC6
// pattern): only this one export is stubbed; everything else is the real module.
const mockCheckAndLogRateLimit = jest.fn().mockResolvedValue(false);
jest.mock(
  '../services/settings' /* gc1-allow: requireActual + targeted override — capture call args for the WI-774 flag-on assertion; rest of module is real */,
  () => {
    const actual = jest.requireActual(
      '../services/settings',
    ) as typeof import('../services/settings');
    return {
      ...actual,
      checkAndLogRateLimit: (...args: unknown[]) =>
        mockCheckAndLogRateLimit(...args),
    };
  },
);

// [WI-2398] assertNotProxyMode now also calls assertCanWriteProfile, which
// calls verifyPersonOwnershipV2 — a raw db.select() membership query the
// stub `db` ({}) in this file cannot satisfy. The isOwner:true scenarios
// below are caller-self writes (callerPersonId is set equal to profileId in
// makeProxyApp); the cross-account write attack this guard exists to close
// is covered by the real-DB break test in
// tests/integration/wi2398-write-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's stub-db environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

// [WI-2881] Call-recording wrappers over the three GET-path aggregation
// reads so the denial tests below can assert the reads never run on a
// rejected spoof. requireActual + targeted override (GC1 Pattern A):
// listRecentMilestones delegates to the REAL implementation by default (the
// [F-144] backfill tests exercise it against their stub db); the other two
// are bare recorders — no existing test in this file invokes them.
jest.mock('../services/snapshot-aggregation', () => {
  const actual = jest.requireActual(
    '../services/snapshot-aggregation',
  ) as typeof import('../services/snapshot-aggregation');
  return {
    ...actual,
    buildKnowledgeInventory: jest.fn(),
    buildProgressHistory: jest.fn(),
    listRecentMilestones: jest.fn(
      (...args: Parameters<typeof actual.listRecentMilestones>) =>
        actual.listRecentMilestones(...args),
    ),
  };
});

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ERROR_CODES } from '@eduagent/schemas';
import { snapshotProgressRoutes } from './snapshot-progress';
import {
  buildKnowledgeInventory,
  buildProgressHistory,
  listRecentMilestones,
} from '../services/snapshot-aggregation';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { ForbiddenError } from '../errors';

const PROFILE_ID = 'a0000000-0000-4000-a000-000000000001';

function makeProxyApp(opts?: { isOwner?: boolean }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, {});
    c.set('profileId' as never, PROFILE_ID);
    c.set('account' as never, { id: 'test-account-id' });
    c.set('user' as never, { id: 'test-user' });
    const isOwner = opts?.isOwner ?? false;
    c.set('profileMeta' as never, {
      isOwner,
      resolvedVia: isOwner ? 'explicit-header' : 'auto',
    });
    // [WI-2398] Caller-self identity — assertNotProxyMode now also calls
    // assertCanWriteProfile, which requires account + callerPersonId.
    c.set('callerPersonId' as never, PROFILE_ID);
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

describe('[WI-774] snapshot-progress flag-on rate-limit threading', () => {
  function makeV2App() {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('account' as never, { id: 'test-account-id' });
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, {
        isOwner: true,
        resolvedVia: 'explicit-header',
      });
      // The account middleware seeds callerPersonId on the v2 path.
      c.set('callerPersonId' as never, PROFILE_ID);
      await next();
    });
    app.route('/', snapshotProgressRoutes);
    return app;
  }

  it('[WI-867] callerPersonId is always threaded into rate-limit guard (v2 always active)', async () => {
    mockCheckAndLogRateLimit.mockResolvedValue(false);
    await makeV2App().request(
      '/progress/refresh',
      { method: 'POST' },
      { IDENTITY_V2_ENABLED: 'true' },
    );

    // [WI-867] callerPersonId must always be threaded from resolveIdentityV2 (flag collapsed).
    expect(mockCheckAndLogRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'a0000000-0000-4000-a000-000000000001',
      'test-account-id',
      'progress_refresh',
      { hours: 1, maxCount: 10 },
      { callerPersonId: PROFILE_ID },
    );
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
      // [WI-2881] Caller-self identity — the GET now runs assertCanReadProfile
      // (account + callerPersonId; ownership-v2 mocked to resolve above).
      c.set('callerPersonId' as never, 'a0000000-0000-4000-a000-000000000001');
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
    const { app, snapshotFindFirst } = makeMilestonesApp({
      isOwner: false,
      resolvedVia: 'auto',
    });
    const res = await app.request('/progress/milestones', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(snapshotFindFirst).not.toHaveBeenCalled();
  });

  it('allows backfill when isOwner is true (legitimate self-read)', async () => {
    const { app, snapshotFindFirst } = makeMilestonesApp({
      isOwner: true,
      resolvedVia: 'explicit-header',
    });
    const res = await app.request('/progress/milestones', { method: 'GET' });
    expect(res.status).toBe(200);
    // Backfill path entered — getLatestSnapshot queried the snapshot.
    expect(snapshotFindFirst).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [WI-2881] read-authority guard (G24)
// The harness middleware installs profileId ONLY from the request's
// X-Profile-Id header — the same client-controlled input the real
// profileScopeMiddleware resolves — so each attack below is a credentialed
// non-owner request traversing header → middleware → route.
// profileAuthorityVerifiedFor is deliberately never set (no central proof),
// which keeps the cases mutation-sensitive to the route guard's own
// fail-closed fallback (verifyPersonOwnershipV2); mounting the real
// profileScopeMiddleware would reject centrally (WI-2128) before the route
// and lose that sensitivity (middleware behavior: profile-scope.test.ts).
// ---------------------------------------------------------------------------
describe('[WI-2881] read-authority guard (G24)', () => {
  const VICTIM_PROFILE_ID = 'victim-profile-id';
  const ATTACKER_PERSON_ID = 'attacker-person-id';
  const SPOOF_HEADERS = { 'X-Profile-Id': VICTIM_PROFILE_ID };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeUnprovenApp() {
    const direct = new Hono();
    direct.use('*', async (c, next) => {
      c.set('db' as never, {});
      // profileId derives strictly from the spoofed header; a request that
      // forgets to send it fails loudly (500) instead of silently passing.
      const spoofedProfileId = c.req.header('X-Profile-Id');
      if (!spoofedProfileId) {
        throw new Error('harness requires an X-Profile-Id header');
      }
      c.set('profileId' as never, spoofedProfileId);
      c.set('user' as never, { id: 'test-user' });
      c.set('account' as never, { id: 'test-account-id' });
      c.set('callerPersonId' as never, ATTACKER_PERSON_ID);
      // profileAuthorityVerifiedFor deliberately NOT set — no central proof.
      await next();
    });
    direct.onError((err, c) => {
      if (err instanceof ForbiddenError) {
        return c.json(
          { code: ERROR_CODES.FORBIDDEN, message: err.message },
          403,
        );
      }
      if (err instanceof HTTPException) {
        return err.getResponse();
      }
      return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
    });
    direct.route('/', snapshotProgressRoutes);
    return direct;
  }

  function denyNextOwnershipCheck() {
    jest
      .mocked(verifyPersonOwnershipV2)
      .mockRejectedValueOnce(new Error('caller cannot read selected profile'));
  }

  async function expectForbidden(res: Response) {
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(jest.mocked(verifyPersonOwnershipV2)).toHaveBeenCalledWith(
      expect.anything(),
      VICTIM_PROFILE_ID,
      'test-account-id',
      ATTACKER_PERSON_ID,
    );
  }

  it('[G24] GET /progress/inventory rejects a cross-profile X-Profile-Id spoof with 403 before the inventory read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request('/progress/inventory', {
      headers: SPOOF_HEADERS,
    });

    await expectForbidden(res);
    expect(buildKnowledgeInventory).not.toHaveBeenCalled();
  });

  it('[G24] GET /progress/history rejects a cross-profile X-Profile-Id spoof with 403 before the history read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request('/progress/history', {
      headers: SPOOF_HEADERS,
    });

    await expectForbidden(res);
    expect(buildProgressHistory).not.toHaveBeenCalled();
  });

  it('[G24] GET /progress/milestones rejects a cross-profile X-Profile-Id spoof with 403 before the milestones read (and its backfill write)', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request('/progress/milestones', {
      headers: SPOOF_HEADERS,
    });

    await expectForbidden(res);
    expect(listRecentMilestones).not.toHaveBeenCalled();
  });
});
