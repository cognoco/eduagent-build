import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useInterviewState,
  useSendInterviewMessage,
  useStreamInterviewMessage,
} from './use-interview';

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

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

jest.mock('../lib/api', () => ({
  getApiUrl: () => 'http://localhost:8787',
}));

jest.mock('../lib/sse', () => ({
  parseSSEStream: jest.fn(),
  streamSSEViaXHR: jest.fn(),
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

  // [BUG-810] Caller-side gate. The previous shape forced callers to pass an
  // empty-string subjectId fallback; that worked because of the internal
  // !!subjectId check, but only as a coincidence. Make the gate explicit so
  // a future caller cannot accidentally enable the query with '' anymore.
  it('[BREAK / BUG-810] respects caller `enabled: false` even with valid subjectId', () => {
    const { result } = renderHook(
      () => useInterviewState('subject-1', { enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('[BUG-810] caller `enabled: true` re-enables the query (default behaviour)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          state: {
            draftId: 'draft-2',
            status: 'in_progress',
            exchangeCount: 0,
            subjectName: 'Math',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(
      () => useInterviewState('subject-1', { enabled: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(1);
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

describe('useStreamInterviewMessage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('streams interview message via SSE and calls onChunk/onDone', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'chunk', content: 'Tell ' };
        yield { type: 'chunk', content: 'me ' };
        yield { type: 'chunk', content: 'more.' };
        yield {
          type: 'done',
          isComplete: false,
          exchangeCount: 1,
        };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(
      () => useStreamInterviewMessage('subject-1'),
      {
        wrapper: createWrapper(),
      }
    );

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await act(async () => {
      await result.current.stream('Hello', onChunk, onDone);
    });

    expect(streamSSEViaXHR).toHaveBeenCalled();
    const [url] = streamSSEViaXHR.mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain('/subjects/subject-1/interview/stream');

    // onChunk receives accumulated text
    expect(onChunk).toHaveBeenCalledTimes(3);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'Tell ');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'Tell me ');
    expect(onChunk).toHaveBeenNthCalledWith(3, 'Tell me more.');

    expect(onDone).toHaveBeenCalledWith({
      isComplete: false,
      exchangeCount: 1,
    });
  });

  it('does not stream when subjectId is empty', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    const { result } = renderHook(() => useStreamInterviewMessage(''), {
      wrapper: createWrapper(),
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await act(async () => {
      await result.current.stream('Hello', onChunk, onDone);
    });

    expect(streamSSEViaXHR).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('sends auth headers in the XHR request', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'done', isComplete: false, exchangeCount: 1 };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(
      () => useStreamInterviewMessage('subject-1'),
      {
        wrapper: createWrapper(),
      }
    );

    await act(async () => {
      await result.current.stream('Hi', jest.fn(), jest.fn());
    });

    const [, options] = streamSSEViaXHR.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string }
    ];
    expect(options.headers['Authorization']).toBe('Bearer test-token');
    expect(options.headers['X-Profile-Id']).toBe('test-profile-id');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.message).toBe('Hi');
  });
});
