import { renderHook, act } from '@testing-library/react-native';
import { useSessionStreaming } from './use-session-streaming';
import { QuotaExceededError } from '../../lib/api-client';

// Mock session components barrel (animateResponse)
jest.mock('../session', () => ({
  animateResponse: jest.fn(() => jest.fn()),
}));

// Mock session recovery
const mockWriteRecoveryMarker = jest.fn().mockResolvedValue(undefined);
jest.mock('../../lib/session-recovery', () => ({
  writeSessionRecoveryMarker: (...args: unknown[]) =>
    mockWriteRecoveryMarker(...args),
}));

// Mock format-api-error
jest.mock('../../lib/format-api-error', () => ({
  formatApiError: (err: unknown) =>
    err instanceof Error ? err.message : 'Unknown error',
}));

// Mock homework problem-cards
jest.mock('../homework/problem-cards', () => ({
  buildHomeworkSessionMetadata: jest.fn(() => ({})),
  withProblemMode: jest.fn((problems: unknown[]) => problems),
}));

// Mock milestone tracker
jest.mock('../../hooks/use-milestone-tracker', () => ({
  celebrationForReason: jest.fn((reason: string) => reason),
}));

const WATCHDOG_RECONNECT_TEXT = 'Connection dropped — Try again';

function applyMessageUpdates(
  calls: Array<[unknown]>,
  initialState: Array<Record<string, unknown>>
) {
  return calls.reduce<Array<Record<string, unknown>>>((state, [update]) => {
    if (typeof update === 'function') {
      return (
        update as (
          prev: Array<Record<string, unknown>>
        ) => Array<Record<string, unknown>>
      )(state);
    }
    return update as Array<Record<string, unknown>>;
  }, initialState);
}

// ---------------------------------------------------------------------------
// Options factory — builds the ~30-field dependency bag for useSessionStreaming.
// Declared at module scope for brevity but silenceTimerRef cleanup is handled
// in the describe-level afterEach via the returned ref.
// ---------------------------------------------------------------------------

