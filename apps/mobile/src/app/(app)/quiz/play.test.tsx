import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockSetPrefetchedRoundId = jest.fn();
const mockSetCompletionResult = jest.fn();
const mockCheckAnswer = jest.fn();
const mockPrefetchMutate = jest.fn();
const mockCompleteRoundMutate = jest.fn();
const mockPlatformAlert = jest.fn();
const mockSentryCapture = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error',
  },
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00b4d8',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textInverse: '#ffffff',
    danger: '#ef4444',
  }),
}));

const mockGoBackOrReplace = jest.fn();
jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../../components/quiz/GuessWhoQuestion', () => ({
  GuessWhoQuestion: () => null,
}));

jest.mock('../../../hooks/use-quiz', () => ({
  useCheckAnswer: () => ({
    mutateAsync: mockCheckAnswer,
  }),
  useCompleteRound: () => ({
    isPending: false,
    mutate: mockCompleteRoundMutate,
  }),
  usePrefetchRound: () => ({
    mutate: mockPrefetchMutate,
  }),
}));

jest.mock('../../../lib/platform-alert', () => ({
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

// formatApiError stub: returns the Error message verbatim, otherwise a
// recognisable sentinel. Lets tests assert which error reached the user.
jest.mock('../../../lib/format-api-error', () => ({
  formatApiError: (e: unknown) =>
    e instanceof Error ? e.message : 'Unknown error',
}));

jest.mock('../../../lib/sentry', () => ({
  Sentry: {
    captureException: (...args: unknown[]) => mockSentryCapture(...args),
    addBreadcrumb: jest.fn(),
  },
}));

let mockRound: object | null = {
  id: 'round-1',
  activityType: 'capitals' as const,
  theme: 'Europe',
  total: 1,
  questions: [
    {
      type: 'capitals' as const,
      country: 'Slovakia',
      options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
      funFact: 'Bratislava sits on the Danube.',
      isLibraryItem: true,
      freeTextEligible: true,
    },
  ],
};

jest.mock('./_layout', () => ({
  useQuizFlow: () => ({
    round: mockRound,
    activityType: mockRound ? 'capitals' : null,
    subjectId: null,
    setPrefetchedRoundId: mockSetPrefetchedRoundId,
    setCompletionResult: mockSetCompletionResult,
  }),
}));

const { default: QuizPlayScreen } = require('./play');

describe('QuizPlayScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAnswer.mockResolvedValue({ correct: true });
    // Reset to a valid round for each test
    mockRound = {
      id: 'round-1',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 1,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
          funFact: 'Bratislava sits on the Danube.',
          isLibraryItem: true,
          freeTextEligible: true,
        },
      ],
    };
  });

  it('renders a free-text input for freeTextEligible questions', async () => {
    render(<QuizPlayScreen />);

    expect(screen.getByTestId('quiz-free-text-input')).toBeTruthy();
    expect(screen.getByTestId('quiz-free-text-field')).toBeTruthy();
    expect(screen.queryByTestId('quiz-option-0')).toBeNull();

    fireEvent.changeText(
      screen.getByTestId('quiz-free-text-field'),
      'Bratislava'
    );
    fireEvent.press(screen.getByTestId('quiz-free-text-submit'));

    await waitFor(() => {
      expect(mockCheckAnswer).toHaveBeenCalledWith({
        roundId: 'round-1',
        questionIndex: 0,
        answerGiven: 'Bratislava',
      });
    });
  });
});

// [BUG-812] When server returns options with duplicates that dedupe below 2
// (e.g. options:['Same','Same']), the screen must render the actionable
// "couldn't load" fallback instead of a 1-option MC question.
describe('QuizPlayScreen — malformed MC dedup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockRound = {
      id: 'round-1',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 1,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
          funFact: 'Bratislava sits on the Danube.',
          isLibraryItem: true,
          freeTextEligible: true,
        },
      ],
    };
  });

  it('renders fallback when options dedupe to fewer than 2 entries', () => {
    mockRound = {
      id: 'round-2',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 1,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: ['Bratislava', 'Bratislava'],
          isLibraryItem: true,
          freeTextEligible: false,
        },
      ],
    };

    render(<QuizPlayScreen />);

    expect(screen.getByTestId('quiz-play-malformed')).toBeTruthy();
    expect(screen.queryByTestId('quiz-option-0')).toBeNull();
  });

  it('renders fallback when options array is empty', () => {
    mockRound = {
      id: 'round-3',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 1,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: [],
          isLibraryItem: true,
          freeTextEligible: false,
        },
      ],
    };

    render(<QuizPlayScreen />);

    expect(screen.getByTestId('quiz-play-malformed')).toBeTruthy();
  });
});

