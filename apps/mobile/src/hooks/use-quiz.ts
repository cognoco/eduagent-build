import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CompleteRoundResponse,
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

export function usePrefetchRound(): UseMutationResult<
  { id: string },
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
      const res = await client.quiz.rounds.prefetch.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as { id: string };
    },
    // Prefetch failures fall back to the normal launch path, so the UX is
    // unaffected — but we still want visibility when the backend starts
    // reliably rejecting prefetch (quota, backend outage, etc.). Silent
    // recovery without any signal is banned per ~/.claude/CLAUDE.md.
    onError: (err) => {
      console.warn('[quiz] prefetch failed:', err);
    },
  });
}

export function useFetchRound(
  roundId: string | null
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
          { init: { signal } }
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
          { init: { signal } }
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
