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
      if (profileIdRef.current)
        headers.set('X-Profile-Id', profileIdRef.current);

      const res = await globalThis.fetch(input, { ...init, headers });

      if (!res.ok) {
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
        const errBody = await res.text().catch(() => '');
        throw new Error(
          `API error ${res.status}: ${errBody || res.statusText}`
        );
      }

      return res;
    };

    return hc<AppType>(`${getApiUrl()}/v1`, { fetch: customFetch });
  }, []);
}
