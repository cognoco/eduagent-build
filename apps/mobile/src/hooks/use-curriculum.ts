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
  CurriculumAdaptRequest,
  CurriculumAdaptResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useCurriculum(
  subjectId: string,
  options?: {
    /**
     * React Query refetchInterval — pass a millisecond number to poll while
     * curriculum generation is in-flight (e.g. after interview completion).
     * Pass `false` or omit to disable polling (default).
     */
    refetchInterval?: number | false;
  },
): UseQueryResult<Curriculum | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['curriculum', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].curriculum.$get(
          { param: { subjectId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as { curriculum: Curriculum | null };
        return data.curriculum;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useSkipTopic(
  subjectId: string,
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
  subjectId: string,
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
  subjectId: string,
): UseMutationResult<{ curriculum: Curriculum }, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      feedback: string,
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
  subjectId: string,
): UseMutationResult<
  CurriculumTopicAddResponse,
  Error,
  CurriculumTopicAddInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CurriculumTopicAddInput,
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
  subjectId: string,
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

export function useAdaptCurriculum(
  subjectId: string,
): UseMutationResult<CurriculumAdaptResponse, Error, CurriculumAdaptRequest> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CurriculumAdaptRequest,
    ): Promise<CurriculumAdaptResponse> => {
      const res = await client.subjects[':subjectId'].curriculum.adapt.$post({
        param: { subjectId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as unknown as CurriculumAdaptResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', subjectId],
      });
    },
  });
}
