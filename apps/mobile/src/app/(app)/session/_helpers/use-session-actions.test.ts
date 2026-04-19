import { renderHook, act } from '@testing-library/react-native';
import { useSessionActions } from './use-session-actions';
import { platformAlert } from '../../../../lib/platform-alert';
import { useApiClient } from '../../../../lib/api-client';

jest.mock('../../../../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

jest.mock('../../../../lib/api-client', () => ({
  useApiClient: jest.fn(),
}));

jest.mock('../../../../lib/session-recovery', () => ({
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
    setDepthEvaluation: jest.fn(),
    setDepthEvaluating: jest.fn(),
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
    (useApiClient as jest.Mock).mockReturnValue({
      sessions: {
        ':sessionId': {
          'evaluate-depth': {
            $post: jest.fn().mockResolvedValue({
              ok: true,
              json: async () => ({
                meaningful: false,
                reason: 'Quick Q&A',
                method: 'heuristic_shallow',
                topics: [],
              }),
            }),
          },
        },
      },
    });
  });

  it('evaluates freeform depth after closing and shows the filing prompt', async () => {
    const opts = createMockOpts();
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    expect(platformAlert).toHaveBeenCalled();

    await act(async () => {
      await confirmEndSession();
    });

    const client = (useApiClient as jest.Mock).mock.results[0]?.value;
    expect(opts.closeSession.mutateAsync).toHaveBeenCalledWith({
      reason: 'user_ended',
      summaryStatus: 'pending',
      milestonesReached: [],
    });
    expect(opts.setShowFilingPrompt).toHaveBeenCalledWith(true);
    expect(opts.setDepthEvaluation).toHaveBeenNthCalledWith(1, null);
    expect(opts.setDepthEvaluating).toHaveBeenNthCalledWith(1, true);
    expect(
      client.sessions[':sessionId']['evaluate-depth'].$post
    ).toHaveBeenCalledWith({
      param: { sessionId: 'session-1' },
    });
    expect(opts.setDepthEvaluation).toHaveBeenNthCalledWith(2, {
      meaningful: false,
      reason: 'Quick Q&A',
      method: 'heuristic_shallow',
      topics: [],
    });
    expect(opts.setDepthEvaluating).toHaveBeenLastCalledWith(false);
  });

  it('fails open client-side when the depth gate request fails', async () => {
    (useApiClient as jest.Mock).mockReturnValue({
      sessions: {
        ':sessionId': {
          'evaluate-depth': {
            $post: jest.fn().mockRejectedValue(new Error('network error')),
          },
        },
      },
    });

    const opts = createMockOpts();
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    await act(async () => {
      await confirmEndSession();
    });

    expect(opts.setDepthEvaluation).toHaveBeenNthCalledWith(2, {
      meaningful: true,
      reason: 'Gate failed - client-side fail open',
      method: 'fail_open',
      topics: [],
    });
    expect(opts.setDepthEvaluating).toHaveBeenLastCalledWith(false);
  });

  it('skips depth evaluation for homework sessions', async () => {
    const opts = createMockOpts({ effectiveMode: 'homework' });
    const { result } = renderHook(() => useSessionActions(opts as any));

    await act(async () => {
      await result.current.handleEndSession();
    });

    await act(async () => {
      await confirmEndSession();
    });

    const client = (useApiClient as jest.Mock).mock.results[0]?.value;
    expect(opts.setShowFilingPrompt).toHaveBeenCalledWith(true);
    expect(opts.setDepthEvaluation).toHaveBeenCalledWith(null);
    expect(opts.setDepthEvaluating).toHaveBeenCalledWith(false);
    expect(
      client.sessions[':sessionId']['evaluate-depth'].$post
    ).not.toHaveBeenCalled();
  });
});
