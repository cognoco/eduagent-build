import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useApiClient } from '../lib/api-client';
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

const refreshedProfileAuthorities = new WeakMap<QueryClient, Set<string>>();

export function useProfiles(): UseQueryResult<Profile[]> {
  // Profile metadata is the authority refresh itself. This client omits the
  // selected Person/proxy context only from its own requests, so a stale owner
  // selection cannot block caller-bound recovery without mutating the shared
  // identity used by concurrent profile-scoped requests.
  const client = useApiClient({ profileContext: 'omit' });
  const queryClient = useQueryClient();
  const { isSignedIn, userId, sessionId } = useAuth();
  const authorityKey = isSignedIn ? `${userId}:${sessionId}` : 'signed-out';
  const previousAuthorityKeyRef = useRef<string | null>(null);
  let refreshedAuthorities = refreshedProfileAuthorities.get(queryClient);
  if (!refreshedAuthorities) {
    refreshedAuthorities = new Set();
    refreshedProfileAuthorities.set(queryClient, refreshedAuthorities);
  }

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
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.profiles.$get({}, { init: { signal } });
        await assertOk(res);
        const data = await parseJson(res, profileListResponseSchema);
        refreshedAuthorities.add(authorityKey);
        return data.profiles as Profile[];
      } finally {
        cleanup();
      }
    },
    enabled: !!isSignedIn,
    // Profiles carry capability metadata. Refresh once per QueryClient/user
    // session even when a same-subject cache entry exists, then reuse that
    // authoritative result across route-driven provider remounts. Reconnect
    // and native foreground boundaries still revalidate below.
    staleTime: 0,
    refetchOnMount: () => !refreshedAuthorities.has(authorityKey),
    refetchOnReconnect: 'always',
  });
  const { refetch } = query;

  useEffect(() => {
    const previousAuthorityKey = previousAuthorityKeyRef.current;
    previousAuthorityKeyRef.current = authorityKey;
    if (
      !isSignedIn ||
      previousAuthorityKey === null ||
      previousAuthorityKey === authorityKey ||
      refreshedAuthorities.has(authorityKey)
    ) {
      return;
    }

    void queryClient
      .cancelQueries({ queryKey: queryKeys.profiles.list(userId) })
      .then(() => refetch());
  }, [
    authorityKey,
    isSignedIn,
    queryClient,
    refetch,
    refreshedAuthorities,
    userId,
  ]);

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
