import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useNotificationSettings,
  useLearningMode,
  useUpdateNotificationSettings,
  useUpdateLearningMode,
} from './use-settings';

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

describe('useNotificationSettings', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches notification settings from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          preferences: {
            reviewReminders: true,
            dailyReminders: false,
            pushEnabled: true,
            maxDailyPush: 5,
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useNotificationSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      pushEnabled: true,
      maxDailyPush: 5,
    });
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 })
    );

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
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches learning mode from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ mode: 'casual' }), { status: 200 })
    );

    const { result } = renderHook(() => useLearningMode(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toBe('casual');
  });
});

describe('useUpdateNotificationSettings', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls PUT with notification preferences', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          preferences: {
            reviewReminders: true,
            dailyReminders: true,
            pushEnabled: true,
            maxDailyPush: 3,
          },
        }),
        { status: 200 }
      )
    );

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

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useUpdateLearningMode', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls PUT with learning mode', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ mode: 'casual' }), { status: 200 })
    );

    const { result } = renderHook(() => useUpdateLearningMode(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync('casual');
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});
