import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CurriculumBook,
  BookProgressStatus,
  GetAllProfileBooksResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export interface EnrichedBook {
  book: CurriculumBook;
  subjectId: string;
  subjectName: string;
  topicCount: number;
  completedCount: number;
  status: BookProgressStatus;
}

/**
 * Aggregates books across all subjects into a flat `EnrichedBook[]`.
 *
 * [BUG-733 / PERF-3] One-shot fetch via `/library/books`. Previous version
 * used `useQueries` to fan out N parallel `/subjects/:id/books` calls on
 * Library mount; the new server endpoint batches the join in a single
 * round-trip (4 DB queries total instead of 4 per subject).
 *
 * **Progress baseline:** `topicCount` and `completedCount` are 0 at the list
 * level. Per-book detail (accurate counts + status) requires a `BookWithTopics`
 * fetch that only happens when the user drills into a specific book.
 */
export function useAllBooks(): {
  books: EnrichedBook[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  const libraryBooksQuery = useQuery({
    queryKey: ['library', 'books', activeProfile?.id],
    queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.library.books.$get({}, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as GetAllProfileBooksResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });

  const books = useMemo<EnrichedBook[]>(() => {
    const data = libraryBooksQuery.data;
    if (!data?.subjects) return [];
    return data.subjects.flatMap((subject) =>
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
    isError: libraryBooksQuery.isError,
    refetch,
  };
}
