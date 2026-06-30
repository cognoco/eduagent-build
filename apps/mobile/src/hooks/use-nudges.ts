import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Nudge, NudgeCreateInput } from '@eduagent/schemas';
import { nudgeListResponseSchema } from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useApiQuery } from './use-api-query';

export function useUnreadNudges(): UseQueryResult<Nudge[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<unknown, Nudge[]>({
    queryKey: ['nudges', 'unread', activeProfile?.id],
    fetch: (signal) =>
      client.nudges.$get({ query: { unread: 'true' } }, { init: { signal } }),
    select: (json) => nudgeListResponseSchema.parse(json).nudges,
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
  { success: true; count: number; profileId: string | undefined },
  Error,
  string
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (nudgeId: string) => {
      const profileId = activeProfile?.id;
      const res = await client.nudges[':id'].read.$patch({
        param: { id: nudgeId },
      });
      await assertOk(res);
      const data = (await res.json()) as { success: true; count: number };
      return { ...data, profileId };
    },
    onSuccess: (_data, _nudgeId, _context) => {
      if (!_data.profileId) return;
      void queryClient.invalidateQueries({
        queryKey: ['nudges', 'unread', _data.profileId],
      });
    },
  });
}

export function useMarkAllNudgesRead(): UseMutationResult<
  { success: true; count: number; profileId: string | undefined },
  Error,
  void
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async () => {
      const profileId = activeProfile?.id;
      const res = await client.nudges['mark-read'].$post();
      await assertOk(res);
      const data = (await res.json()) as { success: true; count: number };
      return { ...data, profileId };
    },
    onSuccess: (_data) => {
      if (!_data.profileId) return;
      void queryClient.invalidateQueries({
        queryKey: ['nudges', 'unread', _data.profileId],
      });
    },
  });
}
