// ---------------------------------------------------------------------------
// use-topic-suggestions hook tests [Phase 6 / batch-A]
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
import { ForbiddenError } from '../lib/api-errors';
import { useTopicSuggestions } from './use-topic-suggestions';

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

const mockSuggestions = [
  {
    id: '440e8400-e29b-41d4-a716-446655440001',
    bookId: '330e8400-e29b-41d4-a716-446655440001',
    title: 'Photosynthesis',
    createdAt: '2026-01-01T00:00:00.000Z',
    usedAt: null,
  },
  {
    id: '440e8400-e29b-41d4-a716-446655440002',
    bookId: '330e8400-e29b-41d4-a716-446655440001',
    title: 'Cell Division',
    createdAt: '2026-01-01T00:00:00.000Z',
    usedAt: null,
  },
];

describe('useTopicSuggestions', () => {
  afterEach(() => {
    queryClient?.clear();
  });

  it('returns topic suggestions on success', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSuggestions), { status: 200 }),
    );

    const { result } = renderHook(
      () => useTopicSuggestions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]?.title).toBe('Photosynthesis');
  });

  it('returns empty array when API returns no suggestions', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const { result } = renderHook(
      () => useTopicSuggestions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('is disabled when subjectId is undefined', async () => {
    const { result } = renderHook(
      () => useTopicSuggestions(undefined, 'book-1'),
      { wrapper: createWrapper() },
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('is disabled when bookId is undefined', async () => {
    const { result } = renderHook(
      () => useTopicSuggestions('subject-1', undefined),
      { wrapper: createWrapper() },
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('is disabled when both subjectId and bookId are undefined', async () => {
    const { result } = renderHook(
      () => useTopicSuggestions(undefined, undefined),
      { wrapper: createWrapper() },
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('transitions to error state on API error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const { result } = renderHook(
      () => useTopicSuggestions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    // assertOk maps 5xx → UpstreamError with the status attached as a field.
    expect((result.current.error as ApiResponseError).status).toBe(500);
  });

  it('does not retry on API error (retry: false)', async () => {
    mockFetch.mockResolvedValue(
      new Response('Service Unavailable', { status: 503 }),
    );

    const { result } = renderHook(
      () => useTopicSuggestions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // retry: false means only one attempt
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('includes subjectId and bookId in the URL', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    renderHook(() => useTopicSuggestions('subject-99', 'book-77'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('subject-99');
    expect(url).toContain('book-77');
    expect(url).toContain('topic-suggestions');
  });

  it('scopes cache key by subjectId, bookId, and profileId', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSuggestions), { status: 200 }),
    );

    const { result } = renderHook(
      () => useTopicSuggestions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const cachedKeys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(cachedKeys).toContainEqual([
      'topic-suggestions',
      'subject-1',
      'book-1',
      'test-profile-id',
    ]);
  });

  it('handles 403 forbidden error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    const { result } = renderHook(
      () => useTopicSuggestions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // The api-client boundary classifies 403 into a typed ForbiddenError so
    // screens switch on error type rather than parsing status codes.
    expect(result.current.error).toBeInstanceOf(ForbiddenError);
  });

  it('returns stale data while revalidating', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSuggestions), { status: 200 }),
    );

    const { result, rerender } = renderHook(
      () => useTopicSuggestions('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const firstData = result.current.data;
    expect(firstData).toHaveLength(2);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([mockSuggestions[0]]), { status: 200 }),
    );

    queryClient.invalidateQueries({ queryKey: ['topic-suggestions'] });
    rerender({});

    // Stale data should still be present during background refetch
    expect(result.current.data).toBeDefined();
    expect(result.current.data).toHaveLength(2);
  });
});
