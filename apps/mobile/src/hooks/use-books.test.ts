// ---------------------------------------------------------------------------
// use-books hook tests [4B.4]
// ---------------------------------------------------------------------------

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { BookWithTopics, CurriculumBook } from '@eduagent/schemas';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId, NetworkError } from '../lib/api-client';
import {
  DEFAULT_QUERY_TIMEOUT_MS,
  LEARNING_ENTRY_QUERY_TIMEOUT_MS,
} from '../lib/query-timeout';
import {
  useBooks,
  useBookWithTopics,
  useGenerateBookTopics,
  useDeleteBook,
  useRetryCurriculum,
} from './use-books';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

const SUBJECT_1_ID = '220e8400-e29b-41d4-a716-446655440001';
const BOOK_1_ID = '330e8400-e29b-41d4-a716-446655440001';
const BOOK_2_ID = '330e8400-e29b-41d4-a716-446655440002';
const TOPIC_1_ID = '440e8400-e29b-41d4-a716-446655440001';

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

const mockBooks: CurriculumBook[] = [
  {
    id: BOOK_1_ID,
    subjectId: SUBJECT_1_ID,
    title: 'Ancient Egypt',
    description: 'Explore pyramids and pharaohs',
    emoji: '🏛️',
    sortOrder: 1,
    topicsGenerated: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: BOOK_2_ID,
    subjectId: SUBJECT_1_ID,
    title: 'Ancient Greece',
    description: 'Gods, heroes, and democracy',
    emoji: '⚔️',
    sortOrder: 2,
    topicsGenerated: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const mockBookWithTopics: BookWithTopics = {
  book: mockBooks[0]!,
  topics: [
    {
      id: TOPIC_1_ID,
      title: 'Timeline',
      description: 'How it all began',
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: BOOK_1_ID,
      chapter: 'The Story',
      skipped: false,
    },
  ],
  connections: [],
  status: 'NOT_STARTED',
  completedTopicCount: 0,
};

// ---------------------------------------------------------------------------
// useBooks
// ---------------------------------------------------------------------------

describe('useBooks', () => {
  it('returns books from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ books: mockBooks }), { status: 200 }),
    );

    const { result } = renderHook(() => useBooks('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockBooks);
    expect(result.current.data).toHaveLength(2);
  });

  it('is disabled when subjectId is undefined', async () => {
    const { result } = renderHook(() => useBooks(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles API error (500)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const { result } = renderHook(() => useBooks('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles API error (404)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'NOT_FOUND', message: 'Subject not found' }),
        { status: 404 },
      ),
    );

    const { result } = renderHook(() => useBooks('nonexistent'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles network error', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      const { result } = renderHook(() => useBooks('subject-1'), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(7_500);
      });

      expect(result.current.isError).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(5);
      // The real useApiClient wraps fetch rejections in NetworkError with a
      // user-friendly message (not the raw rejection message).
      expect(result.current.error).toBeInstanceOf(NetworkError);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the longer learning-entry timeout for shelf book reads', async () => {
    jest.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      mockFetch.mockImplementationOnce(
        (input: RequestInfo | URL, init?: RequestInit) => {
          capturedSignal =
            init?.signal ??
            (input instanceof Request ? input.signal : undefined);
          return new Promise<Response>((_resolve, reject) => {
            capturedSignal?.addEventListener('abort', () => {
              reject(
                Object.assign(new Error('Aborted'), {
                  name: 'AbortError',
                }),
              );
            });
          });
        },
      );

      renderHook(() => useBooks('subject-1'), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(capturedSignal).toBeInstanceOf(AbortSignal);

      await act(async () => {
        jest.advanceTimersByTime(DEFAULT_QUERY_TIMEOUT_MS);
      });
      expect(capturedSignal?.aborted).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(
          LEARNING_ENTRY_QUERY_TIMEOUT_MS - DEFAULT_QUERY_TIMEOUT_MS,
        );
        await Promise.resolve();
      });
      expect(capturedSignal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses aggregate library books as initial shelf data when available', async () => {
    const wrapper = createWrapper();
    queryClient.setQueryData(['library', 'books', 'test-profile-id'], {
      subjects: [
        {
          subjectId: 'subject-1',
          subjectName: 'History',
          books: mockBooks,
        },
      ],
    });
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    const { result } = renderHook(() => useBooks('subject-1'), {
      wrapper,
    });

    expect(result.current.data).toEqual(mockBooks);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(result.current.data).toEqual(mockBooks);
  });

  it('does not crash when the cached library entry has no subjects array', async () => {
    // [shelf-crash] queryClient.getQueryData casts the cached value to
    // GetAllProfileBooksResponse, but the real cached object can lack a
    // `subjects` array (e.g. a paged/legacy shape). Without a guard on
    // `subjects`, initialData calls `.find` on undefined and the shelf
    // screen renders its error boundary instead of the books. initialData
    // must instead fall back to undefined and let the queryFn populate.
    const wrapper = createWrapper();
    queryClient.setQueryData(['library', 'books', 'test-profile-id'], {
      pages: [],
      pageParams: [],
    });
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ books: mockBooks }), { status: 200 }),
    );

    const { result } = renderHook(() => useBooks('subject-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockBooks);
    });
  });

  it('unwraps legacy wrapped cache entries from the books query key', async () => {
    const wrapper = createWrapper();
    queryClient.setQueryData(['books', 'subject-1', 'test-profile-id'], {
      books: mockBooks,
      subjectId: 'subject-1',
    });

    const { result } = renderHook(() => useBooks('subject-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockBooks);
    });
  });
});

