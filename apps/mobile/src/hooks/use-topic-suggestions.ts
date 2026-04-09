import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { TopicSuggestion } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useTopicSuggestions(
  subjectId: string | undefined,
  bookId: string | undefined
): UseQueryResult<TopicSuggestion[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['topic-suggestions', subjectId, bookId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !bookId)
        throw new Error('subjectId and bookId are required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].books[':bookId'][
          'topic-suggestions'
        ].$get({ param: { subjectId, bookId } }, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as TopicSuggestion[];
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!bookId,
  });
}
