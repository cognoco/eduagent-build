import { useEffect, useState } from 'react';
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

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { readCachedNowFeed, writeCachedNowFeed } from '../lib/now-feed-cache';
import { parseJson } from '../lib/parse-json';
import { useApiQuery } from './use-api-query';

const NOW_FEED_STALE_TIME_MS = 30_000;
const NOW_FEED_SLOW_FALLBACK_MS = 2_000;

export function nowFeedQueryKey(
  profileId: string,
): readonly ['now-feed', string] {
  if (typeof profileId !== 'string') {
    throw new Error('nowFeedQueryKey requires a profile ID');
  }
  return ['now-feed', profileId];
}

export type NowFeedQueryResult = UseQueryResult<NowResponse> & {
  fallbackFeed: NowResponse | null;
  isSlowFallback: boolean;
};

interface ProfileScopedNowFeedFallback {
  profileId: string;
  feed: NowResponse;
  isSlowFallback: boolean;
}

export function useNowFeed(): NowFeedQueryResult {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;
  const [fallback, setFallback] = useState<ProfileScopedNowFeedFallback | null>(
    null,
  );

  const query = useQuery({
    queryKey: profileId
      ? nowFeedQueryKey(profileId)
      : (['now-feed', undefined] as const),
    queryFn: async ({ signal: querySignal }): Promise<NowResponse> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.now.$get(
          { query: { scope: 'self' } },
          { init: { signal } },
        );
        const okRes = await assertOk(res);
        const data = await parseJson(okRes, nowResponseSchema, 'GET /now');
        if (profileId) {
          void writeCachedNowFeed(profileId, data);
        }
        return data;
      } finally {
        cleanup();
      }
    },
    enabled: !!profileId,
    staleTime: NOW_FEED_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!profileId || !query.isFetching || query.data) {
      setFallback((current) => {
        if (!query.isError) return null;
        if (!current || current.profileId !== profileId) return current;
        return { ...current, isSlowFallback: false };
      });
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void readCachedNowFeed(profileId).then((cached) => {
        if (cancelled || !cached) return;
        setFallback({ profileId, feed: cached, isSlowFallback: true });
      });
    }, NOW_FEED_SLOW_FALLBACK_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profileId, query.data, query.isError, query.isFetching]);

  const currentProfileFallback =
    fallback?.profileId === profileId ? fallback : null;

  return {
    ...query,
    fallbackFeed: currentProfileFallback?.feed ?? null,
    isSlowFallback: currentProfileFallback?.isSlowFallback ?? false,
  };
}

export function useMentorNoticeActions() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();
  const issuedForProfileId = activeProfile?.id;

  const invalidate = async (): Promise<void> => {
    if (!issuedForProfileId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: nowFeedQueryKey(issuedForProfileId),
      }),
      queryClient.invalidateQueries({
        queryKey: ['now-overflow', issuedForProfileId],
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
  const profileId = activeProfile?.id;

  return useApiQuery({
    queryKey: ['now-overflow', profileId],
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
