import { renderHook, act } from '@testing-library/react-native';
import { useSessionActions } from './use-session-actions';
import * as PlatformAlertModule from '../../lib/platform-alert';
import * as SessionRecoveryModule from '../../lib/session-recovery';

const mockCaptureException = jest.fn();

jest.mock(
  /* gc1-allow: Sentry SDK loads native module config in Jest */
  '../../lib/sentry',
  () => ({
    Sentry: {
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    },
  }),
);

// Use real platform-alert (wraps RN Alert, which is a no-op in Jest).
// Spy so tests can introspect the calls.
const platformAlert = jest
  .spyOn(PlatformAlertModule, 'platformAlert')
  .mockImplementation(jest.fn());

// Use real session-recovery (wraps secure-storage → expo-secure-store globally mocked).
// Spy on clearSessionRecoveryMarker so tests can verify it was called.
jest
  .spyOn(SessionRecoveryModule, 'clearSessionRecoveryMarker')
  .mockResolvedValue(undefined);

function createMockOpts(overrides: Record<string, unknown> = {}) {
  const silenceTimerRef = {
    current: null as ReturnType<typeof setTimeout> | null,
  };
  return {
    activeSessionId: 'session-1',
    isStreaming: false,
    isClosing: false,
    setIsClosing: jest.fn(),
    exchangeCount: 5,
    escalationRung: 2,
    effectiveMode: 'freeform',
    effectiveSubjectId: 'subject-1',
    effectiveSubjectName: 'Math',
    topicId: undefined,
    milestonesReached: [],
    inputMode: 'text',
    setInputMode: jest.fn(),
    setShowWrongSubjectChip: jest.fn(),
    setShowTopicSwitcher: jest.fn(),
    setShowParkingLot: jest.fn(),
    setMessages: jest.fn(),
    filing: { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false },
    setConsumedQuickChipMessageId: jest.fn(),
    setMessageFeedback: jest.fn(),
    homeworkProblemsState: [],
    setHomeworkProblemsState: jest.fn(),
    currentProblemIndex: 0,
    setCurrentProblemIndex: jest.fn(),
    homeworkMode: undefined,
    setHomeworkMode: jest.fn(),
    activeHomeworkProblem: undefined,
    parkingLotDraft: '',
    setParkingLotDraft: jest.fn(),
    closedSessionRef: { current: null },
    silenceTimerRef,
    sessionEndedRef: { current: false },
    queuedProblemTextRef: { current: null },
    activeProfileId: 'profile-1',
    closeSession: {
      mutateAsync: jest.fn().mockResolvedValue({
        sessionId: 'session-1',
        wallClockSeconds: 120,
        summaryStatus: 'pending',
      }),
    },
    recordSystemPrompt: { mutateAsync: jest.fn().mockResolvedValue(undefined) },
    recordSessionEvent: { mutateAsync: jest.fn().mockResolvedValue(undefined) },
    flagSessionContent: { mutateAsync: jest.fn().mockResolvedValue(undefined) },
    addParkingLotItem: { mutateAsync: jest.fn().mockResolvedValue(undefined) },
    setSessionInputMode: {
      mutateAsync: jest.fn().mockResolvedValue(undefined),
    },
    handleSend: jest.fn().mockResolvedValue(undefined),
    syncHomeworkMetadata: jest.fn().mockResolvedValue(undefined),
    fetchFastCelebrations: jest.fn().mockResolvedValue([]),
    showConfirmation: jest.fn(),
    router: { replace: jest.fn() },
    ...overrides,
  };
}

async function confirmEndSession() {
  const buttons = (platformAlert as jest.Mock).mock.calls[0]?.[2] as Array<{
    onPress?: () => void | Promise<void>;
  }>;
  await buttons[1]?.onPress?.();
}

