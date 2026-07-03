import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import {
  NetworkError,
  setActiveProfileId,
  setProxyMode,
} from '../lib/api-client';
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
  useAddParkingLotItem,
  computeFilingRefetchInterval,
} from './use-sessions';
import { queryKeys } from '../lib/query-keys';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

// prettier-ignore
jest.mock('../lib/sse', () => ({ // gc1-allow: transport-boundary — XHR-based SSE cannot run in jest; streamSSEViaXHR and parseSSEStream are the real network boundary
  parseSSEStream: jest.fn(),
  streamSSEViaXHR: jest.fn(),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
  setProxyMode(false);
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
  setProxyMode(false);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useStartSession', () => {
  it('passes topicId, sessionType, and inputMode to the API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: '660e8400-e29b-41d4-a716-446655440000',
            subjectId: '550e8400-e29b-41d4-a716-446655440000',
            topicId: '770e8400-e29b-41d4-a716-446655440000',
            sessionType: 'homework',
            inputMode: 'voice',
            verificationType: null,
            status: 'active',
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: '2025-01-01T00:00:00Z',
            lastActivityAt: '2025-01-01T00:00:00Z',
            endedAt: null,
            durationSeconds: null,
            wallClockSeconds: null,
            filedAt: null,
            filingStatus: null,
            filingRetryCount: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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
            id: '660e8400-e29b-41d4-a716-446655440000',
            subjectId: '550e8400-e29b-41d4-a716-446655440000',
            topicId: '770e8400-e29b-41d4-a716-446655440000',
            sessionType: 'learning',
            inputMode: 'text',
            verificationType: null,
            status: 'active',
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: '2025-01-01T00:00:00Z',
            lastActivityAt: '2025-01-01T00:00:00Z',
            endedAt: null,
            durationSeconds: null,
            wallClockSeconds: null,
            filedAt: null,
            filingStatus: null,
            filingRetryCount: 0,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
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
            id: '660e8400-e29b-41d4-a716-446655440000',
            subjectId: '550e8400-e29b-41d4-a716-446655440000',
            topicId: null,
            sessionType: 'homework',
            inputMode: 'text',
            verificationType: null,
            status: 'active',
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: '2025-01-01T00:00:00Z',
            lastActivityAt: '2025-01-01T00:00:00Z',
            endedAt: null,
            durationSeconds: null,
            wallClockSeconds: null,
            filedAt: null,
            filingStatus: null,
            filingRetryCount: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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
            id: '660e8400-e29b-41d4-a716-446655440000',
            subjectId: '550e8400-e29b-41d4-a716-446655440000',
            topicId: null,
            sessionType: 'learning',
            inputMode: 'text',
            verificationType: null,
            status: 'active',
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: '2025-01-01T00:00:00Z',
            lastActivityAt: '2025-01-01T00:00:00Z',
            endedAt: null,
            durationSeconds: null,
            wallClockSeconds: null,
            filedAt: null,
            filingStatus: null,
            filingRetryCount: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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
  it('calls POST /sessions/:sessionId/messages', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: 'AI response',
          escalationRung: 1,
          isUnderstandingCheck: false,
          exchangeCount: 1,
          expectedResponseMinutes: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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
  it('calls POST /sessions/:sessionId/close', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Session closed',
          sessionId: 'session-1',
          wallClockSeconds: 0,
          summaryStatus: 'pending',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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
          summaryStatus: 'pending',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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

  it('invalidates progress-derived queries after closing a session', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Session closed',
          sessionId: 'session-1',
          wallClockSeconds: 600,
          summaryStatus: 'pending',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useCloseSession('session-1'), {
      wrapper: createWrapper(),
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({ reason: 'user_ended' });
    });

    // PR-10: ['sessions'] was a no-op (top segment 'sessions' matches no registered
    // key; session keys use 'session', 'session-transcript', etc.) — removed.
    // Verify it is NOT called so the no-op deletion stays clean.
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['sessions'] });

    // These broad invalidations remain (PR-10 deferred — session-close storm).
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['retention'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['language-progress'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resume-nudge'] });
  });
});

describe('useSyncHomeworkState', () => {
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
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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
  it('calls POST /sessions/:sessionId/input-mode with the requested mode', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: '660e8400-e29b-41d4-a716-446655440000',
            subjectId: '550e8400-e29b-41d4-a716-446655440000',
            topicId: null,
            sessionType: 'learning',
            inputMode: 'voice',
            verificationType: null,
            status: 'active',
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: '2025-01-01T00:00:00Z',
            lastActivityAt: '2025-01-01T00:00:00Z',
            endedAt: null,
            durationSeconds: null,
            wallClockSeconds: null,
            filedAt: null,
            filingStatus: null,
            filingRetryCount: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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

  // [PR-10] Guard: the old ['sessions'] invalidation was a no-op (top segment
  // 'sessions' matches no registered key). Verify it was removed and only the
  // transcript invalidation fires.
  it('[PR-10] does not call no-op ["sessions"] invalidation on input-mode change', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: '660e8400-e29b-41d4-a716-446655440000',
            subjectId: '550e8400-e29b-41d4-a716-446655440000',
            topicId: null,
            sessionType: 'learning',
            inputMode: 'text',
            verificationType: null,
            status: 'active',
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: '2025-01-01T00:00:00Z',
            lastActivityAt: '2025-01-01T00:00:00Z',
            endedAt: null,
            durationSeconds: null,
            wallClockSeconds: null,
            filedAt: null,
            filingStatus: null,
            filingRetryCount: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSetSessionInputMode('session-1'), {
      wrapper: createWrapper(),
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({ inputMode: 'text' });
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['sessions'] });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) }),
    );
  });
});

