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

    // Tapping the CTA navigates to analogy-preference
    fireEvent.press(screen.getByTestId('view-curriculum-button'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/onboarding/analogy-preference',
      })
    );
  });

  it('disables input after a stream error and lets the learner clear it', async () => {
    mockStream.mockRejectedValueOnce(new Error('Network request failed'));

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
  });
});
