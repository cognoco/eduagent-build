import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '@eduagent/database';
import type { ProfileMeta, ProfileScopeEnv } from './profile-scope';
import { assertCanWriteProfile } from '../services/family-access';

const PROXY_MODE_MESSAGE = 'Not available in proxy mode';
const PROXY_MODE_CODE = 'PROXY_MODE';

// Narrow shape assertCanWriteProfile needs — mirrors family-access.ts's own
// CanWriteProfileSource so this file does not have to import Hono's Env
// types for every route (they vary per route file).
type CallerIdentitySource = {
  get(key: 'db'): Database;
  get(key: 'account'): { id: string } | undefined;
  get(key: 'callerPersonId'): string | undefined;
};

// Body shape: include a stable `code` so the mobile classifier can distinguish
// proxy-mode rejection from a generic 403 and avoid mapping it to "sign out".
// The classifier reads parsed.error?.code ?? parsed?.code (api-client.ts).
const proxyModeBody = {
  code: PROXY_MODE_CODE,
  message: PROXY_MODE_MESSAGE,
};

/**
 * [SEC-2 / BUG-718] Server-derived proxy-mode guard for write endpoints.
 *
 * Before this fix, proxy mode was determined entirely by the X-Proxy-Mode
 * request header — a client-controlled value. A malicious or buggy client
 * could omit the header to gain full write access on a child profile, or
 * send it spuriously to suppress writes on a non-proxy session.
 *
 * The authoritative signal is `profileMeta.isOwner`, set server-side by
 * profileScopeMiddleware after verifying that X-Profile-Id resolves to a
 * profile belonging to the authenticated account. When the resolved profile
 * is NOT the owner profile (i.e., a parent is acting on behalf of a child),
 * the request is by definition in proxy mode regardless of any header.
 *
 * The X-Proxy-Mode header is still honored as a belt-and-suspenders signal
 * (e.g., a parent explicitly sending it from the owner profile during a
 * switch race) but it can no longer downgrade a true proxy request.
 *
 * [WI-2398 — write-side IDOR] The checks above only prove the client-supplied
 * X-Profile-Id resolves to SOME owner-role profile in the caller's org (via
 * profileMeta.isOwner / resolvedVia) — never that it is the CALLER's own
 * identity. A non-owner org member (own login, own callerPersonId) can send
 * X-Profile-Id = a DIFFERENT owner/admin profile's id, pass every check
 * above, and mutate that profile's self-service data (curriculum
 * skip/unskip/challenge/topics/adapt, onboarding pronouns/interests, and
 * every other write gated solely by this function). The final check below
 * closes that gap: it derives allow/deny from the server-resolved caller
 * (`callerPersonId`, set app-wide by accountMiddleware from the
 * authenticated login->person binding, never request-supplied) via
 * assertCanWriteProfile — the write-authority twin of assertCanReadProfile
 * (WI-2416) — requiring the caller to be self-or-guardian of the
 * header-resolved profile, not merely an org member. Because every call
 * site shares this one function, fixing it here closes the gap at every
 * assertNotProxyMode call site without touching each route individually.
 */
export async function assertNotProxyMode(
  c: Context<ProfileScopeEnv> | Context,
): Promise<void> {
  const profileMeta = (c as Context<ProfileScopeEnv>).get('profileMeta') as
    | ProfileMeta
    | undefined;

  // [BUG-975 / CCR-PR126-H-1] Fail closed when profileMeta is absent.
  //
  // profileScopeMiddleware sets profileMeta whenever it can resolve a profile
  // (explicit X-Profile-Id or auto-resolved owner). When profileMeta is
  // undefined, ownership cannot be verified server-side — historically the
  // function silently passed through, which meant a route mounted without
  // profileScopeMiddleware (or a path where auto-resolve failed silently)
  // had only the client-controlled X-Proxy-Mode header guarding writes.
  // That is the exact failure mode SEC-2 was meant to eliminate.
  if (!profileMeta) {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json(proxyModeBody, 403),
    });
  }

  // Server-derived: any non-owner profile is a proxy session.
  if (profileMeta.isOwner === false) {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json(proxyModeBody, 403),
    });
  }

  // [Issue 901] Reject auto-synthesized owner identity. When no X-Profile-Id
  // header is sent, profileScopeMiddleware auto-resolves the account OWNER
  // profile (isOwner:true) — so a non-owner caller could omit the header to
  // pass the isOwner check above. A true (non-proxy) owner session must carry
  // an explicitly selected, verified owner profile.
  if (profileMeta.resolvedVia !== 'explicit-header') {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json(proxyModeBody, 403),
    });
  }

  // Belt-and-suspenders: client-supplied flag still rejected (cannot relax,
  // can only tighten — useful for owner-profile sessions that the client
  // wants treated as read-only for a switch transition).
  if (c.req.header('X-Proxy-Mode') === 'true') {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json(proxyModeBody, 403),
    });
  }

  // [WI-2398] Caller-identity gate — see the function doc above. profileId
  // here is the HEADER-resolved profile (already proven owner-shaped and
  // explicitly selected by the checks above); assertCanWriteProfile proves
  // the server-resolved caller actually has write authority over it (self or
  // active guardian of an uncredentialed charge), not merely org membership.
  const profileId = (c as Context<ProfileScopeEnv>).get('profileId');
  if (!profileId) {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json(proxyModeBody, 403),
    });
  }
  try {
    await assertCanWriteProfile(
      c as unknown as CallerIdentitySource,
      profileId,
    );
  } catch {
    // assertCanWriteProfile always throws ForbiddenError (fail-closed) — the
    // outward-facing rejection stays the stable PROXY_MODE shape so the
    // mobile classifier's existing handling applies unchanged.
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json(proxyModeBody, 403),
    });
  }
}
