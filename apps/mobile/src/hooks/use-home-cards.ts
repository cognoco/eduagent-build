import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  HomeCardInteractionInput,
  HomeCardsResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useHomeCards(): UseQueryResult<HomeCardsResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['home-cards', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client['home-cards'].$get({
          init: { signal },
        });
        await assertOk(res);
        return (await res.json()) as HomeCardsResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useTrackHomeCardInteraction(): UseMutationResult<
  { ok: boolean },
  Error,
  HomeCardInteractionInput
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: HomeCardInteractionInput) => {
      const res = await client['home-cards'].interactions.$post({
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as { ok: boolean };
    },
    // No invalidation on tap/dismiss — prevents visible card reordering (#26).
    // Server re-ranks on the next foreground focus via query staleTime.
  });
}
