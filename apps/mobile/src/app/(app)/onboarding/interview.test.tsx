import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';

const mockReplace = jest.fn();
const mockStream = jest.fn();
const mockAbort = jest.fn();
const mockStartSessionMutateAsync = jest.fn();
const mockStreamSessionMessage = jest.fn();
let mockSearchParams: Record<string, string> = {
  subjectId: 'subject-1',
  subjectName: 'History',
  step: '1',
  totalSteps: '4',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../components/session', () => {
  const { View, Text, Pressable } = require('react-native');

  return {
    ChatShell: ({
      title,
      headerBelow,
      inputDisabled,
      onSend,
      footer,
    }: {
      title: string;
      headerBelow?: React.ReactNode;
      inputDisabled?: boolean;
      onSend: (text: string) => Promise<void> | void;
      footer?: React.ReactNode;
    }) => (
      <View>
        <Text>{title}</Text>
        {headerBelow}
        <Text testID="chat-shell-input-disabled">
          {inputDisabled ? 'true' : 'false'}
        </Text>
        <Pressable
          testID="chat-shell-send"
          onPress={() => void onSend('Tell me more')}
        >
          <Text>Send</Text>
        </Pressable>
        {footer}
      </View>
    ),
    LivingBook: () => null,
  };
});

jest.mock('../../../hooks/use-interview', () => ({
  useInterviewState: jest.fn(() => ({
    data: null,
    isLoading: false,
  })),
  useStreamInterviewMessage: jest.fn(() => ({
    stream: mockStream,
    abort: mockAbort,
    isStreaming: false,
  })),
  useForceCompleteInterview: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
}));

jest.mock('../../../hooks/use-sessions', () => ({
  useStartSession: jest.fn(() => ({
    mutateAsync: mockStartSessionMutateAsync,
    isPending: false,
  })),
  useStreamMessage: jest.fn(() => ({
    stream: mockStreamSessionMessage,
    isStreaming: false,
  })),
}));

const InterviewScreen = require('./interview').default;

describe('InterviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {
      subjectId: 'subject-1',
      subjectName: 'History',
      step: '1',
      totalSteps: '4',
    };
    // Default: session creation succeeds
    mockStartSessionMutateAsync.mockResolvedValue({
      session: { id: 'session-123' },
    });
  });

  it('renders the onboarding step indicator', () => {
    render(<InterviewScreen />);

    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
  });

  it('transitions to session phase after interview completes (input stays enabled)', async () => {
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        onChunk('Great summary of your goals!');
        onDone({ isComplete: true, exchangeCount: 1 });
      }
    );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    // After interview completes, session is created and input stays enabled
    await waitFor(() => {
      expect(mockStartSessionMutateAsync).toHaveBeenCalledWith({
        subjectId: 'subject-1',
        sessionType: 'learning',
        inputMode: 'text',
      });
      expect(screen.getByTestId('chat-shell-input-disabled')).toHaveTextContent(
        'false'
      );
    });
  });

  it('falls back to Let\'s Go card when session creation fails', async () => {
    mockStartSessionMutateAsync.mockRejectedValueOnce(
      new Error('Session creation failed')
    );

    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        onChunk('Great summary!');
        onDone({ isComplete: true, exchangeCount: 1 });
      }
    );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    // Falls back to the "Let's Go" card
    await waitFor(() => {
      expect(screen.getByText('Ready to start learning!')).toBeTruthy();
      expect(screen.getByText("Let's Go")).toBeTruthy();
      expect(screen.getByTestId('chat-shell-input-disabled')).toHaveTextContent(
        'true'
      );
    });

    fireEvent.press(screen.getByTestId('view-curriculum-button'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/analogy-preference',
      params: {
        subjectId: 'subject-1',
        subjectName: 'History',
        step: '2',
        totalSteps: '4',
      },
    });
  });

  it('routes language subjects to language-setup via fallback card', async () => {
    mockSearchParams = {
      subjectId: 'subject-1',
      subjectName: 'Spanish',
      languageCode: 'es',
      languageName: 'Spanish',
      step: '1',
      totalSteps: '4',
    };
    // Force fallback by failing session creation
    mockStartSessionMutateAsync.mockRejectedValueOnce(
      new Error('Session creation failed')
    );
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        onChunk('Ready!');
        onDone({ isComplete: true, exchangeCount: 1 });
      }
    );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    await waitFor(() => {
      expect(screen.getByTestId('view-curriculum-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('view-curriculum-button'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/language-setup',
      params: {
        subjectId: 'subject-1',
        subjectName: 'Spanish',
        languageCode: 'es',
        languageName: 'Spanish',
        step: '2',
        totalSteps: '4',
      },
    });
  });

  it('disables input after a stream error and lets the learner retry', async () => {
    mockStream
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockImplementationOnce(
        async (
          _msg: string,
          _onChunk: (accumulated: string) => void,
          onDone: (result: {
            isComplete: boolean;
            exchangeCount: number;
          }) => void
        ) => {
          onDone({ isComplete: false, exchangeCount: 2 });
        }
      );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    await waitFor(() => {
      expect(screen.getByTestId('interview-stream-error')).toBeTruthy();
      expect(
        screen.getByText(
          "Looks like you're offline or our servers can't be reached. Check your internet connection and try again."
        )
      ).toBeTruthy();
      expect(screen.getByTestId('chat-shell-input-disabled')).toHaveTextContent(
        'true'
      );
    });

    fireEvent.press(screen.getByTestId('interview-try-again-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('interview-stream-error')).toBeNull();
      expect(screen.getByTestId('chat-shell-input-disabled')).toHaveTextContent(
        'false'
      );
    });

    expect(mockStream).toHaveBeenCalledTimes(2);
  });
});
