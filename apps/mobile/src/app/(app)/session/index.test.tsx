import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SessionScreen from './index';

const mockStartSession = jest.fn();
const mockCloseSession = jest.fn();
const mockStream = jest.fn();
const mockHomeworkStatePost = jest.fn();
const mockRecordSystemPrompt = jest.fn();
const mockRecordSessionEvent = jest.fn();
const mockSetSessionInputMode = jest.fn();
const mockFlagSessionContent = jest.fn();
const mockReplace = jest.fn();
const mockClassifySubject = jest.fn();
const mockDirectStartSession = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../../../components/session', () => ({
  ChatShell: ({
    subtitle,
    messages,
    inputAccessory,
    belowInput,
    inputMode,
    onInputModeChange,
    onSend,
    renderMessageActions,
    rightAction,
    footer,
  }: {
    subtitle?: string;
    messages?: Array<{ id: string; content: string }>;
    inputAccessory?: React.ReactNode;
    belowInput?: React.ReactNode;
    inputMode?: 'text' | 'voice';
    onInputModeChange?: (mode: 'text' | 'voice') => void;
    onSend: (text: string) => void;
    renderMessageActions?: (message: {
      id: string;
      role: string;
      content: string;
      eventId?: string;
      streaming?: boolean;
      isSystemPrompt?: boolean;
    }) => React.ReactNode;
    rightAction?: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View>
        <Text testID="session-subtitle">{subtitle}</Text>
        <Text testID="mock-input-mode">{inputMode ?? 'text'}</Text>
        {(messages ?? []).map((message) => (
          <View key={message.id} testID={`mock-message-${message.id}`}>
            <Text>{message.content}</Text>
            {renderMessageActions?.(message as never)}
          </View>
        ))}
        {inputAccessory}
        {belowInput}
        {rightAction}
        {footer}
        <Pressable
          testID="mock-set-voice-mode"
          onPress={() => onInputModeChange?.('voice')}
        >
          <Text>Voice mode</Text>
        </Pressable>
        <Pressable
          testID="mock-set-text-mode"
          onPress={() => onInputModeChange?.('text')}
        >
          <Text>Text mode</Text>
        </Pressable>
        <Pressable
          testID="manual-send-button"
          onPress={() => onSend('Solve 2x + 5 = 17')}
        >
          <Text>Send</Text>
        </Pressable>
      </View>
    );
  },
  animateResponse: jest.fn(),
  getModeConfig: jest.fn().mockReturnValue({
    title: 'Homework',
    subtitle: 'Homework help',
    placeholder: 'Ask for help',
    showTimer: false,
    showQuestionCount: false,
  }),
  getOpeningMessage: jest.fn().mockReturnValue('Let us tackle this worksheet.'),
  SessionTimer: () => null,
  QuestionCounter: () => null,
  LibraryPrompt: () => null,
  SessionInputModeToggle: () => null,
}));

jest.mock('../../../hooks/use-sessions', () => ({
  useStartSession: () => ({
    mutateAsync: mockStartSession,
  }),
  useCloseSession: () => ({
    mutateAsync: mockCloseSession,
  }),
  useStreamMessage: () => ({
    stream: mockStream,
  }),
  useSessionTranscript: () => ({ data: null }),
  useRecordSystemPrompt: () => ({ mutateAsync: mockRecordSystemPrompt }),
  useRecordSessionEvent: () => ({ mutateAsync: mockRecordSessionEvent }),
  useSetSessionInputMode: () => ({ mutateAsync: mockSetSessionInputMode }),
  useFlagSessionContent: () => ({ mutateAsync: mockFlagSessionContent }),
  useParkingLot: () => ({ data: [], isLoading: false }),
  useAddParkingLotItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../../../hooks/use-classify-subject', () => ({
  useClassifySubject: () => ({
    mutateAsync: mockClassifySubject,
  }),
}));

