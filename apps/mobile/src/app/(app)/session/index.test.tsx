import type { InputMode } from '@eduagent/schemas';
import React from 'react';
import { Alert } from 'react-native';
import {
  render,
  fireEvent,
  waitFor,
  act,
  screen,
} from '@testing-library/react-native';
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
    inputDisabled,
    disabledReason,
  }: {
    subtitle?: string;
    messages?: Array<{ id: string; content: string }>;
    inputAccessory?: React.ReactNode;
    belowInput?: React.ReactNode;
    inputMode?: InputMode;
    onInputModeChange?: (mode: InputMode) => void;
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
    inputDisabled?: boolean;
    disabledReason?: string;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View>
        <Text testID="session-subtitle">{subtitle}</Text>
        <Text testID="mock-input-mode">{inputMode ?? 'text'}</Text>
        {inputDisabled && disabledReason ? (
          <View testID="input-disabled-banner">
            <Text>{disabledReason}</Text>
          </View>
        ) : null}
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
  QuotaExceededCard: ({
    details,
    isOwner,
  }: {
    details: { reason: string };
    isOwner: boolean;
  }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID="quota-exceeded-card">
        <Text>{isOwner ? 'Upgrade plan' : 'Ask your parent'}</Text>
        <Text>
          {details.reason === 'daily' ? "today's limit" : "this month's limit"}
        </Text>
      </View>
    );
  },
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
  useProgressInventory: () => ({ data: undefined, isLoading: false }),
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

const EMPTY_BOOKMARKS: never[] = [];
jest.mock('../../../hooks/use-bookmarks', () => ({
  useCreateBookmark: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteBookmark: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSessionBookmarks: () => ({ data: EMPTY_BOOKMARKS, isLoading: false }),
}));

jest.mock('../../../lib/session-recovery', () => ({
  clearSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
  readSessionRecoveryMarker: jest.fn().mockResolvedValue(null),
  writeSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
}));

const secureStore: Record<string, string> = {};
jest.mock('../../../lib/secure-storage', () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(secureStore[key] ?? null)
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStore[key] = value;
    return Promise.resolve();
  }),
}));

const { readSessionRecoveryMarker: mockReadSessionRecoveryMarker } =
  require('../../../lib/session-recovery') as {
    readSessionRecoveryMarker: jest.Mock;
  };

const mockCelebrationsPendingGet = jest.fn();

jest.mock('../../../lib/api-client', () => {
  class QuotaExceededError extends Error {
    readonly code = 'QUOTA_EXCEEDED' as const;
    readonly details: unknown;
    constructor(message: string, details: unknown) {
      super(message);
      this.name = 'QuotaExceededError';
      this.details = details;
    }
  }

  class ForbiddenError extends Error {
    readonly code = 'FORBIDDEN' as const;
    constructor(message = 'Forbidden') {
      super(message);
      this.name = 'ForbiddenError';
    }
  }

  return {
    QuotaExceededError,
    ForbiddenError,
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
  };
});

