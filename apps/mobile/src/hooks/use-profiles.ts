import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { useApiClient } from '../lib/api-client';
import type { Profile } from '@eduagent/schemas';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useProfiles(): UseQueryResult<Profile[]> {
  const client = useApiClient();
  const { isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['profiles'],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.profiles.$get({}, { init: { signal } });
        await assertOk(res);
        const data = await res.json();
        return data.profiles;
      } finally {
        cleanup();
      }
    },
    enabled: !!isSignedIn,
  });
}

export function useUpdateProfileName() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      displayName,
    }: {
      profileId: string;
      displayName: string;
    }) => {
      const res = await client.profiles[':id'].$patch({
        param: { id: profileId },
        json: { displayName },
      });
      await assertOk(res);
      const data = (await res.json()) as { profile: Profile };
      return data.profile;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
