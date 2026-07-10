import { type UseQueryResult } from '@tanstack/react-query';
import {
  topicSessionsResponseSchema,
  type TopicSession,
  type TopicSessionsResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { queryKeys } from '../lib/query-keys';
import { useApiQuery } from './use-api-query';

export function useTopicSessions(
  subjectId: string | undefined,
  topicId: string | undefined,
): UseQueryResult<TopicSession[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<TopicSessionsResponse, TopicSession[]>({
    queryKey: queryKeys.topicSessions(subjectId, topicId, activeProfile?.id),
    enabled: !!subjectId && !!topicId,
    schema: topicSessionsResponseSchema,
    fetch: (signal) => {
      if (!subjectId || !topicId)
        throw new Error('subjectId and topicId are required');
      return client.subjects[':subjectId'].topics[':topicId'].sessions.$get(
        { param: { subjectId, topicId } },
        { init: { signal } },
      );
    },
    select: (data) => data.sessions,
  });
}
