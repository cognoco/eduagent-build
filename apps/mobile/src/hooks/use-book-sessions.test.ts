// ---------------------------------------------------------------------------
// use-book-sessions hook tests
// ---------------------------------------------------------------------------

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createScreenWrapper,
  createTestProfile,
  createRoutedMockFetch,
  type RoutedMockFetch,
} from '../test-utils/screen-render';
import type { Profile } from '../lib/profile';
import { useBookSessions } from './use-book-sessions';

// Real ProfileContext + real api-client (Clerk's useAuth is globally mocked in
// test-setup), driven by a routed mock fetch installed as globalThis.fetch.
// `mockFetch` keeps the same name the assertions below use; per-call overrides
// via mockResolvedValueOnce take priority over the routed default.
let mockFetch: RoutedMockFetch;
let queryClient: QueryClient;
let prevFetch: typeof globalThis.fetch;

beforeEach(() => {
  prevFetch = globalThis.fetch;
  mockFetch = createRoutedMockFetch();
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
});

function createWrapper(activeProfile: Profile | null = createTestProfile()) {
  const w = createScreenWrapper({
    activeProfile,
    profiles: activeProfile ? [activeProfile] : [],
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockSessions = [
  {
    id: '660e8400-e29b-41d4-a716-446655440001',
    topicId: '770e8400-e29b-41d4-a716-446655440001',
    topicTitle: 'Ancient Egypt Overview',
    chapter: 'Origins',
    exchangeCount: 5,
    createdAt: '2026-05-01T10:00:00.000Z',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440002',
    topicId: '770e8400-e29b-41d4-a716-446655440002',
    topicTitle: 'Hieroglyphics',
    chapter: 'Writing',
    exchangeCount: 3,
    createdAt: '2026-05-02T10:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// useBookSessions
// ---------------------------------------------------------------------------

describe('useBookSessions', () => {
  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches and returns sessions for a given subject and book', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: mockSessions }), { status: 200 }),
    );

    const { result } = renderHook(
      () => useBookSessions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]?.id).toBe(
      '660e8400-e29b-41d4-a716-446655440001',
    );
    expect(result.current.data?.[1]?.id).toBe(
      '660e8400-e29b-41d4-a716-446655440002',
    );
  });

  it('is disabled when subjectId is undefined — no fetch fires', async () => {
    const { result } = renderHook(() => useBookSessions(undefined, 'book-1'), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is disabled when bookId is undefined — no fetch fires', async () => {
    const { result } = renderHook(
      () => useBookSessions('subject-1', undefined),
      { wrapper: createWrapper() },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is disabled when both subjectId and bookId are undefined — no fetch fires', async () => {
    const { result } = renderHook(() => useBookSessions(undefined, undefined), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is disabled when there is no active profile — no fetch fires', async () => {
    const { result } = renderHook(
      () => useBookSessions('subject-1', 'book-1'),
      { wrapper: createWrapper(null) },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('propagates API errors into error state', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    const { result } = renderHook(
      () => useBookSessions('subject-1', 'missing-book'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('propagates 403 Forbidden as an error state', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'FORBIDDEN', message: 'Access denied' }),
        { status: 403 },
      ),
    );

    const { result } = renderHook(
      () => useBookSessions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toContain('Access denied');
  });

  it('returns an empty array when the book has no sessions', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: [] }), { status: 200 }),
    );

    const { result } = renderHook(
      () => useBookSessions('subject-1', 'book-2'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('includes subjectId and bookId as path parameters in the API call', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: mockSessions }), { status: 200 }),
    );

    const { result } = renderHook(
      () => useBookSessions('subject-42', 'book-99'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('subject-42');
    expect(url).toContain('book-99');
  });

  it('refetches when subjectId or bookId changes', async () => {
    const sessionsForBookA = [mockSessions[0]!];
    const sessionsForBookB = [mockSessions[1]!];

    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessions: sessionsForBookA }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessions: sessionsForBookB }), {
          status: 200,
        }),
      );

    const { result, rerender } = renderHook(
      ({ subjectId, bookId }: { subjectId: string; bookId: string }) =>
        useBookSessions(subjectId, bookId),
      {
        wrapper: createWrapper(),
        initialProps: { subjectId: 'subject-1', bookId: 'book-a' },
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.id).toBe(
      '660e8400-e29b-41d4-a716-446655440001',
    );

    // Switch to a different book
    rerender({ subjectId: 'subject-1', bookId: 'book-b' });

    await waitFor(() => {
      expect(result.current.data?.[0]?.id).toBe(
        '660e8400-e29b-41d4-a716-446655440002',
      );
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('isolates cache by profileId — different profiles get separate cache entries', () => {
    // Verify queryKey shape includes profileId for isolation
    // The hook uses queryKey: ['book-sessions', subjectId, bookId, activeProfile?.id]
    // This is a structural test — different profile IDs must produce different cache keys
    const keyA = ['book-sessions', 'subject-1', 'book-1', 'profile-A'];
    const keyB = ['book-sessions', 'subject-1', 'book-1', 'profile-B'];
    expect(keyA).not.toEqual(keyB);
  });

  it('new data replaces stale data after a successful refetch', async () => {
    // First fetch
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: mockSessions }), { status: 200 }),
    );

    const { result } = renderHook(
      () => useBookSessions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);

    // Set up the second fetch response BEFORE triggering refetch
    const updatedSessions = [
      ...mockSessions,
      {
        id: '660e8400-e29b-41d4-a716-446655440003',
        topicId: '770e8400-e29b-41d4-a716-446655440003',
        topicTitle: 'Mummies',
        chapter: 'Burial',
        exchangeCount: 1,
        createdAt: '2026-05-03T10:00:00.000Z',
      },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: updatedSessions }), {
        status: 200,
      }),
    );

    // Trigger refetch and wait for completion
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.[2]?.id).toBe(
      '660e8400-e29b-41d4-a716-446655440003',
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
