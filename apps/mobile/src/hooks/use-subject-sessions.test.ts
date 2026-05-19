// ---------------------------------------------------------------------------
// use-subject-sessions hook tests [Phase 6 / batch-A]
// ---------------------------------------------------------------------------

import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { useSubjectSessions } from './use-subject-sessions';

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

const mockSessions = [
  {
    id: 'sess-1',
    subjectId: 'subject-1',
    topicId: 'topic-1',
    sessionType: 'learning',
    status: 'completed',
    escalationRung: 1,
    exchangeCount: 5,
    startedAt: '2026-01-01T10:00:00Z',
    lastActivityAt: '2026-01-01T10:30:00Z',
    endedAt: '2026-01-01T10:30:00Z',
    durationSeconds: 1800,
  },
  {
    id: 'sess-2',
    subjectId: 'subject-1',
    topicId: 'topic-2',
    sessionType: 'homework',
    status: 'completed',
    escalationRung: 2,
    exchangeCount: 3,
    startedAt: '2026-01-02T11:00:00Z',
    lastActivityAt: '2026-01-02T11:20:00Z',
    endedAt: '2026-01-02T11:20:00Z',
    durationSeconds: 1200,
  },
];

describe('useSubjectSessions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns sessions from API on success', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: mockSessions }), { status: 200 }),
    );

    const { result } = renderHook(() => useSubjectSessions('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]?.id).toBe('sess-1');
    expect(result.current.data?.[1]?.sessionType).toBe('homework');
  });

  it('returns empty array when API returns no sessions', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useSubjectSessions('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('is disabled when subjectId is undefined', async () => {
    const { result } = renderHook(() => useSubjectSessions(undefined), {
      wrapper: createWrapper(),
    });

    // Give query time to potentially fire (it should not)
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('transitions to error state on API error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const { result } = renderHook(() => useSubjectSessions('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toMatch(/500/);
  });

  it('does not retry on API error (retry: false)', async () => {
    mockFetch.mockResolvedValue(new Response('Server Error', { status: 503 }));

    const { result } = renderHook(() => useSubjectSessions('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // retry: false means only one attempt
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses subjectId and activeProfile.id in the query key', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: mockSessions }), { status: 200 }),
    );

    const { result } = renderHook(() => useSubjectSessions('subject-42'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The cache key includes both subjectId and profileId so different profiles
    // cannot share each other's session data.
    const cachedKeys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(cachedKeys).toContainEqual([
      'subject-sessions',
      'subject-42',
      'test-profile-id',
    ]);
  });

  it('calls the correct API path including subjectId', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: [] }), { status: 200 }),
    );

    renderHook(() => useSubjectSessions('subject-99'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('subject-99');
    expect(url).toContain('/sessions');
  });

  it('returns stale data while re-fetching', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: mockSessions }), { status: 200 }),
    );

    const { result, rerender } = renderHook(
      () => useSubjectSessions('subject-1'),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Stale first, then fresh
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessions: [mockSessions[0]] }), {
        status: 200,
      }),
    );

    // Mark as stale and trigger refetch
    queryClient.invalidateQueries({ queryKey: ['subject-sessions'] });
    rerender({});

    // Data should still be present (stale) while fetching
    expect(result.current.data).toBeDefined();
  });
});