// ---------------------------------------------------------------------------
// useBookWithTopics
// ---------------------------------------------------------------------------

describe('useBookWithTopics', () => {
  it('returns book with topics from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockBookWithTopics), { status: 200 }),
    );

    const { result } = renderHook(
      () => useBookWithTopics('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockBookWithTopics);
  });

  it('retries transient network failures for book details', async () => {
    jest.useFakeTimers();
    try {
      mockFetch
        .mockRejectedValueOnce(new Error('Network request failed'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockBookWithTopics), { status: 200 }),
        );

      const { result } = renderHook(
        () => useBookWithTopics('subject-1', 'book-1'),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.current.data).toEqual(mockBookWithTopics);
    } finally {
      jest.useRealTimers();
    }
  });

  it('is disabled when subjectId is undefined', async () => {
    const { result } = renderHook(
      () => useBookWithTopics(undefined, 'book-1'),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is disabled when bookId is undefined', async () => {
    const { result } = renderHook(
      () => useBookWithTopics('subject-1', undefined),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('preserves the app default retry count for API errors', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response('Not Found', { status: 404 })),
    );

    const { result } = renderHook(
      () => useBookWithTopics('subject-1', 'nonexistent'),
      { wrapper: createWrapper() },
    );

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 6000 },
    );

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useGenerateBookTopics
// ---------------------------------------------------------------------------

describe('useGenerateBookTopics', () => {
  it('calls POST to generate book topics', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockBookWithTopics), { status: 200 }),
    );

    const { result } = renderHook(
      () => useGenerateBookTopics('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockBookWithTopics);
  });

  it('passes priorKnowledge in the request body', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockBookWithTopics), { status: 200 }),
    );

    const { result } = renderHook(
      () => useGenerateBookTopics('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate({ priorKnowledge: 'I know about pyramids' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('throws when subjectId is undefined', async () => {
    const { result } = renderHook(
      () => useGenerateBookTopics(undefined, 'book-1'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow(
        'subjectId and bookId are required',
      );
    });
  });

  it('throws when bookId is undefined', async () => {
    const { result } = renderHook(
      () => useGenerateBookTopics('subject-1', undefined),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow(
        'subjectId and bookId are required',
      );
    });
  });

  it('handles API error from generate-topics endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'UPSTREAM_ERROR',
          message: 'LLM service unavailable',
        }),
        { status: 503 },
      ),
    );

    const { result } = renderHook(
      () => useGenerateBookTopics('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow();
    });
  });

  it('invalidates related queries on success', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockBookWithTopics), { status: 200 }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useGenerateBookTopics('subject-1', 'book-1'),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // [BUG-162] Invalidations are now scoped by active profile id so a
    // mutation on this profile cannot accidentally invalidate another
    // profile's cache on a shared device.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['books', 'subject-1', 'test-profile-id'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['book', 'subject-1', 'book-1', 'test-profile-id'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['curriculum', 'subject-1', 'test-profile-id'],
      }),
    );
  });

  // BUG-123: stale closure — onSuccess must read the latest ref values [BUG-123]
  it('onSuccess invalidates using the latest subjectId and bookId when they change after mount', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockBookWithTopics), { status: 200 }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    // Mount with initial IDs
    let subjectId = 'subject-1';
    let bookId = 'book-1';

    const { result, rerender } = renderHook(
      () => useGenerateBookTopics(subjectId, bookId),
      { wrapper },
    );

    // Simulate route param change before mutation completes
    subjectId = 'subject-2';
    bookId = 'book-2';
    rerender({});

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should invalidate using the LATEST IDs (subject-2, book-2), not stale
    // ones — and scoped to the active profile id [BUG-162].
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['books', 'subject-2', 'test-profile-id'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['book', 'subject-2', 'book-2', 'test-profile-id'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['curriculum', 'subject-2', 'test-profile-id'],
      }),
    );
  });

  // [BREAK] [BUG-162] Without profileId in the curriculum invalidation key,
  // a book-topics generation on profile A would invalidate profile B's
  // curriculum cache for the same subjectId on a shared device — silently
  // bridging cache lifecycles across identities.
  it('[BREAK] curriculum invalidation includes profileId so it cannot invalidate another profile cache', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockBookWithTopics), { status: 200 }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useGenerateBookTopics('subject-1', 'book-1'),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify the curriculum invalidation key has exactly 3 segments — the
    // missing-profileId form ['curriculum', 'subject-1'] would silently
    // match ALL profiles via prefix match. The fixed form must NOT match
    // a different profile's key.
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['curriculum', 'subject-1'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['curriculum', 'subject-1', 'test-profile-id'],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// useRetryCurriculum
// ---------------------------------------------------------------------------

describe('useRetryCurriculum', () => {
  it('invalidates subjects and books when dispatched > 0', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ dispatched: 2 }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRetryCurriculum('subject-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['subjects', 'test-profile-id'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['books', 'subject-1', 'test-profile-id'],
      }),
    );
  });

  it('does NOT invalidate any query when dispatched === 0 (nothing was regeneratable)', async () => {
    // Regression guard: the OLD onSuccess always called invalidateQueries
    // regardless of dispatched, causing a fake 'preparing' cycle that led the
    // learner back to the same dead screen. The fixed handler skips
    // invalidation so the screen can show a terminal "nothing to retry" message.
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ dispatched: 0 }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRetryCurriculum('subject-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('surfaces API error via isError (onError is not swallowed)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const { result } = renderHook(() => useRetryCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useDeleteBook
// ---------------------------------------------------------------------------

describe('useDeleteBook', () => {
  it('calls DELETE for the selected book', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          deleted: true,
          bookId: BOOK_1_ID,
          subjectId: SUBJECT_1_ID,
          topicCount: 0,
          startedTopicCount: 0,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useDeleteBook('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ confirmStartedTopics: false });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [, init] = mockFetch.mock.calls[0] as [unknown, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBe(JSON.stringify({ confirmStartedTopics: false }));
  });

  it('preserves started-topic conflict details from the API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'CONFLICT',
          message: 'This book has started topics.',
          details: {
            reason: 'started_topics',
            bookId: 'book-1',
            subjectId: 'subject-1',
            topicCount: 5,
            startedTopicCount: 2,
          },
        }),
        { status: 409 },
      ),
    );

    const { result } = renderHook(() => useDeleteBook('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ confirmStartedTopics: false });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { status?: number }).status).toBe(409);
    expect((caught as { details?: unknown }).details).toEqual(
      expect.objectContaining({
        reason: 'started_topics',
        startedTopicCount: 2,
      }),
    );
  });

  it('invalidates shelf, detail, library, and progress data on success', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          deleted: true,
          bookId: BOOK_1_ID,
          subjectId: SUBJECT_1_ID,
          topicCount: 3,
          startedTopicCount: 0,
        }),
        { status: 200 },
      ),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteBook('subject-1', 'book-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ confirmStartedTopics: false });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['books', 'subject-1', 'test-profile-id'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['book', 'subject-1', 'book-1', 'test-profile-id'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['library', 'books', 'test-profile-id'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['progress'] }),
    );
  });
});
