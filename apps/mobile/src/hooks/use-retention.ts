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
import { queryKeys } from '../lib/query-keys';

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
    queryKey: queryKeys.retention.subject(subjectId, activeProfile?.id),
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
    queryKey: queryKeys.retention.topic(topicId, activeProfile?.id),
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
    }): Promise<RelearnResult> => {
      const res = await client.retention.relearn.$post({
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as RelearnResult;
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

  return useQuery({
    queryKey: queryKeys.retention.teachingPreference(
      subjectId,
      activeProfile?.id,
    ),
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
