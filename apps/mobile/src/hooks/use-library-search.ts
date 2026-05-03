import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import type { LibrarySearchResult } from '@eduagent/schemas';

export function useLibrarySearch(
  query: string
): UseQueryResult<LibrarySearchResult> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['library-search', trimmed, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.library.search.$get(
          { query: { q: trimmed } },
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as LibrarySearchResult;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && trimmed.length >= 1,
  });
}
