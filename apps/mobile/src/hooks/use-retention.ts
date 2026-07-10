import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  EvaluateEligibility,
  RecallTestResult,
  RelearnResponse,
  RetentionCardResponse,
  SubjectRetentionResponse,
} from '@eduagent/schemas';
import {
  evaluateEligibilitySchema,
  recallTestResponseSchema,
  relearnResponseSchema,
  subjectRetentionResponseSchema,
  teachingPreferenceEndpointResponseSchema,
  topicRetentionResponseSchema,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { queryKeys } from '../lib/query-keys';
import { parseJson } from '../lib/parse-json';
import { useApiQuery } from './use-api-query';

interface TeachingPreference {
  subjectId: string;
  method: string;
  analogyDomain: string | null;
  nativeLanguage: string | null;
}

export function useRetentionTopics(
  subjectId: string,
): UseQueryResult<SubjectRetentionResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<SubjectRetentionResponse>({
    queryKey: queryKeys.retention.subject(subjectId, activeProfile?.id),
    schema: subjectRetentionResponseSchema,
    fetch: (signal) =>
      client.subjects[':subjectId'].retention.$get(
        { param: { subjectId } },
        { init: { signal } },
      ),
    select: (json) => json,
    enabled: !!subjectId,
  });
}

export function useTopicRetention(
  topicId: string,
): UseQueryResult<RetentionCardResponse | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<
    { card: RetentionCardResponse | null },
    RetentionCardResponse | null
  >({
    queryKey: queryKeys.retention.topic(topicId, activeProfile?.id),
    schema: topicRetentionResponseSchema,
    fetch: (signal) =>
      client.topics[':topicId'].retention.$get(
        { param: { topicId } },
        { init: { signal } },
      ),
    select: (json) => json.card,
    enabled: !!topicId,
  });
}

export function useEvaluateEligibility(
  topicId: string,
): UseQueryResult<EvaluateEligibility> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: queryKeys.retention.evaluateEligibility(
      topicId,
      activeProfile?.id,
    ),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.topics[':topicId'][
          'evaluate-eligibility'
        ].$get({ param: { topicId } }, { init: { signal } });
        await assertOk(res);
        return parseJson(
          res,
          evaluateEligibilitySchema,
          'GET /topics/:topicId/evaluate-eligibility',
        );
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!topicId,
    staleTime: 5 * 60 * 1000, // 5 min — eligibility changes rarely
  });
}

export function useSubmitRecallTest() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      topicId: string;
      answer?: string;
      attemptMode?: 'standard' | 'dont_remember';
    }): Promise<RecallTestResult> => {
      const res = await client.retention['recall-test'].$post({
        json: input,
      });
      await assertOk(res);
      const data = await parseJson(
        res,
        recallTestResponseSchema,
        'POST /retention/recall-test',
      );
      return data.result;
    },
    onSuccess: () => {
      // PR-10 deferred: broad ['retention'] covers retention.subject,
      // retention.topic, retention.evaluateEligibility (now under 'retention'
      // prefix — fixed in PR 10), and retention.teachingPreference for the
      // topic. Broad ['progress'] covers topic progress and subject progress.
      // Narrowing requires subjectId + topicId + activeProfileId in scope —
      // not available from the recall-test response alone.
      void queryClient.invalidateQueries({ queryKey: ['retention'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useStartRelearn() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      topicId: string;
      method: 'same' | 'different';
      preferredMethod?: string;
    }): Promise<RelearnResponse> => {
      const res = await client.retention.relearn.$post({
        json: input,
      });
      await assertOk(res);
      return parseJson(res, relearnResponseSchema, 'POST /retention/relearn');
    },
    onSuccess: () => {
      // PR-10 deferred: broad ['retention'] and ['progress'] — relearn
      // triggers a new session and may update retention cards, topic progress,
      // and subject progress. Surfaces unknown without a subjectId/topicId in
      // scope here. Keep broad until a workflow test enumerates them.
      void queryClient.invalidateQueries({ queryKey: ['retention'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      // The old ['sessions'] call here was a no-op (top segment 'sessions'
      // matches no registered key; session keys use 'session', etc.)
      // — removed PR 10.
    },
  });
}

export function useTeachingPreference(
  subjectId: string | undefined,
): UseQueryResult<TeachingPreference | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<
    { preference: TeachingPreference | null },
    TeachingPreference | null
  >({
    queryKey: queryKeys.retention.teachingPreference(
      subjectId,
      activeProfile?.id,
    ),
    schema: teachingPreferenceEndpointResponseSchema,
    fetch: (signal) =>
      client.subjects[':subjectId']['teaching-preference'].$get(
        { param: { subjectId: subjectId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json.preference,
    enabled: !!subjectId,
  });
}