jest.mock('../../../hooks/use-resolve-subject', () => ({
  useResolveSubject: () => ({
    mutateAsync: jest.fn().mockResolvedValue({
      suggestions: [],
      displayMessage: 'Pick a subject that fits, or create your own.',
    }),
    isPending: false,
  }),
}));

jest.mock('../../../hooks/use-notes', () => ({
  useUpsertNote: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

const mockFilingMutateAsync = jest.fn();
jest.mock('../../../hooks/use-filing', () => ({
  useFiling: () => ({
    mutateAsync: mockFilingMutateAsync,
    isPending: false,
  }),
}));

jest.mock('../../../hooks/use-streaks', () => ({
  useStreaks: () => ({ data: { longestStreak: 1 } }),
}));

jest.mock('../../../hooks/use-progress', () => ({
  useOverallProgress: () => ({ data: { totalTopicsCompleted: 0 } }),
}));

jest.mock('../../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: [{ id: 'subject-1', name: 'Math', status: 'active' }],
  }),
  useCreateSubject: () => ({
    mutateAsync: jest.fn().mockResolvedValue({
      subject: { id: 'subject-new', name: 'New Subject' },
    }),
    isPending: false,
  }),
}));

jest.mock('../../../hooks/use-curriculum', () => ({
  useCurriculum: () => ({
    data: {
      topics: [
        {
          id: 'topic-1',
          title: 'Topic 1',
          description: 'Desc',
          skipped: false,
        },
      ],
    },
    isLoading: false,
  }),
}));

jest.mock('../../../hooks/use-network-status', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

jest.mock('../../../hooks/use-api-reachability', () => ({
  useApiReachability: () => ({ isApiReachable: true, isChecked: true }),
}));

const mockCelebrationLevel = { data: 'full' };
jest.mock('../../../hooks/use-settings', () => ({
  useCelebrationLevel: () => mockCelebrationLevel,
}));

const mockTrigger = jest.fn();
const mockCelebrationResult = {
  CelebrationOverlay: null,
  trigger: mockTrigger,
};
jest.mock('../../../hooks/use-celebration', () => ({
  useCelebration: () => mockCelebrationResult,
}));

const mockTrackExchangeResult = { triggered: [] as string[], trackerState: {} };
const mockTrackExchange = jest.fn().mockReturnValue(mockTrackExchangeResult);
const mockHydrate = jest.fn();
const mockResetMilestones = jest.fn();
const mockMilestoneTracker = {
  milestonesReached: [] as string[],
  trackerState: {},
  trackExchange: mockTrackExchange,
  hydrate: mockHydrate,
  reset: mockResetMilestones,
};
jest.mock('../../../hooks/use-milestone-tracker', () => ({
  celebrationForReason: jest.fn(),
  createMilestoneTrackerStateFromMilestones: jest.fn().mockReturnValue({}),
  normalizeMilestoneTrackerState: jest.fn().mockReturnValue({}),
  useMilestoneTracker: () => mockMilestoneTracker,
}));

jest.mock('../../../lib/session-recovery', () => ({
  clearSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
  readSessionRecoveryMarker: jest.fn().mockResolvedValue(null),
  writeSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
}));

const { readSessionRecoveryMarker: mockReadSessionRecoveryMarker } =
  require('../../../lib/session-recovery') as {
    readSessionRecoveryMarker: jest.Mock;
  };

const mockCelebrationsPendingGet = jest.fn();
jest.mock('../../../lib/api-client', () => ({
  useApiClient: () => ({
    sessions: {
      ':sessionId': {
        'homework-state': {
          $post: mockHomeworkStatePost,
        },
      },
    },
    subjects: {
      ':subjectId': {
        sessions: {
          $post: mockDirectStartSession,
        },
      },
    },
    celebrations: {
      pending: {
        $get: mockCelebrationsPendingGet,
      },
      seen: {
        $post: jest.fn().mockResolvedValue({ ok: true }),
      },
    },
  }),
}));

jest.mock('../../../lib/format-api-error', () => ({
  formatApiError: (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown error',
}));

jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'profile-1' },
  }),
}));

