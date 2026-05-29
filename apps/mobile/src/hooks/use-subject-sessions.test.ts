// ---------------------------------------------------------------------------
// use-subject-sessions hook tests [Phase 6 / batch-A]
// ---------------------------------------------------------------------------

import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createScreenWrapper,
  createTestProfile,
  createRoutedMockFetch,
  type RoutedMockFetch,
} from '../test-utils/screen-render';
import type { ApiResponseError } from '../lib/assert-ok';
import { useSubjectSessions } from './use-subject-sessions';

// Real ProfileContext + real api-client (Clerk's useAuth is globally mocked in
// test-setup), driven by a routed mock fetch installed as globalThis.fetch.
// Per-call overrides via mockResolvedValueOnce take priority over the routed
// default, preserving the original canned-response test flow.
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

function createWrapper() {
  const w = createScreenWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
    profiles: [createTestProfile({ id: 'test-profile-id' })],
  });
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
  afterEach(() => {
    queryClient?.clear();
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
    // assertOk maps 5xx → UpstreamError with the status attached as a field.
    expect((result.current.error as ApiResponseError).status).toBe(500);
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
