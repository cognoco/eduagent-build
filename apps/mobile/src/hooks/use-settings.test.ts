import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useNotificationSettings,
  useLearningMode,
  useUpdateNotificationSettings,
  useUpdateLearningMode,
} from './use-settings';

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ get: mockGet, put: mockPut }),
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

describe('useNotificationSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches notification settings from API', async () => {
    mockGet.mockResolvedValue({
      preferences: {
        reviewReminders: true,
        dailyReminders: false,
        pushEnabled: true,
        maxDailyPush: 5,
      },
    });

    const { result } = renderHook(() => useNotificationSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/settings/notifications');
    expect(result.current.data).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      pushEnabled: true,
      maxDailyPush: 5,
    });
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useNotificationSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useLearningMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches learning mode from API', async () => {
    mockGet.mockResolvedValue({ mode: 'casual' });

    const { result } = renderHook(() => useLearningMode(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/settings/learning-mode');
    expect(result.current.data).toBe('casual');
  });
});

describe('useUpdateNotificationSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls PUT with notification preferences', async () => {
    mockPut.mockResolvedValue({
      preferences: {
        reviewReminders: true,
        dailyReminders: true,
        pushEnabled: true,
        maxDailyPush: 3,
      },
    });

    const { result } = renderHook(() => useUpdateNotificationSettings(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        reviewReminders: true,
        dailyReminders: true,
        pushEnabled: true,
      });
    });

    expect(mockPut).toHaveBeenCalledWith('/settings/notifications', {
      reviewReminders: true,
      dailyReminders: true,
      pushEnabled: true,
    });
  });
});

describe('useUpdateLearningMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls PUT with learning mode', async () => {
    mockPut.mockResolvedValue({ mode: 'casual' });

    const { result } = renderHook(() => useUpdateLearningMode(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync('casual');
    });

    expect(mockPut).toHaveBeenCalledWith('/settings/learning-mode', {
      mode: 'casual',
    });
  });
});