describe('useSessionSummary', () => {
  it('calls GET /sessions/:sessionId/summary', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: {
            id: '880e8400-e29b-41d4-a716-446655440001',
            sessionId: '660e8400-e29b-41d4-a716-446655440000',
            content: 'I learned about gravity',
            aiFeedback: 'Good summary',
            status: 'accepted',
            closingLine: null,
            learnerRecap: null,
            nextTopicId: null,
            nextTopicTitle: null,
            nextTopicReason: null,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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
      new Response(JSON.stringify({ summary: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
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
  it('calls POST /sessions/:sessionId/summary with content', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: {
            id: '880e8400-e29b-41d4-a716-446655440001',
            sessionId: '660e8400-e29b-41d4-a716-446655440000',
            content: 'Gravity pulls objects toward Earth',
            aiFeedback: 'Clear and accurate summary.',
            status: 'accepted',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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

  it('invalidates progress after accepting a summary', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: {
            id: '880e8400-e29b-41d4-a716-446655440001',
            sessionId: '660e8400-e29b-41d4-a716-446655440000',
            content: 'Gravity pulls objects toward Earth',
            aiFeedback: 'Clear and accurate summary.',
            status: 'accepted',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSubmitSummary('session-1'), {
      wrapper: createWrapper(),
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({
        content: 'Gravity pulls objects toward Earth',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress'] });
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
  it('calls POST /sessions/:sessionId/summary/skip', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: {
            id: '880e8400-e29b-41d4-a716-446655440001',
            sessionId: '660e8400-e29b-41d4-a716-446655440000',
            content: '',
            aiFeedback: null,
            status: 'skipped',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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

  it('invalidates progress after skipping a summary', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: {
            id: '880e8400-e29b-41d4-a716-446655440001',
            sessionId: '660e8400-e29b-41d4-a716-446655440000',
            content: '',
            aiFeedback: null,
            status: 'skipped',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSkipSummary('session-1'), {
      wrapper: createWrapper(),
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress'] });
  });
});

describe('useStreamMessage', () => {
  it('does not abort the XHR after app-level done completes normally', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };
    const abort = jest.fn();

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'chunk', content: 'Hello' };
        yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
      })(),
      abort,
    });

    const { result } = renderHook(() => useStreamMessage('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.stream('Hello', jest.fn(), jest.fn(), 'session-1');
    });

    expect(abort).not.toHaveBeenCalled();
  });

  it.each<[string, Error]>([
    ['network failure', new NetworkError()],
    [
      'idle timeout',
      Object.assign(
        new Error('The connection timed out while waiting for a reply'),
        { isTimeout: true },
      ),
    ],
    [
      'server 5xx',
      Object.assign(new Error('API error 502: request failed'), {
        status: 502,
      }),
    ],
  ])(
    'retries one pre-stream %s when the request is idempotent',
    async (_label, error) => {
      const { streamSSEViaXHR } = require('../lib/sse') as {
        streamSSEViaXHR: jest.Mock;
      };
      const firstAbort = jest.fn();
      const secondAbort = jest.fn();
      const preStreamFailure: AsyncIterable<never> = {
        [Symbol.asyncIterator]() {
          return {
            next: async () => {
              throw error;
            },
          };
        },
      };

      streamSSEViaXHR
        .mockReturnValueOnce({
          events: preStreamFailure,
          abort: firstAbort,
        })
        .mockReturnValueOnce({
          events: (async function* () {
            yield { type: 'chunk', content: 'Recovered' };
            yield { type: 'done', exchangeCount: 2, escalationRung: 1 };
          })(),
          abort: secondAbort,
        });

      const { result } = renderHook(() => useStreamMessage('session-1'), {
        wrapper: createWrapper(),
      });
      const onChunk = jest.fn();
      const onDone = jest.fn();

      await act(async () => {
        await result.current.stream('Hello', onChunk, onDone, 'session-1', {
          idempotencyKey: 'outbox-entry-1',
        });
      });

      expect(streamSSEViaXHR).toHaveBeenCalledTimes(2);
      expect(firstAbort).toHaveBeenCalledTimes(1);
      expect(secondAbort).not.toHaveBeenCalled();
      expect(onChunk).toHaveBeenCalledWith('Recovered');
      expect(onDone).toHaveBeenCalledWith({
        exchangeCount: 2,
        escalationRung: 1,
      });
    },
  );

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

  it('forwards language-learning activity from the done event', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'chunk', content: 'Read this.' };
        yield {
          type: 'done',
          exchangeCount: 1,
          escalationRung: 1,
          languageLearning: {
            strand: 'meaning_input',
            activityType: 'graded_input',
            modality: 'text',
            targetWords: ['agua'],
            targetGrammar: [],
            gradedInput: {
              type: 'graded_input',
              modality: 'reading',
              cefrLevel: 'A1',
              knownWordRatioTarget: 0.85,
              knownWordEstimate: 0.82,
              targetWords: ['agua'],
              text: 'Tengo agua en la mesa.',
              comprehensionQuestions: [
                {
                  id: 'q1',
                  prompt: 'What is on the table?',
                  answerHint: 'agua',
                },
              ],
              audioEnabled: true,
            },
          },
        };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(() => useStreamMessage('session-1'), {
      wrapper: createWrapper(),
    });
    const onChunk = jest.fn();
    const onDone = jest.fn();

    await act(async () => {
      await result.current.stream('Hola', onChunk, onDone, 'session-1');
    });

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        languageLearning: expect.objectContaining({
          strand: 'meaning_input',
          gradedInput: expect.objectContaining({
            text: 'Tengo agua en la mesa.',
          }),
        }),
      }),
    );
  });

  it('sends image payloads in the SSE request body when provided', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(() => useStreamMessage('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.stream('Hello', jest.fn(), jest.fn(), 'session-1', {
        imageBase64: 'base64-homework-image',
        imageMimeType: 'image/jpeg',
      });
    });

    const [, init] = streamSSEViaXHR.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({
      message: 'Hello',
      imageBase64: 'base64-homework-image',
      imageMimeType: 'image/jpeg',
    });
  });

  it('waits for async done handling before resolving the stream', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };
    let releaseDone!: () => void;
    const doneGate = new Promise<void>((resolve) => {
      releaseDone = resolve;
    });

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'chunk', content: 'Hello' };
        yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
      })(),
      abort: jest.fn(),
    });

    const { result } = renderHook(() => useStreamMessage('session-1'), {
      wrapper: createWrapper(),
    });

    const onDone = jest.fn(async () => {
      await doneGate;
    });
    let settled = false;

    let streamPromise!: Promise<void>;
    await act(async () => {
      streamPromise = result.current
        .stream('Hello', jest.fn(), onDone, 'session-1')
        .then(() => {
          settled = true;
        });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    expect(settled).toBe(false);

    releaseDone();
    await act(async () => {
      await streamPromise;
    });

    expect(settled).toBe(true);
  });

  // [BREAK / BUG-629 / I-1] If useStreamMessage stops injecting X-Proxy-Mode
  // on the SSE call, parent-proxy sessions silently bypass server proxy
  // enforcement. Asserts the header is present when getProxyMode returns true.
  it('[BREAK] injects X-Proxy-Mode:true header when proxy mode is on', async () => {
    setProxyMode(true);

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
  // setProxyMode's value while getToken is pending.
  it('[BREAK] snapshots proxy mode before async getToken resolves', async () => {
    // Initial read returns true; any read AFTER snapshot would get false.
    setProxyMode(true);

    // Make getToken a controllable deferred so we can flip proxyMode mid-await.
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
      setProxyMode(false);

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
      setProxyMode(false);
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

  it('forwards typed challenge round done fields into onDone', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };
    const challengeRound = {
      state: 'active',
      startedAt: '2026-05-26T10:00:00.000Z',
      questionIndex: 1,
      totalQuestions: 3,
      offerCount: 1,
      topicId: '11111111-1111-4111-8111-111111111111',
      declinedDontAskAgain: false,
      evaluations: [],
    };
    const draftedNote = {
      id: 'draft-1',
      body: 'My challenge note',
      sourceAnswerEventIds: ['answer-event-1'],
    };

    streamSSEViaXHR.mockReturnValueOnce({
      events: (async function* () {
        yield { type: 'chunk', content: 'Done' };
        yield {
          type: 'done',
          exchangeCount: 3,
          escalationRung: 2,
          challengeRound,
          challengeOffer: { pitch: 'Want a harder round?' },
          draftedNote,
        };
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

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeCount: 3,
        escalationRung: 2,
        challengeRound,
        challengeOffer: { pitch: 'Want a harder round?' },
        draftedNote,
      }),
    );
  });

  it('queues overlapping stream calls instead of completing the second silently', async () => {
    const { streamSSEViaXHR } = require('../lib/sse') as {
      streamSSEViaXHR: jest.Mock;
    };

    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    streamSSEViaXHR
      .mockReturnValueOnce({
        events: (async function* () {
          yield { type: 'chunk', content: 'First' };
          await firstGate;
          yield { type: 'done', exchangeCount: 1, escalationRung: 1 };
        })(),
        abort: jest.fn(),
      })
      .mockReturnValueOnce({
        events: (async function* () {
          yield { type: 'chunk', content: 'Second' };
          await secondGate;
          yield { type: 'done', exchangeCount: 2, escalationRung: 1 };
        })(),
        abort: jest.fn(),
      });

    const { result } = renderHook(() => useStreamMessage('session-1'), {
      wrapper: createWrapper(),
    });

    const firstDone = jest.fn();
    const secondDone = jest.fn();
    let firstPromise!: Promise<void>;
    let secondPromise!: Promise<void>;

    await act(async () => {
      firstPromise = result.current.stream(
        'first',
        jest.fn(),
        firstDone,
        'session-1',
      );
      secondPromise = result.current.stream(
        'second',
        jest.fn(),
        secondDone,
        'session-1',
      );
    });

    await waitFor(() => {
      expect(streamSSEViaXHR).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      releaseFirst();
      await firstPromise;
    });
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(streamSSEViaXHR).toHaveBeenCalledTimes(2);
    });
    expect(secondDone).not.toHaveBeenCalled();

    await act(async () => {
      releaseSecond();
      await secondPromise;
    });

    expect(firstDone).toHaveBeenCalledWith({
      exchangeCount: 1,
      escalationRung: 1,
    });
    expect(secondDone).toHaveBeenCalledWith({
      exchangeCount: 2,
      escalationRung: 1,
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
          code: 'LLM_UNAVAILABLE',
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
    expect((caught as Error & { code?: string }).code).toBe('LLM_UNAVAILABLE');
  });
});

describe('useTopicParkingLot', () => {
  it('calls GET /subjects/:subjectId/topics/:topicId/parking-lot', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'aa0e8400-e29b-41d4-a716-446655440001',
              question: 'Why does factoring help here?',
              explored: false,
              createdAt: '2026-02-15T10:00:00.000Z',
            },
          ],
          count: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
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

// [BUG-165] useAddParkingLotItem must scope cache invalidation to the active
// profile so a mutation on this profile cannot invalidate another profile's
// parking-lot cache on a shared device. Before the fix, the invalidation key
// was ['parking-lot', sessionId] — prefix-matched both profiles via TanStack
// prefix matching.
describe('useAddParkingLotItem (profile-scoped invalidation)', () => {
  it('[BREAK] invalidates parking-lot only for the active profile id', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          item: {
            id: 'aa0e8400-e29b-41d4-a716-446655440002',
            question: 'Why does this work?',
            explored: false,
            createdAt: '2026-02-15T10:00:00.000Z',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAddParkingLotItem('session-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ question: 'Why does this work?' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Active profile's parking-lot key MUST be the invalidated key.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.sessions.parkingLot(
          'study',
          'session-1',
          'test-profile-id',
        ),
      }),
    );
    // The pre-fix shape ['parking-lot', sessionId] would prefix-match every
    // profile via TanStack invalidation — that shape MUST NOT be present.
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['parking-lot', 'session-1'] }),
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

// ---------------------------------------------------------------------------
// Profile-switch cache isolation
// ---------------------------------------------------------------------------

describe('profile-switch cache isolation', () => {
  it('sessions.detail — same session ID, different profiles produce different keys', () => {
    const keyA = queryKeys.sessions.detail('study', 'sess-1', 'profile-A');
    const keyB = queryKeys.sessions.detail('study', 'sess-1', 'profile-B');
    expect(keyA).not.toEqual(keyB);
    expect(keyA).toEqual(['session', 'study', 'sess-1', 'profile-A']);
  });

  it('sessions.transcript — same session, different profiles are isolated', () => {
    const keyA = queryKeys.sessions.transcript('study', 'sess-1', 'profile-A');
    const keyB = queryKeys.sessions.transcript('study', 'sess-1', 'profile-B');
    expect(keyA).not.toEqual(keyB);
    expect(keyA).toEqual([
      'session-transcript',
      'study',
      'sess-1',
      'profile-A',
    ]);
  });

  it('sessions.summary — same session, different profiles are isolated', () => {
    const keyA = queryKeys.sessions.summary('study', 'sess-1', 'profile-A');
    const keyB = queryKeys.sessions.summary('study', 'sess-1', 'profile-B');
    expect(keyA).not.toEqual(keyB);
  });

  it('sessions.parkingLot — same session, undefined profile is isolated from defined', () => {
    const keyDefined = queryKeys.sessions.parkingLot(
      'study',
      'sess-1',
      'profile-A',
    );
    const keyUndefined = queryKeys.sessions.parkingLot(
      'study',
      'sess-1',
      undefined,
    );
    expect(keyDefined).not.toEqual(keyUndefined);
  });
});
