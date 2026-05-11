import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { BookSuggestionsResponse } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useBookSuggestions(
  subjectId: string | undefined,
  options?: { topup?: boolean },
): UseQueryResult<BookSuggestionsResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const topup = options?.topup ?? false;

  return useQuery({
    queryKey: ['book-suggestions', subjectId, activeProfile?.id, topup],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId) throw new Error('subjectId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'][
          'book-suggestions'
        ].$get(
          {
            param: { subjectId },
            query: topup ? { topup: '1' as const } : {},
          },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as BookSuggestionsResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}
