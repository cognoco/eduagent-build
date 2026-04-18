import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CoachingCard } from '@eduagent/schemas';
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
          { init: { signal } }
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
