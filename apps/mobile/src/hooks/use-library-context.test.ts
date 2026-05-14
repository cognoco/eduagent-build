import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useLibraryRetention,
  useSubjectRetentionMap,
} from './use-library-context';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();

jest.mock(
  '../lib/api-client' /* gc1-allow: Clerk useAuth() external boundary */,
  () => ({
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
  }),
);

jest.mock(
  '../lib/profile' /* gc1-allow: ProfileProvider uses SecureStore (native) */,
  () => ({
    useProfile: () => ({
      activeProfile: { id: 'test-profile-id' },
    }),
  }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRetentionResponse(
  subjects: Array<{
    subjectId: string;
    topics?: Array<{
      topicId?: string;
      easeFactor?: number;
      repetitions?: number;
      nextReviewAt?: string | null;
      lastReviewedAt?: string | null;
      xpStatus?: 'pending' | 'verified' | 'decayed';
      failureCount?: number;
    }>;
    reviewDueCount?: number;
  }>,
) {
  return new Response(
    JSON.stringify({
      subjects: subjects.map((s) => ({
        subjectId: s.subjectId,
        topics: (s.topics ?? []).map((t) => ({
          topicId: t.topicId ?? 'topic-default',
          easeFactor: t.easeFactor ?? 2.5,
          repetitions: t.repetitions ?? 0,
          nextReviewAt: t.nextReviewAt ?? null,
          lastReviewedAt: t.lastReviewedAt ?? null,
          xpStatus: t.xpStatus ?? 'pending',
          failureCount: t.failureCount ?? 0,
        })),
        reviewDueCount: s.reviewDueCount ?? 0,
      })),
    }),
    { status: 200 },
  );
}

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

// ---------------------------------------------------------------------------
// Tests: useLibraryRetention
// ---------------------------------------------------------------------------

describe('useLibraryRetention', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches /library/retention and returns subjects array', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: 'sub-1',
          topics: [
            {
              topicId: 'top-1',
              repetitions: 3,
              nextReviewAt: new Date(
                Date.now() + 5 * 24 * 60 * 60 * 1000,
              ).toISOString(),
              xpStatus: 'verified',
            },
          ],
          reviewDueCount: 0,
        },
      ]),
    );

    const { result } = renderHook(() => useLibraryRetention(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.subjects).toHaveLength(1);
    expect(result.current.data?.subjects[0]?.subjectId).toBe('sub-1');
    expect(result.current.data?.subjects[0]?.topics).toHaveLength(1);
  });

  it('starts in loading state', () => {
    mockFetch.mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );

    const { result } = renderHook(() => useLibraryRetention(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('sets isError when the API returns 500', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal server error', { status: 500 }),
    );

    const { result } = renderHook(() => useLibraryRetention(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('caches under the expected query key', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([{ subjectId: 'sub-1' }]),
    );

    renderHook(() => useLibraryRetention(), { wrapper: createWrapper() });

    await waitFor(() => {
      const cached = queryClient.getQueryData([
        'library',
        'retention',
        'test-profile-id',
      ]) as { subjects: Array<{ subjectId: string }> } | undefined;
      expect(cached?.subjects[0]?.subjectId).toBe('sub-1');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: useSubjectRetentionMap
// ---------------------------------------------------------------------------

describe('useSubjectRetentionMap', () => {
  const FUTURE_DATE = new Date(
    Date.now() + 5 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const NEAR_FUTURE = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1 hour away → fading

  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns empty map while data is loading', () => {
    mockFetch.mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );

    const { result } = renderHook(() => useSubjectRetentionMap(), {
      wrapper: createWrapper(),
    });

    expect(result.current.size).toBe(0);
  });

  it('derives "strong" when all topics have next review > 3 days out', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: 'sub-1',
          topics: [
            {
              topicId: 't-1',
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
            {
              topicId: 't-2',
              repetitions: 3,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'pending',
            },
          ],
        },
      ]),
    );

    const { result } = renderHook(() => useSubjectRetentionMap(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.size).toBeGreaterThan(0);
    });

    expect(result.current.get('sub-1')).toBe('strong');
  });

  it('derives "fading" when one topic is close to review (1h away)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: 'sub-2',
          topics: [
            {
              topicId: 't-1',
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
            {
              topicId: 't-2',
              repetitions: 2,
              nextReviewAt: NEAR_FUTURE,
              xpStatus: 'pending',
            },
          ],
        },
      ]),
    );

    const { result } = renderHook(() => useSubjectRetentionMap(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.size).toBeGreaterThan(0);
    });

    // Worst status wins: fading beats strong
    expect(result.current.get('sub-2')).toBe('fading');
  });

  it('derives "forgotten" when one topic has failureCount >= 3', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: 'sub-3',
          topics: [
            {
              topicId: 't-1',
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
            {
              topicId: 't-2',
              repetitions: 1,
              nextReviewAt: NEAR_FUTURE,
              failureCount: 3,
            },
          ],
        },
      ]),
    );

    const { result } = renderHook(() => useSubjectRetentionMap(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.size).toBeGreaterThan(0);
    });

    // forgotten beats all other statuses
    expect(result.current.get('sub-3')).toBe('forgotten');
  });

  it('handles mixed statuses across subjects: strong + fading + forgotten', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: 'sub-strong',
          topics: [
            {
              topicId: 't-s1',
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
          ],
        },
        {
          subjectId: 'sub-fading',
          topics: [
            {
              topicId: 't-f1',
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
            {
              topicId: 't-f2',
              repetitions: 2,
              nextReviewAt: NEAR_FUTURE,
              xpStatus: 'pending',
            },
          ],
        },
        {
          subjectId: 'sub-forgotten',
          topics: [{ topicId: 't-g1', repetitions: 1, failureCount: 3 }],
        },
      ]),
    );

    const { result } = renderHook(() => useSubjectRetentionMap(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.size).toBe(3);
    });

    expect(result.current.get('sub-strong')).toBe('strong');
    expect(result.current.get('sub-fading')).toBe('fading');
    expect(result.current.get('sub-forgotten')).toBe('forgotten');
  });

  it('omits subjects with no topics from the map', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        { subjectId: 'sub-empty', topics: [] },
        {
          subjectId: 'sub-with-topics',
          topics: [
            {
              topicId: 't-1',
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
          ],
        },
      ]),
    );

    const { result } = renderHook(() => useSubjectRetentionMap(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.size).toBeGreaterThan(0);
    });

    // Empty-topic subject is omitted
    expect(result.current.has('sub-empty')).toBe(false);
    expect(result.current.has('sub-with-topics')).toBe(true);
  });

  it('updates the map when query data changes', async () => {
    // First fetch: sub-1 is strong
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: 'sub-1',
          topics: [
            {
              topicId: 't-1',
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
          ],
        },
      ]),
    );

    const { result } = renderHook(() => useSubjectRetentionMap(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.get('sub-1')).toBe('strong');
    });

    // Seed new data with sub-1 now forgotten
    act(() => {
      queryClient.setQueryData(['library', 'retention', 'test-profile-id'], {
        subjects: [
          {
            subjectId: 'sub-1',
            topics: [
              {
                topicId: 't-1',
                repetitions: 1,
                nextReviewAt: null,
                lastReviewedAt: null,
                easeFactor: 2.5,
                xpStatus: 'decayed',
                failureCount: 0,
              },
            ],
            reviewDueCount: 1,
          },
        ],
      });
    });

    await waitFor(() => {
      // decayed → forgotten
      expect(result.current.get('sub-1')).toBe('forgotten');
    });
  });
});
