import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
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

interface BookFixture {
  id: string;
  title: string;
  topicsGenerated?: boolean;
}

interface SubjectFixture {
  subjectId: string;
  subjectName: string;
  books: BookFixture[];
}

function makeLibraryBooksResponse(subjects: SubjectFixture[]) {
  return new Response(
    JSON.stringify({
      subjects: subjects.map((s) => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        books: s.books.map((b) => ({
          id: b.id,
          subjectId: s.subjectId,
          title: b.title,
          description: null,
          emoji: null,
          sortOrder: 0,
          topicsGenerated: b.topicsGenerated ?? false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })),
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
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
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
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse([
        {
          subjectId: 's1',
          subjectName: 'Math',
          books: [
            { id: 'b1', title: 'Algebra', topicsGenerated: true },
            { id: 'b2', title: 'Geometry', topicsGenerated: false },
          ],
        },
        {
          subjectId: 's2',
          subjectName: 'Science',
          books: [{ id: 'b3', title: 'Physics', topicsGenerated: true }],
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
    expect(algebra).not.toBeUndefined();
    expect(algebra!.subjectId).toBe('s1');
    expect(algebra!.subjectName).toBe('Math');
    expect(algebra!.status).toBe('IN_PROGRESS'); // topicsGenerated = true

    // b2 (Geometry, topicsGenerated=false) should NOT appear
    const geometry = result.current.books.find((b) => b.book.id === 'b2');
    expect(geometry).toBeUndefined();

    const physics = result.current.books.find((b) => b.book.id === 'b3');
    expect(physics).not.toBeUndefined();
    expect(physics!.subjectId).toBe('s2');
    expect(physics!.subjectName).toBe('Science');
    expect(physics!.status).toBe('IN_PROGRESS');
  });

  it('excludes unbuilt books (topicsGenerated=false) from results', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse([
        {
          subjectId: 's1',
          subjectName: 'Math',
          books: [
            { id: 'b1', title: 'Algebra', topicsGenerated: true },
            { id: 'b2', title: 'Not Built Yet', topicsGenerated: false },
            { id: 'b3', title: 'Also Not Built', topicsGenerated: false },
          ],
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
    mockFetch.mockResolvedValueOnce(makeLibraryBooksResponse([]));

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
      makeLibraryBooksResponse([
        { subjectId: 's1', subjectName: 'Math', books: [] },
      ])
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.books).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it('sets isError when the library books query fails', async () => {
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
      makeLibraryBooksResponse([
        {
          subjectId: 's1',
          subjectName: 'Math',
          books: [{ id: 'b1', title: 'Algebra', topicsGenerated: true }],
        },
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
    expect(first).not.toBeUndefined();
    expect(first!.topicCount).toBe(0);
    expect(first!.completedCount).toBe(0);
  });

  it('exposes a refetch function', async () => {
    mockFetch.mockResolvedValueOnce(makeLibraryBooksResponse([]));

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });

  it('caches the aggregate response under the library books query key', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse([
        {
          subjectId: 's1',
          subjectName: 'Math',
          books: [{ id: 'b1', title: 'Algebra', topicsGenerated: true }],
        },
      ])
    );

    renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData([
        'library',
        'books',
        'test-profile-id',
      ]) as { subjects: Array<{ books: Array<{ id: string }> }> } | undefined;
      expect(cached?.subjects[0]?.books[0]?.id).toBe('b1');
    });
  });
});
