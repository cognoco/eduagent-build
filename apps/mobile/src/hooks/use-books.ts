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
  BookDeleteInput,
  DeleteBookResponse,
  GetAllProfileBooksResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import {
  combinedSignal,
  LEARNING_ENTRY_QUERY_TIMEOUT_MS,
} from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { NetworkError } from '../lib/api-errors';

const BOOK_DETAIL_NETWORK_RETRY_LIMIT = 4;
const BOOK_DETAIL_DEFAULT_RETRY_LIMIT = 2;

function retryBookDetailRead(failureCount: number, error: unknown): boolean {
  if (error instanceof NetworkError) {
    return failureCount < BOOK_DETAIL_NETWORK_RETRY_LIMIT;
  }

  return failureCount < BOOK_DETAIL_DEFAULT_RETRY_LIMIT;
}

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
      const { signal, cleanup } = combinedSignal(
        querySignal,
        LEARNING_ENTRY_QUERY_TIMEOUT_MS,
      );
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

  return useQuery<BookWithTopics | null, Error>({
    queryKey: ['book', subjectId, bookId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !bookId)
        throw new Error('subjectId and bookId are required');
      const { signal, cleanup } = combinedSignal(
        querySignal,
        LEARNING_ENTRY_QUERY_TIMEOUT_MS,
      );
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
    retry: retryBookDetailRead,
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

interface DeleteBookVars {
  subjectId: string;
  bookId: string;
  input: BookDeleteInput;
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
  const { activeProfile } = useProfile();
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
      // [BUG-162] Scope invalidation to the affected subject AND active
      // profile so a mutation on this profile never touches another
      // profile's cache on a shared device. The query keys for books/book/
      // curriculum already include profileId as the trailing key segment.
      const pid = activeProfile?.id;
      void queryClient.invalidateQueries({
        queryKey: ['books', sid, pid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['book', sid, bid, pid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', sid, pid],
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

export function useDeleteBook(
  subjectId: string | undefined,
  bookId: string | undefined,
): UseMutationResult<DeleteBookResponse, Error, BookDeleteInput> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  const internalMutation = useMutation<
    DeleteBookResponse,
    Error,
    DeleteBookVars
  >({
    mutationFn: async ({
      subjectId: sid,
      bookId: bid,
      input,
    }: DeleteBookVars): Promise<DeleteBookResponse> => {
      const res = await client.subjects[':subjectId'].books[':bookId'].$delete({
        param: { subjectId: sid, bookId: bid },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as DeleteBookResponse;
    },
    onSuccess: (_data, variables) => {
      const { subjectId: sid, bookId: bid } = variables;
      const pid = activeProfile?.id;
      void queryClient.invalidateQueries({
        queryKey: ['books', sid, pid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['book', sid, bid, pid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['library', 'books', pid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', sid, pid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['book-sessions', sid, bid, pid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['book-notes', sid, bid, pid],
      });
      void queryClient.invalidateQueries({ queryKey: ['retention'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });

  const publicMutation = internalMutation as unknown as UseMutationResult<
    DeleteBookResponse,
    Error,
    BookDeleteInput
  >;
  return {
    ...publicMutation,
    mutate: (
      input: BookDeleteInput,
      options?: Parameters<typeof publicMutation.mutate>[1],
    ) => {
      if (!subjectId || !bookId) return;
      internalMutation.mutate(
        { subjectId, bookId, input },
        options as Parameters<typeof internalMutation.mutate>[1],
      );
    },
    mutateAsync: async (
      input: BookDeleteInput,
      options?: Parameters<typeof publicMutation.mutateAsync>[1],
    ) => {
      if (!subjectId || !bookId) {
        throw new Error(
          'Cannot delete book: subjectId and bookId are required',
        );
      }
      return internalMutation.mutateAsync(
        { subjectId, bookId, input },
        options as Parameters<typeof internalMutation.mutateAsync>[1],
      );
    },
  } as UseMutationResult<DeleteBookResponse, Error, BookDeleteInput>;
}
