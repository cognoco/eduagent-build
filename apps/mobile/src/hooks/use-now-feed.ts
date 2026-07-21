import { useEffect, useMemo, useState } from 'react';
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
import { readCachedNowFeed, writeCachedNowFeed } from '../lib/now-feed-cache';
import { useNavigationDataScopeContract } from './use-navigation-contract';
import { parseJson } from '../lib/parse-json';
import { useApiQuery } from './use-api-query';

const NOW_FEED_STALE_TIME_MS = 30_000;
const NOW_FEED_SLOW_FALLBACK_MS = 2_000;

export type NowFeedQueryResult = UseQueryResult<NowResponse> & {
  fallbackFeed: NowResponse | null;
  isSlowFallback: boolean;
};

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
  // [WI-2498] Cache entries are actor/profile/policy-bound, so one actor's
  // projection can never be rehydrated for another. Server-side V remains the
  // control; `noticesVisible` below is defense in depth only.
  const cacheBinding = useMemo(
    () => (userId && profileId ? { actorId: userId, profileId } : null),
    [userId, profileId],
  );
  const noticesVisible = !navigationContract.isParentProxy;
  const [fallbackFeed, setFallbackFeed] = useState<NowResponse | null>(null);
  const [isSlowFallback, setIsSlowFallback] = useState(false);

  const query = useQuery({
    // [WI-2498] Keyed by actor AND subject: the in-memory cache must not be
    // shared across actors selecting the same profile.
    queryKey: ['now-feed', userId, profileId],
    queryFn: async ({ signal: querySignal }): Promise<NowResponse> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.now.$get(
          { query: { scope: 'self' } },
          { init: { signal } },
        );
        const okRes = await assertOk(res);
        const data = await parseJson(okRes, nowResponseSchema, 'GET /now');
        if (cacheBinding) {
          void writeCachedNowFeed(cacheBinding, data, { noticesVisible });
        }
        return data;
      } finally {
        cleanup();
      }
    },
    enabled: !!profileId,
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

  return useApiQuery({
    // [WI-2498] Actor-bound, matching the now-feed key above.
    queryKey: ['now-overflow', userId, profileId],
    enabled,
    schema: nowOverflowResponseSchema,
    fetch: (signal) =>
      client.now.overflow.$get(
        { query: { scope: 'self' } },
        { init: { signal } },
      ),
    select: (json) => json,
  });
}
