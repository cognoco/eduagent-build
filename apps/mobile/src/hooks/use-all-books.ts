import { useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { CurriculumBook, BookProgressStatus } from '@eduagent/schemas';
import type { EnrichedBook } from '../lib/library-filters';
import { useSubjects } from './use-subjects';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

/**
 * Aggregates books across all subjects into a flat `EnrichedBook[]`.
 *
 * Uses `useQueries` to fetch books per subject (reuses the
 * `['books', subjectId]` query key so TanStack Query deduplicates with
 * existing `useBooks` calls).
 *
 * **Progress baseline:** `topicCount` and `completedCount` are 0 at the list
 * level. Per-book detail (accurate counts + status) requires a `BookWithTopics`
 * fetch that only happens when the user drills into a specific book. The
 * `status` field uses `topicsGenerated` as a heuristic: generated books are
 * `IN_PROGRESS`, others are `NOT_STARTED`. This matches the existing
 * `ShelfView` component behavior.
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
  const subjectsQuery = useSubjects({ includeInactive: true });
  const subjects = subjectsQuery.data ?? [];

  const bookQueries = useQueries({
    queries: subjects.map((subject) => ({
      queryKey: ['books', subject.id, activeProfile?.id],
      queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
        const { signal, cleanup } = combinedSignal(querySignal);
        try {
          const res = await client.subjects[':subjectId'].books.$get(
            { param: { subjectId: subject.id } },
            { init: { signal } }
          );
          await assertOk(res);
          const data = (await res.json()) as { books: CurriculumBook[] };
          return { books: data.books, subjectId: subject.id };
        } finally {
          cleanup();
        }
      },
      enabled: !!activeProfile && !!subject.id,
    })),
  });

  // CR-5 fix: Derive memo deps from stable per-query values, not the
  // bookQueries array ref (which is new every render). We join
  // `dataUpdatedAt` timestamps into a single string as a stable cache key
  // that only changes when actual data arrives.
  const dataKey = bookQueries.map((q) => q.dataUpdatedAt).join(',');

  const books = useMemo<EnrichedBook[]>(() => {
    return subjects.flatMap((subject, index) => {
      const queryData = bookQueries[index]?.data;
      if (!queryData) return [];
      return queryData.books.map((book) => ({
        book,
        subjectId: subject.id,
        subjectName: subject.name,
        topicCount: 0,
        completedCount: 0,
        status: (book.topicsGenerated
          ? 'IN_PROGRESS'
          : 'NOT_STARTED') as BookProgressStatus,
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataKey is a stable proxy for bookQueries data changes
  }, [subjects, dataKey]);

  const isLoading =
    subjectsQuery.isLoading ||
    (subjects.length > 0 && bookQueries.some((q) => q.isLoading));

  const isError = subjectsQuery.isError || bookQueries.some((q) => q.isError);

  const refetch = (): void => {
    void subjectsQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['books'] });
  };

  return { books, isLoading, isError, refetch };
}
