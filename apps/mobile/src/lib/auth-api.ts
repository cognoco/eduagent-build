/**
 * Authenticated API client hooks.
 *
 * Provides `useApi()` — a low-level authenticated fetch with `get(path)`
 * and `post(path, body)` helpers. Uses plain fetch (not Hono RPC) to
 * avoid importing AppType from @eduagent/api, which violates the
 * dependency direction rule (mobile → schemas/retention only).
 */
import { useCallback } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { getApiUrl } from './api';
import { useProfile } from './profile';

export function useApi(): {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
} {
  const { getToken } = useAuth();
  const baseUrl = getApiUrl();
  const { activeProfile } = useProfile();

  const buildHeaders = useCallback(async (): Promise<
    Record<string, string>
  > => {
    const token = await getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (activeProfile?.id) {
      headers['X-Profile-Id'] = activeProfile.id;
    }
    return headers;
  }, [getToken, activeProfile?.id]);

  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      const headers = await buildHeaders();
      const res = await globalThis.fetch(`${baseUrl}/v1${path}`, { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API error ${res.status}: ${body || res.statusText}`);
      }
      return (await res.json()) as T;
    },
    [buildHeaders, baseUrl]
  );

  const post = useCallback(
    async <T>(path: string, body: unknown): Promise<T> => {
      const headers = await buildHeaders();
      const res = await globalThis.fetch(`${baseUrl}/v1${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(
          `API error ${res.status}: ${errBody || res.statusText}`
        );
      }
      return (await res.json()) as T;
    },
    [buildHeaders, baseUrl]
  );

  return { get, post };
}

/** @deprecated Use `useApi()` instead. */
export function useApiGet(): ReturnType<typeof useApi> {
  return useApi();
}
