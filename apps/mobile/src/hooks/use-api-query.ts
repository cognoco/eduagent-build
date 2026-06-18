import {
  useQuery,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

/**
 * Wrapper that absorbs the read-query boilerplate every scoped GET hook
 * repeats: `combinedSignal` timeout wiring, `assertOk`, JSON parse, and the
 * `enabled && !!activeProfile` profile guard. Call-sites supply the query key,
 * the fetch closure (capturing their own Hono client), and a `select` mapper.
 */
export function useApiQuery<TResponse, TData = TResponse>(opts: {
  queryKey: QueryKey;
  enabled?: boolean;
  timeoutMs?: number;
  fetch: (signal: AbortSignal) => Promise<Response>;
  select: (json: TResponse) => TData;
}): UseQueryResult<TData> {
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: opts.queryKey,
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal, opts.timeoutMs);
      try {
        const res = await opts.fetch(signal);
        await assertOk(res);
        return opts.select((await res.json()) as TResponse);
      } finally {
        cleanup();
      }
    },
    enabled: (opts.enabled ?? true) && !!activeProfile,
  });
}
