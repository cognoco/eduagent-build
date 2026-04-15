import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAllBooks } from './use-all-books';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSubjectsResponse(subjects: Array<{ id: string; name: string }>) {
  return new Response(
    JSON.stringify({
      subjects: subjects.map((s) => ({
        ...s,
        status: 'active',
        profileId: 'test-profile-id',
      })),
    }),
    { status: 200 }
  );
}

function makeBooksResponse(
  books: Array<{
    id: string;
    title: string;
    subjectId: string;
    topicsGenerated?: boolean;
  }>
) {
  return new Response(
    JSON.stringify({
      books: books.map((b) => ({
        id: b.id,
        subjectId: b.subjectId,
        title: b.title,
        description: null,
        emoji: null,
        sortOrder: 0,
        topicsGenerated: b.topicsGenerated ?? false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    }),
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAllBooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns enriched books from multiple subjects', async () => {
    // First call: subjects list
    mockFetch.mockResolvedValueOnce(
      makeSubjectsResponse([
        { id: 's1', name: 'Math' },
        { id: 's2', name: 'Science' },
      ])
    );
    // Second call: books for s1
    mockFetch.mockResolvedValueOnce(
      makeBooksResponse([
        { id: 'b1', title: 'Algebra', subjectId: 's1', topicsGenerated: true },
        {
          id: 'b2',
          title: 'Geometry',
          subjectId: 's1',
          topicsGenerated: false,
        },
      ])
    );
    // Third call: books for s2
    mockFetch.mockResolvedValueOnce(
      makeBooksResponse([
        {
          id: 'b3',
          title: 'Physics',
          subjectId: 's2',
          topicsGenerated: true,
        },
      ])
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      // Only books with topicsGenerated=true are included (b1, b3).
      // Unbuilt books (b2, topicsGenerated=false) are filtered out.
      expect(result.current.books.length).toBe(2);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);

    // Verify enrichment: each book has subjectId + subjectName attached
    const algebra = result.current.books.find((b) => b.book.id === 'b1');
    expect(algebra).toBeDefined();
    expect(algebra!.subjectId).toBe('s1');
    expect(algebra!.subjectName).toBe('Math');
    expect(algebra!.status).toBe('IN_PROGRESS'); // topicsGenerated = true

    // b2 (Geometry, topicsGenerated=false) should NOT appear
    const geometry = result.current.books.find((b) => b.book.id === 'b2');
    expect(geometry).toBeUndefined();

    const physics = result.current.books.find((b) => b.book.id === 'b3');
    expect(physics).toBeDefined();
    expect(physics!.subjectId).toBe('s2');
    expect(physics!.subjectName).toBe('Science');
    expect(physics!.status).toBe('IN_PROGRESS');
  });

  it('excludes unbuilt books (topicsGenerated=false) from results', async () => {
    mockFetch.mockResolvedValueOnce(
      makeSubjectsResponse([{ id: 's1', name: 'Math' }])
    );
    mockFetch.mockResolvedValueOnce(
      makeBooksResponse([
        { id: 'b1', title: 'Algebra', subjectId: 's1', topicsGenerated: true },
        {
          id: 'b2',
          title: 'Not Built Yet',
          subjectId: 's1',
          topicsGenerated: false,
        },
        {
          id: 'b3',
          title: 'Also Not Built',
          subjectId: 's1',
          topicsGenerated: false,
        },
      ])
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.books.length).toBe(1);
    });

    // Only the built book is included
    expect(result.current.books[0]!.book.id).toBe('b1');
    // Unbuilt books are excluded from the count
    expect(
      result.current.books.find((b) => b.book.id === 'b2')
    ).toBeUndefined();
    expect(
      result.current.books.find((b) => b.book.id === 'b3')
    ).toBeUndefined();
  });

  it('returns empty array when no subjects exist', async () => {
    mockFetch.mockResolvedValueOnce(makeSubjectsResponse([]));

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.books).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it('returns empty array when subjects have no books', async () => {
    mockFetch.mockResolvedValueOnce(
      makeSubjectsResponse([{ id: 's1', name: 'Math' }])
    );
    mockFetch.mockResolvedValueOnce(makeBooksResponse([]));

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.books).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it('sets isError when a books query fails', async () => {
    mockFetch.mockResolvedValueOnce(
      makeSubjectsResponse([{ id: 's1', name: 'Math' }])
    );
    mockFetch.mockResolvedValueOnce(
      new Response('Server error', { status: 500 })
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('sets topicCount and completedCount to 0 (baseline)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeSubjectsResponse([{ id: 's1', name: 'Math' }])
    );
    mockFetch.mockResolvedValueOnce(
      makeBooksResponse([
        { id: 'b1', title: 'Algebra', subjectId: 's1', topicsGenerated: true },
      ])
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.books.length).toBe(1);
    });

    // Per-book topic counts are 0 at the list level (detail requires BookWithTopics fetch)
    const first = result.current.books[0];
    expect(first).toBeDefined();
    expect(first!.topicCount).toBe(0);
    expect(first!.completedCount).toBe(0);
  });

  it('exposes a refetch function', async () => {
    mockFetch.mockResolvedValueOnce(makeSubjectsResponse([]));

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });

  it('stores per-subject books in the shared books cache as an array', async () => {
    mockFetch.mockResolvedValueOnce(
      makeSubjectsResponse([{ id: 's1', name: 'Math' }])
    );
    mockFetch.mockResolvedValueOnce(
      makeBooksResponse([
        { id: 'b1', title: 'Algebra', subjectId: 's1', topicsGenerated: true },
      ])
    );

    renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData(['books', 's1', 'test-profile-id'])
      ).toEqual([
        expect.objectContaining({
          id: 'b1',
          subjectId: 's1',
          title: 'Algebra',
        }),
      ]);
    });
  });
});
