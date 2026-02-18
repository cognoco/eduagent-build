import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCoachingCard } from './use-coaching-card';

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

describe('useCoachingCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns suggestion-based card when topic available', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/progress/continue') {
        return Promise.resolve({
          suggestion: {
            subjectId: 'sub-1',
            subjectName: 'Mathematics',
            topicId: 'topic-1',
            topicTitle: 'Algebra Basics',
          },
        });
      }
      if (path === '/streaks') {
        return Promise.resolve({
          streak: {
            currentStreak: 5,
            longestStreak: 12,
            lastActivityDate: '2026-02-15',
            gracePeriodStartDate: null,
            isOnGracePeriod: false,
            graceDaysRemaining: 0,
          },
        });
      }
      return Promise.resolve({});
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
    mockGet.mockImplementation((path: string) => {
      if (path === '/progress/continue') {
        return Promise.resolve({ suggestion: null });
      }
      if (path === '/streaks') {
        return Promise.resolve({
          streak: {
            currentStreak: 7,
            longestStreak: 12,
            lastActivityDate: '2026-02-14',
            gracePeriodStartDate: '2026-02-15',
            isOnGracePeriod: true,
            graceDaysRemaining: 2,
          },
        });
      }
      return Promise.resolve({});
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
    mockGet.mockImplementation((path: string) => {
      if (path === '/progress/continue') {
        return Promise.resolve({ suggestion: null });
      }
      if (path === '/streaks') {
        return Promise.resolve({
          streak: {
            currentStreak: 0,
            longestStreak: 0,
            lastActivityDate: null,
            gracePeriodStartDate: null,
            isOnGracePeriod: false,
            graceDaysRemaining: 0,
          },
        });
      }
      return Promise.resolve({});
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
    mockGet.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({}), 100))
    );

    const { result } = renderHook(() => useCoachingCard(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.headline).toBe('Preparing your session...');
  });
});