jest.mock('../../../lib/format-api-error', () => ({
  formatApiError: (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown error',
}));

jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'profile-1', isOwner: true },
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
    // Clear SecureStore mock data
    Object.keys(secureStore).forEach((key) => delete secureStore[key]);
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
        onChunk: (value: string) => void,
        onDone: (result: {
          exchangeCount: number;
          escalationRung: number;
          aiEventId?: string;
        }) => void
      ) => {
        // Real SSE streams always emit at least one token before completion;
        // mirror that so the streaming hook doesn't treat the response as an
        // empty/failed stream (chunkCount === 0 → reconnect_prompt).
        onChunk('Got it.');
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

  it('includes the capture source in homework metadata when homework starts from the gallery', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: 'subject-1',
      subjectName: 'Math',
      captureSource: 'gallery',
      ocrText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
      ]),
    });

    const screen = render(<SessionScreen />);

    fireEvent.press(screen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            homework: expect.objectContaining({
              source: 'gallery',
              ocrText: 'Solve 2x + 5 = 17',
            }),
          }),
        })
      );
      expect(mockHomeworkStatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            metadata: expect.objectContaining({
              source: 'gallery',
            }),
          }),
        })
      );
    });
  });

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
     * then triggers end-session via the Alert "End Session" callback to
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

      // Spy on Alert.alert so we can invoke the "End Session" button callback
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

      // Alert.alert was called with "End session?" — invoke the "End Session" callback
      // BUG-352 added a 4th options arg { cancelable, onDismiss }
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'End session?',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({ cancelable: true })
        );
      });

      const buttons = alertSpy.mock.calls[0]![2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const doneButton = buttons.find((b) => b.text === 'End Session');

      // Invoke the "End Session" callback — this calls closeSession, then sets showFilingPrompt
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

describe('voice mode persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    Object.keys(secureStore).forEach((key) => delete secureStore[key]);
    (useRouter as jest.Mock).mockReturnValue({ replace: mockReplace });
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: 'subject-1',
      subjectName: 'Math',
      homeworkProblems: JSON.stringify([
        { id: 'problem-1', text: 'Solve 2x + 5 = 17', source: 'ocr' },
      ]),
    });
    mockStartSession.mockResolvedValue({ session: { id: 'session-1' } });
    mockHomeworkStatePost.mockResolvedValue({
      ok: true,
      json: async () => ({
        metadata: { problemCount: 1, currentProblemIndex: 0, problems: [] },
      }),
    });
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (value: string) => void,
        onDone: (r: { exchangeCount: number; escalationRung: number }) => void
      ) => {
        onChunk('Got it.');
        onDone({ exchangeCount: 1, escalationRung: 1 });
      }
    );
    mockRecordSystemPrompt.mockResolvedValue({ ok: true });
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
    mockClassifySubject.mockResolvedValue({
      candidates: [],
      needsConfirmation: false,
    });
    mockDirectStartSession.mockResolvedValue({
      ok: true,
      json: async () => ({ session: { id: 'session-1' } }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defaults to voice when SecureStore has voice preference', async () => {
    secureStore['voice-input-mode-profile-1'] = 'voice';
    const { getByTestId } = render(<SessionScreen />);
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('voice');
    });
  });

  it('defaults to text when SecureStore has no preference', async () => {
    const { getByTestId } = render(<SessionScreen />);
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('text');
    });
  });

  it('persists voice preference when mode changes to voice', async () => {
    const { getByTestId } = render(<SessionScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('mock-set-voice-mode'));
    });
    await waitFor(() => {
      expect(secureStore['voice-input-mode-profile-1']).toBe('voice');
    });
  });

  it('persists text preference when mode changes to text', async () => {
    secureStore['voice-input-mode-profile-1'] = 'voice';
    const { getByTestId } = render(<SessionScreen />);
    // Wait for initial voice mode to load
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('voice');
    });
    await act(async () => {
      fireEvent.press(getByTestId('mock-set-text-mode'));
    });
    await waitFor(() => {
      expect(secureStore['voice-input-mode-profile-1']).toBe('text');
    });
  });

  it('shows QuotaExceededCard and disables input when stream returns 402', async () => {
    const { QuotaExceededError } = require('../../../lib/api-client');
    const details = {
      tier: 'free' as const,
      reason: 'monthly' as const,
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: null,
      usedToday: 0,
      topUpCreditsRemaining: 0,
      upgradeOptions: [],
    };
    mockStream.mockRejectedValueOnce(
      new QuotaExceededError('Quota exceeded', details)
    );

    const { unmount } = render(<SessionScreen />);

    // Flush startup async work
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Trigger a message send using the mock send button
    fireEvent.press(screen.getByTestId('manual-send-button'));

    await waitFor(() => {
      expect(screen.getByTestId('quota-exceeded-card')).toBeTruthy();
      expect(screen.getByTestId('input-disabled-banner')).toBeTruthy();
    });

    unmount();
  });
});
