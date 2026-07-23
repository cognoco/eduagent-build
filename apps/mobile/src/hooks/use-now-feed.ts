import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  nowOverflowResponseSchema,
  nowResponseSchema,
  type NowOverflowResponse,
  type NowResponse,
  mentorNoticeDeferResponseSchema,
  mentorNoticeRecheckResponseSchema,
} from '@eduagent/schemas';

import { useAuth } from '@clerk/expo';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import {
  NOW_FEED_CACHE_POLICY_EPOCH,
  observePolicyEpoch,
  readCachedNowFeed,
  readObservedPolicyEpoch,
  writeCachedNowFeed,
} from '../lib/now-feed-cache';
import { useNavigationDataScopeContract } from './use-navigation-contract';
import { parseJson } from '../lib/parse-json';
import { useApiQuery } from './use-api-query';

const NOW_FEED_STALE_TIME_MS = 30_000;
const NOW_FEED_SLOW_FALLBACK_MS = 2_000;

export function nowFeedQueryKey(
  actorId: string,
  profileId: string,
  policyEpoch: string,
): readonly ['now-feed', string, string, string] {
  return ['now-feed', actorId, profileId, policyEpoch] as const;
}

export type NowFeedQueryResult = UseQueryResult<NowResponse> & {
  fallbackFeed: NowResponse | null;
  isSlowFallback: boolean;
  // [WI-2504 bounce 2] The policy epoch THIS hook observed as of its latest
  // render, so a consumer that starts an async action (e.g. a mentor-notice
  // recheck) can compare it against the epoch observed once that action
  // resolves, and refuse to act on a result that outlived the epoch it
  // started under.
  observedEpoch: string;
};

/**
 * [WI-2504] Query key the observed epoch is stored under, shared across every
 * hook instance for the same (actor, profile) pair.
 */
function observedPolicyEpochQueryKey(actorId: string, profileId: string) {
  return ['now-feed-observed-policy-epoch', actorId, profileId] as const;
}

/**
 * [WI-2504] The mentor-notice policy epoch this device last OBSERVED for
 * (actor, profile), hydrated from storage.
 *
 * `hydrated` is the ordering guarantee the acceptance criteria depend on:
 * nothing may build a cache key or read a projection until the stored
 * observation is back, or a cold offline launch would key under the bootstrap
 * epoch and serve a feed the device has already been told is void.
 *
 * [WI-2504 rework] Backed by the shared QueryClient cache rather than
 * hook-local `useState`. `useNowFeed`, `useNowOverflow`, and
 * `useSessionSummary` mount concurrently (the Mentor screen renders
 * `useNowFeed` + `useNowOverflow` together) and each previously held its OWN
 * copy of the observed epoch: one instance's fetch could `observe()` a
 * disabled epoch while sibling instances kept their prior enabled epoch and
 * the warm data keyed under it. Reading/writing through
 * `queryClient`'s cache for the same (actor, profile) query key means every
 * mounted consumer shares one observation — `observe()` from any one of them
 * invalidates the epoch for all of them atomically.
 *
 * Exported for `useSessionSummary` (hooks/use-sessions.ts), whose response
 * carries the notice RECEIPT. It is the same seam — one server epoch, one
 * stored observation — reused, not a second policy source.
 */
export function useObservedPolicyEpoch(
  actorId: string | null | undefined,
  profileId: string | undefined,
): {
  epoch: string;
  hydrated: boolean;
  observe: (next: string) => void;
} {
  const queryClient = useQueryClient();
  const canHydrate = !!actorId && !!profileId;

  const epochQuery = useQuery({
    // Actor/profile switch changes the key, so a new pair re-hydrates its OWN
    // observation from storage rather than inheriting the previous pair's.
    queryKey: canHydrate
      ? observedPolicyEpochQueryKey(actorId, profileId)
      : (['now-feed-observed-policy-epoch', 'unbound'] as const),
    queryFn: () =>
      readObservedPolicyEpoch(actorId as string, profileId as string),
    enabled: canHydrate,
    // No staleTime override: a fresh mount (e.g. the app was foregrounded
    // after storage changed out from under it) must re-read storage rather
    // than trust a query-cache entry that could be stale for THIS mount.
    // `observe()` still reaches every currently-mounted subscriber instantly
    // via `setQueryData`, independent of staleTime.
  });

  const observe = useMemo(
    () => (next: string) => {
      if (!canHydrate) return;
      queryClient.setQueryData(
        observedPolicyEpochQueryKey(actorId, profileId),
        next,
      );
    },
    [queryClient, canHydrate, actorId, profileId],
  );

  return {
    // No stored observation -> the bootstrap epoch, i.e. "this device has not
    // been told anything", never "policy disabled".
    epoch: (canHydrate ? epochQuery.data : null) ?? NOW_FEED_CACHE_POLICY_EPOCH,
    // Nothing to hydrate FROM when actor/profile is missing — report hydrated
    // so callers that gate on it are not blocked while auth resolves; the
    // cache binding stays null regardless, so no projection is read or
    // written under a guessed key.
    // `isFetching` also gates hydration: a fresh mount whose cached epoch is
    // stale (default staleTime) fires a background re-read, and consumers
    // must not build a cache key or query off that soon-to-be-stale value —
    // wait for the re-read to land, same as the very first hydration.
    hydrated: canHydrate
      ? epochQuery.isFetched && !epochQuery.isFetching
      : true,
    observe,
  };
}

