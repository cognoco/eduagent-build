import { useQuery } from '@tanstack/react-query';
import type { SubjectProgress, TopicProgress } from '@eduagent/schemas';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

export function useSubjectProgress(subjectId: string) {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'subject', subjectId, activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ progress: SubjectProgress }>(
        `/subjects/${subjectId}/progress`
      );
      return data.progress;
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useOverallProgress() {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'overview', activeProfile?.id],
    queryFn: async () => {
      const data = await get<{
        subjects: SubjectProgress[];
        totalTopicsCompleted: number;
        totalTopicsVerified: number;
      }>('/progress/overview');
      return data;
    },
    enabled: !!activeProfile,
  });
}

export function useContinueSuggestion() {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'continue', activeProfile?.id],
    queryFn: async () => {
      const data = await get<{
        suggestion: {
          subjectId: string;
          subjectName: string;
          topicId: string;
          topicTitle: string;
        } | null;
      }>('/progress/continue');
      return data.suggestion;
    },
    enabled: !!activeProfile,
  });
}

export function useTopicProgress(subjectId: string, topicId: string) {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'topic', subjectId, topicId, activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ topic: TopicProgress }>(
        `/subjects/${subjectId}/topics/${topicId}/progress`
      );
      return data.topic;
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
  });
}
