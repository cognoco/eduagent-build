import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { PendingCelebration } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';
import { combinedSignal } from '../lib/query-timeout';

export function usePendingCelebrations(options?: {
  profileId?: string;
  viewer?: 'child' | 'parent';
}): UseQueryResult<PendingCelebration[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const targetProfileId = options?.profileId ?? activeProfile?.id;
  const viewer = options?.viewer ?? 'child';

  return useQuery({
    queryKey: ['celebrations', 'pending', targetProfileId, viewer],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.celebrations.pending.$get(
          { query: { viewer } },
          {
            init: {
              signal,
              headers: targetProfileId
                ? { 'X-Profile-Id': targetProfileId }
                : undefined,
            },
          },
        );
        await assertOk(res);
        const data = await res.json();
        return data.pendingCelebrations as PendingCelebration[];
      } finally {
        cleanup();
      }
    },
    enabled: !!targetProfileId,
  });
}

export function useMarkCelebrationsSeen(): UseMutationResult<
  { ok: boolean },
  Error,
  { viewer: 'child' | 'parent'; profileId?: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async ({
      viewer,
      profileId,
    }: {
      viewer: 'child' | 'parent';
      profileId?: string;
    }) => {
      const res = await client.celebrations.seen.$post(
        { json: { viewer } },
        {
          init: {
            headers: profileId ? { 'X-Profile-Id': profileId } : undefined,
          },
        },
      );
      await assertOk(res);
      return (await res.json()) as { ok: boolean };
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'celebrations',
          'pending',
          variables.profileId ?? activeProfile?.id,
          variables.viewer,
        ],
      });
    },
  });
}
