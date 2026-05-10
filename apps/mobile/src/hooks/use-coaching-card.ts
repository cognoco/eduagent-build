import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { CoachingCard, QuizActivityType } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

interface CoachingCardResponse {
  coldStart: boolean;
  card: CoachingCard | null;
  fallback: unknown;
}

export function useCoachingCard(): UseQueryResult<CoachingCardResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['coaching-card', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client['coaching-card'].$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as CoachingCardResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    staleTime: 5 * 60 * 1000, // 5 min — coaching card is precomputed and cached server-side
  });
}

/**
 * Returns the coaching card only if it is a quiz_discovery type.
 * Used by the home screen to conditionally show a "Discover more" intent card.
 */
export function useQuizDiscoveryCard() {
  const { data, ...rest } = useCoachingCard();

  const quizCard =
    data?.card?.type === 'quiz_discovery' ? data.card : undefined;

  return { data: quizCard, ...rest };
}

/**
 * Marks a quiz discovery activity as surfaced so it won't be shown again
 * until the next eligible session. Fire-and-forget — navigation proceeds
 * immediately. If the mutation fails, the card reappears next session.
 */
export function useMarkQuizDiscoverySurfaced() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activityType: QuizActivityType) => {
      const res = await client.quiz['missed-items']['mark-surfaced'].$post({
        json: { activityType },
      });
      await assertOk(res);
      return (await res.json()) as { markedCount: number };
    },
    retry: 3,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['coaching-card'] });
    },
  });
}
