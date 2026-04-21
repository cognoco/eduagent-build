import { renderHook, act } from '@testing-library/react-native';
import { useSessionActions } from './use-session-actions';
import { platformAlert } from '../../lib/platform-alert';

jest.mock('../../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

jest.mock('../../lib/session-recovery', () => ({
  clearSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
}));

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
});
