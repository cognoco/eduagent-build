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
const SUBJECT_1_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_2_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT_3_ID = '33333333-3333-4333-8333-333333333333';
const SUBJECT_STRONG_ID = '44444444-4444-4444-8444-444444444444';
const SUBJECT_FADING_ID = '55555555-5555-4555-8555-555555555555';
const SUBJECT_FORGOTTEN_ID = '66666666-6666-4666-8666-666666666666';
const SUBJECT_EMPTY_ID = '77777777-7777-4777-8777-777777777777';
const SUBJECT_WITH_TOPICS_ID = '88888888-8888-4888-8888-888888888888';
const TOPIC_1_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOPIC_2_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOPIC_STRONG_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOPIC_FADING_1_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TOPIC_FADING_2_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TOPIC_FORGOTTEN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const BOOK_ID = '99999999-9999-4999-8999-999999999999';

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
    ...jest.requireActual('../lib/profile'),
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
      bookId?: string;
      easeFactor?: number;
      intervalDays?: number;
      repetitions?: number;
      nextReviewAt?: string | null;
      lastReviewedAt?: string | null;
      daysSinceLastReview?: number | null;
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
          topicId: t.topicId ?? TOPIC_1_ID,
          topicTitle: 'Fixture topic',
          bookId: t.bookId ?? BOOK_ID,
          easeFactor: t.easeFactor ?? 2.5,
          intervalDays: t.intervalDays ?? 1,
          repetitions: t.repetitions ?? 0,
          nextReviewAt: t.nextReviewAt ?? null,
          lastReviewedAt: t.lastReviewedAt ?? null,
          daysSinceLastReview: t.daysSinceLastReview ?? null,
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
          subjectId: SUBJECT_1_ID,
          topics: [
            {
              topicId: TOPIC_1_ID,
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
    expect(result.current.data?.subjects[0]?.subjectId).toBe(SUBJECT_1_ID);
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
      makeRetentionResponse([{ subjectId: SUBJECT_1_ID }]),
    );

    renderHook(() => useLibraryRetention(), { wrapper: createWrapper() });

    await waitFor(() => {
      const cached = queryClient.getQueryData([
        'library',
        'retention',
        'test-profile-id',
      ]) as { subjects: Array<{ subjectId: string }> } | undefined;
      expect(cached?.subjects[0]?.subjectId).toBe(SUBJECT_1_ID);
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
          subjectId: SUBJECT_1_ID,
          topics: [
            {
              topicId: TOPIC_1_ID,
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
            {
              topicId: TOPIC_2_ID,
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

    expect(result.current.get(SUBJECT_1_ID)).toBe('strong');
  });

  it('derives "fading" when one topic is close to review (1h away)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: SUBJECT_2_ID,
          topics: [
            {
              topicId: TOPIC_1_ID,
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
            {
              topicId: TOPIC_2_ID,
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
    expect(result.current.get(SUBJECT_2_ID)).toBe('fading');
  });

  it('derives "forgotten" when one topic has failureCount >= 3', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: SUBJECT_3_ID,
          topics: [
            {
              topicId: TOPIC_1_ID,
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
            {
              topicId: TOPIC_2_ID,
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
    expect(result.current.get(SUBJECT_3_ID)).toBe('forgotten');
  });

  it('handles mixed statuses across subjects: strong + fading + forgotten', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: SUBJECT_STRONG_ID,
          topics: [
            {
              topicId: TOPIC_STRONG_ID,
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
          ],
        },
        {
          subjectId: SUBJECT_FADING_ID,
          topics: [
            {
              topicId: TOPIC_FADING_1_ID,
              repetitions: 2,
              nextReviewAt: FUTURE_DATE,
              xpStatus: 'verified',
            },
            {
              topicId: TOPIC_FADING_2_ID,
              repetitions: 2,
              nextReviewAt: NEAR_FUTURE,
              xpStatus: 'pending',
            },
          ],
        },
        {
          subjectId: SUBJECT_FORGOTTEN_ID,
          topics: [
            {
              topicId: TOPIC_FORGOTTEN_ID,
              repetitions: 1,
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
      expect(result.current.size).toBe(3);
    });

    expect(result.current.get(SUBJECT_STRONG_ID)).toBe('strong');
    expect(result.current.get(SUBJECT_FADING_ID)).toBe('fading');
    expect(result.current.get(SUBJECT_FORGOTTEN_ID)).toBe('forgotten');
  });

  it('omits subjects with no topics from the map', async () => {
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        { subjectId: SUBJECT_EMPTY_ID, topics: [] },
        {
          subjectId: SUBJECT_WITH_TOPICS_ID,
          topics: [
            {
              topicId: TOPIC_1_ID,
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
    expect(result.current.has(SUBJECT_EMPTY_ID)).toBe(false);
    expect(result.current.has(SUBJECT_WITH_TOPICS_ID)).toBe(true);
  });

  it('updates the map when query data changes', async () => {
    // First fetch: SUBJECT_1_ID is strong
    mockFetch.mockResolvedValueOnce(
      makeRetentionResponse([
        {
          subjectId: SUBJECT_1_ID,
          topics: [
            {
              topicId: TOPIC_1_ID,
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
      expect(result.current.get(SUBJECT_1_ID)).toBe('strong');
    });

    // Seed new data with SUBJECT_1_ID now forgotten
    act(() => {
      queryClient.setQueryData(['library', 'retention', 'test-profile-id'], {
        subjects: [
          {
            subjectId: SUBJECT_1_ID,
            topics: [
              {
                topicId: TOPIC_1_ID,
                topicTitle: 'Fixture topic',
                bookId: BOOK_ID,
                repetitions: 1,
                intervalDays: 1,
                nextReviewAt: null,
                lastReviewedAt: null,
                daysSinceLastReview: null,
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
      expect(result.current.get(SUBJECT_1_ID)).toBe('forgotten');
    });
  });
});
