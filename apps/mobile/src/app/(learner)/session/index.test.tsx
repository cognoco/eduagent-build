import React from 'react';
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
    inputMode,
    onInputModeChange,
    onSend,
    renderMessageActions,
  }: {
    subtitle?: string;
    messages?: Array<{ id: string; content: string }>;
    inputAccessory?: React.ReactNode;
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

  it('shows contextual learner-agency chips and session tools', () => {
    const screen = render(<SessionScreen />);

    expect(screen.getByText('I know this')).toBeTruthy();
    expect(screen.getByText('Explain differently')).toBeTruthy();
    expect(screen.getByText('Too easy')).toBeTruthy();
    expect(screen.getByText('Example')).toBeTruthy();
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
});
