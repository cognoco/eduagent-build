import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CompleteRoundResponse,
  QuestionCheckResponse,
  QuestionCheckInput,
  QuestionResult,
  QuizActivityType,
  QuizRoundResponse,
  QuizStats,
  RecentRound,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';

export function useGenerateRound(): UseMutationResult<
  QuizRoundResponse,
  Error,
  {
    activityType: QuizActivityType;
    themePreference?: string;
    subjectId?: string;
  }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input) => {
      const res = await client.quiz.rounds.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as QuizRoundResponse;
    },
  });
}

export function useFetchRound(
  roundId: string | null,
): UseQueryResult<QuizRoundResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['quiz-round', roundId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!roundId) {
        throw new Error('roundId is required');
      }

      const { signal, cleanup } = combinedSignal(querySignal);

      try {
        const res = await client.quiz.rounds[':id'].$get(
          { param: { id: roundId } },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as QuizRoundResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!roundId,
  });
}

export function useCheckAnswer(): UseMutationResult<
  QuestionCheckResponse,
  Error,
  {
    roundId: string;
    questionIndex: QuestionCheckInput['questionIndex'];
    answerGiven: QuestionCheckInput['answerGiven'];
    answerMode?: QuestionCheckInput['answerMode'];
    finalAttempt?: QuestionCheckInput['finalAttempt'];
    cluesUsed?: QuestionCheckInput['cluesUsed'];
  }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async ({
      roundId,
      questionIndex,
      answerGiven,
      answerMode,
      finalAttempt,
      cluesUsed,
    }) => {
      const res = await client.quiz.rounds[':id'].check.$post({
        param: { id: roundId },
        // [BUG-STALE-OPTIONS] Pass answerMode so the API can verify MC answers
        // are in question.options — defense-in-depth against stale-options race.
        json: {
          questionIndex,
          answerGiven,
          answerMode,
          finalAttempt,
          cluesUsed,
        },
      });
      await assertOk(res);
      return (await res.json()) as QuestionCheckResponse;
    },
  });
}

export function useCompleteRound(): UseMutationResult<
  CompleteRoundResponse,
  Error,
  { roundId: string; results: QuestionResult[] }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roundId, results }) => {
      const res = await client.quiz.rounds[':id'].complete.$post({
        param: { id: roundId },
        json: { results },
      });
      await assertOk(res);
      return (await res.json()) as CompleteRoundResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quiz-recent'] });
      void queryClient.invalidateQueries({ queryKey: ['quiz-stats'] });
      // PR-10 deferred: broad ['progress'] — quiz completion affects topic progress
      // and subject progress for the round's topic, but the round may span multiple
      // topics and subjectId/topicId/activeProfileId are not available in this hook's
      // closure. Keep broad until a workflow test enumerates the key set.
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['streak'] });
    },
  });
}

export function useRecentRounds(): UseQueryResult<RecentRound[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['quiz-recent', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);

      try {
        const res = await client.quiz.rounds.recent.$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as RecentRound[];
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useRoundDetail(
  roundId: string | undefined,
): UseQueryResult<QuizRoundResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    // [BUG-528] Include activeProfile?.id so two profiles with the same
    // roundId (e.g. shared curriculum) cannot share a cache entry. Without
    // this, signing in as a different profile on the same device could return
    // the previous user's quiz round from cache.
    queryKey: ['quiz-round-detail', roundId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!roundId) throw new Error('No round ID');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.quiz.rounds[':id'].$get(
          { param: { id: roundId } },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as QuizRoundResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!roundId,
    staleTime: 60_000,
  });
}

export function useQuizStats(): UseQueryResult<QuizStats[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['quiz-stats', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);

      try {
        const res = await client.quiz.stats.$get({}, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as QuizStats[];
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    // Stats only change when a round completes, at which point
    // useCompleteRound invalidates this key. Coalesce remounts within 30s so
    // tabbing between /practice and /quiz doesn't hammer the endpoint.
    staleTime: 30_000,
  });
}
