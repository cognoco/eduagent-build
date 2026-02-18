import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRetentionTopics, useTopicRetention } from './use-retention';

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

describe('useRetentionTopics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches retention topics for a subject', async () => {
    mockGet.mockResolvedValue({
      topics: [
        {
          topicId: 'topic-1',
          easeFactor: 2.5,
          intervalDays: 7,
          repetitions: 3,
          nextReviewAt: '2026-02-22T10:00:00.000Z',
          xpStatus: 'pending',
          failureCount: 0,
        },
      ],
      reviewDueCount: 0,
    });

    const { result } = renderHook(() => useRetentionTopics('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/subjects/sub-1/retention');
    expect(result.current.data?.topics).toHaveLength(1);
    expect(result.current.data?.reviewDueCount).toBe(0);
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useRetentionTopics('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useTopicRetention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches topic retention card', async () => {
    mockGet.mockResolvedValue({
      card: {
        topicId: 'topic-1',
        easeFactor: 2.5,
        intervalDays: 7,
        repetitions: 3,
        nextReviewAt: '2026-02-22T10:00:00.000Z',
        xpStatus: 'verified',
        failureCount: 0,
      },
    });

    const { result } = renderHook(() => useTopicRetention('topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/topics/topic-1/retention');
    expect(result.current.data?.xpStatus).toBe('verified');
  });

  it('returns null when no card exists', async () => {
    mockGet.mockResolvedValue({ card: null });

    const { result } = renderHook(() => useTopicRetention('topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });
});
