import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAssessment,
  useCreateAssessment,
  useSubmitAnswer,
} from './use-assessments';

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

describe('useAssessment', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches assessment by ID', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assessment: {
            id: 'assess-1',
            topicId: 'topic-1',
            verificationDepth: 'recall',
            status: 'in_progress',
            masteryScore: null,
            createdAt: '2026-02-15T10:00:00.000Z',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useAssessment('assess-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.id).toBe('assess-1');
    expect(result.current.data?.status).toBe('in_progress');
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    const { result } = renderHook(() => useAssessment('assess-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useCreateAssessment', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('creates assessment via POST', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assessment: {
            id: 'new-assess',
            topicId: 'topic-1',
            verificationDepth: 'recall',
            status: 'in_progress',
            masteryScore: null,
            createdAt: '2026-02-15T10:00:00.000Z',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(
      () => useCreateAssessment('sub-1', 'topic-1'),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useSubmitAnswer', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('submits answer via POST', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            passed: true,
            masteryScore: 0.85,
            feedback: 'Well done!',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSubmitAnswer('assess-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        answer: 'Photosynthesis converts light into energy.',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.result.passed).toBe(true);
  });

  it('handles submission errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Submission failed', { status: 500 })
    );

    const { result } = renderHook(() => useSubmitAnswer('assess-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ answer: 'Wrong answer' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
