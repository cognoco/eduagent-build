import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '@eduagent/database';
import { ERROR_CODES, ForbiddenError } from '@eduagent/schemas';

import { scopesRoutes } from './scopes';
import { resolveScopesForPerson } from '../services/scope-resolution';
import { resolveSupporterColdStart } from '../services/supporter-coldstart';
import { readSupporteeStructuralSubjects } from '../services/supporter-structural-mask';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { TEST_PROFILE_ID } from '@eduagent/test-utils';

// Route unit tests configure these per-case; the real resolvers run raw db
// queries the stub `db` in this file cannot satisfy — each service has direct
// unit coverage. requireActual + targeted override (GC1 Pattern A).
jest.mock('../services/scope-resolution', () => ({
  ...jest.requireActual('../services/scope-resolution'),
  resolveScopesForPerson: jest.fn(),
}));

jest.mock('../services/supporter-structural-mask', () => ({
  ...jest.requireActual('../services/supporter-structural-mask'),
  readSupporteeStructuralSubjects: jest.fn(),
}));

// [WI-2881] The coldstart resolver runs real db queries the stub `db` in this
// file cannot satisfy; the denial test below asserts the read never runs on a
// rejected spoof. requireActual + targeted override (GC1 Pattern A).
jest.mock('../services/supporter-coldstart', () => ({
  ...jest.requireActual('../services/supporter-coldstart'),
  resolveSupporterColdStart: jest.fn(),
}));

// [WI-2881] assertCanReadProfile (GET /scopes, /scopes/coldstart) calls
// verifyPersonOwnershipV2 — a raw db.select() membership query the stub `db`
// in this file cannot satisfy. The resolving default models an authorized
// caller (self, or a guardian of an uncredentialed charge); denial tests
// override with mockRejectedValueOnce to prove the routes fail closed before
// the scope reads. The cross-account read attack against a real membership
// table is covered by the real-DB break test in
// tests/integration/wi2416-read-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's stub-db environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

const PROFILE_ID = TEST_PROFILE_ID;
const CHILD_ID = '00000000-0000-4000-8000-000000000101';
const EDGE_ID = '00000000-0000-4000-8000-000000000201';
const CALLER_PERSON_ID = '00000000-0000-4000-8000-000000000301';

function makeApp(callerPersonId: string = PROFILE_ID) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, { marker: 'db' } as unknown as Database);
    c.set('profileId' as never, PROFILE_ID);
    // [WI-2881] account required by assertCanReadProfile on the self-scope
    // GETs (ownership-v2 mocked to resolve above).
    c.set('account' as never, { id: 'test-account-id' });
    c.set('callerPersonId' as never, callerPersonId);
    await next();
  });
  app.route('/v1', scopesRoutes);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof ForbiddenError) {
      return c.json({ code: ERROR_CODES.FORBIDDEN, message: err.message }, 403);
    }
    throw err;
  });
  return app;
}

describe('scopes routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /scopes returns the resolved scope list for the active person', async () => {
    jest.mocked(resolveScopesForPerson).mockResolvedValue({
      shape: 'supporter',
      defaultScopeIndex: 0,
      scopes: [
        { kind: 'supporter-hub' },
        {
          kind: 'person',
          personId: CHILD_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
        },
      ],
    });

    const res = await makeApp().request('/v1/scopes');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      shape: 'supporter',
      defaultScopeIndex: 0,
      scopes: [
        { kind: 'supporter-hub' },
        {
          kind: 'person',
          personId: CHILD_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
        },
      ],
    });
    expect(resolveScopesForPerson).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
    );
  });

  it('GET /scopes/:personId/subjects validates UUID params before service work', async () => {
    const res = await makeApp().request('/v1/scopes/not-a-uuid/subjects');

    expect(res.status).toBe(400);
    expect(readSupporteeStructuralSubjects).not.toHaveBeenCalled();
  });

  it('GET /scopes/:personId/subjects delegates active-edge structural reads', async () => {
    jest.mocked(readSupporteeStructuralSubjects).mockResolvedValue({
      personId: CHILD_ID,
      edgeId: EDGE_ID,
      subjects: [],
    });

    const res = await makeApp().request(`/v1/scopes/${CHILD_ID}/subjects`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      personId: CHILD_ID,
      edgeId: EDGE_ID,
      subjects: [],
    });
    expect(readSupporteeStructuralSubjects).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      CHILD_ID,
    );
  });

  it('GET /scopes/:personId/subjects returns 403 for unlinked people', async () => {
    jest
      .mocked(readSupporteeStructuralSubjects)
      .mockImplementation(async (_db, supporterPersonId) => {
        if (supporterPersonId === CALLER_PERSON_ID) {
          throw new ForbiddenError('No edge');
        }
        return { personId: CHILD_ID, edgeId: EDGE_ID, subjects: [] };
      });

    const res = await makeApp(CALLER_PERSON_ID).request(
      `/v1/scopes/${CHILD_ID}/subjects`,
    );

    expect(res.status).toBe(403);
    expect(readSupporteeStructuralSubjects).toHaveBeenCalledWith(
      expect.anything(),
      CALLER_PERSON_ID,
      CHILD_ID,
    );
  });
});

// ---------------------------------------------------------------------------
// [WI-2881] read-authority guard (G31 — self-scope handlers only; the sibling
// GET /scopes/:personId/subjects supporter-edge handler is G32, WI-2518's
// remit, and stays on its readSupporteeStructuralSubjects edge check.)
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
describe('[WI-2881] read-authority guard (G31)', () => {
  const VICTIM_PROFILE_ID = 'victim-profile-id';
  const ATTACKER_PERSON_ID = 'attacker-person-id';
  const SPOOF_HEADERS = { 'X-Profile-Id': VICTIM_PROFILE_ID };

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
    direct.route('/', scopesRoutes);
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

  it('[G31] GET /scopes rejects a cross-profile X-Profile-Id spoof with 403 before the scope-list read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request('/scopes', {
      headers: SPOOF_HEADERS,
    });

    await expectForbidden(res);
    expect(resolveScopesForPerson).not.toHaveBeenCalled();
  });

  it('[G31] GET /scopes/coldstart rejects a cross-profile X-Profile-Id spoof with 403 before the coldstart read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request('/scopes/coldstart', {
      headers: SPOOF_HEADERS,
    });

    await expectForbidden(res);
    expect(resolveSupporterColdStart).not.toHaveBeenCalled();
  });
});
