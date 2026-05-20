import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useStreaks, useXpSummary } from './use-streaks';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
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

describe('useStreaks', () => {
  it('returns streak data from API', async () => {
    const streakData = {
      currentStreak: 5,
      longestStreak: 12,
      lastActivityDate: '2026-02-15T00:00:00Z',
      gracePeriodStartDate: null,
      isOnGracePeriod: false,
      graceDaysRemaining: 0,
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ streak: streakData }), { status: 200 }),
    );

    const { result } = renderHook(() => useStreaks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(streakData);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 }),
    );

    const { result } = renderHook(() => useStreaks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useXpSummary
// ---------------------------------------------------------------------------

describe('useXpSummary', () => {
  it('returns XP summary from API', async () => {
    const xpData = {
      totalXp: 250,
      verifiedXp: 200,
      pendingXp: 50,
      decayedXp: 0,
      topicsCompleted: 8,
      topicsVerified: 6,
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ xp: xpData }), { status: 200 }),
    );

    const { result } = renderHook(() => useXpSummary(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(xpData);
    expect(result.current.data?.totalXp).toBe(250);
    expect(result.current.data?.topicsCompleted).toBe(8);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Server error', { status: 500 }),
    );

    const { result } = renderHook(() => useXpSummary(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
