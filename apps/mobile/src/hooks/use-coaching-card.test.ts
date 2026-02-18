import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCoachingCard } from './use-coaching-card';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
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

describe('useCoachingCard', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns suggestion-based card when topic available', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/progress/continue')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              suggestion: {
                subjectId: 'sub-1',
                subjectName: 'Mathematics',
                topicId: 'topic-1',
                topicTitle: 'Algebra Basics',
              },
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/streaks')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              streak: {
                currentStreak: 5,
                longestStreak: 12,
                lastActivityDate: '2026-02-15',
                gracePeriodStartDate: null,
                isOnGracePeriod: false,
                graceDaysRemaining: 0,
              },
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    const { result } = renderHook(() => useCoachingCard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.headline).toBe('Continue: Algebra Basics');
    expect(result.current.subtext).toContain('Mathematics');
    expect(result.current.primaryRoute).toContain('subjectId=sub-1');
    expect(result.current.primaryRoute).toContain('topicId=topic-1');
  });

  it('returns grace period card when on grace period', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/progress/continue')) {
        return Promise.resolve(
          new Response(JSON.stringify({ suggestion: null }), { status: 200 })
        );
      }
      if (url.includes('/streaks')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              streak: {
                currentStreak: 7,
                longestStreak: 12,
                lastActivityDate: '2026-02-14',
                gracePeriodStartDate: '2026-02-15',
                isOnGracePeriod: true,
                graceDaysRemaining: 2,
              },
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    const { result } = renderHook(() => useCoachingCard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.headline).toBe('Welcome back!');
    expect(result.current.subtext).toContain('2 grace days');
    expect(result.current.subtext).toContain('7-day streak');
  });

  it('returns default card when no suggestion and no grace period', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/progress/continue')) {
        return Promise.resolve(
          new Response(JSON.stringify({ suggestion: null }), { status: 200 })
        );
      }
      if (url.includes('/streaks')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              streak: {
                currentStreak: 0,
                longestStreak: 0,
                lastActivityDate: null,
                gracePeriodStartDate: null,
                isOnGracePeriod: false,
                graceDaysRemaining: 0,
              },
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    const { result } = renderHook(() => useCoachingCard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.headline).toBe('Ready to learn?');
    expect(result.current.subtext).toContain('Start a new topic');
  });

  it('shows loading state initially', async () => {
    // Delay the responses so loading state is visible
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve(new Response(JSON.stringify({}), { status: 200 })),
            100
          )
        )
    );

    const { result } = renderHook(() => useCoachingCard(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.headline).toBe('Preparing your session...');
  });
});
