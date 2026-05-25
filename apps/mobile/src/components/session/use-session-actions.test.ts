import { renderHook, act } from '@testing-library/react-native';
import { useSessionActions } from './use-session-actions';
import * as PlatformAlertModule from '../../lib/platform-alert';
import * as SessionRecoveryModule from '../../lib/session-recovery';

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
    setShowFilingPrompt: jest.fn(),
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
  });

  it('shows filing prompt for freeform sessions after close', async () => {
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
    expect(opts.setShowFilingPrompt).toHaveBeenCalledWith(true);
    expect(opts.setIsClosing).toHaveBeenCalledWith(false);
  });

  it('shows filing prompt for homework sessions after close', async () => {
    const opts = createMockOpts({ effectiveMode: 'homework' });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    await act(async () => {
      await confirmEndSession();
    });

    expect(opts.setShowFilingPrompt).toHaveBeenCalledWith(true);
  });

  it('navigates to summary for learning sessions (no filing prompt)', async () => {
    const opts = createMockOpts({ effectiveMode: 'learning' });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    await act(async () => {
      await confirmEndSession();
    });

    expect(opts.setShowFilingPrompt).not.toHaveBeenCalled();
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
