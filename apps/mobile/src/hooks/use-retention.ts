import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { RetentionCardResponse } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

// ---------------------------------------------------------------------------
// Recall test + relearn response types (mirror API route wrappers)
// ---------------------------------------------------------------------------

interface RecallTestResult {
  passed: boolean;
  failureCount: number;
  hint?: string;
  failureAction?: 'feedback_only' | 'redirect_to_library';
  remediation?: {
    cooldownEndsAt: string;
    suggestionText: string;
    retentionStatus: string;
  };
  masteryScore?: number;
  xpChange?: string;
}

interface RelearnResult {
  sessionId: string;
  message: string;
  recap: string | null;
}

interface TeachingPreference {
  subjectId: string;
  method: string;
  analogyDomain: string | null;
  nativeLanguage: string | null;
}

export function useRetentionTopics(subjectId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['retention', 'subject', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].retention.$get(
          { param: { subjectId } },
          { init: { signal } },
        );
        await assertOk(res);
        return await res.json();
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useTopicRetention(
  topicId: string,
): UseQueryResult<RetentionCardResponse | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['retention', 'topic', topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.topics[':topicId'].retention.$get(
          { param: { topicId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as {
          card: RetentionCardResponse | null;
        };
        return data.card;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!topicId,
  });
}

// FR128-129: Evaluate (Devil's Advocate) eligibility check
interface EvaluateEligibility {
  eligible: boolean;
  topicId: string;
  topicTitle: string;
  currentRung: 1 | 2 | 3 | 4;
  easeFactor: number;
  repetitions: number;
  reason?: string;
}

export function useEvaluateEligibility(
  topicId: string,
): UseQueryResult<EvaluateEligibility> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['evaluate-eligibility', topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.topics[':topicId'][
          'evaluate-eligibility'
        ].$get({ param: { topicId } }, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as EvaluateEligibility;
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
      const data = (await res.json()) as { result: RecallTestResult };
      return data.result;
    },
    onSuccess: () => {
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
    }): Promise<RelearnResult> => {
      const res = await client.retention.relearn.$post({
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as RelearnResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['retention'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useTeachingPreference(
  subjectId: string | undefined,
): UseQueryResult<TeachingPreference | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: [
      'retention',
      'teaching-preference',
      subjectId,
      activeProfile?.id,
    ],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'][
          'teaching-preference'
        ].$get({ param: { subjectId: subjectId ?? '' } }, { init: { signal } });
        await assertOk(res);
        const data = (await res.json()) as {
          preference: TeachingPreference | null;
        };
        return data.preference;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}
