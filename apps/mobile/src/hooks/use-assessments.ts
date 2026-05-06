import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Assessment,
  AssessmentEligibleTopic,
  AssessmentEvaluation,
  AssessmentStatus,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export const assessmentEligibleTopicsQueryKey = ['assessments', 'eligible'];

export function useAssessment(
  assessmentId: string
): UseQueryResult<Assessment> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['assessment', assessmentId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.assessments[':assessmentId'].$get(
          { param: { assessmentId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { assessment: Assessment };
        return data.assessment;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!assessmentId,
  });
}

export function useCreateAssessment(subjectId: string, topicId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.subjects[':subjectId'].topics[
        ':topicId'
      ].assessments.$post({
        param: { subjectId, topicId },
      });
      await assertOk(res);
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'subject', subjectId],
      });
    },
  });
}

export function useAssessmentEligibleTopics(): UseQueryResult<
  AssessmentEligibleTopic[]
> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: [...assessmentEligibleTopicsQueryKey, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.retention['assessment-eligible'].$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as {
          topics: AssessmentEligibleTopic[];
        };
        return data.topics;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useSubmitAnswer(assessmentId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      answer: string;
    }): Promise<{
      evaluation: AssessmentEvaluation;
      status: AssessmentStatus;
    }> => {
      const res = await client.assessments[':assessmentId'].answer.$post({
        param: { assessmentId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as {
        evaluation: AssessmentEvaluation;
        status: AssessmentStatus;
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment', assessmentId],
      });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useDeclineAssessmentRefresh(assessmentId: string) {
  const client = useApiClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.assessments[':assessmentId'][
        'decline-refresh'
      ].$patch({
        param: { assessmentId },
      });
      await assertOk(res);
      return await res.json();
    },
  });
}
