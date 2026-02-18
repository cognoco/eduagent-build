import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSubjectProgress,
  useOverallProgress,
  useContinueSuggestion,
  useTopicProgress,
} from './use-progress';

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

describe('useSubjectProgress', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches subject progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSubjectProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.name).toBe('Mathematics');
    expect(result.current.data?.topicsTotal).toBe(10);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 })
    );

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
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches overall progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useOverallProgress(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.totalTopicsCompleted).toBe(2);
  });
});

describe('useContinueSuggestion', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches continue suggestion from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestion: {
            subjectId: 'sub-1',
            subjectName: 'Math',
            topicId: 'topic-1',
            topicTitle: 'Algebra',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useContinueSuggestion(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.topicTitle).toBe('Algebra');
  });

  it('returns null when no suggestion', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ suggestion: null }), { status: 200 })
    );

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
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches topic progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useTopicProgress('sub-1', 'topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.title).toBe('Algebra Basics');
  });
});
