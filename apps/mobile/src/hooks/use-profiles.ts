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
  const { isSignedIn, userId } = useAuth();

  // Scope the cache by Clerk userId so a previous user's profiles list cannot
  // be served stale to the next signed-in user on a shared device. Without
  // this, sign-out paths that skip queryClient.clear() leave User A's
  // ['profiles'] cache live; ProfileProvider then restores User A's saved id
  // from SecureStore, matches it against the stale list (savedExists=true),
  // and pushes that id to api-client as X-Profile-Id. The server's profile
  // scope middleware rejects the mismatched id with 403, surfacing as the
  // "We could not load your profile" error fallback in (app)/_layout.tsx.
  // Prefix-based invalidations (`queryKey: ['profiles']`) still match this
  // scoped key because TanStack invalidation is a prefix match by default.
  return useQuery({
    queryKey: ['profiles', userId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.profiles.$get({}, { init: { signal } });
        await assertOk(res);
        const data = await res.json();
        return data.profiles as Profile[];
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
