import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Bookmark,
  BookmarkListResponse,
  SessionBookmark,
  SessionBookmarkListResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useBookmarks(options?: {
  subjectId?: string;
  topicId?: string;
  limit?: number;
  enabled?: boolean;
}): UseInfiniteQueryResult<InfiniteData<BookmarkListResponse>, Error> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useInfiniteQuery({
    queryKey: [
      'bookmarks',
      activeProfile?.id,
      options?.subjectId,
      options?.topicId,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.bookmarks.$get(
          {
            query: {
              ...(pageParam ? { cursor: pageParam } : {}),
              ...(options?.subjectId ? { subjectId: options.subjectId } : {}),
              ...(options?.topicId ? { topicId: options.topicId } : {}),
              ...(options?.limit ? { limit: String(options.limit) } : {}),
            },
          },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as BookmarkListResponse;
      } finally {
        cleanup();
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!activeProfile && (options?.enabled ?? true),
  });
}

export function useSessionBookmarks(
  sessionId: string | undefined,
): UseQueryResult<SessionBookmark[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['session-bookmarks', activeProfile?.id, sessionId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.bookmarks.session.$get(
          { query: { sessionId: sessionId ?? '' } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as SessionBookmarkListResponse;
        return data.bookmarks;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
  });
}

export function useCreateBookmark(): UseMutationResult<
  { bookmark: Bookmark },
  Error,
  { eventId: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async ({ eventId }) => {
      const res = await client.bookmarks.$post({
        json: { eventId },
      });
      await assertOk(res);
      return (await res.json()) as { bookmark: Bookmark };
    },
    onSuccess: (_data) => {
      void queryClient.invalidateQueries({
        queryKey: ['bookmarks', activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['session-bookmarks', activeProfile?.id],
      });
    },
  });
}

export function useDeleteBookmark(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      const res = await client.bookmarks[':id'].$delete({
        param: { id: bookmarkId },
      });
      await assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['bookmarks', activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['session-bookmarks', activeProfile?.id],
      });
    },
  });
}
