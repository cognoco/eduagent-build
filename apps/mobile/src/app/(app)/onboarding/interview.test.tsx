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

  it('surfaces retry UX when session creation fails [BUG-803]', async () => {
    // [BUG-803] Pre-fix: failure silently swapped to a "Let's Go" card,
    // making the user think the interview succeeded when no session ever
    // started — and there was no retry path. Post-fix: failure surfaces
    // the existing session-creation-stuck retry UX (Try Again + Go Back)
    // so the user can recover.
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

    await waitFor(() => {
      expect(screen.getByTestId('session-creating-retry')).toBeTruthy();
      expect(screen.getByTestId('session-creating-go-back')).toBeTruthy();
    });

    // Pre-fix Let's Go card must NOT appear — it is the regressed behavior.
    expect(screen.queryByTestId('view-curriculum-button')).toBeNull();
    expect(screen.queryByText("Let's Go")).toBeNull();
  });

  it('surfaces retry UX on session failure for language subjects too [BUG-803]', async () => {
    // [BUG-803] Same retry-UX guarantee regardless of subject language —
    // the failure path is language-agnostic; routing to language-setup vs
    // analogy-preference happens only on the success path via extracted
    // interests, not via the (now-removed) fallback card.
    mockSearchParams = {
      subjectId: 'subject-1',
      subjectName: 'Spanish',
      languageCode: 'es',
      languageName: 'Spanish',
      step: '1',
      totalSteps: '4',
    };
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
      expect(screen.getByTestId('session-creating-retry')).toBeTruthy();
      expect(screen.getByTestId('session-creating-go-back')).toBeTruthy();
    });

    expect(screen.queryByTestId('view-curriculum-button')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('[BUG-817 / F-MOB-19] retry button actually re-attempts session creation', async () => {
    // BUG-817 acceptance criterion: the failure path is recoverable. Tapping
    // "Try Again" must call startSession again — not just show a button that
    // looks actionable. Pre-fix the catch silently set interviewComplete and
    // there was no retry path at all.
    mockStartSessionMutateAsync
      .mockRejectedValueOnce(new Error('Network blip'))
      .mockResolvedValueOnce({ session: { id: 'sess-recovered' } });

    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (accumulated: string) => void,
        onDone: (result: { isComplete: boolean; exchangeCount: number }) => void
      ) => {
        onChunk('All done!');
        onDone({ isComplete: true, exchangeCount: 1 });
      }
    );

    render(<InterviewScreen />);
    fireEvent.press(screen.getByTestId('chat-shell-send'));

    await waitFor(() => {
      expect(screen.getByTestId('session-creating-retry')).toBeTruthy();
    });

    // First attempt failed.
    expect(mockStartSessionMutateAsync).toHaveBeenCalledTimes(1);

    // Tap retry.
    fireEvent.press(screen.getByTestId('session-creating-retry'));

    // Retry must trigger a SECOND startSession call. If the retry button is
    // wired to a no-op (the regression we are guarding against), this fails.
    await waitFor(() => {
      expect(mockStartSessionMutateAsync).toHaveBeenCalledTimes(2);
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
        expect(screen.getByTestId('skip-interview-button')).toBeTruthy();
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
        expect(screen.getByTestId('skip-interview-button')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('skip-interview-button'));

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(screen.getByTestId('force-complete-timeout-error')).toBeTruthy();
      expect(screen.getByTestId('force-complete-timeout-go-back')).toBeTruthy();
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
      expect(screen.getByTestId('skip-interview-button')).toBeTruthy();
    });

    // Press skip — starts the in-flight mutation.
    fireEvent.press(screen.getByTestId('skip-interview-button'));

    // Simulate user navigating away (hardware back triggers useFocusEffect cleanup).
    expect(capturedFocusCleanup).toBeDefined();
    capturedFocusCleanup!();

    // Now resolve the mutation — goToNextStep (router.replace) must NOT fire.
    resolveForceComplete({ extractedSignals: null });

    // Allow any pending microtasks to drain.
    await new Promise((r) => setTimeout(r, 0));

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
