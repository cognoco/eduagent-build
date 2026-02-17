import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNotificationSettings, useLearningMode } from './use-settings';

const mockGet = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ get: mockGet }),
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
      emailEnabled: true,
      pushEnabled: false,
      weeklyDigest: true,
    });

    const { result } = renderHook(() => useNotificationSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/settings/notifications');
    expect(result.current.data).toEqual({
      emailEnabled: true,
      pushEnabled: false,
      weeklyDigest: true,
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

  it('fetches learning mode settings from API', async () => {
    mockGet.mockResolvedValue({
      mode: 'focused',
      sessionDurationMinutes: 30,
    });

    const { result } = renderHook(() => useLearningMode(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/settings/learning-mode');
    expect(result.current.data).toEqual({
      mode: 'focused',
      sessionDurationMinutes: 30,
    });
  });
});
