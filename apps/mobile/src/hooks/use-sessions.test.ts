import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useStartSession,
  useStartFirstCurriculumSession,
  useSetSessionInputMode,
  useSendMessage,
  useCloseSession,
  useSyncHomeworkState,
  useStreamMessage,
  useSessionSummary,
  useSkipSummary,
  useSubmitSummary,
  useTopicParkingLot,
  computeFilingRefetchInterval,
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
  // [I-1] getProxyMode is called by useStreamMessage to inject X-Proxy-Mode.
  getProxyMode: jest.fn().mockReturnValue(false),
  withIdempotencyKey: (
    headers: Record<string, string>,
    key: string | undefined,
  ) => (key ? { ...headers, 'X-Idempotency-Key': key } : headers),
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
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

describe('useStartSession', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('passes topicId, sessionType, and inputMode to the API', async () => {
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
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useStartSession('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        subjectId: 'subject-1',
        topicId: 'topic-1',
        sessionType: 'homework',
        inputMode: 'voice',
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
    expect(body.inputMode).toBe('voice');
  });

  it('starts the first curriculum session through the scoped fast-path endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: 'session-1',
            subjectId: 'subject-1',
            topicId: 'topic-1',
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
        { status: 201 },
      ),
    );

    const { result } = renderHook(
      () => useStartFirstCurriculumSession('subject-1'),
      {
        wrapper: createWrapper(),
      },
    );

    await act(async () => {
      result.current.mutate({
        bookId: 'book-1',
        sessionType: 'learning',
        inputMode: 'text',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/subjects/subject-1/sessions/first-curriculum');
    expect(JSON.parse(fetchInit.body as string)).toEqual({
      bookId: 'book-1',
      sessionType: 'learning',
      inputMode: 'text',
    });
  });

  it('passes homework metadata to the API when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: 'session-1',
            subjectId: 'subject-1',
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
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useStartSession('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        subjectId: 'subject-1',
        sessionType: 'homework',
        metadata: {
          homework: {
            problemCount: 2,
            currentProblemIndex: 0,
            problems: [
              {
                id: 'problem-1',
                text: 'Solve 2x + 5 = 17',
                source: 'ocr',
              },
            ],
          },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string);
    expect(body.metadata.homework.problemCount).toBe(2);
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
        { status: 200 },
      ),
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
        { status: 200 },
      ),
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
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useCloseSession('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({});
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('sends milestonesReached in the close payload', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Session closed',
          sessionId: 'session-1',
          wallClockSeconds: 600,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useCloseSession('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        reason: 'user_ended',
        milestonesReached: ['polar_star', 'comet'],
      });
    });

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string);
    expect(body.milestonesReached).toEqual(['polar_star', 'comet']);
  });
});

describe('useSyncHomeworkState', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /sessions/:sessionId/homework-state', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          metadata: {
            problemCount: 2,
            currentProblemIndex: 1,
            problems: [],
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSyncHomeworkState('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        metadata: {
          problemCount: 2,
          currentProblemIndex: 1,
          problems: [],
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useSetSessionInputMode', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /sessions/:sessionId/input-mode with the requested mode', async () => {
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
            inputMode: 'voice',
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSetSessionInputMode('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ inputMode: 'voice' });
    });

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string);
    expect(body.inputMode).toBe('voice');
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
        { status: 200 },
      ),
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
      new Response(JSON.stringify({ summary: null }), { status: 200 }),
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
        { status: 200 },
      ),
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
      'Clear and accurate summary.',
    );
    expect(result.current.data?.summary.status).toBe('accepted');
  });

  it('handles submission error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('API error 422', {
        status: 422,
        statusText: 'Unprocessable Entity',
      }),
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

