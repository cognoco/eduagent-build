import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { BookSuggestion } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useBookSuggestions(
  subjectId: string | undefined,
): UseQueryResult<BookSuggestion[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['book-suggestions', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId) throw new Error('subjectId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'][
          'book-suggestions'
        ].$get({ param: { subjectId } }, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as BookSuggestion[];
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}