// [BUG-819] handleAnswer must record the result against the question that
// was visible when the user tapped, not against whatever currentIndex
// happens to be after the network round-trip.
describe('QuizPlayScreen — handleAnswer questionIndex stability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes questionIndex captured at tap-time to checkAnswer', async () => {
    mockRound = {
      id: 'round-stable',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 2,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
          isLibraryItem: true,
          freeTextEligible: false,
        },
        {
          type: 'capitals' as const,
          country: 'France',
          options: ['Paris', 'Lyon', 'Madrid', 'Rome'],
          isLibraryItem: true,
          freeTextEligible: false,
        },
      ],
    };

    let resolveCheck: ((v: unknown) => void) | undefined;
    mockCheckAnswer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        })
    );

    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));

    expect(mockCheckAnswer).toHaveBeenCalledTimes(1);
    expect(mockCheckAnswer).toHaveBeenCalledWith({
      roundId: 'round-stable',
      questionIndex: 0,
      answerGiven: 'Bratislava',
    });

    resolveCheck?.({ correct: true });

    await waitFor(() => {
      expect(screen.queryByText('Correct')).toBeTruthy();
    });
  });
});

// [UX-DE-H1] When no round is loaded, render an error state with Retry and
// Go Home so the user is never left on a dead plain-text screen.
describe('QuizPlayScreen — no round loaded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRound = null;
  });

  afterEach(() => {
    // Restore for other test suites
    mockRound = {
      id: 'round-1',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 1,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
          funFact: 'Bratislava sits on the Danube.',
          isLibraryItem: true,
          freeTextEligible: true,
        },
      ],
    };
  });

  it('shows Retry and Go Home buttons when round is null', () => {
    render(<QuizPlayScreen />);
    expect(screen.getByTestId('quiz-play-no-round')).toBeTruthy();
    expect(screen.getByTestId('quiz-play-no-round-retry')).toBeTruthy();
    expect(screen.getByTestId('quiz-play-no-round-home')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// [BUG-799] Quiz answer-check failure must surface visible feedback (toast +
// Sentry capture) — not only flip a state flag that may be cleared before the
// JSX consumer renders it.
//
// [BUG-806] completeRound onError must use formatApiError so typed server
// envelope errors (where `err instanceof Error` is false) reach the user
// instead of being replaced by the generic fallback.
// ---------------------------------------------------------------------------

describe('QuizPlayScreen — error feedback [BUG-799 / BUG-806]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRound = {
      id: 'round-err',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 1,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
          isLibraryItem: true,
          freeTextEligible: false,
        },
      ],
    };
  });

  it('[BREAK / BUG-799] surfaces a visible alert when checkAnswer rejects', async () => {
    mockCheckAnswer.mockRejectedValueOnce(new Error('Network unreachable'));

    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));

    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        "Couldn't check your answer",
        'Network unreachable'
      );
    });
    expect(mockSentryCapture).toHaveBeenCalledTimes(1);
  });

  it('[BREAK / BUG-799] handles non-Error checkAnswer rejection', async () => {
    mockCheckAnswer.mockRejectedValueOnce({ code: 'QUOTA_EXCEEDED' });

    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));

    await waitFor(() => {
      // formatApiError stub returns 'Unknown error' for non-Error shapes.
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        "Couldn't check your answer",
        'Unknown error'
      );
    });
  });

  // [BUG-806] When completeRound rejects with a non-Error envelope, the old
  // `instanceof Error` check returned the generic fallback. formatApiError
  // must run unconditionally so the typed server reason reaches the user.
  // The handleContinue gate has a 250 ms cool-down — bypass with real waits.
  async function answerAndAdvanceToSubmit(): Promise<void> {
    fireEvent.press(screen.getByTestId('quiz-option-0'));
    // Wait for handleAnswer's `continueEnabledAtRef = Date.now() + 250`.
    await waitFor(() =>
      expect(screen.getByTestId('quiz-play-screen')).toBeTruthy()
    );
    await new Promise((r) => setTimeout(r, 280));
    // [BUG-691] handleContinue is now scoped to the body Pressable so the
    // Quit X in the header can never bubble to it. With a 1-question round,
    // handleContinue calls submitRound → completeRound.
    fireEvent.press(screen.getByTestId('quiz-play-body'));
  }

  it('[BREAK / BUG-806] completeRound onError uses formatApiError, not instanceof', async () => {
    mockCompleteRoundMutate.mockImplementation((_input, opts) => {
      opts.onError({ code: 'INTERNAL_ERROR', message: 'server-shape' });
    });
    mockCheckAnswer.mockResolvedValueOnce({ correct: true });

    render(<QuizPlayScreen />);
    await answerAndAdvanceToSubmit();

    await waitFor(() => {
      expect(mockCompleteRoundMutate).toHaveBeenCalled();
    });
    expect(mockSentryCapture).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'server-shape',
    });
  });

  it('[BUG-806] completeRound onError forwards Error message via formatApiError', async () => {
    mockCompleteRoundMutate.mockImplementation((_input, opts) => {
      opts.onError(new Error('Round save failed: 500'));
    });
    mockCheckAnswer.mockResolvedValueOnce({ correct: true });

    render(<QuizPlayScreen />);
    await answerAndAdvanceToSubmit();

    await waitFor(() => {
      expect(mockCompleteRoundMutate).toHaveBeenCalled();
    });
    expect(mockSentryCapture).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Round save failed: 500' })
    );
  });

  // [BUG-691] The root container is a plain View, not a Pressable. The
  // Quit X button cannot bubble its press to the continue handler because
  // the continue Pressable is scoped to the body, sibling of the header.
  it('[BUG-691] root is not a Pressable — Quit cannot trigger handleContinue', async () => {
    mockCheckAnswer.mockResolvedValueOnce({ correct: true });
    render(<QuizPlayScreen />);

    // Resolve the answer so continueActive is true
    fireEvent.press(screen.getByTestId('quiz-option-0'));
    await waitFor(() =>
      expect(screen.getByTestId('quiz-play-screen')).toBeTruthy()
    );
    await new Promise((r) => setTimeout(r, 280));

    // [BUG-892] Press the Quit button. This must open the styled in-app
    // confirmation modal (NOT call platformAlert/window.confirm) and must
    // NOT submit the round (which would mean handleContinue also fired).
    fireEvent.press(screen.getByTestId('quiz-play-quit'));
    expect(screen.getByTestId('quiz-quit-confirm')).toBeTruthy();
    expect(mockPlatformAlert).not.toHaveBeenCalledWith(
      'Quit this round?',
      expect.any(String),
      expect.any(Array)
    );
    expect(mockCompleteRoundMutate).not.toHaveBeenCalled();
  });

  // [BUG-892] On Expo Web, platformAlert routes through window.confirm for
  // 2-button prompts which freezes the renderer. The quit confirmation must
  // be a styled in-app Modal instead.
  it('[BUG-892] Quit opens an in-app modal, not platformAlert', () => {
    render(<QuizPlayScreen />);

    // Modal is hidden initially — confirm button is rendered inside the Modal,
    // which only mounts its children when visible=true.
    expect(screen.queryByTestId('quiz-quit-confirm')).toBeNull();

    fireEvent.press(screen.getByTestId('quiz-play-quit'));

    expect(screen.getByTestId('quiz-quit-confirm')).toBeTruthy();
    expect(screen.getByTestId('quiz-quit-cancel')).toBeTruthy();
    // Critically: platformAlert (which would hit window.confirm on web) is NOT
    // invoked for the quit-confirm flow.
    expect(mockPlatformAlert).not.toHaveBeenCalledWith(
      'Quit this round?',
      expect.any(String),
      expect.any(Array)
    );
  });

  it('[BUG-892] Cancelling the quit modal keeps the user on the quiz', () => {
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-play-quit'));
    fireEvent.press(screen.getByTestId('quiz-quit-cancel'));

    // After dismiss the modal hides (children unmount).
    expect(screen.queryByTestId('quiz-quit-confirm')).toBeNull();
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('[BUG-892] Confirming the quit modal navigates back to /quiz', () => {
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-play-quit'));
    fireEvent.press(screen.getByTestId('quiz-quit-confirm'));

    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/quiz'
    );
  });
});
