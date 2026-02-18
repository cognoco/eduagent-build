import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInterviewState, useSendInterviewMessage } from './use-interview';

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

describe('useInterviewState', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns interview state from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          state: {
            draftId: 'draft-1',
            status: 'in_progress',
            exchangeCount: 2,
            subjectName: 'Math',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useInterviewState('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual({
      draftId: 'draft-1',
      status: 'in_progress',
      exchangeCount: 2,
      subjectName: 'Math',
    });
  });

  it('returns null when no interview exists', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ state: null }), { status: 200 })
    );

    const { result } = renderHook(() => useInterviewState('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('is disabled when subjectId is empty', () => {
    const { result } = renderHook(() => useInterviewState(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useSendInterviewMessage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('sends interview message and returns response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: 'What are your goals?',
          isComplete: false,
          exchangeCount: 1,
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSendInterviewMessage('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('I want to learn calculus');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.response).toBe('What are your goals?');
    expect(result.current.data?.isComplete).toBe(false);
  });

  it('returns isComplete when interview finishes', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: 'Great, I have enough to create your curriculum!',
          isComplete: true,
          exchangeCount: 4,
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSendInterviewMessage('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('I want to focus on integration');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.isComplete).toBe(true);
    expect(result.current.data?.exchangeCount).toBe(4);
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal error', {
        status: 500,
        statusText: 'Internal Server Error',
      })
    );

    const { result } = renderHook(() => useSendInterviewMessage('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('test message');
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