describe('useSessionActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptureException.mockClear();
  });

  it('[WI-2103 AC-1] cancels a scheduled silence prompt before closing the session', async () => {
    jest.useFakeTimers();
    const latePrompt = jest.fn();
    const opts = createMockOpts();
    opts.silenceTimerRef.current = setTimeout(
      latePrompt,
      2 * 60 * 1000,
    ) as unknown as NonNullable<typeof opts.silenceTimerRef.current>;
    const { result } = renderHook(() => useSessionActions(opts as any));

    try {
      await act(async () => {
        await result.current.handleEndSession();
        await confirmEndSession();
      });

      expect(opts.sessionEndedRef.current).toBe(true);
      expect(opts.silenceTimerRef.current).toBeNull();

      act(() => {
        jest.advanceTimersByTime(2 * 60 * 1000 + 1);
      });
      expect(latePrompt).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('[WI-2103 AC-2] retracts a rendered silence prompt before close persistence settles', async () => {
    let resolveClose!: (value: {
      sessionId: string;
      wallClockSeconds: number;
      summaryStatus: string;
    }) => void;
    const closeRequest = new Promise<{
      sessionId: string;
      wallClockSeconds: number;
      summaryStatus: string;
    }>((resolve) => {
      resolveClose = resolve;
    });
    const opts = createMockOpts({
      closeSession: { mutateAsync: jest.fn(() => closeRequest) },
    });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    let closeCompletion!: Promise<void>;
    act(() => {
      closeCompletion = confirmEndSession();
    });

    expect(opts.setMessages).toHaveBeenCalledTimes(1);
    const retract = opts.setMessages.mock.calls[0]?.[0] as (
      messages: Array<{ id: string }>,
    ) => Array<{ id: string }>;
    expect(
      retract([{ id: 'learner-message' }, { id: 'silence-prompt' }]),
    ).toEqual([{ id: 'learner-message' }]);

    resolveClose({
      sessionId: 'session-1',
      wallClockSeconds: 120,
      summaryStatus: 'pending',
    });
    await act(async () => {
      await closeCompletion;
    });
  });

  it('navigates to summary for freeform sessions after close without filing prompt', async () => {
    const opts = createMockOpts();
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    expect(platformAlert).toHaveBeenCalled();

    await act(async () => {
      await confirmEndSession();
    });

    expect(opts.closeSession.mutateAsync).toHaveBeenCalledWith({
      reason: 'user_ended',
      summaryStatus: 'pending',
      milestonesReached: [],
    });
    expect(opts.filing.mutate).not.toHaveBeenCalled();
    expect(opts.router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/session-summary/session-1',
        params: expect.objectContaining({
          sessionType: 'freeform',
        }),
      }),
    );
  });

  it('auto-files homework sessions then navigates to the (home-bound) summary', async () => {
    const opts = createMockOpts({ effectiveMode: 'homework' });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    await act(async () => {
      await confirmEndSession();
    });

    // Silent fire-and-forget auto-file (W2 #11) — no blocking filing prompt.
    expect(opts.filing.mutate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      sessionMode: 'homework',
    });
    // Navigates to the summary WITHOUT deep-link params (Home-bound).
    const replaceArg = (opts.router.replace as jest.Mock).mock.calls[0][0];
    expect(replaceArg).toEqual(
      expect.objectContaining({
        pathname: '/session-summary/session-1',
        params: expect.objectContaining({ sessionType: 'homework' }),
      }),
    );
    expect(replaceArg.params).not.toHaveProperty('filedSubjectId');
    expect(replaceArg.params).not.toHaveProperty('filedBookId');
  });

  it('still navigates to the summary when the homework auto-file fails internally', async () => {
    // Model React-Query's fire-and-forget mutate(): the underlying mutationFn
    // rejects, RQ handles it internally (onError), and mutate() itself returns
    // void synchronously without throwing. The production code does NOT await
    // it, so navigation must proceed on the same tick regardless of failure.
    const internalRejection = jest.fn();
    const opts = createMockOpts({
      effectiveMode: 'homework',
      filing: {
        mutate: jest.fn(() => {
          // Schedule an internally-handled rejection, exactly as RQ does — the
          // call returns undefined; the rejection never surfaces to the caller.
          void Promise.reject(new Error('filing failed')).catch(
            internalRejection,
          );
        }),
        mutateAsync: jest.fn(),
        isPending: false,
      },
    });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    // confirmEndSession resolving (not rejecting) proves the fire-and-forget
    // failure did not propagate out of the close handler.
    await act(async () => {
      await confirmEndSession();
    });

    expect(opts.filing.mutate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      sessionMode: 'homework',
    });
    expect(internalRejection).toHaveBeenCalled();
    expect(opts.router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/session-summary/session-1',
      }),
    );
  });

  it('navigates to summary for learning sessions (no auto-file)', async () => {
    const opts = createMockOpts({ effectiveMode: 'learning' });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    await act(async () => {
      await confirmEndSession();
    });

    expect(opts.filing.mutate).not.toHaveBeenCalled();
    expect(opts.router.replace).toHaveBeenCalled();
  });

  it('clears wrapping state when close times out', async () => {
    jest.useFakeTimers();
    const opts = createMockOpts({
      closeSession: {
        mutateAsync: jest.fn(
          () =>
            new Promise(() => {
              /* never resolves */
            }),
        ),
      },
    });
    const { result } = renderHook(() => useSessionActions(opts as any));

    try {
      await act(async () => {
        await result.current.handleEndSession();
      });

      const buttons = (platformAlert as jest.Mock).mock.calls[0]?.[2] as Array<{
        onPress?: () => void | Promise<void>;
      }>;

      let closePromise: Promise<void> = Promise.resolve();
      await act(async () => {
        closePromise = Promise.resolve(buttons[1]?.onPress?.());
      });

      await act(async () => {
        jest.advanceTimersByTime(15_000);
        await closePromise;
      });

      expect(opts.setIsClosing).toHaveBeenCalledWith(false);
      expect(platformAlert).toHaveBeenLastCalledWith(
        'Could not end this session cleanly',
        expect.any(String),
        expect.any(Array),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('[WI-78 DS-216] ignores rapid duplicate topic switch requests while close is in flight', async () => {
    const closeSession = {
      mutateAsync: jest.fn(
        () =>
          new Promise(() => {
            /* keep close in flight */
          }),
      ),
    };
    const opts = createMockOpts({ closeSession });
    const { result } = renderHook(() => useSessionActions(opts as any));

    void result.current.handleTopicSwitch('topic-2', 'subject-2', 'Biology');
    void result.current.handleTopicSwitch('topic-2', 'subject-2', 'Biology');

    expect(closeSession.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('[WI-78 review] releases the topic-switch lock after a successful switch', async () => {
    const opts = createMockOpts({ activeSessionId: undefined });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleTopicSwitch('topic-2', 'subject-2', 'Biology');
    });
    await act(async () => {
      await result.current.handleTopicSwitch(
        'topic-3',
        'subject-3',
        'Chemistry',
      );
    });

    expect(opts.router.replace).toHaveBeenCalledTimes(2);
  });

  it('captures homework metadata sync failure to Sentry while moving to the next problem', async () => {
    const err = new Error('metadata write failed');
    const opts = createMockOpts({
      effectiveMode: 'homework',
      activeSessionId: 'session-1',
      homeworkProblemsState: [
        { id: 'p1', text: 'first' },
        { id: 'p2', text: 'second' },
      ],
      currentProblemIndex: 0,
      activeHomeworkProblem: { id: 'p1', text: 'first' },
      syncHomeworkMetadata: jest.fn().mockRejectedValue(err),
    });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleNextProblem();
    });

    expect(opts.setCurrentProblemIndex).toHaveBeenCalledWith(1);
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      tags: {
        surface: 'session',
        feature: 'homework_metadata_sync',
        sync_scope: 'next_problem',
        sessionId: 'session-1',
      },
    });
  });

  // -------------------------------------------------------------------------
  // WI-373: system-prompt intents (client sends a token, never free text)
  // -------------------------------------------------------------------------
  describe('WI-373 system-prompt intents', () => {
    it('handleQuickChip records a quick_chip intent token, never free content', async () => {
      const opts = createMockOpts();
      const { result } = renderHook(() => useSessionActions(opts as any));

      await act(async () => {
        await result.current.handleQuickChip('hint');
      });

      expect(opts.recordSystemPrompt.mutateAsync).toHaveBeenCalledWith({
        kind: 'quick_chip',
        chip: 'hint',
      });
      const arg = opts.recordSystemPrompt.mutateAsync.mock.calls[0]?.[0];
      expect(arg).not.toHaveProperty('content');
    });

    it('handleMessageFeedback records a message_feedback intent token, never free content', async () => {
      const opts = createMockOpts();
      const { result } = renderHook(() => useSessionActions(opts as any));

      await act(async () => {
        await result.current.handleMessageFeedback(
          {
            id: 'm1',
            eventId: 'evt-9',
            role: 'assistant',
            content: 'ans',
          } as any,
          'helpful',
        );
      });

      expect(opts.recordSystemPrompt.mutateAsync).toHaveBeenCalledWith({
        kind: 'message_feedback',
        action: 'helpful',
        eventId: 'evt-9',
      });
      const arg = opts.recordSystemPrompt.mutateAsync.mock.calls[0]?.[0];
      expect(arg).not.toHaveProperty('content');
    });
  });
});
