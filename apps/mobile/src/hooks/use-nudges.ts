import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Nudge, NudgeCreateInput } from '@eduagent/schemas';
import { nudgeListResponseSchema } from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

export function useUnreadNudges(): UseQueryResult<Nudge[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['nudges', 'unread', activeProfile?.id],
    queryFn: async () => {
      const res = await client.nudges.$get({ query: { unread: 'true' } });
      await assertOk(res);
      return nudgeListResponseSchema.parse(await res.json()).nudges;
    },
    enabled: !!activeProfile,
  });
}

export function useSendNudge(): UseMutationResult<
  unknown,
  Error,
  NudgeCreateInput
> {
  const client = useApiClient();
  return useMutation({
    mutationFn: async (input) => {
      const res = await client.nudges.$post({ json: input });
      await assertOk(res);
      return await res.json();
    },
  });
}

export function useMarkNudgeRead(): UseMutationResult<
  { success: true; count: number },
  Error,
  string
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (nudgeId) => {
      const res = await client.nudges[':id'].read.$patch({
        param: { id: nudgeId },
      });
      await assertOk(res);
      return (await res.json()) as { success: true; count: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['nudges', 'unread', activeProfile?.id],
      });
    },
  });
}

export function useMarkAllNudgesRead(): UseMutationResult<
  { success: true; count: number },
  Error,
  void
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async () => {
      const res = await client.nudges['mark-read'].$post();
      await assertOk(res);
      return (await res.json()) as { success: true; count: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['nudges', 'unread', activeProfile?.id],
      });
    },
  });
}
