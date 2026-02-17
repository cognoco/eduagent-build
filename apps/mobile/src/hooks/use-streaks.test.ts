import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStreaks } from './use-streaks';

const mockGet = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ get: mockGet }),
  useApiGet: () => ({ get: mockGet }),
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

    mockGet.mockResolvedValue({ streak: streakData });

    const { result } = renderHook(() => useStreaks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/streaks');
    expect(result.current.data).toEqual(streakData);
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useStreaks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
