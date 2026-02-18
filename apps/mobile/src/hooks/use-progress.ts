import { useQuery } from '@tanstack/react-query';
import type { SubjectProgress, TopicProgress } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

export function useSubjectProgress(subjectId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'subject', subjectId, activeProfile?.id],
    queryFn: async () => {
      const res = await client.subjects[':subjectId'].progress.$get({
        param: { subjectId },
      });
      const data = await res.json();
      return data.progress;
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useOverallProgress() {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'overview', activeProfile?.id],
    queryFn: async () => {
      const res = await client.progress.overview.$get();
      return await res.json();
    },
    enabled: !!activeProfile,
  });
}

export function useContinueSuggestion() {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'continue', activeProfile?.id],
    queryFn: async () => {
      const res = await client.progress.continue.$get();
      const data = await res.json();
      return data.suggestion;
    },
    enabled: !!activeProfile,
  });
}

export function useTopicProgress(subjectId: string, topicId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'topic', subjectId, topicId, activeProfile?.id],
    queryFn: async () => {
      const res = await client.subjects[':subjectId'].topics[
        ':topicId'
      ].progress.$get({
        param: { subjectId, topicId },
      });
      const data = await res.json();
      return data.topic;
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
  });
}
