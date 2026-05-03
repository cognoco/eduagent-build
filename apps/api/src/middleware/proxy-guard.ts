import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ProfileScopeEnv } from './profile-scope';

const PROXY_MODE_MESSAGE = 'Not available in proxy mode';

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
 */
export function assertNotProxyMode(
  c: Context<ProfileScopeEnv> | Context
): void {
  const profileMeta = (c as Context<ProfileScopeEnv>).get('profileMeta') as
    | { isOwner: boolean }
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
      res: c.json({ message: PROXY_MODE_MESSAGE }, 403),
    });
  }

  // Server-derived: any non-owner profile is a proxy session.
  if (profileMeta.isOwner === false) {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json({ message: PROXY_MODE_MESSAGE }, 403),
    });
  }

  // Belt-and-suspenders: client-supplied flag still rejected (cannot relax,
  // can only tighten — useful for owner-profile sessions that the client
  // wants treated as read-only for a switch transition).
  if (c.req.header('X-Proxy-Mode') === 'true') {
    throw new HTTPException(403, {
      message: PROXY_MODE_MESSAGE,
      res: c.json({ message: PROXY_MODE_MESSAGE }, 403),
    });
  }
}