describe('SessionScreen homework flow', () => {
  async function flushAsyncWork(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    let aiEventCount = 0;
    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: 'subject-1',
      subjectName: 'Math',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
        {
          id: 'problem-2',
          text: 'Factor x^2 + 3x + 2',
          source: 'ocr',
        },
      ]),
    });
    mockStartSession.mockResolvedValue({
      session: { id: 'session-1' },
    });
    mockHomeworkStatePost.mockResolvedValue({
      ok: true,
      json: async () => ({
        metadata: {
          problemCount: 2,
          currentProblemIndex: 0,
          problems: [],
        },
      }),
    });
    mockStream.mockImplementation(
      async (
        _message: string,
        _onChunk: (value: string) => void,
        onDone: (result: {
          exchangeCount: number;
          escalationRung: number;
          aiEventId?: string;
        }) => void
      ) => {
        onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: `event-${++aiEventCount}`,
        });
      }
    );
    mockRecordSystemPrompt.mockResolvedValue({ ok: true });
    mockCloseSession.mockResolvedValue({ wallClockSeconds: 120 });
    mockCelebrationsPendingGet.mockResolvedValue({
      ok: true,
      json: async () => ({ pendingCelebrations: [] }),
    });
    mockFilingMutateAsync.mockResolvedValue({
      shelfId: 'shelf-1',
      bookId: 'book-1',
    });
    mockSetSessionInputMode.mockResolvedValue({
      session: { id: 'session-1', inputMode: 'voice' },
    });
    mockFlagSessionContent.mockResolvedValue({
      message: 'Content flagged for review. Thank you!',
    });
    mockDirectStartSession.mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { id: 'session-1' },
      }),
    });
    mockClassifySubject.mockResolvedValue({
      candidates: [],
      needsConfirmation: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps homework progress in one session when moving to the next problem', async () => {
    const screen = render(<SessionScreen />);

    fireEvent.press(screen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        undefined
      );
    });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId('homework-problem-progress')).toHaveTextContent(
      'Problem 1 of 2'
    );

    fireEvent.press(screen.getByTestId('next-problem-chip'));

    await flushAsyncWork();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledWith(
        'Factor x^2 + 3x + 2',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        undefined
      );
    });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId('homework-problem-progress')).toHaveTextContent(
      'Problem 2 of 2'
    );
  }, 15000);

  it('hides contextual chips on greeting but shows session tools', () => {
    const screen = render(<SessionScreen />);

    // Contextual quick chips should NOT appear before any user message
    expect(screen.queryByText('I know this')).toBeNull();
    expect(screen.queryByText('Explain differently')).toBeNull();
    expect(screen.queryByText('Too easy')).toBeNull();
    expect(screen.queryByText('Example')).toBeNull();

    // Session tool chips should always be present
    expect(screen.getByText('Switch topic')).toBeTruthy();
    expect(screen.getByText('Park it')).toBeTruthy();
  });

  it('records quick chips and learner feedback with follow-up prompts', async () => {
    const screen = render(<SessionScreen />);

    fireEvent.press(screen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledTimes(1);
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        undefined
      );
    });

    fireEvent.press(screen.getByTestId('quick-chip-too_easy'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'quick_action',
          content: 'too_easy',
          metadata: expect.objectContaining({
            chip: 'too_easy',
          }),
        })
      );
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        content:
          'The learner says this is too easy. Raise the challenge a little and ask for more independent thinking.',
        metadata: { type: 'quick_chip', chip: 'too_easy' },
      });
      expect(mockStream).toHaveBeenCalledWith(
        'That feels too easy. Can you make it more challenging?',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        undefined
      );
    });
    expect(screen.getByTestId('session-confirmation-toast')).toBeTruthy();

    fireEvent.press(screen.getByTestId('message-feedback-not-helpful-event-2'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user_feedback',
          content: 'not_helpful',
          metadata: {
            value: 'not_helpful',
            eventId: 'event-2',
          },
        })
      );
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        content:
          'The learner marked the previous answer as not helpful. Re-explain more clearly with one new example.',
        metadata: {
          type: 'message_feedback',
          value: 'not_helpful',
          eventId: 'event-2',
        },
      });
      expect(mockStream).toHaveBeenCalledWith(
        'Can you explain that differently?',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        undefined
      );
    });

    fireEvent.press(screen.getByTestId('message-feedback-incorrect-event-3'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user_feedback',
          content: 'incorrect',
          metadata: {
            value: 'incorrect',
            eventId: 'event-3',
          },
        })
      );
      expect(mockFlagSessionContent).toHaveBeenCalledWith({
        eventId: 'event-3',
        reason: 'Learner marked response as incorrect',
      });
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        content:
          'The learner believes the previous answer was incorrect. Correct it clearly, explain what changed, and continue from there.',
        metadata: {
          type: 'message_feedback',
          value: 'incorrect',
          eventId: 'event-3',
        },
      });
      expect(mockStream).toHaveBeenCalledWith(
        'I think that answer is incorrect. Can you correct it and explain what changed?',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        undefined
      );
    });
  });

  it('hydrates milestone tracker state from the recovery marker when resuming', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      sessionId: 'session-1',
      subjectId: 'subject-1',
      subjectName: 'Math',
    });
    mockReadSessionRecoveryMarker.mockResolvedValueOnce({
      sessionId: 'session-1',
      updatedAt: new Date().toISOString(),
      milestoneTracker: {
        milestonesReached: ['polar_star'],
        consecutiveLowRung: 1,
        longMessageCount: 0,
        awaitingPersistence: false,
        previousRung: 2,
      },
    });

    render(<SessionScreen />);

    await waitFor(() => {
      expect(mockReadSessionRecoveryMarker).toHaveBeenCalled();
      expect(mockHydrate).toHaveBeenCalled();
    });
  });

  it('persists input-mode changes once the session exists', async () => {
    const screen = render(<SessionScreen />);

    fireEvent.press(screen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByTestId('mock-set-voice-mode'));

    await waitFor(() => {
      expect(mockSetSessionInputMode).toHaveBeenCalledWith({
        inputMode: 'voice',
      });
    });
  });

  it('prompts for subject resolution before starting a session when classification is ambiguous', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    mockClassifySubject.mockResolvedValue({
      candidates: [
        {
          subjectId: 'subject-1',
          subjectName: 'Math',
          confidence: 0.62,
        },
        {
          subjectId: 'subject-2',
          subjectName: 'Physics',
          confidence: 0.58,
        },
      ],
      needsConfirmation: true,
    });

    const screen = render(<SessionScreen />);

    fireEvent.press(screen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(screen.getByTestId('session-subject-resolution')).toBeTruthy();
      expect(screen.getAllByText(/math or physics/i).length).toBeGreaterThan(0);
    });

    expect(mockStartSession).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('subject-resolution-subject-2'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockDirectStartSession).toHaveBeenCalledWith({
        param: { subjectId: 'subject-2' },
        json: expect.objectContaining({
          subjectId: 'subject-2',
          inputMode: 'text',
        }),
      });
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        undefined
      );
    });
  });

  it('shows "+ New subject" escape hatch when classification fails [BUG-234]', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    mockClassifySubject.mockRejectedValue(new Error('Network error'));

    const screen = render(<SessionScreen />);

    fireEvent.press(screen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      // Fallback candidates from useSubjects mock (Math) are shown in ScrollView,
      // plus a "+ New subject" chip (BUG-236 testID: subject-resolution-new)
      expect(screen.getByTestId('subject-resolution-new')).toBeTruthy();
    });

    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it('shows "+ New subject" chip alongside candidates when classification is ambiguous [BUG-234]', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    mockClassifySubject.mockResolvedValue({
      candidates: [
        { subjectId: 'subject-1', subjectName: 'Math', confidence: 0.5 },
      ],
      needsConfirmation: true,
    });

    const screen = render(<SessionScreen />);

    fireEvent.press(screen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(screen.getByTestId('session-subject-resolution')).toBeTruthy();
      expect(screen.getByTestId('subject-resolution-new')).toBeTruthy();
      expect(screen.getByText('+ New subject')).toBeTruthy();
    });
  });

  describe('post-session filing prompt', () => {
    /**
     * Helper: renders a freeform session, sends a message to start it,
     * then triggers end-session via the Alert "I'm Done" callback to
     * get `showFilingPrompt` set to true.
     */
    async function renderAndTriggerFilingPrompt() {
      // Use freeform mode (no subjectId) so filing prompt shows on close
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        mode: 'freeform',
      });
      mockClassifySubject.mockResolvedValue({
        candidates: [
          { subjectId: 'subject-1', subjectName: 'Math', confidence: 0.95 },
        ],
        needsConfirmation: false,
        resolvedSubjectId: 'subject-1',
      });

      // Spy on Alert.alert so we can invoke the "I'm Done" button callback
      const alertSpy = jest.spyOn(Alert, 'alert');

      const screen = render(<SessionScreen />);

      // Send a message to start the session and get exchangeCount > 0
      fireEvent.press(screen.getByTestId('manual-send-button'));
      await flushAsyncWork();

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(1);
      });

      // The end-session button should now be visible (exchangeCount > 0)
      const endButton = screen.getByTestId('end-session-button');
      fireEvent.press(endButton);

      // Alert.alert was called with "Ready to wrap up?" — invoke the "I'm Done" callback
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Ready to wrap up?',
          expect.any(String),
          expect.any(Array)
        );
      });

      const buttons = alertSpy.mock.calls[0]![2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const doneButton = buttons.find((b) => b.text === "I'm Done");

      // Invoke the "I'm Done" callback — this calls closeSession, then sets showFilingPrompt
      await act(async () => {
        doneButton?.onPress?.();
      });
      await flushAsyncWork();

      // Advance timers to let fetchFastCelebrations polling resolve
      await act(async () => {
        jest.runAllTimers();
      });
      await flushAsyncWork();

      alertSpy.mockRestore();

      return screen;
    }

    it('renders filing prompt when a freeform session is closed', async () => {
      const screen = await renderAndTriggerFilingPrompt();

      await waitFor(() => {
        expect(screen.getByTestId('filing-prompt')).toBeTruthy();
        expect(screen.getByTestId('filing-prompt-accept')).toBeTruthy();
        expect(screen.getByTestId('filing-prompt-dismiss')).toBeTruthy();
      });
    }, 15000);

    it('accept button calls filing mutateAsync and navigates to book screen', async () => {
      const screen = await renderAndTriggerFilingPrompt();

      await waitFor(() => {
        expect(screen.getByTestId('filing-prompt-accept')).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('filing-prompt-accept'));
      await flushAsyncWork();

      await waitFor(() => {
        expect(mockFilingMutateAsync).toHaveBeenCalledWith({
          sessionId: 'session-1',
          sessionMode: 'freeform',
        });
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
            params: { subjectId: 'shelf-1', bookId: 'book-1' },
          })
        );
      });
    }, 15000);

    it('dismiss button navigates to session summary', async () => {
      const screen = await renderAndTriggerFilingPrompt();

      await waitFor(() => {
        expect(screen.getByTestId('filing-prompt-dismiss')).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('filing-prompt-dismiss'));
      await flushAsyncWork();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: '/session-summary/session-1',
          })
        );
      });
    }, 15000);
  });
});
