import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useAllBooks, type EnrichedBook } from './use-all-books';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

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

function makeLibraryBooksResponse(
  subjects: SubjectFixture[],
  nextCursor: string | null = null,
) {
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
      nextCursor,
    }),
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

describe('useAllBooks', () => {
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
      ]),
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
    const algebra = result.current.books.find(
      (b: EnrichedBook) => b.book.id === 'b1',
    );
    expect(algebra).not.toBeUndefined();
    expect(algebra!.subjectId).toBe('s1');
    expect(algebra!.subjectName).toBe('Math');
    expect(algebra!.status).toBe('IN_PROGRESS'); // topicsGenerated = true

    // b2 (Geometry, topicsGenerated=false) should NOT appear
    const geometry = result.current.books.find(
      (b: EnrichedBook) => b.book.id === 'b2',
    );
    expect(geometry).toBeUndefined();

    const physics = result.current.books.find(
      (b: EnrichedBook) => b.book.id === 'b3',
    );
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
      ]),
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
      result.current.books.find((b: EnrichedBook) => b.book.id === 'b2'),
    ).toBeUndefined();
    expect(
      result.current.books.find((b: EnrichedBook) => b.book.id === 'b3'),
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
      ]),
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
      new Response('Server error', { status: 500 }),
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
      ]),
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
      ]),
    );

    renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    // useInfiniteQuery stores pages[] — first page is pages[0]
    await waitFor(() => {
      const cached = queryClient.getQueryData([
        'library',
        'books',
        'test-profile-id',
      ]) as
        | {
            pages: Array<{ subjects: Array<{ books: Array<{ id: string }> }> }>;
          }
        | undefined;
      expect(cached?.pages[0]?.subjects[0]?.books[0]?.id).toBe('b1');
    });
  });

  // ---- [WI-966] Multi-page / cursor pagination ----

  it('[WI-966] flattens books across multiple pages', async () => {
    const CURSOR_PAGE2 = '550e8400-e29b-41d4-a716-446655440099';
    // Page 1: one subject, one built book; nextCursor points to page 2
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's1',
            subjectName: 'Math',
            books: [{ id: 'b1', title: 'Algebra', topicsGenerated: true }],
          },
        ],
        CURSOR_PAGE2,
      ),
    );
    // Page 2: second subject, one built book; nextCursor=null (last page)
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's2',
            subjectName: 'Science',
            books: [{ id: 'b2', title: 'Physics', topicsGenerated: true }],
          },
        ],
        null,
      ),
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    // The hook auto-drains both pages (no manual fetchNextPage needed); the
    // explicit fetchNextPage() API remains exposed and is a safe no-op once
    // drained. Both pages must flatten into books[].
    await waitFor(() => {
      expect(result.current.books.length).toBe(2);
    });

    // Calling the exposed fetchNextPage after exhaustion is a harmless no-op.
    result.current.fetchNextPage();

    expect(result.current.hasNextPage).toBe(false);
    const ids = result.current.books.map((b: EnrichedBook) => b.book.id);
    expect(ids).toContain('b1');
    expect(ids).toContain('b2');
  });

  it('[WI-966] auto-drains all pages so page-2 books appear WITHOUT a manual fetchNextPage', async () => {
    // This is the behaviour-preservation guard: library.tsx consumes the full
    // flattened book list and never calls fetchNextPage. A profile with >1
    // page of subjects must still surface every book, exactly like the
    // pre-pagination one-shot fetch.
    const CURSOR_PAGE2 = '550e8400-e29b-41d4-a716-446655440099';
    const CURSOR_PAGE3 = '550e8400-e29b-41d4-a716-446655440100';
    // Page 1 → nextCursor page 2
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's1',
            subjectName: 'Math',
            books: [{ id: 'b1', title: 'Algebra', topicsGenerated: true }],
          },
        ],
        CURSOR_PAGE2,
      ),
    );
    // Page 2 → nextCursor page 3
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's2',
            subjectName: 'Science',
            books: [{ id: 'b2', title: 'Physics', topicsGenerated: true }],
          },
        ],
        CURSOR_PAGE3,
      ),
    );
    // Page 3 → last page (nextCursor=null)
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's3',
            subjectName: 'History',
            books: [{ id: 'b3', title: 'Rome', topicsGenerated: true }],
          },
        ],
        null,
      ),
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    // No manual fetchNextPage(): the hook should drain all 3 pages on its own.
    await waitFor(() => {
      expect(result.current.books.length).toBe(3);
    });

    expect(result.current.hasNextPage).toBe(false);
    const ids = result.current.books.map((b: EnrichedBook) => b.book.id);
    expect(ids).toContain('b1'); // page 1
    expect(ids).toContain('b2'); // page 2 — the regression the rework fixes
    expect(ids).toContain('b3'); // page 3
    // All three pages were actually requested from the server.
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('[WI-966] exposes hasNextPage=false on last page', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's1',
            subjectName: 'Math',
            books: [{ id: 'b1', title: 'Algebra', topicsGenerated: true }],
          },
        ],
        null, // nextCursor=null → last page
      ),
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.books.length).toBe(1);
  });

  // ---- [WI-966] isFullyLoaded ----

  it('[WI-966] isFullyLoaded is true only once all pages have drained (single page)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's1',
            subjectName: 'Math',
            books: [{ id: 'b1', title: 'Algebra', topicsGenerated: true }],
          },
        ],
        null, // last page — no drain needed
      ),
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      // Single page — isFullyLoaded and isSuccess converge immediately.
      expect(result.current.isFullyLoaded).toBe(true);
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.isFetchingNextPage).toBe(false);
  });

  it('[WI-966] isFullyLoaded is true after the auto-drain of a multi-page response finishes', async () => {
    const CURSOR_PAGE2 = '550e8400-e29b-41d4-a716-446655440099';
    // Page 1 returns a cursor; page 2 is the last.
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's1',
            subjectName: 'Math',
            books: [{ id: 'b1', title: 'Algebra', topicsGenerated: true }],
          },
        ],
        CURSOR_PAGE2,
      ),
    );
    mockFetch.mockResolvedValueOnce(
      makeLibraryBooksResponse(
        [
          {
            subjectId: 's2',
            subjectName: 'Science',
            books: [{ id: 'b2', title: 'Physics', topicsGenerated: true }],
          },
        ],
        null, // last page
      ),
    );

    const { result } = renderHook(() => useAllBooks(), {
      wrapper: createWrapper(),
    });

    // isFullyLoaded must only become true once ALL pages are loaded.
    await waitFor(() => {
      expect(result.current.isFullyLoaded).toBe(true);
    });

    // Both books visible — drain completed.
    expect(result.current.books).toHaveLength(2);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.isFetchingNextPage).toBe(false);
  });
});
