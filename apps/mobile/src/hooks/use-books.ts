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
      if (!subjectId) throw new Error('subjectId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].books.$get({
          param: { subjectId },
          init: { signal },
        } as never);
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
      if (!subjectId || !bookId)
        throw new Error('subjectId and bookId are required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].books[':bookId'].$get({
          param: { subjectId, bookId },
          init: { signal },
        } as never);
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
      if (!subjectId || !bookId) {
        throw new Error(
          'Cannot generate topics: subjectId and bookId are required'
        );
      }
      const res = await client.subjects[':subjectId'].books[':bookId'][
        'generate-topics'
      ].$post({
        param: { subjectId, bookId },
        json: input ?? {},
      } as never);
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
