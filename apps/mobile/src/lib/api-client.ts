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
import { useProfile } from './profile';

// ---------------------------------------------------------------------------
// Quota-exceeded error — type derived from @eduagent/schemas QuotaExceeded
// ---------------------------------------------------------------------------

import type { QuotaExceeded } from '@eduagent/schemas';

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

export type QuotaExceededDetails = QuotaExceeded['details'];
export type UpgradeOption = QuotaExceededDetails['upgradeOptions'][number];

export class QuotaExceededError extends Error {
  readonly code = 'QUOTA_EXCEEDED' as const;
  readonly details: QuotaExceededDetails;

  constructor(message: string, details: QuotaExceededDetails) {
    super(message);
    this.name = 'QuotaExceededError';
    this.details = details;
  }
}

/**
 * [EP15-I5] Typed error for 403 responses.
 * Thrown by customFetch so callers can `instanceof ForbiddenError` instead
 * of parsing status codes from generic Error message strings.
 *
 * [BUG-100] `apiCode` preserves the server's application-level error code
 * (e.g. 'SUBJECT_INACTIVE') so downstream classifiers like `errorHasCode`
 * can distinguish specific 403 reasons without string-matching the message.
 */
export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const;
  readonly apiCode: string | undefined;

  constructor(
    message = 'You do not have permission to access this resource',
    apiCode?: string
  ) {
    super(message);
    this.name = 'ForbiddenError';
    this.apiCode = apiCode;
  }
}

/**
 * [F-Q-01] Typed error for 5xx upstream responses.
 * Thrown by customFetch so callers can read `.code` instead of parsing
 * raw JSON from Error.message.
 */
export class UpstreamError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Authenticated Hono RPC client
// ---------------------------------------------------------------------------

export type ApiClient = ReturnType<typeof hc<AppType>>;

export function useApiClient(): ApiClient {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();

  // Refs avoid recreating the client when auth state changes.
  // The custom fetch reads current values from refs on each request.
  const getTokenRef = useRef(getToken);
  const profileIdRef = useRef(activeProfile?.id);
  getTokenRef.current = getToken;
  profileIdRef.current = activeProfile?.id;

  return useMemo(() => {
    const customFetch: typeof globalThis.fetch = async (input, init) => {
      const token = await getTokenRef.current();
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (profileIdRef.current && !headers.has('X-Profile-Id'))
        headers.set('X-Profile-Id', profileIdRef.current);

      const res = await globalThis.fetch(input, { ...init, headers });

      if (!res.ok) {
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

        if (res.status === 402) {
          const body = await res
            .json()
            .catch(() => null as Record<string, unknown> | null);
          if (body && body.code === 'QUOTA_EXCEEDED' && body.details) {
            throw new QuotaExceededError(
              (body.message as string) ?? 'Quota exceeded',
              body.details as QuotaExceededDetails
            );
          }
        }

        // [EP15-I5] Classify 403 into typed ForbiddenError so screens can
        // distinguish "access denied" from generic API errors.  Always throw
        // here to avoid double-consuming the response body with text() below.
        // [BUG-100] Also preserve the server's error code (e.g. SUBJECT_INACTIVE)
        // so errorHasCode() and formatApiError() can classify the specific reason.
        if (res.status === 403) {
          const body = await res
            .json()
            .catch(() => null as Record<string, unknown> | null);
          throw new ForbiddenError(
            (body?.message as string) ?? undefined,
            (body?.code as string) ?? undefined
          );
        }

        // [F-Q-01] Parse JSON body for non-ok responses so typed errors
        // carry a .code property that screens can classify.
        const errBody = await res.text().catch(() => '');
        let parsed: { code?: string; message?: string } | null = null;
        try {
          parsed = JSON.parse(errBody) as { code?: string; message?: string };
        } catch {
          // Not JSON — fall through to generic error
        }
        if (parsed?.code) {
          throw new UpstreamError(
            parsed.message ?? (errBody || res.statusText),
            parsed.code
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
