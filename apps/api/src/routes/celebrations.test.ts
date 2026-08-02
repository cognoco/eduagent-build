// ---------------------------------------------------------------------------
// celebrations.test.ts — proxy-mode write-guard regression for WI-143 / DS-054
//
// Scope: this file was added to scaffold the WI-76 batch-2 proxy-mode guard
// test. Broader coverage of celebrations routes lives in integration tests.
// Mirrors the mini-Hono pattern used by parking-lot.test.ts.
// ---------------------------------------------------------------------------

// [WI-2398] assertNotProxyMode now also calls assertCanWriteProfile, which
// calls verifyPersonOwnershipV2 — a raw db.select() membership query the
// stub `db` ({}) in this file cannot satisfy. The isOwner:true scenario below
// is a caller-self write (makeProxyApp sets callerPersonId equal to
// profileId); the cross-account write attack this guard exists to close is
// covered by the real-DB break test in
// tests/integration/wi2398-write-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's stub-db environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { ForbiddenError } from '../errors';
import { celebrationRoutes } from './celebrations';

const PROFILE_ID = 'a0000000-0000-4000-a000-000000000001';

function makeProxyApp(opts?: { isOwner?: boolean }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, {});
    c.set('profileId' as never, PROFILE_ID);
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
    // [WI-2398] Caller-self identity — assertNotProxyMode now also calls
    // assertCanWriteProfile, which requires account + callerPersonId.
    c.set('account' as never, { id: 'test-account-id' });
    c.set('callerPersonId' as never, PROFILE_ID);
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

// ---- [WI-2877] read-authority guard (G14) ----
// Direct-mount harness WITHOUT profileScopeMiddleware: no
// profileAuthorityVerifiedFor proof exists, so this case exercises the route
// guard's own fail-closed fallback (verifyPersonOwnershipV2) — the
// defense-in-depth layer for standalone/direct mounting. In the full app the
// same spoof is rejected centrally by profileScopeMiddleware (WI-2128) before
// any route runs (see profile-scope.test.ts).
// getPendingCelebrations has no service mock in this file (the real service
// would hit the stub db), so this case asserts the 403 boundary only.

describe('[WI-2877] read-authority guard', () => {
  const VICTIM_PROFILE_ID = 'victim-profile-id';
  const ATTACKER_PERSON_ID = 'attacker-person-id';

  function makeUnprovenApp() {
    const direct = new Hono();
    direct.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, VICTIM_PROFILE_ID);
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
      return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
    });
    direct.route('/', celebrationRoutes);
    return direct;
  }

  it('GET /celebrations/pending?viewer=parent rejects a cross-profile read with 403 — viewer=parent is client input, never authority', async () => {
    // The caller's person holds no self/guardianship authority over the
    // installed profile; the client-asserted viewer=parent query param must
    // not substitute for that authority.
    jest
      .mocked(verifyPersonOwnershipV2)
      .mockRejectedValueOnce(new Error('caller cannot read selected profile'));

    const res = await makeUnprovenApp().request(
      '/celebrations/pending?viewer=parent',
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(jest.mocked(verifyPersonOwnershipV2)).toHaveBeenCalledWith(
      expect.anything(),
      VICTIM_PROFILE_ID,
      'test-account-id',
      ATTACKER_PERSON_ID,
    );
  });
});
