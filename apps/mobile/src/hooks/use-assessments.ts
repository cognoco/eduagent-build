import {
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Assessment,
  AssessmentEligibleTopic,
  AssessmentEvaluation,
  AssessmentRecord,
  AssessmentStatus,
} from '@eduagent/schemas';
import {
  assessmentEligibleTopicsResponseSchema,
  createAssessmentResponseSchema,
  declineAssessmentRefreshResponseSchema,
  getActiveAssessmentResponseSchema,
  getAssessmentResponseSchema,
  submitAssessmentAnswerResponseSchema,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';
import { useApiQuery } from './use-api-query';

export const assessmentEligibleTopicsQueryKey = ['assessments', 'eligible'];

export function useAssessment(
  assessmentId: string,
): UseQueryResult<Assessment> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ assessment: Assessment }, Assessment>({
    queryKey: ['assessment', assessmentId, activeProfile?.id],
    schema: getAssessmentResponseSchema,
    fetch: (signal) =>
      client.assessments[':assessmentId'].$get(
        { param: { assessmentId } },
        { init: { signal } },
      ),
    select: (json) => json.assessment,
    enabled: !!assessmentId,
  });
}

export function useActiveAssessment(
  subjectId: string,
  topicId: string,
): UseQueryResult<AssessmentRecord | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<
    { assessment: AssessmentRecord | null },
    AssessmentRecord | null
  >({
    queryKey: ['assessment', 'active', subjectId, topicId, activeProfile?.id],
    schema: getActiveAssessmentResponseSchema,
    fetch: (signal) =>
      client.subjects[':subjectId'].topics[':topicId'].assessments.active.$get(
        { param: { subjectId, topicId } },
        { init: { signal } },
      ),
    select: (json) => json.assessment,
    enabled: !!subjectId && !!topicId,
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
      return parseJson(
        res,
        createAssessmentResponseSchema,
        'POST /subjects/:subjectId/topics/:topicId/assessments',
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
      void queryClient.invalidateQueries({
        queryKey: ['assessment', 'active'],
      });
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

  return useApiQuery<
    { topics: AssessmentEligibleTopic[] },
    AssessmentEligibleTopic[]
  >({
    queryKey: [...assessmentEligibleTopicsQueryKey, activeProfile?.id],
    schema: assessmentEligibleTopicsResponseSchema,
    fetch: (signal) =>
      client.retention['assessment-eligible'].$get({}, { init: { signal } }),
    select: (json) => json.topics,
  });
}

interface SubmitAnswerInput {
  answer: string;
  assessmentId?: string;
}

export function useSubmitAnswer(assessmentId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: SubmitAnswerInput,
    ): Promise<{
      evaluation: AssessmentEvaluation;
      status: AssessmentStatus;
    }> => {
      const targetAssessmentId = input.assessmentId ?? assessmentId;
      if (!targetAssessmentId) {
        throw new Error('Assessment id is required to submit an answer.');
      }
      const res = await client.assessments[':assessmentId'].answer.$post({
        param: { assessmentId: targetAssessmentId },
        json: { answer: input.answer },
      });
      await assertOk(res);
      return parseJson(
        res,
        submitAssessmentAnswerResponseSchema,
        'POST /assessments/:assessmentId/answer',
      );
    },
    onSuccess: (_data, variables) => {
      const targetAssessmentId = variables.assessmentId ?? assessmentId;
      void queryClient.invalidateQueries({
        queryKey: ['assessment', targetAssessmentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['assessment', 'active'],
      });
      // PR-10 deferred: broad ['progress'] — assessment answer updates topic
      // progress and subject progress, but subjectId, topicId, and activeProfileId
      // are not available in this hook's closure (useSubmitAnswer only receives
      // assessmentId). Narrowing requires resolving the assessment's subject/topic
      // first, which would add an extra fetch. Keep broad.
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
      return parseJson(
        res,
        declineAssessmentRefreshResponseSchema,
        'PATCH /assessments/:assessmentId/decline-refresh',
      );
    },
  });
}
