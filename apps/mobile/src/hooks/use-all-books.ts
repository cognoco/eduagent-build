import { useEffect, useMemo } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type {
  CurriculumBook,
  BookProgressStatus,
  GetAllProfileBooksResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import {
  combinedSignal,
  LEARNING_ENTRY_QUERY_TIMEOUT_MS,
} from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export interface EnrichedBook {
  book: CurriculumBook;
  subjectId: string;
  subjectName: string;
  topicCount: number;
  completedCount: number;
  status: BookProgressStatus;
}

const PAGE_SIZE = 20;

/**
 * Aggregates books across all subjects into a flat `EnrichedBook[]`.
 *
 * [BUG-733 / PERF-3] One-shot fetch via `/library/books`. Previous version
 * used `useQueries` to fan out N parallel `/subjects/:id/books` calls on
 * Library mount; the new server endpoint batches the join in a single
 * round-trip (4 DB queries total instead of 4 per subject).
 *
 * [WI-966] Now uses cursor-based infinite pagination so library mount no
 * longer requires returning every subject and book in one response — the
 * SERVER query is bounded to `PAGE_SIZE` subjects per round-trip (the AC's
 * goal). The hook then AUTO-DRAINS remaining pages (see effect below) so
 * `books` always contains every book exactly as the previous one-shot version
 * did, preserving existing book-list behaviour for callers like `library.tsx`
 * that consume the full flattened list rather than driving an infinite scroll.
 * `fetchNextPage()` / `hasNextPage` remain exposed for callers that DO want to
 * drive pagination on scroll.
 *
 * **Progress baseline:** `topicCount` and `completedCount` are 0 at the list
 * level. Per-book detail (accurate counts + status) requires a `BookWithTopics`
 * fetch that only happens when the user drills into a specific book.
 */
export function useAllBooks(): {
  books: EnrichedBook[];
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** True once all pages have loaded (no pending auto-drain). Gate any UI that
   *  must show a complete book list (e.g. delete-scope counts) on this flag,
   *  not `isLoading`, because `isLoading` goes false after the first page
   *  settles while auto-drain of pages 2, 3, … is still in flight. */
  isFullyLoaded: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
} {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  const libraryBooksQuery = useInfiniteQuery({
    queryKey: ['library', 'books', activeProfile?.id],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({
      pageParam,
      signal: querySignal,
    }: {
      pageParam: string | undefined;
      signal?: AbortSignal;
    }) => {
      const { signal, cleanup } = combinedSignal(
        querySignal,
        LEARNING_ENTRY_QUERY_TIMEOUT_MS,
      );
      try {
        const res = await client.library.books.$get(
          {
            query: {
              limit: String(PAGE_SIZE),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as GetAllProfileBooksResponse;
      } finally {
        cleanup();
      }
    },
    getNextPageParam: (lastPage: GetAllProfileBooksResponse) =>
      lastPage.nextCursor ?? undefined,
    enabled: !!activeProfile,
  });

  // [WI-966] Auto-drain remaining pages. The server query is bounded per page,
  // but library.tsx consumes the full flattened book list (booksBySubjectId,
  // delete-scope readiness, header topic totals), so we keep loading until the
  // cursor is exhausted. This preserves the pre-pagination behaviour (every
  // book present) without un-bounding the server query.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = libraryBooksQuery;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const books = useMemo<EnrichedBook[]>(() => {
    const data = libraryBooksQuery.data as
      | InfiniteData<GetAllProfileBooksResponse>
      | undefined;
    if (!data?.pages) return [];
    return data.pages.flatMap((page) =>
      page.subjects.flatMap((subject) =>
        subject.books
          .filter((book) => book.topicsGenerated)
          .map((book) => ({
            book,
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            topicCount: 0,
            completedCount: 0,
            status: (book.status ??
              (book.topicsGenerated
                ? 'IN_PROGRESS'
                : 'NOT_STARTED')) as BookProgressStatus,
          })),
      ),
    );
  }, [libraryBooksQuery.data]);

  const refetch = (): void => {
    void libraryBooksQuery.refetch();
    // Also bust per-subject cache — drill-into-book uses /subjects/:id/books
    // separately and otherwise wouldn't notice changes.
    void queryClient.invalidateQueries({ queryKey: ['books'] });
  };

  return {
    books,
    isLoading: libraryBooksQuery.isLoading,
    isSuccess: libraryBooksQuery.isSuccess,
    isError: libraryBooksQuery.isError,
    hasNextPage,
    isFetchingNextPage,
    isFullyLoaded:
      libraryBooksQuery.isSuccess && !hasNextPage && !isFetchingNextPage,
    fetchNextPage: (): void => {
      void fetchNextPage();
    },
    refetch,
  };
}
