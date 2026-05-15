// ---------------------------------------------------------------------------
// use-books hook tests [4B.4]
// ---------------------------------------------------------------------------

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useBooks,
  useBookWithTopics,
  useGenerateBookTopics,
} from './use-books';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', {
      fetch: async (...args: unknown[]) => {
        const res = await mockFetch(...(args as Parameters<typeof fetch>));
        if (!res.ok) {
          const text = await res
            .clone()
            .text()
            .catch(() => res.statusText);
          throw new Error(`API error ${res.status}: ${text}`);
        }
        return res;
      },
    });
  },
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'test-profile-id' },
  }),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

const mockBooks = [
  {
    id: 'book-1',
    subjectId: 'subject-1',
    title: 'Ancient Egypt',
    description: 'Explore pyramids and pharaohs',
    emoji: '🏛️',
    sortOrder: 1,
    topicsGenerated: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'book-2',
    subjectId: 'subject-1',
    title: 'Ancient Greece',
    description: 'Gods, heroes, and democracy',
    emoji: '⚔️',
    sortOrder: 2,
    topicsGenerated: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const mockBookWithTopics = {
  book: mockBooks[0],
  topics: [
    {
      id: 'topic-1',
      title: 'Timeline',
      description: 'How it all began',
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: 'book-1',
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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

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
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    const { result } = renderHook(() => useBooks('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain('Network request failed');
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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

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

  it('handles API error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const { result } = renderHook(
      () => useBookWithTopics('subject-1', 'nonexistent'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useGenerateBookTopics
// ---------------------------------------------------------------------------

describe('useGenerateBookTopics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

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

    // Should invalidate books, book detail, and curriculum queries
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['books', 'subject-1'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['book', 'subject-1', 'book-1'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['curriculum', 'subject-1'] }),
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

    // Should invalidate using the LATEST IDs (subject-2, book-2), not stale ones
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['books', 'subject-2'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['book', 'subject-2', 'book-2'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['curriculum', 'subject-2'] }),
    );
  });
});