export function useNowFeed(): NowFeedQueryResult {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const { userId } = useAuth();
  // [WI-2498] Proxy state is read through the navigation contract, not from
  // raw profile state — the contract is the single sanctioned reader of
  // owner/proxy/mode (navigation-contract-usage-guard.test.ts). The data-scope
  // variant is the one the other cache/query-scope hooks use (use-sessions,
  // use-dashboard, use-progress-scope): it skips the subscription query this
  // hook has no use for. `contract.isParentProxy` is a straight pass-through of
  // the same explicit-proxy flag, flag-state independent.
  const navigationContract = useNavigationDataScopeContract();
  const profileId = activeProfile?.id;
  const {
    epoch: observedEpoch,
    hydrated: epochHydrated,
    observe,
  } = useObservedPolicyEpoch(userId, profileId);

  // [WI-2498] Cache entries are actor/profile/policy-bound, so one actor's
  // projection can never be rehydrated for another. Server-side V remains the
  // control; `noticesVisible` below is defense in depth only.
  // [WI-2504] ...and policy-bound now means bound to the OBSERVED server epoch,
  // not a client constant.
  const cacheBinding = useMemo(
    () =>
      userId && profileId && epochHydrated
        ? { actorId: userId, profileId, policyEpoch: observedEpoch }
        : null,
    [userId, profileId, epochHydrated, observedEpoch],
  );
  // The fetch that observes a new epoch may resolve after this render, so the
  // query function reads the binding through a ref rather than a stale closure.
  const cacheBindingRef = useRef(cacheBinding);
  cacheBindingRef.current = cacheBinding;
  const noticesVisible = !navigationContract.isParentProxy;
  const [fallbackFeed, setFallbackFeed] = useState<NowResponse | null>(null);
  const [isSlowFallback, setIsSlowFallback] = useState(false);
  // [WI-2504 bounce 2] The epoch `fallbackFeed` was last populated (or
  // cleared) for — lets the effect below tell "still the same pending fetch"
  // from "the query key's epoch just changed out from under it".
  const fallbackEpochRef = useRef<string | null>(null);

  const query = useQuery({
    // [WI-2498] Keyed by actor AND subject: the in-memory cache must not be
    // shared across actors selecting the same profile.
    // [WI-2504] ...and by the observed epoch, so the warm in-memory projection
    // is dropped at the same moment the persisted one becomes unreachable.
    queryKey: nowFeedQueryKey(userId!, profileId!, observedEpoch),
    queryFn: async ({ signal: querySignal }): Promise<NowResponse> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.now.$get(
          { query: { scope: 'self' } },
          { init: { signal } },
        );
        const okRes = await assertOk(res);
        const data = await parseJson(okRes, nowResponseSchema, 'GET /now');
        const binding = cacheBindingRef.current;
        if (binding) {
          // [WI-2504] This response IS the observation. An absent epoch means
          // the server told us nothing about policy (older worker), so the
          // previous observation stands — a device is never credited with
          // knowing a change it did not receive.
          const previousEpoch = binding.policyEpoch;
          const epoch = data.mentorNoticePolicyEpoch ?? previousEpoch;
          if (epoch !== previousEpoch) {
            await observePolicyEpoch(
              binding.actorId,
              binding.profileId,
              epoch,
              previousEpoch,
            );
            observe(epoch);
          }
          void writeCachedNowFeed({ ...binding, policyEpoch: epoch }, data, {
            noticesVisible,
          });
        }
        return data;
      } finally {
        cleanup();
      }
    },
    // [WI-2504] Wait for the stored observation so the first fetch already
    // carries the right key — otherwise every cold start would fetch twice.
    enabled: !!profileId && epochHydrated,
    staleTime: NOW_FEED_STALE_TIME_MS,
    // [WI-2504 bounce 2] `keepPreviousData` must not carry a query's data
    // across an epoch re-key. `observedEpoch` can change between renders —
    // from this hook's own fetch observing a new epoch, or from any other
    // consumer sharing the same observation (see `useObservedPolicyEpoch`
    // above) — re-keying THIS query while a settled query for the OLD epoch
    // still holds its (possibly notice-bearing) data. Plain
    // `keepPreviousData` would paint that old query's data for the whole
    // window the re-keyed query's own fetch is pending. Only reuse the
    // placeholder when the previous query was fetched under the SAME
    // observed epoch as now; otherwise expose no data until the new epoch's
    // fetch resolves.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[3] === observedEpoch ? previousData : undefined,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!cacheBinding || !query.isFetching || query.data) {
      setIsSlowFallback(false);
      if (!query.isError) {
        setFallbackFeed(null);
      }
      fallbackEpochRef.current = null;
      return undefined;
    }

    // [WI-2504 bounce 2] A fallback populated for a PREVIOUS epoch must not
    // survive into a re-keyed query's pending window: this branch runs
    // whenever `query.data` is absent, which is now also true immediately
    // after an epoch re-key (the freshly mounted query has no data of its
    // own yet — see the `placeholderData` epoch gate above). Without this,
    // `data ?? fallbackFeed` could keep exposing the OLD epoch's (possibly
    // notice-bearing) cached feed until — or unless — this fetch's own cache
    // read lands.
    if (fallbackEpochRef.current !== cacheBinding.policyEpoch) {
      setFallbackFeed(null);
      setIsSlowFallback(false);
      fallbackEpochRef.current = cacheBinding.policyEpoch ?? null;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void readCachedNowFeed(cacheBinding, Date.now(), {
        noticesVisible,
      }).then((cached) => {
        if (cancelled || !cached) return;
        setFallbackFeed(cached);
        setIsSlowFallback(true);
      });
    }, NOW_FEED_SLOW_FALLBACK_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    cacheBinding,
    noticesVisible,
    query.data,
    query.isError,
    query.isFetching,
  ]);

  return {
    ...query,
    fallbackFeed,
    isSlowFallback,
    observedEpoch,
  };
}

