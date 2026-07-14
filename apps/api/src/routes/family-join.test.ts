// ---------------------------------------------------------------------------
// [WI-1753] Family-join LAUNCH GATE.
//
// Family-join ships to production dark. Two gates are still open — the
// accept-authorization security review (accept is token-possession only; whether
// the teen's login email must equal the invited address is unresolved) and the
// invite-copy operator sign-off — and the user-facing accept surface does not
// exist yet (WI-1927). There is therefore no UI path to these routes in
// production, but "no UI path" is not a security control. FAMILY_JOIN_ENABLED is.
//
// These tests pin the property that matters: with the flag absent or not the
// literal 'true', BOTH endpoints are closed, and they close BEFORE any auth
// resolution or database access — so a disabled deployment cannot be probed for
// behavior, and cannot mutate anything.
//
// No internal mocks: the gate throws before the handlers reach the db/auth
// context, so the routes can be exercised on a bare Hono app with no seams.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';

import { familyJoinRoutes } from './family-join';
import { NotFoundError } from '../errors';

type GateTestEnv = {
  Bindings: { FAMILY_JOIN_ENABLED?: string };
  Variables: Record<string, never>;
};

/**
 * Mounts the real routes with the app's error mapping. `db` / `callerPersonId`
 * are deliberately NEVER set: if the gate ever failed to fire, the handler would
 * reach `withCaller` and blow up on the missing context rather than quietly
 * returning 404 — so a regression cannot masquerade as a pass here.
 */
function buildApp(flag: string | undefined) {
  const app = new Hono<GateTestEnv>();
  app.route('/', familyJoinRoutes as unknown as Hono<GateTestEnv>);
  app.onError((err, c) => {
    if (err instanceof NotFoundError)
      return c.json({ error: 'not_found' }, 404);
    return c.json({ error: 'other', message: (err as Error).message }, 500);
  });
  return {
    request: (path: string, body: unknown) =>
      app.request(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        { FAMILY_JOIN_ENABLED: flag },
      ),
  };
}

const INVITE_BODY = { invitedEmail: 'teen@example.test' };
const ACCEPT_BODY = { token: 'a-token', optInSupportership: false };

describe('[WI-1753] family-join launch gate', () => {
  // The production default. The flag is Doppler-managed and absent by default,
  // so `undefined` IS the shipped state — this is the case that matters most.
  describe.each([
    ['absent (the production default)', undefined],
    ["the string 'false'", 'false'],
    // Fail-closed: only the literal 'true' opens the gate. A truthy-looking
    // value must NOT be enough, or a config typo silently ships the feature.
    ['a truthy-looking typo', 'TRUE'],
    ['another truthy-looking typo', '1'],
  ])('when FAMILY_JOIN_ENABLED is %s', (_label, flag) => {
    it('closes POST /family-join/invite', async () => {
      const res = await buildApp(flag).request(
        '/family-join/invite',
        INVITE_BODY,
      );
      expect(res.status).toBe(404);
    });

    it('closes POST /family-join/accept', async () => {
      const res = await buildApp(flag).request(
        '/family-join/accept',
        ACCEPT_BODY,
      );
      expect(res.status).toBe(404);
    });
  });

  // The gate must precede auth + db. If it did not, these requests would reach
  // `withCaller` — which throws on the absent caller context, surfacing as 500,
  // not 404. So a 404 here is positive evidence of ordering, not just of refusal.
  it('closes before any auth resolution or database access', async () => {
    const invite = await buildApp(undefined).request(
      '/family-join/invite',
      INVITE_BODY,
    );
    const accept = await buildApp(undefined).request(
      '/family-join/accept',
      ACCEPT_BODY,
    );

    expect(invite.status).toBe(404);
    expect(accept.status).toBe(404);
    await expect(invite.json()).resolves.toEqual({ error: 'not_found' });
    await expect(accept.json()).resolves.toEqual({ error: 'not_found' });
  });

  // 404, not 403: a 403 would confirm the endpoint exists. This feature's whole
  // premise is that it leaks nothing about who or what is present; the disabled
  // surface must not advertise itself either.
  it('refuses as not-found rather than forbidden, so the dark surface does not announce itself', async () => {
    const res = await buildApp(undefined).request(
      '/family-join/invite',
      INVITE_BODY,
    );
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });
});
