import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSubjectProgress,
  useOverallProgress,
  useContinueSuggestion,
  useTopicProgress,
} from './use-progress';

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

describe('useSubjectProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches subject progress from API', async () => {
    mockGet.mockResolvedValue({
      progress: {
        subjectId: 'sub-1',
        name: 'Mathematics',
        topicsTotal: 10,
        topicsCompleted: 3,
        topicsVerified: 1,
        urgencyScore: 0,
        retentionStatus: 'strong',
        lastSessionAt: null,
      },
    });

    const { result } = renderHook(() => useSubjectProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/subjects/sub-1/progress');
    expect(result.current.data?.name).toBe('Mathematics');
    expect(result.current.data?.topicsTotal).toBe(10);
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSubjectProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useOverallProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches overall progress from API', async () => {
    mockGet.mockResolvedValue({
      subjects: [
        {
          subjectId: 'sub-1',
          name: 'Math',
          topicsTotal: 5,
          topicsCompleted: 2,
          topicsVerified: 1,
          urgencyScore: 0,
          retentionStatus: 'strong',
          lastSessionAt: null,
        },
      ],
      totalTopicsCompleted: 2,
      totalTopicsVerified: 1,
    });

    const { result } = renderHook(() => useOverallProgress(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/progress/overview');
    expect(result.current.data?.totalTopicsCompleted).toBe(2);
  });
});

describe('useContinueSuggestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches continue suggestion from API', async () => {
    mockGet.mockResolvedValue({
      suggestion: {
        subjectId: 'sub-1',
        subjectName: 'Math',
        topicId: 'topic-1',
        topicTitle: 'Algebra',
      },
    });

    const { result } = renderHook(() => useContinueSuggestion(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/progress/continue');
    expect(result.current.data?.topicTitle).toBe('Algebra');
  });

  it('returns null when no suggestion', async () => {
    mockGet.mockResolvedValue({ suggestion: null });

    const { result } = renderHook(() => useContinueSuggestion(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });
});

describe('useTopicProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches topic progress from API', async () => {
    mockGet.mockResolvedValue({
      topic: {
        topicId: 'topic-1',
        title: 'Algebra Basics',
        description: 'Intro',
        completionStatus: 'in_progress',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: 0.85,
        summaryExcerpt: null,
        xpStatus: 'pending',
      },
    });

    const { result } = renderHook(() => useTopicProgress('sub-1', 'topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/subjects/sub-1/topics/topic-1/progress'
    );
    expect(result.current.data?.title).toBe('Algebra Basics');
  });
});
