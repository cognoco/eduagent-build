import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  CurriculumBook,
  BookWithTopics,
  BookTopicGenerateInput,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useBooks(
  subjectId: string | undefined
): UseQueryResult<CurriculumBook[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['books', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- books route WIP, RPC type not yet inferred
        const res = await (client.subjects[':subjectId'] as any).books.$get({
          param: { subjectId: subjectId! },
          init: { signal },
        });
        await assertOk(res);
        const data = (await res.json()) as { books: CurriculumBook[] };
        return data.books;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useBookWithTopics(
  subjectId: string | undefined,
  bookId: string | undefined
): UseQueryResult<BookWithTopics | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['book', subjectId, bookId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- books route WIP, RPC type not yet inferred
        const res = await (client.subjects[':subjectId'] as any).books[
          ':bookId'
        ].$get({
          param: { subjectId: subjectId!, bookId: bookId! },
          init: { signal },
        });
        await assertOk(res);
        return (await res.json()) as BookWithTopics;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!bookId,
  });
}

export function useGenerateBookTopics(
  subjectId: string | undefined,
  bookId: string | undefined
): UseMutationResult<
  BookWithTopics,
  Error,
  BookTopicGenerateInput | undefined
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input?: BookTopicGenerateInput
    ): Promise<BookWithTopics> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- books route WIP, RPC type not yet inferred
      const res = await (client.subjects[':subjectId'] as any).books[':bookId'][
        'generate-topics'
      ].$post({
        param: { subjectId: subjectId!, bookId: bookId! },
        json: input ?? {},
      });
      await assertOk(res);
      return (await res.json()) as BookWithTopics;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['books', subjectId] });
      void queryClient.invalidateQueries({
        queryKey: ['book', subjectId, bookId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', subjectId],
      });
    },
  });
}
