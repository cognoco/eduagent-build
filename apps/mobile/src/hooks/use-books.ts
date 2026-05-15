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
  GetAllProfileBooksResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useBooks(
  subjectId: string | undefined,
): UseQueryResult<CurriculumBook[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['books', subjectId, activeProfile?.id],
    initialData: () => {
      if (!activeProfile?.id || !subjectId) return undefined;
      const cachedLibrary =
        queryClient.getQueryData<GetAllProfileBooksResponse>([
          'library',
          'books',
          activeProfile.id,
        ]);
      return cachedLibrary?.subjects.find((s) => s.subjectId === subjectId)
        ?.books;
    },
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId) throw new Error('subjectId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].books.$get(
          { param: { subjectId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as { books: CurriculumBook[] };
        return data.books;
      } finally {
        cleanup();
      }
    },
    select: (data) => {
      const normalized = data as
        | CurriculumBook[]
        | { books?: CurriculumBook[] };
      if (Array.isArray(normalized)) {
        return normalized;
      }
      return Array.isArray(normalized.books) ? normalized.books : [];
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useBookWithTopics(
  subjectId: string | undefined,
  bookId: string | undefined,
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
        const res = await client.subjects[':subjectId'].books[':bookId'].$get(
          { param: { subjectId, bookId } },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as BookWithTopics;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!bookId,
  });
}

/**
 * Internal mutation variables type — wraps the API input with the routing
 * params so onSuccess can use the exact IDs that were submitted, avoiding a
 * stale closure when the component re-renders with new params while the
 * mutation is in flight. [3F.7]
 */
interface GenerateBookTopicsVars {
  subjectId: string;
  bookId: string;
  input: BookTopicGenerateInput | undefined;
}

export function useGenerateBookTopics(
  subjectId: string | undefined,
  bookId: string | undefined,
): UseMutationResult<
  BookWithTopics,
  Error,
  BookTopicGenerateInput | undefined
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  // Internal mutation that carries subjectId + bookId in its variables so that
  // onSuccess always invalidates the queries for the book that was actually
  // generated, not whatever IDs happen to be in scope when the callback fires.
  const internalMutation = useMutation<
    BookWithTopics,
    Error,
    GenerateBookTopicsVars
  >({
    mutationFn: async ({
      subjectId: sid,
      bookId: bid,
      input,
    }: GenerateBookTopicsVars): Promise<BookWithTopics> => {
      const res = await client.subjects[':subjectId'].books[':bookId'][
        'generate-topics'
      ].$post({
        param: { subjectId: sid, bookId: bid },
        json: input ?? {},
      });
      await assertOk(res);
      return (await res.json()) as BookWithTopics;
    },
    onSuccess: (_data, variables) => {
      // Use variables.subjectId / variables.bookId — the IDs from the actual
      // request — not the closed-over hook params which may have changed if
      // the user navigated between subjects while generation was in flight.
      const { subjectId: sid, bookId: bid } = variables;
      // Scope invalidation to the affected subject to avoid re-fetching every
      // book/curriculum query across all subjects (over-invalidation).
      void queryClient.invalidateQueries({
        queryKey: ['books', sid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['book', sid, bid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', sid],
      });
    },
  });

  // Expose a public-facing mutation result with the original
  // BookTopicGenerateInput | undefined variable type so callers do not need
  // to know about the internal routing-param wrapping.
  // Full cast is required because GenerateBookTopicsVars (internal) has no
  // overlap with BookTopicGenerateInput | undefined (public API). [3F.7]
  const publicMutation = internalMutation as unknown as UseMutationResult<
    BookWithTopics,
    Error,
    BookTopicGenerateInput | undefined
  >;
  return {
    ...publicMutation,
    mutate: (
      input: BookTopicGenerateInput | undefined,
      options?: Parameters<typeof publicMutation.mutate>[1],
    ) => {
      if (!subjectId || !bookId) return;
      internalMutation.mutate(
        { subjectId, bookId, input },
        options as Parameters<typeof internalMutation.mutate>[1],
      );
    },
    mutateAsync: async (
      input: BookTopicGenerateInput | undefined,
      options?: Parameters<typeof publicMutation.mutateAsync>[1],
    ) => {
      if (!subjectId || !bookId) {
        throw new Error(
          'Cannot generate topics: subjectId and bookId are required',
        );
      }
      return internalMutation.mutateAsync(
        { subjectId, bookId, input },
        options as Parameters<typeof internalMutation.mutateAsync>[1],
      );
    },
  } as UseMutationResult<
    BookWithTopics,
    Error,
    BookTopicGenerateInput | undefined
  >;
}
