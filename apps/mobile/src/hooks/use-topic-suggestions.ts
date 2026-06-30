import type { UseQueryResult } from '@tanstack/react-query';
import type { TopicSuggestion } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useApiQuery } from './use-api-query';

export function useTopicSuggestions(
  subjectId: string | undefined,
  bookId: string | undefined,
): UseQueryResult<TopicSuggestion[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<TopicSuggestion[]>({
    queryKey: ['topic-suggestions', subjectId, bookId, activeProfile?.id],
    fetch: (signal) =>
      client.subjects[':subjectId'].books[':bookId']['topic-suggestions'].$get(
        { param: { subjectId: subjectId ?? '', bookId: bookId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json as TopicSuggestion[],
    enabled: !!subjectId && !!bookId,
  });
}
