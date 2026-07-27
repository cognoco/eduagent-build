// ---------------------------------------------------------------------------
// Family-join launch gate (WI-1753) — keeps the family-join surface DARK until
// the feature is deliberately switched on.
//
// Mounted at the TOP of the chain in index.ts — BEFORE authMiddleware,
// databaseMiddleware and accountMiddleware, and therefore before the routes'
// own zValidator. That placement is the whole point of this middleware, and it
// is load-bearing:
//   - behind authMiddleware, an unauthenticated probe gets 401 ("you may not
//     enter") instead of 404 ("there is nothing here") — which confirms the
//     endpoint exists;
//   - behind databaseMiddleware/accountMiddleware, an authenticated probe makes
//     the server do DB + identity work (incl. accountMiddleware's JIT account
//     provisioning) for a feature that is switched off;
//   - behind zValidator, malformed JSON gets a 400 — a nonexistent route never
//     validates a body, so validation behavior is itself a disclosure.
// A handler-level check cannot close any of those: by the time a handler runs,
// the global stack has already answered. (Found in review of PR #2168; the
// original in-handler check shipped with a test that mounted the routes on a
// bare Hono app and so could not observe any of it.)
//
// Fail-closed: only the exact string 'true' opens the gate. Absent, 'false', or
// any junk value keeps the surface dark, so a typo in a deploy binding can
// never silently arm the feature.
//
// The 404 carries the app's GENERIC not-found envelope. It must never say
// "family join is disabled" — that would re-leak, in the body, exactly what the
// status code is there to hide.
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { isFamilyJoinEnabled } from '../config';

type FamilyJoinGateEnv = {
  Bindings: {
    FAMILY_JOIN_ENABLED?: string;
  };
};

// Paths include the worker's /v1 basePath: this middleware runs after index.ts
// applies basePath('/v1') (same convention auth.ts's PUBLIC_PATHS and the
// maintenance gate use).
const FAMILY_JOIN_PREFIX = '/v1/family-join/';

/** Strip a single trailing slash (but keep the root '/'), mirroring the maintenance gate. */
function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

/**
 * 404s every /v1/family-join/* request unless FAMILY_JOIN_ENABLED === 'true'.
 * Inert (pure pass-through) for every other path, and for every path once the
 * flag is on.
 */
export const familyJoinGateMiddleware = createMiddleware<FamilyJoinGateEnv>(
  async (c, next) => {
    const path = normalizePath(c.req.path);
    const isFamilyJoinPath = `${path}/`.startsWith(FAMILY_JOIN_PREFIX);

    // Not our surface, or the flag is on → fully inert.
    if (!isFamilyJoinPath || isFamilyJoinEnabled(c.env?.FAMILY_JOIN_ENABLED)) {
      return next();
    }

    // c.notFound() — the app's OWN not-found response, byte-for-byte what an
    // unregistered path returns. Deliberately not a typed NotFoundError: that
    // carries a message, and any message here ("family join is disabled", or
    // even a bare resource noun) is a hint the status code exists to withhold.
    return c.notFound();
  },
);
