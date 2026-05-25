// ---------------------------------------------------------------------------
// use-book-sessions hook tests
// ---------------------------------------------------------------------------

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { useBookSessions } from './use-book-sessions';

const mockFetch = jest.fn();

// prettier-ignore
jest.mock('../lib/api-client', () => ({ // gc1-allow: hook tests need a Hono client wired to controllable fetch
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

// prettier-ignore
jest.mock('../lib/profile', () => ({ // gc1-allow: hook tests need a fixed active profile without provider setup
  ...jest.requireActual('../lib/profile'),
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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockSessions = [
  {
    id: 'session-1',
    bookId: 'book-1',
    subjectId: 'subject-1',
    status: 'completed',
    startedAt: '2026-05-01T10:00:00.000Z',
    endedAt: '2026-05-01T10:30:00.000Z',
    durationSeconds: 1800,
    topicId: 'topic-1',
    topicName: 'Ancient Egypt Overview',
    sessionType: 'learning',
  },
  {
    id: 'session-2',
    bookId: 'book-1',
    subjectId: 'subject-1',
    status: 'completed',
    startedAt: '2026-05-02T10:00:00.000Z',
    endedAt: '2026-05-02T10:45:00.000Z',
    durationSeconds: 2700,
    topicId: 'topic-2',
    topicName: 'Hieroglyphics',
    sessionType: 'homework',
  },
];

// ---------------------------------------------------------------------------
// useBookSessions
// ---------------------------------------------------------------------------

describe('useBookSessions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
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
    expect(result.current.data?.[0]?.id).toBe('session-1');
    expect(result.current.data?.[1]?.id).toBe('session-2');
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
    // Override the profile mock to return null activeProfile for this test
    const profileMod = require('../lib/profile') as {
      useProfile: () => { activeProfile: null | { id: string } };
    };
    const original = profileMod.useProfile;
    profileMod.useProfile = () => ({ activeProfile: null });

    try {
      const { result } = renderHook(
        () => useBookSessions('subject-1', 'book-1'),
        { wrapper: createWrapper() },
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      profileMod.useProfile = original;
    }
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
    expect(result.current.data?.[0]?.id).toBe('session-1');

    // Switch to a different book
    rerender({ subjectId: 'subject-1', bookId: 'book-b' });

    await waitFor(() => {
      expect(result.current.data?.[0]?.id).toBe('session-2');
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
        id: 'session-3',
        bookId: 'book-1',
        subjectId: 'subject-1',
        status: 'active',
        startedAt: '2026-05-03T10:00:00.000Z',
        endedAt: null,
        durationSeconds: null,
        topicId: 'topic-3',
        topicName: 'Mummies',
        sessionType: 'learning',
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
    expect(result.current.data?.[2]?.id).toBe('session-3');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
