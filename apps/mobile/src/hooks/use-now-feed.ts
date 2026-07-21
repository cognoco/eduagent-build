import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  keepPreviousData,
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

export type NowFeedQueryResult = UseQueryResult<NowResponse> & {
  fallbackFeed: NowResponse | null;
  isSlowFallback: boolean;
};

/**
 * [WI-2504] The mentor-notice policy epoch this device last OBSERVED for
 * (actor, profile), hydrated from storage.
 *
 * `hydrated` is the ordering guarantee the acceptance criteria depend on:
 * nothing may build a cache key or read a projection until the stored
 * observation is back, or a cold offline launch would key under the bootstrap
 * epoch and serve a feed the device has already been told is void.
 */
function useObservedPolicyEpoch(
  actorId: string | null | undefined,
  profileId: string | undefined,
): {
  epoch: string;
  hydrated: boolean;
  observe: (next: string) => void;
} {
  const [observedEpoch, setObservedEpoch] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!actorId || !profileId) {
      setObservedEpoch(null);
      setHydrated(false);
      return undefined;
    }
    let cancelled = false;
    // Actor/profile switch: re-hydrate that pair's own observation. One
    // actor's observed policy must never key another's projection.
    setHydrated(false);
    void readObservedPolicyEpoch(actorId, profileId).then((epoch) => {
      if (cancelled) return;
      setObservedEpoch(epoch);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [actorId, profileId]);

  return {
    // No stored observation -> the bootstrap epoch, i.e. "this device has not
    // been told anything", never "policy disabled".
    epoch: observedEpoch ?? NOW_FEED_CACHE_POLICY_EPOCH,
    hydrated,
    observe: setObservedEpoch,
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

  const query = useQuery({
    // [WI-2498] Keyed by actor AND subject: the in-memory cache must not be
    // shared across actors selecting the same profile.
    // [WI-2504] ...and by the observed epoch, so the warm in-memory projection
    // is dropped at the same moment the persisted one becomes unreachable.
    queryKey: ['now-feed', userId, profileId, observedEpoch],
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
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!cacheBinding || !query.isFetching || query.data) {
      setIsSlowFallback(false);
      if (!query.isError) {
        setFallbackFeed(null);
      }
      return undefined;
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
