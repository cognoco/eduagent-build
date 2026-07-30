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
 * The authoritative signal is whether the server-derived caller Person is the
 * explicitly selected profile Person. A different caller/profile pair is a
 * guardian proxy session. `profileMeta.isOwner` cannot identify proxy mode:
 * joined learners have their own credentials and correctly operate a
 * non-owner Person as self.
 *
 * The X-Proxy-Mode header is still honored as a belt-and-suspenders signal
 * (e.g., a parent explicitly sending it from the owner profile during a
 * switch race) but it can no longer downgrade a true proxy request.
 *
 * [WI-2398 — write-side IDOR] The client-supplied X-Profile-Id must resolve to
 * the caller's own Person for a non-proxy write. `callerPersonId` is set by
 * accountMiddleware from the authenticated login binding and is never
 * request-supplied. The final `assertCanWriteProfile` check retains
 * defense-in-depth organization membership validation.
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
  // (explicit X-Profile-Id or auto-resolved caller). When profileMeta is
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

  // [Issue 901] Writes require affirmative selection even though a headerless
  // read can safely auto-resolve the login-bound caller Person. This prevents
  // stale clients from silently entering a capability-bearing write path.
  if (profileMeta.resolvedVia !== 'explicit-header') {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json(proxyModeBody, 403),
    });
  }

  const callerPersonId = (c as Context<ProfileScopeEnv>).get('callerPersonId');
  const profileId = (c as Context<ProfileScopeEnv>).get('profileId');
  // [WI-2128] Proxy is an authority relationship, not a profile shape. A
  // credentialed learner writing their own non-owner Person is self; a
  // guardian selecting a different Person is proxy mode. Both values are
  // server-derived/verified before this guard.
  if (!callerPersonId || !profileId || callerPersonId !== profileId) {
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
  // here is the HEADER-resolved profile (already proven to equal the caller's
  // server-derived Person and to be explicitly selected);
  // assertCanWriteProfile additionally proves current organization membership
  // instead of trusting request context alone.
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
