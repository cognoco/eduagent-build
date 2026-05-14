import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useTotalSessionCount,
  useIsFirstSession,
  useTotalTopicsCompleted,
} from './use-session-context';

const mockFetch = jest.fn();

let queryClient: QueryClient;
const originalFetch = globalThis.fetch;

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

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

/** Minimal valid KnowledgeInventory response. */
function makeInventoryResponse(totalSessions: number) {
  return {
    thisWeekMini: { sessions: 0, wordsLearned: 0, topicsTouched: 0 },
    global: {
      topicsAttempted: 0,
      topicsMastered: 0,
      vocabularyTotal: 0,
      vocabularyMastered: 0,
      weeklyDeltaTopicsMastered: null,
      weeklyDeltaVocabularyTotal: null,
      weeklyDeltaTopicsExplored: null,
      totalSessions,
      totalActiveMinutes: 0,
      totalWallClockMinutes: 0,
      currentStreak: 0,
      longestStreak: 0,
    },
    subjects: [],
  };
}

/** Minimal valid OverallProgress (overview) response. */
function makeOverviewResponse(totalTopicsCompleted: number) {
  return {
    subjects: [],
    totalTopicsCompleted,
    totalTopicsVerified: 0,
  };
}

// ---------------------------------------------------------------------------
// useTotalSessionCount
// ---------------------------------------------------------------------------

describe('useTotalSessionCount', () => {
  it('returns 0 when query data is undefined (cold cache / no fetch)', () => {
    // Do not resolve the mock — leave it hanging so data is never populated.
    mockFetch.mockReturnValue(
      new Promise(() => {
        /* never resolves — keeps query in pending state */
      }),
    );

    const { result } = renderHook(() => useTotalSessionCount(), {
      wrapper: createWrapper(),
    });

    // Immediately after mount, before any data arrives, must default to 0.
    expect(result.current).toBe(0);
  });

  it('returns the session count when inventory data is present', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeInventoryResponse(7)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useTotalSessionCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe(7);
    });
  });
});

// ---------------------------------------------------------------------------
// useIsFirstSession
// ---------------------------------------------------------------------------

describe('useIsFirstSession', () => {
  it('returns true when totalSessions is 0 (cold cache default)', () => {
    mockFetch.mockReturnValue(
      new Promise(() => {
        /* never resolves — keeps query in pending state */
      }),
    );

    const { result } = renderHook(() => useIsFirstSession(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(true);
  });

  it('returns true when totalSessions resolves to 0', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeInventoryResponse(0)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useIsFirstSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      // isLoading flips to false once data is present
      expect(result.current).toBe(true);
    });
  });

  it('returns false when totalSessions is greater than 0', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeInventoryResponse(3)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useIsFirstSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// useTotalTopicsCompleted
// ---------------------------------------------------------------------------

describe('useTotalTopicsCompleted', () => {
  it('returns 0 when query data is undefined (cold cache / no fetch)', () => {
    mockFetch.mockReturnValue(
      new Promise(() => {
        /* never resolves — keeps query in pending state */
      }),
    );

    const { result } = renderHook(() => useTotalTopicsCompleted(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(0);
  });

  it('returns the topic count when overview data is present', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOverviewResponse(12)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useTotalTopicsCompleted(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe(12);
    });
  });
});
