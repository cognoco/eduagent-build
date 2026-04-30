/**
 * Typed Hono RPC client hook.
 *
 * Replaces `useApi()` from auth-api.ts. Uses `hc<AppType>` to get
 * compile-time type safety on every API call — response shapes are
 * inferred from the route definitions, not manually cast.
 *
 * `@eduagent/api` is a **type-only** devDependency. `import type`
 * is erased at compile time, so zero API code enters the mobile bundle.
 */
import type { AppType } from '@eduagent/api';
import { hc } from 'hono/client';
import { useMemo, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { getApiUrl } from './api';

// ---------------------------------------------------------------------------
// Typed error classes — defined in api-errors.ts (no React deps) and
// re-exported here so existing imports from 'api-client' keep working.
// ---------------------------------------------------------------------------

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  UpstreamError,
} from './api-errors';
import type { QuotaExceededDetails } from './api-errors';

export {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  UpstreamError,
} from './api-errors';
export type { QuotaExceededDetails, UpgradeOption } from './api-errors';

// ---------------------------------------------------------------------------
// Auth-expired callback — handles 401 from expired Clerk tokens
// ---------------------------------------------------------------------------
// Since this is a non-React utility file, we use a module-level callback
// that the root layout sets once on mount (via setOnAuthExpired).  When a
// 401 is received the callback triggers Clerk signOut + redirect to sign-in.
// A guard flag prevents multiple simultaneous 401s from all racing to sign out.

type AuthExpiredCallback = () => void;

let _onAuthExpired: AuthExpiredCallback | null = null;
let _authExpiredFiring = false;

/** Register the callback that fires when a 401 (token expired) is received. */
export function setOnAuthExpired(cb: AuthExpiredCallback): void {
  _onAuthExpired = cb;
  _authExpiredFiring = false;
}

/** Clear the callback (e.g. on unmount). */
export function clearOnAuthExpired(): void {
  _onAuthExpired = null;
  _authExpiredFiring = false;
}

/**
 * [BUG-630 / I-2] Reset the "auth-expired in progress" flag.
 * Must be called by the registered onAuthExpired callback after signOut
 * resolves (success or failure). Without this reset the flag stays true
 * permanently — the second and any subsequent 401s are silently swallowed
 * (e.g. a fresh expired token during a re-sign-in flow), and the user has
 * no feedback that they need to authenticate again.
 */
export function resetAuthExpiredGuard(): void {
  _authExpiredFiring = false;
}

// ---------------------------------------------------------------------------
// Active profile ID — set by ProfileProvider, read by customFetch.
// [BUG-520] Decouples api-client from profile.ts to break the circular
// dependency: api-client → profile → use-profiles → api-client.
// ---------------------------------------------------------------------------

let _activeProfileId: string | undefined;

/** Called by ProfileProvider whenever the active profile changes. */
export function setActiveProfileId(id: string | undefined): void {
  _activeProfileId = id;
}

// ---------------------------------------------------------------------------
// Proxy mode flag - set by useParentProxy hook, read by customFetch.
// ---------------------------------------------------------------------------

let _proxyMode = false;

/** Called by useParentProxy hook whenever proxy state changes. */
export function setProxyMode(enabled: boolean): void {
  _proxyMode = enabled;
}

/**
 * [I-1] Read the current proxy-mode flag from outside this module.
 * Used by useStreamMessage which builds its own XHR headers and cannot
 * rely on customFetch to inject X-Proxy-Mode automatically.
 */
export function getProxyMode(): boolean {
  return _proxyMode;
}

// ---------------------------------------------------------------------------
// Authenticated Hono RPC client
// ---------------------------------------------------------------------------

export type ApiClient = ReturnType<typeof hc<AppType>>;

