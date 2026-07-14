// ---------------------------------------------------------------------------
// WI-1753 — family-join launch gate (FAMILY_JOIN_ENABLED).
//
// The gate's ONLY job is to make the two family-join endpoints DARK when the
// flag is off: indistinguishable from a route that does not exist. That is a
// property of the COMPOSED app, not of the handler — so this suite drives the
// real `app` from ../index, with the full global middleware stack (auth,
// database, account, …) and the routes' own zValidator in place.
//
// A prior version of this suite mounted `familyJoinRoutes` on a bare Hono
// instance with no middleware. It passed while the endpoint was NOT dark: the
// handler-level check ran only AFTER authMiddleware (401), after
// databaseMiddleware/accountMiddleware (DB + identity work on a disabled
// feature), and after zValidator (400 on malformed JSON) — each of which
// confirms the endpoint exists. A test that cannot observe the defect is not
// evidence, so the gate is asserted here at the only boundary that matters.
// ---------------------------------------------------------------------------

import { app } from '../index';

const FAMILY_JOIN_PATHS = [
  '/v1/family-join/invite',
  '/v1/family-join/accept',
] as const;

/**
 * Bindings only — no Authorization header, no DB. If the gate is correctly
 * ahead of the global stack, nothing downstream ever runs, so a DATABASE_URL
 * that points nowhere is enough. (If the gate regresses behind the stack, the
 * request reaches auth/database and this test fails loudly, which is the point.)
 */
function call(
  path: string,
  {
    flag,
    body = JSON.stringify({ invitedEmail: 'teen@example.com' }),
    headers = { 'Content-Type': 'application/json' },
  }: {
    flag?: string;
    body?: string;
    headers?: Record<string, string>;
  },
) {
  const env: Record<string, string> = {
    DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
  };
  if (flag !== undefined) env.FAMILY_JOIN_ENABLED = flag;
  return app.request(path, { method: 'POST', headers, body }, env);
}

describe('family-join launch gate — endpoints are dark when FAMILY_JOIN_ENABLED is off', () => {
  // The flag is absent in every environment that has not opted in, so "absent"
  // is the real default and gets the same coverage as an explicit 'false'.
  describe.each([
    ['absent (deploy default)', undefined],
    ["explicitly 'false'", 'false'],
    ['a junk value (fail-closed)', 'maybe'],
  ])('flag %s', (_label, flag) => {
    it.each(FAMILY_JOIN_PATHS)(
      '404s %s for an UNAUTHENTICATED caller — not 401',
      async (path) => {
        const res = await call(path, { flag });

        // 401 here means authMiddleware ran first: the endpoint answered
        // "you're not allowed in" instead of "there is nothing here", which
        // confirms to an unauthenticated prober that the feature exists.
        expect(res.status).not.toBe(401);
        expect(res.status).toBe(404);
      },
    );

    it.each(FAMILY_JOIN_PATHS)(
      '404s %s on MALFORMED JSON — not 400',
      async (path) => {
        const res = await call(path, { flag, body: '{ this is not json' });

        // 400 here means the route's zValidator ran: validation behavior is
        // itself a disclosure — a nonexistent route never validates a body.
        expect(res.status).not.toBe(400);
        expect(res.status).toBe(404);
      },
    );

    it.each(FAMILY_JOIN_PATHS)(
      'answers %s with the GENERIC not-found envelope — the body names nothing',
      async (path) => {
        const res = await call(path, { flag });
        const body = await res.text();

        // The status code hides the feature; a body saying "family join is
        // disabled" would hand it straight back. The dark response must name
        // neither the feature nor the flag — not even a resource noun.
        expect(body.toLowerCase()).not.toMatch(
          /family|join|disabled|flag|enabled|invite|accept/,
        );
      },
    );
  });

  describe("flag 'true' — the gate lets the request through to the real stack", () => {
    it.each(FAMILY_JOIN_PATHS)(
      'does NOT 404 %s at the gate; the request reaches the global stack',
      async (path) => {
        const res = await call(path, { flag: 'true' });

        // With the gate open, an unauthenticated request must be rejected by
        // authMiddleware (401) — proving the gate is not simply always-404,
        // and that flipping the flag genuinely re-arms the endpoint.
        expect(res.status).toBe(401);
      },
    );
  });
});