describe('useSkipSummary', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /sessions/:sessionId/summary/skip', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: {
            id: 'summary-1',
            sessionId: 'session-1',
            content: '',
            aiFeedback: null,
            status: 'skipped',
          },
          consecutiveSummarySkips: 1,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSkipSummary('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockFetch).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.data?.summary.status).toBe('skipped');
    });
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
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    // Mock streamSSEViaXHR to return events async generator + abort handle
    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'chunk', content: 'Hello' };
        yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
      })(),
      abort: jest.fn(),
    });

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

    // Should have called streamSSEViaXHR with URL containing the override session ID
    expect(streamSSEViaXHR).toHaveBeenCalled();
    const [url] = streamSSEViaXHR.mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain('real-session-id');
    expect(onDone).toHaveBeenCalledWith({
      exchangeCount: 1,
      escalationRung: 1,
    });
  });

  it('replaces accumulated streamed text when the server recovers a partial stream failure', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'chunk', content: 'Hel' };
        yield { type: 'replace', content: 'Recovered response' };
        yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(() => useStreamMessage('session-1'), {
      wrapper: createWrapper(),
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await act(async () => {
      await result.current.stream('Hello', onChunk, onDone, 'session-1');
    });

    expect(onChunk).toHaveBeenNthCalledWith(1, 'Hel');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'Recovered response');
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeCount: 1,
        escalationRung: 1,
      }),
    );
  });

  // [BREAK / BUG-629 / I-1] If useStreamMessage stops injecting X-Proxy-Mode
  // on the SSE call, parent-proxy sessions silently bypass server proxy
  // enforcement. Asserts the header is present when getProxyMode returns true.
  it('[BREAK] injects X-Proxy-Mode:true header when proxy mode is on', async () => {
    const apiClient = require('../lib/api-client') as {
      getProxyMode: jest.Mock;
    };
    apiClient.getProxyMode.mockReturnValueOnce(true);

    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };
    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(() => useStreamMessage('session-x'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.stream('hi', jest.fn(), jest.fn(), 'session-x');
    });

    const [, init] = streamSSEViaXHR.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers['X-Proxy-Mode']).toBe('true');
  });

  // [BREAK / BUG-631 / I-3] Snapshot semantics: proxyMode must be read BEFORE
  // the async getToken() call so a profile-switch race during the await cannot
  // produce a mismatched header pair. We simulate the race by flipping
  // getProxyMode's return value while getToken is pending.
  it('[BREAK] snapshots proxy mode before async getToken resolves', async () => {
    const apiClient = require('../lib/api-client') as {
      getProxyMode: jest.Mock;
    };
    // Initial read returns true; any read AFTER snapshot would get false.
    apiClient.getProxyMode.mockReturnValue(true);

    // Make getToken a controllable deferred so we can flip getProxyMode mid-await.
    let resolveToken!: (value: string) => void;
    const tokenPromise = new Promise<string>((r) => {
      resolveToken = r;
    });
    const clerk = require('@clerk/clerk-expo') as {
      useAuth: () => { getToken: jest.Mock };
    };
    const useAuthBefore = clerk.useAuth;
    clerk.useAuth = () =>
      ({
        getToken: jest.fn(() => tokenPromise),
      }) as never;

    try {
      const { streamSSEViaXHR } = require('../lib/sse') as {
        streamSSEViaXHR: jest.Mock;
      };
      streamSSEViaXHR.mockReturnValueOnce({
        events: (async function* () {
          yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
        })(),
        abort: jest.fn(),
      });

      const { result } = renderHook(() => useStreamMessage('session-x'), {
        wrapper: createWrapper(),
      });

      // Kick off stream — it will await getToken
      let streamPromise!: Promise<unknown>;
      await act(async () => {
        streamPromise = result.current.stream(
          'hi',
          jest.fn(),
          jest.fn(),
          'session-x',
        );
        // Yield so the synchronous prefix (snapshot) executes.
        await Promise.resolve();
      });

      // Now flip the underlying value — if the implementation reads AFTER
      // await, this regresses the header.
      apiClient.getProxyMode.mockReturnValue(false);

      await act(async () => {
        resolveToken('test-token');
        await streamPromise;
      });

      const [, init] = streamSSEViaXHR.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(init.headers['X-Proxy-Mode']).toBe('true');
    } finally {
      clerk.useAuth = useAuthBefore;
    }
  });

  it('forwards fallback SSE events into onDone', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield {
          type: 'fallback',
          reason: 'empty_reply',
          fallbackText: 'Try again',
        };
        yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(() => useStreamMessage('session-1'), {
      wrapper: createWrapper(),
    });

    const onDone = jest.fn();

    await act(async () => {
      await result.current.stream('Hello', jest.fn(), onDone, 'session-1');
    });

    expect(onDone).toHaveBeenCalledWith({
      exchangeCount: 1,
      escalationRung: 1,
      fallback: {
        reason: 'empty_reply',
        fallbackText: 'Try again',
      },
    });
  });

  it('classifies server SSE error events as retryable upstream errors', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield {
          type: 'error',
          message:
            'Something went wrong while generating a reply. Please try again.',
        };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(() => useStreamMessage('session-1'), {
      wrapper: createWrapper(),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.stream('Hello', jest.fn(), jest.fn(), 'session-1');
      } catch (err) {
        caught = err;
      }
    });

    expect((caught as Error).name).toBe('UpstreamError');
    expect((caught as Error & { status?: number }).status).toBe(502);
  });
});

describe('useTopicParkingLot', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls GET /subjects/:subjectId/topics/:topicId/parking-lot', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'parked-1',
              question: 'Why does factoring help here?',
              explored: false,
              createdAt: '2026-02-15T10:00:00.000Z',
            },
          ],
          count: 1,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(
      () => useTopicParkingLot('subject-1', 'topic-1'),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.[0]?.question).toBe(
      'Why does factoring help here?',
    );
  });
});

describe('computeFilingRefetchInterval', () => {
  it('returns 15000 for filing_pending so useSession polls while retry is in flight', () => {
    expect(computeFilingRefetchInterval('filing_pending')).toBe(15_000);
  });

  it('returns false for filing_failed (terminal — no polling needed)', () => {
    expect(computeFilingRefetchInterval('filing_failed')).toBe(false);
  });

  it('returns false for filing_recovered (terminal — banner auto-dismisses)', () => {
    expect(computeFilingRefetchInterval('filing_recovered')).toBe(false);
  });

  it('returns false for null (healthy session)', () => {
    expect(computeFilingRefetchInterval(null)).toBe(false);
  });

  it('returns false for undefined (data not yet loaded)', () => {
    expect(computeFilingRefetchInterval(undefined)).toBe(false);
  });
});