export function useApiClient(): ApiClient {
  const { getToken } = useAuth();

  // Refs avoid recreating the client when auth state changes.
  // The custom fetch reads current values from refs on each request.
  // [BUG-520] Profile ID is read from the module-level _activeProfileId
  // (set by ProfileProvider) instead of calling useProfile() — this broke
  // a circular dependency: api-client → profile → use-profiles → api-client.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useMemo(() => {
    const customFetch: typeof globalThis.fetch = async (input, init) => {
      // [I-3] Snapshot identity before the async getToken() call to prevent a
      // profile-switch race: if the user switches profiles between when we read
      // the module vars and when we attach headers, we'd send mismatched
      // X-Profile-Id / X-Proxy-Mode for the wrong profile. Snapshotting here
      // ties both values to the same moment in time.
      const snapshotProfileId = _activeProfileId;
      const snapshotProxyMode = _proxyMode;
      const token = await getTokenRef.current();
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (snapshotProfileId && !headers.has('X-Profile-Id'))
        headers.set('X-Profile-Id', snapshotProfileId);
      if (snapshotProxyMode) headers.set('X-Proxy-Mode', 'true');

      // Wrap the underlying fetch in try/catch so network-layer rejections
      // (no response received) become typed NetworkError instead of raw TypeError.
      let res: Response;
      try {
        res = await globalThis.fetch(input, { ...init, headers });
      } catch (fetchErr) {
        throw new NetworkError(undefined, fetchErr);
      }

      if (!res.ok) {
        // Read the body ONCE as text, then parse JSON manually to avoid the
        // "body double-read" footgun (calling both .json() and .text() on the
        // same Response consumes the stream on first read).
        const errBody = await res.text().catch(() => '');
        type ParsedErrBody = {
          code?: string;
          message?: string;
          details?: unknown;
          error?: { code?: string; message?: string };
        };
        let parsed: ParsedErrBody | null = null;
        try {
          parsed = JSON.parse(errBody) as ParsedErrBody;
        } catch {
          // Not JSON — fall through; errBody used as plain text
        }
        const code = parsed?.error?.code ?? parsed?.code;
        const apiMessage = parsed?.error?.message ?? parsed?.message;

        // 401 handling — differentiate "expired token" from "no token yet".
        // After setActive() Clerk may not have minted the JWT by the time
        // the first API call fires (ProfileProvider query).  If no token
        // was sent, this is a timing issue — let TanStack Query retry
        // instead of signing the user out.
        if (res.status === 401) {
          if (__DEV__) {
            console.warn(
              `[AUTH-DEBUG] 401 received | token=${
                token ? 'present' : 'null'
              } | onAuthExpired=${!!_onAuthExpired} | alreadyFiring=${_authExpiredFiring} | url=${
                typeof input === 'string' ? input : (input as Request).url
              }`
            );
          }
          if (token && _onAuthExpired && !_authExpiredFiring) {
            if (__DEV__) {
              console.warn(
                '[AUTH-DEBUG] >>> FIRING onAuthExpired — will sign out'
              );
            }
            _authExpiredFiring = true;
            _onAuthExpired();
          }
          throw new Error(
            token ? 'Session expired — signing out' : 'Auth token not ready'
          );
        }

        if (res.status === 400) {
          throw new BadRequestError(apiMessage ?? (errBody || 'Bad request'));
        }

        if (res.status === 402) {
          if (code === 'QUOTA_EXCEEDED' && parsed?.details) {
            throw new QuotaExceededError(
              apiMessage ?? 'Quota exceeded',
              parsed.details as QuotaExceededDetails
            );
          }
          // Fall through to generic handling for non-quota 402s
        }

        // [EP15-I5] Classify 403 into typed ForbiddenError so screens can
        // distinguish "access denied" from generic API errors.
        // [BUG-100] Also preserve the server's error code (e.g. SUBJECT_INACTIVE)
        // so errorHasCode() and formatApiError() can classify the specific reason.
        if (res.status === 403) {
          throw new ForbiddenError(apiMessage ?? undefined, code ?? undefined);
        }

        if (res.status === 404) {
          throw new NotFoundError(
            apiMessage ?? (errBody || 'Resource not found')
          );
        }

        if (res.status === 409) {
          throw new ConflictError(
            apiMessage ?? 'Request conflicts with current state'
          );
        }

        if (res.status === 410) {
          throw new ResourceGoneError(
            apiMessage ?? undefined,
            code ?? undefined,
            parsed?.details
          );
        }

        if (res.status === 429) {
          const retryAfterHeader = res.headers.get('Retry-After');
          const retryAfter =
            retryAfterHeader != null ? Number(retryAfterHeader) : undefined;
          throw new RateLimitedError(
            apiMessage ?? undefined,
            code ?? undefined,
            undefined,
            Number.isFinite(retryAfter) ? retryAfter : undefined
          );
        }

        // [F-Q-01] For 5xx (and any unhandled 4xx), use UpstreamError when a
        // structured code is present, otherwise fall back to a plain Error.
        if (code) {
          throw new UpstreamError(
            apiMessage ?? (errBody || res.statusText),
            code,
            res.status
          );
        }
        throw new Error(
          `API error ${res.status}: ${errBody || res.statusText}`
        );
      }

      return res;
    };

    return hc<AppType>(`${getApiUrl()}/v1`, { fetch: customFetch });
  }, []);
}
