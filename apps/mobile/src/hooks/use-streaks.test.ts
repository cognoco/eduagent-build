import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStreaks, useXpSummary } from './use-streaks';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
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

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'test-profile-id' },
  }),
}));

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe('useStreaks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
      new Response(JSON.stringify({ streak: streakData }), { status: 200 })
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
      new Response('Network error', { status: 500 })
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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
      new Response(JSON.stringify({ xp: xpData }), { status: 200 })
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
      new Response('Server error', { status: 500 })
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
