// ---------------------------------------------------------------------------
// use-topic-suggestions hook tests [Phase 6 / batch-A]
// ---------------------------------------------------------------------------

import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { useTopicSuggestions } from './use-topic-suggestions';

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

const mockSuggestions = [
  {
    topicId: 'topic-1',
    title: 'Photosynthesis',
    reason: 'Based on your progress in Biology',
    relevance: 'high',
  },
  {
    topicId: 'topic-2',
    title: 'Cell Division',
    reason: 'Next logical step',
    relevance: 'medium',
  },
];

describe('useTopicSuggestions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
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
    expect((result.current.error as Error).message).toMatch(/500/);
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

    expect((result.current.error as Error).message).toMatch(/403/);
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
