import { useQuery } from '@tanstack/react-query';
import type { RetentionCardResponse } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

export function useRetentionTopics(subjectId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['retention', 'subject', subjectId, activeProfile?.id],
    queryFn: async () => {
      const res = await client.subjects[':subjectId'].retention.$get({
        param: { subjectId },
      });
      return await res.json();
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useTopicRetention(topicId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['retention', 'topic', topicId, activeProfile?.id],
    queryFn: async () => {
      const res = await client.topics[':topicId'].retention.$get({
        param: { topicId },
      });
      const data = await res.json();
      return data.card;
    },
    enabled: !!activeProfile && !!topicId,
  });
}
