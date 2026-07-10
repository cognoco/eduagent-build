import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  profileResponseSchema,
  type ProfileCreateInput,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';
import type { Profile } from '../lib/profile';

/**
 * Wraps the raw `client.profiles.$post()` call in a TanStack `useMutation`.
 *
 * `onSuccess` immediately adds the new profile to every cached `['profiles']`
 * query via an optimistic `setQueriesData` then triggers a background
 * invalidation — the same BUG-264 pattern previously inline in create-profile.
 *
 * The caller is responsible for abort signal management, navigation, and any
 * subsequent mutations (e.g. updateAppContext for family mode).
 */
export function useCreateProfile() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      body,
      signal,
    }: {
      body: ProfileCreateInput;
      signal?: AbortSignal;
    }) => {
      const res = await client.profiles.$post(
        { json: body },
        { init: { signal } },
      );
      await assertOk(res);
      const data = await parseJson(res, profileResponseSchema);
      return data.profile as Profile;
    },
    onSuccess: (profile) => {
      // BUG-264: Optimistically add the new profile to the query cache BEFORE
      // invalidating. Without this, invalidateQueries triggers a refetch with
      // stale data (empty array for first-time users), causing activeProfile to
      // be null briefly, which remounts CreateProfileGate and flashes the
      // welcome screen again.
      queryClient.setQueriesData<Profile[]>(
        {
          predicate: (query) => String(query.queryKey[0]) === 'profiles',
        },
        (old) =>
          old && !old.some((p) => p.id === profile.id)
            ? [...old, profile]
            : (old ?? [profile]),
      );
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
