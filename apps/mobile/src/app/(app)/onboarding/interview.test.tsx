import {
  act,
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
const mockForceCompleteMutateAsync = jest.fn();
let mockSearchParams: Record<string, string> = {
  subjectId: 'subject-1',
  subjectName: 'History',
  step: '1',
  totalSteps: '4',
};

// Capture the useFocusEffect cleanup so tests can simulate blur (navigation away).
let capturedFocusCleanup: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (cb: () => (() => void) | undefined) => {
    const cleanup = cb();
    if (cleanup) {
      capturedFocusCleanup = cleanup;
    }
  },
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
    mutateAsync: mockForceCompleteMutateAsync,
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

jest.mock('../../../lib/feature-flags', () => ({
  FEATURE_FLAGS: {
    ONBOARDING_FAST_PATH: false,
    COACH_BAND_ENABLED: true,
    MIC_IN_PILL_ENABLED: true,
    I18N_ENABLED: true,
  },
}));

const { FEATURE_FLAGS } = require('../../../lib/feature-flags');
const InterviewScreen = require('./interview').default;

describe('InterviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFocusCleanup = undefined;
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
    // Default: forceComplete succeeds with no extracted interests
    mockForceCompleteMutateAsync.mockResolvedValue({ extractedSignals: null });
    FEATURE_FLAGS.ONBOARDING_FAST_PATH = false;
  });

  it('renders the onboarding step indicator', () => {
    render(<InterviewScreen />);

    screen.getByText('Step 1 of 4');
  });

  it('[BUG-958] shows completion card when LLM signals isComplete (no session transition)', async () => {
    // [BUG-958] Pre-fix: LLM isComplete called transitionToSession() silently,
    // leaving the user in a chat loop with a "Done" header button and no clear
    // path to curriculum-review. Post-fix: the completion card ("Ready to start
    // learning!" + "Let's Go") is shown immediately so the user has an
    // unambiguous forward action, and no session is created on interview completion.
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

    await waitFor(() => {
      // The completion card must appear with the "Let's Go" forward action.
      screen.getByTestId('view-curriculum-button');
    });

    // startSession must NOT be called — interview completion no longer
    // silently enters a session phase. [BUG-958]
    expect(mockStartSessionMutateAsync).not.toHaveBeenCalled();
  });

  it('[BUG-958] "Let\'s Go" button on completion card navigates to the next onboarding step', async () => {
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        onChunk('Done!');
        onDone({ isComplete: true, exchangeCount: 1 });
      }
    );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    await waitFor(() => {
      screen.getByTestId('view-curriculum-button');
    });

    fireEvent.press(screen.getByTestId('view-curriculum-button'));

    // Must navigate forward (router.replace) — not stay on the interview screen.
    expect(mockReplace).toHaveBeenCalled();
  });

  it('routes directly to a learning session for a non-language subject when ONBOARDING_FAST_PATH is true', async () => {
    FEATURE_FLAGS.ONBOARDING_FAST_PATH = true;
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        onChunk('Ready.');
        onDone({ isComplete: true, exchangeCount: 1 });
      }
    );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    await waitFor(() => screen.getByTestId('view-curriculum-button'));
    fireEvent.press(screen.getByTestId('view-curriculum-button'));

    await waitFor(() => {
      expect(mockStartSessionMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/onboarding/interests-context',
      })
    );
  });

  it('still routes to interests-context when ONBOARDING_FAST_PATH is false', async () => {
    const { useInterviewState } = require('../../../hooks/use-interview');
    useInterviewState.mockReturnValueOnce({
      data: {
        status: 'completed',
        exchangeHistory: [],
        extractedSignals: { interests: ['football'] },
      },
      isLoading: false,
    });

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('view-curriculum-button'));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/onboarding/interests-context',
      })
    );
  });

  it('routes to language-setup for language subjects when fast-path is on', async () => {
    FEATURE_FLAGS.ONBOARDING_FAST_PATH = true;
    mockSearchParams = {
      subjectId: 'subject-1',
      subjectName: 'Spanish',
      languageCode: 'es',
      languageName: 'Spanish',
      step: '1',
      totalSteps: '4',
    };
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        onChunk('Ready.');
        onDone({ isComplete: true, exchangeCount: 1 });
      }
    );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    await waitFor(() => screen.getByTestId('view-curriculum-button'));
    fireEvent.press(screen.getByTestId('view-curriculum-button'));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/onboarding/language-setup',
      })
    );
    expect(mockStartSessionMutateAsync).not.toHaveBeenCalled();
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
      screen.getByTestId('interview-stream-error');
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

  // [BUG-UX-INTERVIEW-SKIP-TIMEOUT] 30s hard timeout on forceComplete.
  // When forceComplete.isPending is true and stays true for 30s, the skip
  // button area must switch to an inline error + Go Back action.
  describe('[BUG-UX-INTERVIEW-SKIP-TIMEOUT] 30s forceComplete safety timeout', () => {
    const {
      useForceCompleteInterview,
    } = require('../../../hooks/use-interview');

    // Mutable so we can control isPending across renders.
    let mockForceCompletePending = false;

    beforeEach(() => {
      jest.useFakeTimers();
      mockForceCompletePending = true;
      // Stub forceComplete as indefinitely pending.
      useForceCompleteInterview.mockReturnValue({
        mutateAsync: mockForceCompleteMutateAsync,
        isPending: mockForceCompletePending,
      });

      // Drive stream to give exchangeCount >= 2 so the footer appears.
      mockStream.mockImplementation(
        async (
          _msg: string,
          _onChunk: (s: string) => void,
          onDone: (r: { isComplete: boolean; exchangeCount: number }) => void
        ) => {
          onDone({ isComplete: false, exchangeCount: 1 });
        }
      );

      // forceComplete mutation stays pending forever (never resolves).
      mockForceCompleteMutateAsync.mockReturnValue(
        new Promise(() => undefined)
      );
    });

    afterEach(() => {
      jest.useRealTimers();
      // Restore mock to the default non-pending state.
      useForceCompleteInterview.mockReturnValue({
        mutateAsync: mockForceCompleteMutateAsync,
        isPending: false,
      });
    });

    it('does NOT show the timeout error before 30s elapses', async () => {
      render(<InterviewScreen />);

      // Send twice to reach exchangeCount >= 2 so the skip footer renders.
      fireEvent.press(screen.getByTestId('chat-shell-send'));
      await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));
      fireEvent.press(screen.getByTestId('chat-shell-send'));
      await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(2));

      // Press skip — forceComplete goes pending and stays pending.
      await waitFor(() => {
        screen.getByTestId('skip-interview-button');
      });
      fireEvent.press(screen.getByTestId('skip-interview-button'));

      act(() => {
        jest.advanceTimersByTime(29_999);
      });

      expect(screen.queryByTestId('force-complete-timeout-error')).toBeNull();
    });

    it('shows timeout error with Go Back after 30s of forceComplete pending', async () => {
      render(<InterviewScreen />);

      fireEvent.press(screen.getByTestId('chat-shell-send'));
      await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));
      fireEvent.press(screen.getByTestId('chat-shell-send'));
      await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(2));

      await waitFor(() => {
        screen.getByTestId('skip-interview-button');
      });
      fireEvent.press(screen.getByTestId('skip-interview-button'));

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      screen.getByTestId('force-complete-timeout-error');
      screen.getByTestId('force-complete-timeout-go-back');
    });

    it('clears the safety timeout when forceComplete resolves before 30s (cleanup)', async () => {
      // Override mutation to resolve quickly.
      mockForceCompleteMutateAsync.mockResolvedValueOnce({
        extractedSignals: null,
      });
      // Reset isPending to false so the useEffect cleanup fires.
      useForceCompleteInterview.mockReturnValue({
        mutateAsync: mockForceCompleteMutateAsync,
        isPending: false,
      });

      render(<InterviewScreen />);

      fireEvent.press(screen.getByTestId('chat-shell-send'));
      await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));
      fireEvent.press(screen.getByTestId('chat-shell-send'));
      await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(2));

      // Advance well past 30s — timer must not fire because mutation resolved.
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      expect(screen.queryByTestId('force-complete-timeout-error')).toBeNull();
    });
  });

  it('[BUG-692-FOLLOWUP] goToNextStep does not fire when user navigates away during forceComplete', async () => {
    // Arrange: stream resolves without completing so exchangeCount can reach 2.
    mockStream.mockImplementation(
      async (
        _msg: string,
        _onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        onDone({ isComplete: false, exchangeCount: 1 });
      }
    );

    // Deferred forceComplete — stays pending until we resolve it.
    let resolveForceComplete!: (value: { extractedSignals: null }) => void;
    mockForceCompleteMutateAsync.mockReturnValue(
      new Promise<{ extractedSignals: null }>((resolve) => {
        resolveForceComplete = resolve;
      })
    );

    render(<InterviewScreen />);

    // Send twice to get exchangeCount >= 2, making the skip button appear.
    fireEvent.press(screen.getByTestId('chat-shell-send'));
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('chat-shell-send'));
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(2));

    // Skip button should now be visible.
    await waitFor(() => {
      screen.getByTestId('skip-interview-button');
    });

    // Press skip — starts the in-flight mutation.
    fireEvent.press(screen.getByTestId('skip-interview-button'));

    // Simulate user navigating away (hardware back triggers useFocusEffect cleanup).
    expect(capturedFocusCleanup).toBeInstanceOf(Function);
    capturedFocusCleanup!();

    // Now resolve the mutation — goToNextStep (router.replace) must NOT fire.
    resolveForceComplete({ extractedSignals: null });

    // Allow any pending microtasks to drain.
    await new Promise((r) => setTimeout(r, 0));

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
