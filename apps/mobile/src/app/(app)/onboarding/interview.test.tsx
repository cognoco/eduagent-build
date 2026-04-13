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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: () => ({
    subjectId: 'subject-1',
    subjectName: 'History',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../components/session', () => {
  const { View, Text, Pressable } = require('react-native');

  return {
    ChatShell: ({
      title,
      inputDisabled,
      onSend,
      footer,
    }: {
      title: string;
      inputDisabled?: boolean;
      onSend: (text: string) => Promise<void> | void;
      footer?: React.ReactNode;
    }) => (
      <View>
        <Text>{title}</Text>
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
}));

const InterviewScreen = require('./interview').default;

describe('InterviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('strips [INTERVIEW_COMPLETE] marker and shows completion footer', async () => {
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        // Simulate chunks arriving with the marker
        onChunk('Great summary of your goals!\n[INTERVIEW_COMPLETE]');
        onDone({ isComplete: true, exchangeCount: 1 });
      }
    );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    await waitFor(() => {
      // Footer should appear with the learning invitation
      expect(screen.getByText('Ready to start learning!')).toBeTruthy();
      expect(screen.getByText("Let's Go")).toBeTruthy();
      // Input should be disabled
      expect(screen.getByTestId('chat-shell-input-disabled')).toHaveTextContent(
        'true'
      );
    });

    // Tapping the CTA navigates straight to curriculum review
    fireEvent.press(screen.getByTestId('view-curriculum-button'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/onboarding/curriculum-review',
      })
    );
  });

  it('disables input after a stream error and lets the learner retry', async () => {
    // BUG-317: Try Again now resends the failed message instead of just clearing
    // the error. Mock the first call to fail and the retry to succeed.
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
          // Retry succeeds — call onDone to finalize the streaming message
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
      // Error panel should disappear after retry
      expect(screen.queryByTestId('interview-stream-error')).toBeNull();
      // Input should be re-enabled since retry succeeded (no streamError)
      expect(screen.getByTestId('chat-shell-input-disabled')).toHaveTextContent(
        'false'
      );
    });

    // Verify the retry actually called stream again
    expect(mockStream).toHaveBeenCalledTimes(2);
  });
});
