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

// ---------------------------------------------------------------------------
// Quota-exceeded error (thrown on 402 from metering middleware)
// ---------------------------------------------------------------------------

export interface UpgradeOption {
  tier: 'plus' | 'family' | 'pro';
  monthlyQuota: number;
  priceMonthly: number;
}

export interface QuotaExceededDetails {
  tier: string;
  monthlyLimit: number;
  usedThisMonth: number;
  topUpCreditsRemaining: number;
  upgradeOptions: UpgradeOption[];
}

export class QuotaExceededError extends Error {
  readonly code = 'QUOTA_EXCEEDED' as const;
  readonly details: QuotaExceededDetails;

  constructor(message: string, details: QuotaExceededDetails) {
    super(message);
    this.name = 'QuotaExceededError';
    this.details = details;
  }
}

async function throwForStatus(res: Response): Promise<never> {
  if (res.status === 402) {
    const body = await res.json().catch(() => null);
    if (body && body.code === 'QUOTA_EXCEEDED' && body.details) {
      throw new QuotaExceededError(
        body.message ?? 'Quota exceeded',
        body.details as QuotaExceededDetails
      );
    }
  }
  const errBody = await res.text().catch(() => '');
  throw new Error(`API error ${res.status}: ${errBody || res.statusText}`);
}

export function useApi(): {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
  put: <T>(path: string, body: unknown) => Promise<T>;
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
        return throwForStatus(res) as never;
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
        return throwForStatus(res) as never;
      }
      return (await res.json()) as T;
    },
    [buildHeaders, baseUrl]
  );

  const put = useCallback(
    async <T>(path: string, body: unknown): Promise<T> => {
      const headers = await buildHeaders();
      const res = await globalThis.fetch(`${baseUrl}/v1${path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return throwForStatus(res) as never;
      }
      return (await res.json()) as T;
    },
    [buildHeaders, baseUrl]
  );

  return { get, post, put };
}

/** @deprecated Use `useApi()` instead. */
export function useApiGet(): ReturnType<typeof useApi> {
  return useApi();
}
