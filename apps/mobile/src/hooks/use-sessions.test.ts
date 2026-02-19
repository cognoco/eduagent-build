import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useStartSession,
  useSendMessage,
  useCloseSession,
  useStreamMessage,
  useSessionSummary,
  useSubmitSummary,
} from './use-sessions';

const mockFetch = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

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

jest.mock('../lib/api', () => ({
  getApiUrl: () => 'http://localhost:8787',
}));

jest.mock('../lib/sse', () => ({
  parseSSEStream: jest.fn(),
  streamSSE: jest.fn(),
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

describe('useStartSession', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('passes topicId and sessionType to the API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: 'session-1',
            subjectId: 'subject-1',
            topicId: 'topic-1',
            sessionType: 'homework',
            status: 'active',
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: '2025-01-01T00:00:00Z',
            lastActivityAt: '2025-01-01T00:00:00Z',
            endedAt: null,
            durationSeconds: null,
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useStartSession('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        subjectId: 'subject-1',
        topicId: 'topic-1',
        sessionType: 'homework',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify the fetch body includes topicId and sessionType
    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string);
    expect(body.topicId).toBe('topic-1');
    expect(body.sessionType).toBe('homework');
  });

  it('calls POST /subjects/:subjectId/sessions', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: 'session-1',
            subjectId: 'subject-1',
            sessionType: 'learning',
            status: 'active',
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: '2025-01-01T00:00:00Z',
            lastActivityAt: '2025-01-01T00:00:00Z',
            endedAt: null,
            durationSeconds: null,
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useStartSession('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ subjectId: 'subject-1' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useSendMessage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /sessions/:sessionId/messages', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: 'AI response',
          escalationRung: 1,
          isUnderstandingCheck: false,
          exchangeCount: 1,
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSendMessage('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ message: 'What is gravity?' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.response).toBe('AI response');
  });
});

describe('useCloseSession', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /sessions/:sessionId/close', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Session closed',
          sessionId: 'session-1',
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useCloseSession('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useSessionSummary', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls GET /sessions/:sessionId/summary', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: {
            id: 'summary-1',
            sessionId: 'session-1',
            content: 'I learned about gravity',
            aiFeedback: 'Good summary',
            status: 'accepted',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSessionSummary('session-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.content).toBe('I learned about gravity');
    expect(result.current.data?.aiFeedback).toBe('Good summary');
  });

  it('returns null when no summary exists', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ summary: null }), { status: 200 })
    );

    const { result } = renderHook(() => useSessionSummary('session-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });
});

describe('useSubmitSummary', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /sessions/:sessionId/summary with content', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: {
            id: 'summary-1',
            sessionId: 'session-1',
            content: 'Gravity pulls objects toward Earth',
            aiFeedback: 'Clear and accurate summary.',
            status: 'accepted',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSubmitSummary('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ content: 'Gravity pulls objects toward Earth' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.summary.aiFeedback).toBe(
      'Clear and accurate summary.'
    );
    expect(result.current.data?.summary.status).toBe('accepted');
  });

  it('handles submission error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('API error 422', {
        status: 422,
        statusText: 'Unprocessable Entity',
      })
    );

    const { result } = renderHook(() => useSubmitSummary('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ content: 'Too short' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useStreamMessage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('uses overrideSessionId when provided, ignoring hook sessionId', async () => {
    const { parseSSEStream } = require('../lib/sse') as {
      parseSSEStream: jest.Mock;
    };

    // Mock fetch to return OK response
    mockFetch.mockResolvedValueOnce(new Response('stream', { status: 200 }));

    // Mock parseSSEStream to yield chunk + done events
    parseSSEStream.mockReturnValueOnce(
      (async function* () {
        yield { type: 'chunk', content: 'Hello' };
        yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
      })()
    );

    // Hook initialized with empty string (simulating no session yet)
    const { result } = renderHook(() => useStreamMessage(''), {
      wrapper: createWrapper(),
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await act(async () => {
      // Pass 'real-session-id' as 4th arg (overrideSessionId)
      await result.current.stream('Hello', onChunk, onDone, 'real-session-id');
    });

    // Should have called API (wouldn't be called if sessionId was '')
    expect(mockFetch).toHaveBeenCalled();
    // Verify the URL contains the override session ID
    const [url] = mockFetch.mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain('real-session-id');
    expect(onDone).toHaveBeenCalledWith({
      exchangeCount: 1,
      escalationRung: 1,
    });
  });
});
