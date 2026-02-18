import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

interface CurriculumTopic {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  relevance: string;
  estimatedMinutes: number;
  skipped: boolean;
}

interface Curriculum {
  id: string;
  subjectId: string;
  version: number;
  topics: CurriculumTopic[];
  generatedAt: string;
}

export function useCurriculum(
  subjectId: string
): UseQueryResult<Curriculum | null> {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['curriculum', subjectId, activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ curriculum: Curriculum | null }>(
        `/subjects/${subjectId}/curriculum`
      );
      return data.curriculum;
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useSkipTopic(
  subjectId: string
): UseMutationResult<{ message: string }, Error, string> {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (topicId: string) =>
      post<{ message: string }>(`/subjects/${subjectId}/curriculum/skip`, {
        topicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', subjectId],
      });
    },
  });
}

export function useChallengeCurriculum(
  subjectId: string
): UseMutationResult<{ curriculum: Curriculum }, Error, string> {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feedback: string) =>
      post<{ curriculum: Curriculum }>(
        `/subjects/${subjectId}/curriculum/challenge`,
        { feedback }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', subjectId],
      });
    },
  });
}

export function useExplainTopic(
  subjectId: string
): UseMutationResult<string, Error, string> {
  const { get } = useApi();

  return useMutation({
    mutationFn: async (topicId: string) => {
      const data = await get<{ explanation: string }>(
        `/subjects/${subjectId}/curriculum/topics/${topicId}/explain`
      );
      return data.explanation;
    },
  });
}
