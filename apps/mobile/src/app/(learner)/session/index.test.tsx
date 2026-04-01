import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SessionScreen from './index';

const mockStartSession = jest.fn();
const mockCloseSession = jest.fn();
const mockStream = jest.fn();
const mockHomeworkStatePost = jest.fn();

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
    inputAccessory,
    onSend,
  }: {
    subtitle?: string;
    inputAccessory?: React.ReactNode;
    onSend: (text: string) => void;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View>
        <Text testID="session-subtitle">{subtitle}</Text>
        {inputAccessory}
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
  LearningBookPrompt: () => null,
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
  useRecordSystemPrompt: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../../hooks/use-classify-subject', () => ({
  useClassifySubject: () => ({
    mutateAsync: jest.fn(),
  }),
}));

jest.mock('../../../hooks/use-streaks', () => ({
  useStreaks: () => ({ data: { longestStreak: 1 } }),
}));

jest.mock('../../../hooks/use-progress', () => ({
  useOverallProgress: () => ({ data: { totalTopicsCompleted: 0 } }),
}));

jest.mock('../../../hooks/use-network-status', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

jest.mock('../../../hooks/use-api-reachability', () => ({
  useApiReachability: () => ({ isApiReachable: true, isChecked: true }),
}));

jest.mock('../../../hooks/use-settings', () => ({
  useCelebrationLevel: () => ({ data: 'full' }),
}));

jest.mock('../../../hooks/use-celebration', () => ({
  useCelebration: () => ({
    CelebrationOverlay: () => null,
    trigger: jest.fn(),
  }),
}));

jest.mock('../../../hooks/use-milestone-tracker', () => ({
  celebrationForReason: jest.fn(),
  createMilestoneTrackerStateFromMilestones: jest.fn().mockReturnValue({}),
  normalizeMilestoneTrackerState: jest.fn().mockReturnValue({}),
  useMilestoneTracker: () => ({
    milestonesReached: [],
    trackerState: {},
    trackExchange: jest.fn().mockReturnValue({ triggered: [], trackerState: {} }),
    hydrate: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock('../../../lib/session-recovery', () => ({
  clearSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
  readSessionRecoveryMarker: jest.fn().mockResolvedValue(null),
  writeSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../lib/api-client', () => ({
  useApiClient: () => ({
    sessions: {
      ':sessionId': {
        'homework-state': {
          $post: mockHomeworkStatePost,
        },
      },
    },
  }),
}));

jest.mock('../../../lib/format-api-error', () => ({
  formatApiError: (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown error',
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
    (useRouter as jest.Mock).mockReturnValue({
      replace: jest.fn(),
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
        }) => void
      ) => {
        onDone({ exchangeCount: 1, escalationRung: 1 });
      }
    );
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
  });
});
