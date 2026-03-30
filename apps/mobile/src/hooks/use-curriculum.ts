import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  Curriculum,
  CurriculumTopicAddInput,
  CurriculumTopicAddResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useCurriculum(
  subjectId: string
): UseQueryResult<Curriculum | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['curriculum', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].curriculum.$get({
          param: { subjectId },
          init: { signal },
        } as never);
        await assertOk(res);
        const data = (await res.json()) as { curriculum: Curriculum | null };
        return data.curriculum;
      } finally {
        cleanup();
      }
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
    mutationFn: async (topicId: string): Promise<{ message: string }> => {
      const res = await client.subjects[':subjectId'].curriculum.skip.$post({
        param: { subjectId },
        json: { topicId },
      });
      await assertOk(res);
      return (await res.json()) as { message: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', subjectId],
      });
    },
  });
}

export function useUnskipTopic(
  subjectId: string
): UseMutationResult<{ message: string }, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (topicId: string): Promise<{ message: string }> => {
      const res = await client.subjects[':subjectId'].curriculum.unskip.$post({
        param: { subjectId },
        json: { topicId },
      });
      await assertOk(res);
      return (await res.json()) as { message: string };
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
    mutationFn: async (
      feedback: string
    ): Promise<{ curriculum: Curriculum }> => {
      const res = await client.subjects[
        ':subjectId'
      ].curriculum.challenge.$post({
        param: { subjectId },
        json: { feedback },
      });
      await assertOk(res);
      return (await res.json()) as { curriculum: Curriculum };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', subjectId],
      });
    },
  });
}

export function useAddCurriculumTopic(
  subjectId: string
): UseMutationResult<
  CurriculumTopicAddResponse,
  Error,
  CurriculumTopicAddInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CurriculumTopicAddInput
    ): Promise<CurriculumTopicAddResponse> => {
      const res = await client.subjects[':subjectId'].curriculum.topics.$post({
        param: { subjectId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as CurriculumTopicAddResponse;
    },
    onSuccess: (result) => {
      if (result.mode === 'create') {
        void queryClient.invalidateQueries({
          queryKey: ['curriculum', subjectId],
        });
      }
    },
  });
}

export function useExplainTopic(
  subjectId: string
): UseMutationResult<string, Error, string> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (topicId: string): Promise<string> => {
      const res = await client.subjects[':subjectId'].curriculum.topics[
        ':topicId'
      ].explain.$get({
        param: { subjectId, topicId },
      });
      await assertOk(res);
      const data = (await res.json()) as { explanation: string };
      return data.explanation;
    },
  });
}
