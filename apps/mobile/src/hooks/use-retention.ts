import { useQuery } from '@tanstack/react-query';
import type { RetentionCardResponse } from '@eduagent/schemas';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

export function useRetentionTopics(subjectId: string) {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['retention', 'subject', subjectId, activeProfile?.id],
    queryFn: async () => {
      const data = await get<{
        topics: RetentionCardResponse[];
        reviewDueCount: number;
      }>(`/subjects/${subjectId}/retention`);
      return data;
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useTopicRetention(topicId: string) {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['retention', 'topic', topicId, activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ card: RetentionCardResponse | null }>(
        `/topics/${topicId}/retention`
      );
      return data.card;
    },
    enabled: !!activeProfile && !!topicId,
  });
}
