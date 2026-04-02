import {
  useMutation,
  useQuery,
  useQueryClient,
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
        const homeCardsClient = (client as Record<string, any>)['home-cards'];
        const res = await homeCardsClient.$get({
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
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input: HomeCardInteractionInput) => {
      const homeCardsClient = (client as Record<string, any>)['home-cards'];
      const res = await homeCardsClient.interactions.$post({
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as { ok: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['home-cards', activeProfile?.id],
      });
    },
  });
}