function createMockOpts(overrides: Record<string, unknown> = {}) {
  const silenceTimerRef = {
    current: null as ReturnType<typeof setTimeout> | null,
  };
  return {
    activeSessionId: null as string | null,
    setActiveSessionId: jest.fn(),
    effectiveSubjectId: 'subject-1',
    effectiveSubjectName: 'Math',
    effectiveMode: 'learning',
    topicId: undefined,
    inputMode: 'text' as const,
    rawInput: undefined,
    verificationType: undefined,
    normalizedOcrText: undefined,
    homeworkCaptureSource: undefined,

    messages: [] as Array<{ id: string; role: string; content: string }>,
    setMessages: jest.fn(),
    setIsStreaming: jest.fn(),
    setExchangeCount: jest.fn(),
    setEscalationRung: jest.fn(),
    setQuotaError: jest.fn(),
    setNotePromptOffered: jest.fn(),
    setShowNoteInput: jest.fn(),
    setResponseHistory: jest.fn(),
    setHomeworkProblemsState: jest.fn(),
    setFluencyDrill: jest.fn(),
    setLowConfidenceMessageId: jest.fn(),

    homeworkProblemsState: [],
    currentProblemIndex: 0,
    activeHomeworkProblem: undefined,
    homeworkMode: undefined,

    subjectId: undefined,
    classifiedSubject: null,

    isStreaming: false,
    sessionExpired: false,
    quotaError: null,
    draftText: '',
    notePromptOffered: false,

    animationCleanupRef: { current: null },
    silenceTimerRef,
    lastAiAtRef: { current: null },
    lastExpectedMinutesRef: { current: 10 },
    lastRetryPayloadRef: { current: null },
    trackerStateRef: { current: {} },
    imageBase64Ref: { current: null as string | null },
    imageMimeTypeRef: {
      current: null as 'image/jpeg' | 'image/png' | 'image/webp' | null,
    },

    activeProfileId: 'profile-1',

    apiClient: {
      sessions: {
        ':sessionId': {
          'homework-state': {
            $post: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
      },
      subjects: {
        ':subjectId': {
          sessions: {
            $post: jest.fn().mockResolvedValue({
              ok: true,
              json: async () => ({ session: { id: 'new-session-1' } }),
            }),
          },
        },
      },
      celebrations: {
        pending: {
          $get: jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ pendingCelebrations: [] }),
          }),
        },
        seen: {
          $post: jest.fn().mockResolvedValue({ ok: true }),
        },
      },
    },

    startSession: {
      mutateAsync: jest.fn().mockResolvedValue({
        session: { id: 'new-session-1' },
      }),
    },

    streamMessage: jest.fn(
      async (
        _text: string,
        onChunk: (accumulated: string) => void,
        onComplete: (result: Record<string, unknown>) => Promise<void>,
        _sessionId: string
      ) => {
        onChunk('Helpful answer');
        await onComplete({
          aiEventId: 'ai-event-1',
          exchangeCount: 1,
          escalationRung: 0,
          expectedResponseMinutes: 5,
        });
      }
    ),

    recordSystemPrompt: {
      mutateAsync: jest.fn().mockResolvedValue(undefined),
    },

    trackExchange: jest.fn(() => ({
      triggered: [],
      trackerState: {},
    })),
    trigger: jest.fn(),

    createLocalMessageId: jest.fn(
      (prefix: string) => `${prefix}-${Date.now()}`
    ),
    responseHistory: [],

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSessionStreaming', () => {
  // Track silence timer refs across tests so afterEach can clear pending timers
  // created by scheduleSilencePrompt (real setTimeout with multi-minute delay).
  const activeTimerRefs: Array<{
    current: ReturnType<typeof setTimeout> | null;
  }> = [];

  function makeOpts(overrides: Record<string, unknown> = {}) {
    const o = createMockOpts(overrides);
    activeTimerRefs.push(o.silenceTimerRef as any);
    return o;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    for (const ref of activeTimerRefs) {
      if (ref.current) clearTimeout(ref.current);
      ref.current = null;
    }
    activeTimerRefs.length = 0;
  });

  // -------------------------------------------------------------------------
  // ensureSession
  // -------------------------------------------------------------------------

  describe('ensureSession', () => {
    it('returns existing sessionId when one is active', async () => {
      const opts = makeOpts({ activeSessionId: 'existing-123' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.ensureSession();
      });

      expect(sessionId).toBe('existing-123');
      expect(opts.startSession.mutateAsync).not.toHaveBeenCalled();
    });

    it('creates a new session via startSession when none exists', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.ensureSession();
      });

      expect(sessionId).toBe('new-session-1');
      expect(opts.startSession.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectId: 'subject-1',
          sessionType: 'learning',
          inputMode: 'text',
          metadata: expect.objectContaining({ effectiveMode: 'learning' }),
        })
      );
      expect(opts.setActiveSessionId).toHaveBeenCalledWith('new-session-1');
    });

    it('uses API client directly when overrideSubjectId is provided', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.ensureSession('override-subject');
      });

      expect(
        opts.apiClient.subjects[':subjectId'].sessions.$post
      ).toHaveBeenCalled();
      // Should NOT use startSession.mutateAsync when override is given
      expect(opts.startSession.mutateAsync).not.toHaveBeenCalled();
    });

    it('returns null when no subject is available', async () => {
      const opts = makeOpts({ effectiveSubjectId: '' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.ensureSession();
      });

      expect(sessionId).toBeNull();
    });

    it('creates homework session type when mode is homework', async () => {
      const opts = makeOpts({ effectiveMode: 'homework' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.ensureSession();
      });

      expect(opts.startSession.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sessionType: 'homework' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // continueWithMessage
  // -------------------------------------------------------------------------

  describe('continueWithMessage', () => {
    it('creates session, streams message, and updates state on success', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('What is algebra?');
      });

      // Session was created
      expect(opts.startSession.mutateAsync).toHaveBeenCalled();
      // Stream was started
      expect(opts.streamMessage).toHaveBeenCalledWith(
        'What is algebra?',
        expect.any(Function), // onChunk
        expect.any(Function), // onComplete
        'new-session-1',
        undefined // homework options
      );
      // State was updated via onComplete callback
      expect(opts.setExchangeCount).toHaveBeenCalledWith(1);
      expect(opts.setEscalationRung).toHaveBeenCalledWith(0);
      expect(opts.setIsStreaming).toHaveBeenCalledWith(false);
    });

    it('stores retry payload before ensureSession for crash recovery', async () => {
      const lastRetryPayloadRef = { current: null as any };
      const opts = makeOpts({ lastRetryPayloadRef });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Hello', {
          sessionSubjectId: 's1',
        });
      });

      // Retry payload was set BEFORE ensureSession (for BUG-331 fix)
      expect(lastRetryPayloadRef.current).toEqual({
        text: 'Hello',
        options: { sessionSubjectId: 's1' },
      });
    });

    it('tracks exchange milestones and triggers celebrations', async () => {
      const opts = makeOpts();
      (opts.trackExchange as jest.Mock).mockReturnValue({
        triggered: ['first_exchange'],
        trackerState: { exchangeCount: 1 },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(opts.trackExchange).toHaveBeenCalled();
      expect(opts.trigger).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'first_exchange' })
      );
    });

    it('shows error message when session creation fails', async () => {
      const opts = makeOpts({ effectiveSubjectId: '' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      // animateResponse should be called with an error message
      const { animateResponse } = require('../session');
      expect(animateResponse).toHaveBeenCalledWith(
        expect.stringContaining('select a subject'),
        opts.setMessages,
        opts.setIsStreaming
      );
    });

    it('handles QuotaExceededError with structured card', async () => {
      const quotaDetails = {
        tier: 'free' as const,
        reason: 'daily' as const,
        dailyLimit: 10,
        monthlyLimit: 100,
        usedToday: 10,
        usedThisMonth: 50,
        topUpCreditsRemaining: 0,
        upgradeOptions: [],
      };
      const opts = makeOpts({
        streamMessage: jest
          .fn()
          .mockRejectedValue(
            new QuotaExceededError('Quota exceeded', quotaDetails)
          ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(opts.setQuotaError).toHaveBeenCalledWith(quotaDetails);
      expect(opts.setIsStreaming).toHaveBeenCalledWith(false);
    });

    it('handles reconnectable errors with reconnect prompt', async () => {
      const networkError = new TypeError('Failed to fetch');
      const opts = makeOpts({
        streamMessage: jest.fn().mockRejectedValue(networkError),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(opts.setIsStreaming).toHaveBeenCalledWith(false);
      // setMessages should have been called to show the error
      expect(opts.setMessages).toHaveBeenCalled();
    });

    it('writes session recovery marker after successful stream', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(mockWriteRecoveryMarker).toHaveBeenCalled();
    });

    it('converts explicit fallback completions into reconnect prompts', async () => {
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            _onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string
          ) => {
            await onComplete({
              aiEventId: 'ai-event-fallback',
              exchangeCount: 1,
              escalationRung: 0,
              fallback: {
                reason: 'empty_reply',
                fallbackText: "I didn't have a reply — tap to try again.",
              },
            });
          }
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('What happened?');
      });

      const finalMessages = applyMessageUpdates(
        (opts.setMessages as jest.Mock).mock.calls,
        []
      );

      expect(finalMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            kind: 'reconnect_prompt',
            content: "I didn't have a reply — tap to try again.",
            streaming: false,
          }),
        ])
      );
      expect(opts.trackExchange).not.toHaveBeenCalled();
      expect(mockWriteRecoveryMarker).toHaveBeenCalledTimes(1);
    });

    it('converts zero-chunk completions into reconnect prompts', async () => {
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            _onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string
          ) => {
            await onComplete({
              aiEventId: 'ai-event-empty',
              exchangeCount: 1,
              escalationRung: 0,
            });
          }
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Anyone there?');
      });

      const finalMessages = applyMessageUpdates(
        (opts.setMessages as jest.Mock).mock.calls,
        []
      );

      expect(finalMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            kind: 'reconnect_prompt',
            content: "I didn't have a reply — tap to try again.",
          }),
        ])
      );
      expect(opts.trackExchange).not.toHaveBeenCalled();
    });

    it('does not overwrite watchdog reconnect prompts during finalization', async () => {
      jest.useFakeTimers();

      let finishStream:
        | ((result?: Record<string, unknown>) => Promise<void>)
        | undefined;

      const opts = makeOpts({
        streamMessage: jest.fn(
          (
            _text: string,
            _onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string
          ) =>
            new Promise<void>((resolve) => {
              finishStream = async (
                result = {
                  aiEventId: 'ai-event-late',
                  exchangeCount: 1,
                  escalationRung: 0,
                }
              ) => {
                await onComplete(result);
                resolve();
              };
            })
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      try {
        let pending: Promise<void> | undefined;
        await act(async () => {
          pending = result.current.continueWithMessage('retry later');
        });

        await act(async () => {
          jest.advanceTimersByTime(45_000);
          await Promise.resolve();
        });

        await act(async () => {
          await finishStream?.();
          await pending;
        });

        const finalMessages = applyMessageUpdates(
          (opts.setMessages as jest.Mock).mock.calls,
          []
        );

        expect(finalMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              kind: 'reconnect_prompt',
              content: WATCHDOG_RECONNECT_TEXT,
            }),
          ])
        );
        expect(finalMessages[0]).not.toHaveProperty('isSystemPrompt');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // -------------------------------------------------------------------------
  // handleReconnect
  // -------------------------------------------------------------------------

  describe('handleReconnect', () => {
    it('replays the last message on reconnect', async () => {
      const lastRetryPayloadRef = {
        current: { text: 'retry me', options: undefined },
      };
      const opts = makeOpts({
        lastRetryPayloadRef,
        messages: [
          { id: 'user-1', role: 'user', content: 'retry me' },
          { id: 'ai-err', role: 'assistant', content: 'Connection lost' },
        ],
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('ai-err');
      });

      // setMessages should have been called to remove the error message
      expect(opts.setMessages).toHaveBeenCalled();
      // streamMessage should have been called with the retry payload
      expect(opts.streamMessage).toHaveBeenCalledWith(
        'retry me',
        expect.any(Function),
        expect.any(Function),
        expect.any(String),
        undefined
      );
    });

    it('does nothing when no retry payload exists', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('some-id');
      });

      expect(opts.streamMessage).not.toHaveBeenCalled();
    });

    it('does nothing when streaming is in progress', async () => {
      const opts = makeOpts({
        isStreaming: true,
        lastRetryPayloadRef: { current: { text: 'test', options: undefined } },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('some-id');
      });

      expect(opts.streamMessage).not.toHaveBeenCalled();
    });

    it('does nothing when session is expired', async () => {
      const opts = makeOpts({
        sessionExpired: true,
        lastRetryPayloadRef: { current: { text: 'test', options: undefined } },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('some-id');
      });

      expect(opts.streamMessage).not.toHaveBeenCalled();
    });

    it('does not reconnect when quotaError is active (CR-5)', async () => {
      const opts = makeOpts({
        quotaError: { dailyLimit: 10 },
        lastRetryPayloadRef: { current: { text: 'test', options: undefined } },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('some-id');
      });

      expect(opts.streamMessage).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // fetchFastCelebrations
  // -------------------------------------------------------------------------

  describe('fetchFastCelebrations', () => {
    it('returns celebrations when found on first poll', async () => {
      const mockCelebrations = [{ type: 'streak', detail: { days: 5 } }];
      const opts = makeOpts();
      (opts.apiClient.celebrations.pending.$get as jest.Mock).mockResolvedValue(
        {
          ok: true,
          json: async () => ({ pendingCelebrations: mockCelebrations }),
        }
      );
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let celebrations: unknown[] = [];
      await act(async () => {
        celebrations = await result.current.fetchFastCelebrations();
      });

      expect(celebrations).toEqual(mockCelebrations);
      // Should mark celebrations as seen
      expect(opts.apiClient.celebrations.seen.$post).toHaveBeenCalled();
    });

    it('returns empty array on API error', async () => {
      const opts = makeOpts();
      (opts.apiClient.celebrations.pending.$get as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let celebrations: unknown[] = [];
      await act(async () => {
        celebrations = await result.current.fetchFastCelebrations();
      });

      expect(celebrations).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // syncHomeworkMetadata
  // -------------------------------------------------------------------------

  describe('syncHomeworkMetadata', () => {
    it('posts homework state when in homework mode', async () => {
      const opts = makeOpts({ effectiveMode: 'homework' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.syncHomeworkMetadata(
          'session-1',
          [{ id: 'p1', text: 'Solve x+1=2' }] as any,
          0
        );
      });

      expect(
        opts.apiClient.sessions[':sessionId']['homework-state'].$post
      ).toHaveBeenCalled();
    });

    it('skips sync when not in homework mode', async () => {
      const opts = makeOpts({ effectiveMode: 'learning' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.syncHomeworkMetadata(
          'session-1',
          [{ id: 'p1', text: 'test' }] as any,
          0
        );
      });

      expect(
        opts.apiClient.sessions[':sessionId']['homework-state'].$post
      ).not.toHaveBeenCalled();
    });

    it('skips sync when problems array is empty', async () => {
      const opts = makeOpts({ effectiveMode: 'homework' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.syncHomeworkMetadata('session-1', [], 0);
      });

      expect(
        opts.apiClient.sessions[':sessionId']['homework-state'].$post
      ).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // F6: confidence indicator state management
  // -------------------------------------------------------------------------

  describe('confidence indicator (F6)', () => {
    it('sets lowConfidenceMessageId when done event has confidence=low', async () => {
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string
          ) => {
            // Deliver at least one chunk — post-[EMPTY-REPLY-GUARD-3] a
            // zero-chunk stream routes to the reconnect-prompt branch and
            // short-circuits the confidence handler. The low-confidence
            // indicator only makes sense for a real reply.
            onChunk('Yes, that is right.');
            await onComplete({
              aiEventId: 'ai-event-2',
              exchangeCount: 1,
              escalationRung: 0,
              expectedResponseMinutes: 5,
              confidence: 'low',
            });
          }
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Is this right?');
      });

      // setLowConfidenceMessageId should have been called with the AI stream message id
      expect(opts.setLowConfidenceMessageId).toHaveBeenCalledWith(
        expect.stringMatching(/^ai-/)
      );
    });

    it('clears lowConfidenceMessageId when done event has confidence=high', async () => {
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            _onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string
          ) => {
            await onComplete({
              aiEventId: 'ai-event-3',
              exchangeCount: 2,
              escalationRung: 0,
              expectedResponseMinutes: 5,
              confidence: 'high',
            });
          }
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Good answer');
      });

      // Should clear the low-confidence indicator (null) since confidence is not 'low'
      expect(opts.setLowConfidenceMessageId).toHaveBeenCalledWith(null);
    });

    it('clears lowConfidenceMessageId when confidence is absent (treat as medium)', async () => {
      // Default streamMessage mock returns no confidence field
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Next question');
      });

      // No confidence field → treated as medium → clears any prior low-confidence state
      expect(opts.setLowConfidenceMessageId).toHaveBeenCalledWith(null);
    });
  });
});
