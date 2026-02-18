import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCurriculum,
  useSkipTopic,
  useChallengeCurriculum,
  useExplainTopic,
} from './use-curriculum';

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
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns curriculum from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ curriculum: mockCurriculum }), {
        status: 200,
      })
    );

    const { result } = renderHook(() => useCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockCurriculum);
  });

  it('returns null when no curriculum exists', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ curriculum: null }), { status: 200 })
    );

    const { result } = renderHook(() => useCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 })
    );

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
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST to skip a topic', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Topic skipped' }), {
        status: 200,
      })
    );

    const { result } = renderHook(() => useSkipTopic('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useChallengeCurriculum', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST to challenge curriculum with feedback', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ curriculum: mockCurriculum }), {
        status: 200,
      })
    );

    const { result } = renderHook(() => useChallengeCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('I already know the basics');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useExplainTopic', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls GET to explain a topic', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ explanation: 'This topic covers...' }), {
        status: 200,
      })
    );

    const { result } = renderHook(() => useExplainTopic('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toBe('This topic covers...');
  });
});
