// ---------------------------------------------------------------------------
// streaks.test.ts — [WI-2881] read-authority guard (G25)
//
// Scope: this file exists to prove GET /streaks and GET /xp reject a
// cross-profile X-Profile-Id spoof (403) before the service read runs.
// Broader behavior coverage of the streak endpoints lives in
// streaks.integration.test.ts and services/streaks.test.ts.
// Mirrors the unproven-direct-route harness from retention.test.ts (WI-2879).
// ---------------------------------------------------------------------------

// Streak/XP reads run real db queries the stub `db` ({}) in this file cannot
// satisfy; the routes are the unit under test, and the services have direct
// coverage in services/streaks.test.ts. requireActual + targeted override
// (GC1 Pattern A): only the two read functions are stubbed.
jest.mock('../services/streaks', () => ({
  ...jest.requireActual('../services/streaks'),
  getStreakData: jest.fn(),
  getXpSummary: jest.fn(),
}));

// [WI-2881] assertCanReadProfile calls verifyPersonOwnershipV2 — a raw
// db.select() membership query the stub `db` ({}) in this file cannot
// satisfy. The resolving default models an authorized caller (self, or a
// guardian of an uncredentialed charge); denial tests override with
// mockRejectedValueOnce to prove the routes fail closed before the reads.
// The cross-account read attack against a real membership table is covered
// by the real-DB break test in
// tests/integration/wi2416-read-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's stub-db environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ERROR_CODES } from '@eduagent/schemas';

import { streakRoutes } from './streaks';
import { getStreakData, getXpSummary } from '../services/streaks';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { ForbiddenError } from '../errors';

// ---------------------------------------------------------------------------
// [WI-2881] read-authority guard (G25)
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
describe('[WI-2881] read-authority guard (G25)', () => {
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
    direct.route('/', streakRoutes);
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

  it('[G25] GET /streaks rejects a cross-profile X-Profile-Id spoof with 403 before the streak read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request('/streaks', {
      headers: SPOOF_HEADERS,
    });

    await expectForbidden(res);
    expect(getStreakData).not.toHaveBeenCalled();
  });

  it('[G25] GET /xp rejects a cross-profile X-Profile-Id spoof with 403 before the XP read', async () => {
    denyNextOwnershipCheck();

    const res = await makeUnprovenApp().request('/xp', {
      headers: SPOOF_HEADERS,
    });

    await expectForbidden(res);
    expect(getXpSummary).not.toHaveBeenCalled();
  });
});
