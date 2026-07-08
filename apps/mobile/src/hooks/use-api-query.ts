import {
  useQuery,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ZodType } from 'zod';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';

type RetryOption =
  | boolean
  | number
  | ((failureCount: number, error: Error) => boolean);

function resolveFallback<TData>(fallback: TData | (() => TData)): TData {
  if (typeof fallback === 'function') {
    return (fallback as () => TData)();
  }
  return fallback;
}

/**
 * Wrapper that absorbs the read-query boilerplate every scoped GET hook
 * repeats: `combinedSignal` timeout wiring, `assertOk`, JSON parse, and the
 * `enabled && !!activeProfile` profile guard. Call-sites supply the query key,
 * the fetch closure (capturing their own Hono client), and a `select` mapper.
 */
export function useApiQuery<TResponse, TData = TResponse>(opts: {
  queryKey: QueryKey;
  enabled?: boolean;
  retry?: RetryOption;
  timeoutMs?: number;
  schema: ZodType<TResponse>;
  context?: string;
  fetch: (signal: AbortSignal) => Promise<Response>;
  select: (json: TResponse) => TData;
  notFoundFallback?: TData | (() => TData);
}): UseQueryResult<TData> {
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: opts.queryKey,
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal, opts.timeoutMs);
      try {
        const res = await opts.fetch(signal);
        if (res.status === 404 && opts.notFoundFallback !== undefined) {
          return resolveFallback(opts.notFoundFallback);
        }
        await assertOk(res);
        const json = await parseJson(res, opts.schema, opts.context);
        return opts.select(json);
      } finally {
        cleanup();
      }
    },
    enabled: (opts.enabled ?? true) && !!activeProfile,
    ...(opts.retry !== undefined ? { retry: opts.retry } : {}),
  });
}
