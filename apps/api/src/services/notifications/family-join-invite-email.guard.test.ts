// ---------------------------------------------------------------------------
// [WI-1753] ANTI-RECURRENCE GUARD — an emailed link must point at a route that
// actually exists.
//
// The bug this exists to prevent (found in review of PR #2163): the family-join
// invite email sent the recipient to `${API_ORIGIN}/v1/family-join?token=…`, and
// NOTHING in the API served that path. A real teen clicked the link in their
// inbox and got nothing. Every test we had passed, because every one of them
// called `POST /family-join/accept` directly and none ever traversed the URL the
// user actually receives.
//
// So this guard asserts on the email AS ACTUALLY EMITTED: it extracts every URL
// from the rendered body and requires each to resolve to a route the API really
// serves. It is written to hold under either resolution of the accept-surface
// question — today the email emits no URL at all (the accept surface does not
// exist yet), and when the surface lands and the link returns, this same test
// proves the link is served rather than dead.
//
// Route table, not HTTP: we match against `app.routes` rather than firing
// `app.request()`. A request for an unrouted path is intercepted by auth/other
// middleware and comes back 401, NOT 404 — so a "status !== 404" assertion would
// pass for a route nobody serves and the guard would have no teeth. The
// registered-route table cannot lie about what is served.
// ---------------------------------------------------------------------------

import { app } from '../../index';
import { formatFamilyJoinInviteEmail } from './email';

/** Bare URLs in a plain-text email body; trailing punctuation is not part of it. */
const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/g;

function extractUrls(body: string): string[] {
  return body.match(URL_IN_TEXT) ?? [];
}

/** Paths of every GET route the API actually registers (basePath included). */
const GET_ROUTES = app.routes
  .filter((r) => r.method === 'GET')
  .map((r) => r.path);

/** Does a registered GET route serve this pathname? (`:param` matches a segment.) */
function isServedByGet(pathname: string): boolean {
  const actual = pathname.split('/').filter(Boolean);
  return GET_ROUTES.some((route) => {
    const expected = route.split('/').filter(Boolean);
    if (expected.length !== actual.length) return false;
    return expected.every(
      (seg, i) => seg.startsWith(':') || seg === '*' || seg === actual[i],
    );
  });
}

describe('[WI-1753] family-join invite email — every emitted URL is served', () => {
  // THE INVARIANT. Whatever the email body contains, the API must serve it.
  it('emits no URL that the API does not serve', () => {
    const email = formatFamilyJoinInviteEmail('teen@example.com');
    const urls = extractUrls(email.body);

    const dead = urls.filter((u) => !isServedByGet(new URL(u).pathname));
    expect(dead).toEqual([]);
  });

  // TEETH #1 — prove the extractor actually finds URLs. Without this, a broken
  // regex would silently make the invariant above vacuous forever.
  it('the URL extractor finds URLs in an email body', () => {
    expect(
      extractUrls('open https://api.example.com/v1/consent-page?token=abc now'),
    ).toEqual(['https://api.example.com/v1/consent-page?token=abc']);
  });

  // TEETH #2 — prove the route check can actually FAIL. `/v1/family-join` is the
  // exact path the invite email used to point at; it is not served, so had it
  // still been emitted, the invariant above would have caught it. A control
  // (`/v1/consent-page`, the real emailed-link surface) proves the matcher does
  // not simply reject everything.
  it('recognises the old family-join deep link as unserved, and a real page as served', () => {
    expect(isServedByGet('/v1/family-join')).toBe(false);
    expect(isServedByGet('/v1/consent-page')).toBe(true);
  });
});
