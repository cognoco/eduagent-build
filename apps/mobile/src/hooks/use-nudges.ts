import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Nudge,
  NudgeCreateInput,
  NudgeListResponse,
} from '@eduagent/schemas';
import {
  nudgeCreateResponseSchema,
  nudgeListResponseSchema,
  nudgeMarkReadResponseSchema,
} from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { parseJson } from '../lib/parse-json';
import { useProfile } from '../lib/profile';
import { useApiQuery } from './use-api-query';

export function useUnreadNudges(): UseQueryResult<Nudge[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<NudgeListResponse, Nudge[]>({
    queryKey: ['nudges', 'unread', activeProfile?.id],
    schema: nudgeListResponseSchema,
    fetch: (signal) =>
      client.nudges.$get({ query: { unread: 'true' } }, { init: { signal } }),
    select: (json) => json.nudges,
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
      return parseJson(res, nudgeCreateResponseSchema, 'POST /nudges');
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
      const data = await parseJson(
        res,
        nudgeMarkReadResponseSchema,
        'PATCH /nudges/:id/read',
      );
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
      const data = await parseJson(
        res,
        nudgeMarkReadResponseSchema,
        'POST /nudges/mark-read',
      );
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
