/**
 * Authenticated Hono RPC client hook.
 *
 * Wraps the typed `hc<AppType>` client with a custom fetch that injects
 * the Clerk session JWT as a Bearer token on every request.
 */
import { useMemo, useCallback } from 'react';
import { hc } from 'hono/client';
import { useAuth } from '@clerk/clerk-expo';
import type { AppType } from '@eduagent/api';
import { getApiUrl } from './api';

export function useAuthenticatedApi() {
  const { getToken } = useAuth();

  const client = useMemo(() => {
    const authFetch: typeof globalThis.fetch = async (input, init) => {
      const token = await getToken();
      const headers = new Headers(init?.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return globalThis.fetch(input, { ...init, headers });
    };

    return hc<AppType>(getApiUrl(), { fetch: authFetch });
  }, [getToken]);

  return client;
}

/**
 * Low-level authenticated fetch for use in TanStack Query hooks.
 *
 * Returns `get(path)` and `post(path, body)` helpers that call the API
 * with the Clerk JWT injected. Avoids the Hono RPC client type resolution
 * issue in composite TypeScript builds (where `AppType` becomes
 * `BlankSchema` in declaration files).
 */
export function useApi() {
  const { getToken } = useAuth();
  const baseUrl = getApiUrl();

  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await globalThis.fetch(`${baseUrl}/v1${path}`, { headers });
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      return (await res.json()) as T;
    },
    [getToken, baseUrl]
  );

  const post = useCallback(
    async <T>(path: string, body: unknown): Promise<T> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await globalThis.fetch(`${baseUrl}/v1${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      return (await res.json()) as T;
    },
    [getToken, baseUrl]
  );

  return { get, post };
}

/** @deprecated Use `useApi()` instead. */
export function useApiGet() {
  return useApi();
}
