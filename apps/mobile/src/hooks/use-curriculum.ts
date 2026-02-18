import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
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
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['curriculum', subjectId, activeProfile?.id],
    queryFn: async () => {
      const res = await client.subjects[':subjectId'].curriculum.$get({
        param: { subjectId },
      });
      const data = await res.json();
      return data.curriculum;
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useSkipTopic(
  subjectId: string
): UseMutationResult<{ message: string }, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (topicId: string) => {
      const res = await client.subjects[':subjectId'].curriculum.skip.$post({
        param: { subjectId },
        json: { topicId },
      });
      return await res.json();
    },
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
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedback: string) => {
      const res = await client.subjects[
        ':subjectId'
      ].curriculum.challenge.$post({
        param: { subjectId },
        json: { feedback },
      });
      return await res.json();
    },
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
  const client = useApiClient();

  return useMutation({
    mutationFn: async (topicId: string) => {
      const res = await client.subjects[':subjectId'].curriculum.topics[
        ':topicId'
      ].explain.$get({
        param: { subjectId, topicId },
      });
      const data = await res.json();
      return data.explanation;
    },
  });
}
