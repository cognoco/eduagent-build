import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@clerk/expo';
import {
  useApiClient,
  setActiveProfileId,
  setProxyMode,
} from '../lib/api-client';
import { shouldRetryApiError } from '../lib/api-errors';
import {
  profileListResponseSchema,
  profileResponseSchema,
  type AppContext,
  type Profile,
} from '@eduagent/schemas';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';
import { queryKeys } from '../lib/query-keys';

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
  const query = useQuery({
    queryKey: queryKeys.profiles.list(userId),
    queryFn: async ({ signal: querySignal }) => {
      // Profile metadata is the authority refresh itself. Do not attach a
      // previously selected Person/proxy header: after family join that stale
      // owner selection must fail closed on normal routes, but it must not
      // prevent this headerless caller-bound recovery request.
      setActiveProfileId(undefined);
      setProxyMode(false);
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.profiles.$get({}, { init: { signal } });
        await assertOk(res);
        const data = await parseJson(res, profileListResponseSchema);
        return data.profiles as Profile[];
      } finally {
        cleanup();
      }
    },
    enabled: !!isSignedIn,
    // Profiles carry capability metadata. The Clerk subject and Person id stay
    // stable across a family join, so a same-subject cache entry can otherwise
    // retain the pre-join owner shell. Revalidate on every provider mount.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
  });
  const { refetch } = query;

  useEffect(() => {
    if (Platform.OS === 'web' || !isSignedIn) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refetch();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isSignedIn, refetch]);

  return query;
}

export function useUpdateProfileName() {
  const client = useApiClient();
  const { userId } = useAuth();
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
      const data = await parseJson(res, profileResponseSchema);
      return data.profile as Profile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData<Profile[]>(
        queryKeys.profiles.list(userId),
        (existing) =>
          existing?.map((entry) => (entry.id === profile.id ? profile : entry)),
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.profiles.list(userId),
      });
    },
  });
}

export function useUpdateProfileAppContext() {
  const client = useApiClient();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    retry: shouldRetryApiError,
    retryDelay: 250,
    mutationFn: async ({
      profileId,
      defaultAppContext,
    }: {
      profileId: string;
      defaultAppContext: AppContext;
    }) => {
      const res = await client.profiles[':id']['app-context'].$patch({
        param: { id: profileId },
        json: { defaultAppContext },
      });
      await assertOk(res);
      const data = await parseJson(res, profileResponseSchema);
      return data.profile as Profile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData<Profile[]>(
        queryKeys.profiles.list(userId),
        (existing) =>
          existing?.map((entry) => (entry.id === profile.id ? profile : entry)),
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.profiles.list(userId),
      });
    },
  });
}
