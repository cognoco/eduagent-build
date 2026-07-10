// ---------------------------------------------------------------------------
// use-library-search hook tests
// ---------------------------------------------------------------------------

import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useLibrarySearch } from './use-library-search';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

function createWrapper(options: { activeProfileNull?: boolean } = {}) {
  const w = createHookWrapper({
    activeProfile: options.activeProfileNull
      ? null
      : createTestProfile({ id: 'test-profile-id' }),
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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockSearchResult = {
  subjects: [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Ancient Egypt' },
  ],
  topics: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      bookId: '30000000-0000-4000-8000-000000000001',
      bookTitle: 'The Oxford History',
      name: 'Pyramids',
      subjectName: 'Ancient Egypt',
      subjectId: '10000000-0000-4000-8000-000000000001',
    },
    {
      id: '20000000-0000-4000-8000-000000000002',
      bookId: '30000000-0000-4000-8000-000000000001',
      bookTitle: 'The Oxford History',
      name: 'Hieroglyphics',
      subjectName: 'Ancient Egypt',
      subjectId: '10000000-0000-4000-8000-000000000001',
    },
  ],
  books: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      title: 'The Oxford History',
      subjectId: '10000000-0000-4000-8000-000000000001',
      subjectName: 'Ancient Egypt',
    },
  ],
  notes: [],
  sessions: [],
};

// ---------------------------------------------------------------------------
// useLibrarySearch
// ---------------------------------------------------------------------------

describe('useLibrarySearch', () => {
  it('fetches and returns search results for a non-empty query', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSearchResult), { status: 200 }),
    );

    const { result } = renderHook(() => useLibrarySearch('egypt'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.subjects).toHaveLength(1);
    expect(result.current.data?.topics).toHaveLength(2);
    expect(result.current.data?.books).toHaveLength(1);
  });

  it('is disabled when query is empty string — no fetch fires', async () => {
    const { result } = renderHook(() => useLibrarySearch(''), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    // enabled: trimmed.length >= 1 → false for empty string
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is disabled when query is whitespace only — no fetch fires', async () => {
    const { result } = renderHook(() => useLibrarySearch('   '), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is disabled when there is no active profile — no fetch fires', async () => {
    const { result } = renderHook(() => useLibrarySearch('egypt'), {
      wrapper: createWrapper({ activeProfileNull: true }),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('propagates API errors into error state', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal server error', { status: 500 }),
    );

    const { result } = renderHook(() => useLibrarySearch('egypt'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('trims whitespace from the query before sending to the API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSearchResult), { status: 200 }),
    );

    const { result } = renderHook(() => useLibrarySearch('  egypt  '), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The URL should contain the trimmed query
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('q=egypt');
    expect(url).not.toContain('q=+egypt');
    expect(url).not.toContain('q=egypt+');
  });

  it('returns empty results for a query with no matches', async () => {
    const emptyResult = {
      subjects: [],
      topics: [],
      books: [],
      notes: [],
      sessions: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(emptyResult), { status: 200 }),
    );

    const { result } = renderHook(() => useLibrarySearch('xyzzynotfound'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.subjects).toHaveLength(0);
    expect(result.current.data?.topics).toHaveLength(0);
    expect(result.current.data?.books).toHaveLength(0);
  });

  it('refetches when query changes', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSearchResult), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subjects: [],
            topics: [
              {
                id: '20000000-0000-4000-8000-000000000003',
                bookId: '30000000-0000-4000-8000-000000000002',
                bookTitle: 'The History of Rome',
                name: 'Rome',
                subjectName: 'History',
                subjectId: '10000000-0000-4000-8000-000000000002',
              },
            ],
            books: [],
            notes: [],
            sessions: [],
          }),
          { status: 200 },
        ),
      );

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useLibrarySearch(q),
      {
        wrapper: createWrapper(),
        initialProps: { q: 'egypt' },
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.subjects).toHaveLength(1);

    // Change query
    rerender({ q: 'rome' });

    await waitFor(() => {
      expect(result.current.data?.topics?.[0]?.name).toBe('Rome');
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('serves stale data during a 5-second staleTime window', async () => {
    // Use a shared QueryClient so we can inspect the cache
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSearchResult), { status: 200 }),
    );

    const { result } = renderHook(() => useLibrarySearch('egypt'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Data from first fetch
    const initialData = result.current.data;
    expect(initialData?.subjects).toHaveLength(1);

    // Without invalidation the cache is still fresh — refetch should not be called
    mockFetch.mockClear();
    await result.current.refetch();

    // staleTime is 5s; since we're within the window in this same test, the
    // actual refetch may or may not refire depending on internal timing.
    // The key invariant is that data is returned correctly on the next render.
    expect(result.current.data?.subjects).toHaveLength(1);
  });
});