export function useMentorNoticeActions() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();
  const { userId } = useAuth();
  const issuedForProfileId = activeProfile?.id;

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['now-feed', userId, issuedForProfileId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['now-overflow', userId, issuedForProfileId],
      }),
    ]);
  };

  const recheck = useMutation({
    mutationFn: async (noticeId: string) => {
      const response = await client['mentor-notices'][
        ':noticeId'
      ].recheck.$post({ param: { noticeId } });
      const ok = await assertOk(response);
      return parseJson(
        ok,
        mentorNoticeRecheckResponseSchema,
        'POST /mentor-notices/:noticeId/recheck',
      );
    },
    onSuccess: invalidate,
  });
  const defer = useMutation({
    mutationFn: async (noticeId: string) => {
      const response = await client['mentor-notices'][':noticeId'].defer.$post({
        param: { noticeId },
      });
      const ok = await assertOk(response);
      return parseJson(
        ok,
        mentorNoticeDeferResponseSchema,
        'POST /mentor-notices/:noticeId/defer',
      );
    },
    onSuccess: invalidate,
  });

  return { recheck, defer, invalidate };
}

export function useNowOverflow(
  enabled: boolean,
): UseQueryResult<NowOverflowResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const { userId } = useAuth();
  const profileId = activeProfile?.id;
  // [WI-2504] The overflow page is not persisted, but it IS a notice-bearing
  // surface that can sit warm in memory across a flag-off. Binding its key to
  // the same observed epoch drops it at the moment the feed's projection dies,
  // so the overflow list cannot outlive the policy the client observed.
  const { epoch: observedEpoch, hydrated: epochHydrated } =
    useObservedPolicyEpoch(userId, profileId);

  return useApiQuery({
    // [WI-2498] Actor-bound, matching the now-feed key above.
    queryKey: ['now-overflow', userId, profileId, observedEpoch],
    enabled: enabled && epochHydrated,
    schema: nowOverflowResponseSchema,
    fetch: (signal) =>
      client.now.overflow.$get(
        { query: { scope: 'self' } },
        { init: { signal } },
      ),
    select: (json) => json,
  });
}
