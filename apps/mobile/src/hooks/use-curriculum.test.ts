import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCurriculum,
  useSkipTopic,
  useChallengeCurriculum,
  useExplainTopic,
} from './use-curriculum';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ get: mockGet, post: mockPost }),
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

const mockCurriculum = {
  id: 'curr-1',
  subjectId: 'subject-1',
  version: 1,
  topics: [
    {
      id: 'topic-1',
      title: 'Introduction',
      description: 'Getting started',
      sortOrder: 0,
      relevance: 'core',
      estimatedMinutes: 15,
      skipped: false,
    },
    {
      id: 'topic-2',
      title: 'Advanced Concepts',
      description: 'Deep dive',
      sortOrder: 1,
      relevance: 'recommended',
      estimatedMinutes: 30,
      skipped: false,
    },
  ],
  generatedAt: '2026-01-01T00:00:00Z',
};

describe('useCurriculum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns curriculum from API', async () => {
    mockGet.mockResolvedValue({ curriculum: mockCurriculum });

    const { result } = renderHook(() => useCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/subjects/subject-1/curriculum');
    expect(result.current.data).toEqual(mockCurriculum);
  });

  it('returns null when no curriculum exists', async () => {
    mockGet.mockResolvedValue({ curriculum: null });

    const { result } = renderHook(() => useCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('is disabled when subjectId is empty', async () => {
    const { result } = renderHook(() => useCurriculum(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useSkipTopic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST to skip a topic', async () => {
    mockPost.mockResolvedValue({ message: 'Topic skipped' });

    const { result } = renderHook(() => useSkipTopic('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/subjects/subject-1/curriculum/skip',
      { topicId: 'topic-1' }
    );
  });
});

describe('useChallengeCurriculum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST to challenge curriculum with feedback', async () => {
    mockPost.mockResolvedValue({ curriculum: mockCurriculum });

    const { result } = renderHook(() => useChallengeCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('I already know the basics');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/subjects/subject-1/curriculum/challenge',
      { feedback: 'I already know the basics' }
    );
  });
});

describe('useExplainTopic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls GET to explain a topic', async () => {
    mockGet.mockResolvedValue({ explanation: 'This topic covers...' });

    const { result } = renderHook(() => useExplainTopic('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/subjects/subject-1/curriculum/topics/topic-1/explain'
    );
    expect(result.current.data).toBe('This topic covers...');
  });
});
