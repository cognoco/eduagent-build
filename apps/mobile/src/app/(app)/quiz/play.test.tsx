import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockSetPrefetchedRoundId = jest.fn();
const mockSetCompletionResult = jest.fn();
const mockSetRound = jest.fn();
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
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    primary: '#00b4d8',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textInverse: '#ffffff',
    danger: '#ef4444',
    success: '#22c55e',
  }),
}));

jest.mock('../../../components/quiz/GuessWhoQuestion', () => ({
  // gc1-allow: GuessWhoQuestion uses native ColorScheme via useThemeColors
  GuessWhoQuestion: ({
    onResolved,
  }: {
    onResolved: (result: {
      correct: boolean;
      answerGiven: string;
      cluesUsed: number;
      answerMode: 'free_text' | 'multiple_choice';
    }) => void;
  }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable
        onPress={() =>
          onResolved({
            correct: true,
            answerGiven: 'Nikola Tesla',
            cluesUsed: 3,
            answerMode: 'free_text',
          })
        }
        testID="guess-who-resolve-correct"
      >
        <Text>Resolve Guess Who</Text>
      </Pressable>
    );
  },
}));

jest.mock(
  '../../../components/common/celebrations/PolarStar' /* gc1-allow: PolarStar is native-animated celebration component; stub prevents native module crash */,
  () => ({
    PolarStar: ({ testID }: { testID?: string }) => {
      const { Text } = require('react-native');
      return <Text testID={testID}>success animation</Text>;
    },
  }),
);

jest.mock('../../../hooks/use-quiz', () => ({
  ...jest.requireActual('../../../hooks/use-quiz'),
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
  ...jest.requireActual('../../../lib/platform-alert'),
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock('../../../lib/sentry', () => ({
  // gc1-allow: @sentry/react-native external boundary
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
let mockReturnTo: string | null = null;

jest.mock('./_layout', () => ({
  ...jest.requireActual('./_layout'),
  useQuizFlow: () => ({
    round: mockRound,
    activityType:
      mockRound && 'activityType' in mockRound ? mockRound.activityType : null,
    returnTo: mockReturnTo,
    subjectId: null,
    setPrefetchedRoundId: mockSetPrefetchedRoundId,
    setRound: mockSetRound,
    setCompletionResult: mockSetCompletionResult,
  }),
}));

const { default: QuizPlayScreen } = require('./play');

beforeEach(() => {
  mockCompleteRoundMutate.mockImplementation((_input, opts) => {
    opts.onSuccess({
      score: 1,
      total: 1,
      xpEarned: 10,
      celebrationTier: 'perfect',
      questionResults: [],
    });
  });
});

describe('QuizPlayScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReturnTo = null;
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

    screen.getByTestId('quiz-free-text-input');
    screen.getByTestId('quiz-free-text-field');
    expect(screen.queryByTestId('quiz-option-0')).toBeNull();

    fireEvent.changeText(
      screen.getByTestId('quiz-free-text-field'),
      'Bratislava',
    );
    fireEvent.press(screen.getByTestId('quiz-free-text-submit'));

    await waitFor(() => {
      expect(mockCheckAnswer).toHaveBeenCalledWith({
        roundId: 'round-1',
        questionIndex: 0,
        answerGiven: 'Bratislava',
        answerMode: 'free_text',
      });
    });
    await waitFor(() => {
      screen.getByTestId('quiz-correct-celebration', {
        includeHiddenElements: true,
      });
    });
  });

  // [BUG-928] Path 7 spec: "Question header: '1 of 7' + dot indicators +
  // elapsed seconds". The previous F-Q-13 implementation hid the timer for
  // anxiety, but this is a count-UP timer so motivation > anxiety.
  it('[BUG-928] renders the elapsed-seconds counter in the header', () => {
    render(<QuizPlayScreen />);

    const elapsed = screen.getByTestId('quiz-play-elapsed');
    // Initial render: timer started from Date.now() in this same tick, so
    // the floored seconds value is 0.
    expect(elapsed.props.children).toBe('0:00');
    // Aria-label includes a unit so screen-reader users hear "Elapsed time:
    // 0 seconds" instead of just "0s".
    expect(elapsed.props.accessibilityLabel).toBe('Elapsed time: 0 seconds');
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

    screen.getByTestId('quiz-play-malformed');
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

    screen.getByTestId('quiz-play-malformed');
  });
});

// [BUG-924] REGRESSION PIN — not a fix confirmation.
//
// User report: "tapped The bird (idx 0), recorded The worm (idx 1)" on
// Expo web preview (Vocabulary: Italian round, parent account on
// /quiz/play). The original index-mismatch hypothesis (shuffled-vs-
// canonical index) does not fit because the client sends answerGiven as
// a string, not an index, and the server stores it verbatim — any
// divergence must come from JSX-layer closure binding or web-specific
// event routing, neither of which Jest/RNTL exercises.
//
// What this test does: it locks the expected contract — each option's
// onPress must record EXACTLY the option string rendered at that index,
// for every index in the round. If the native path ever regresses
// (wrong string captured), this test will catch it.
//
// What this test does NOT do: reproduce the original user-reported bug.
// The actual failure mode is web-only. No reliable Playwright repro has
// been pinned down yet; a durable web-layer regression test remains an
// open follow-up on BUG-924.
describe('QuizPlayScreen — answerGiven matches rendered option text (BUG-924)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAnswer.mockResolvedValue({ correct: true });
  });

  it.each([
    [0, 'The bird'],
    [1, 'The worm'],
    [2, 'The feather'],
    [3, 'The animal'],
  ])(
    'tap on quiz-option-%i records answerGiven=%j',
    async (index: number, expected: string) => {
      mockRound = {
        id: 'round-924',
        activityType: 'vocabulary' as const,
        theme: 'Italian — animals',
        total: 1,
        questions: [
          {
            type: 'vocabulary' as const,
            term: "L'uccello",
            options: ['The bird', 'The worm', 'The feather', 'The animal'],
            cefrLevel: 'A2',
            isLibraryItem: false,
            freeTextEligible: false,
          },
        ],
      };
      render(<QuizPlayScreen />);
      fireEvent.press(screen.getByTestId(`quiz-option-${index}`));
      await waitFor(() => {
        expect(mockCheckAnswer).toHaveBeenCalledWith({
          roundId: 'round-924',
          questionIndex: 0,
          answerGiven: expected,
          answerMode: 'multiple_choice',
        });
      });
    },
  );
});

// [BUG-927] Dispute UI ("Not quite right?") must not appear after a CORRECT
// answer — there is nothing to dispute. Surfacing the link there is confusing
// UX and creates noisy challenge reports for clearly correct answers.
describe('QuizPlayScreen — dispute button visibility (BUG-927)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRound = {
      id: 'round-dispute',
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

  it('hides dispute button after a correct answer', async () => {
    mockCheckAnswer.mockResolvedValueOnce({ correct: true });
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));

    await waitFor(() => {
      screen.getByText('Correct');
    });
    screen.getByTestId('quiz-correct-celebration');
    screen.getByText('You discovered it!');
    expect(screen.getByTestId('quiz-revealed-answer').props.children).toBe(
      'Bratislava',
    );
    screen.getByText('Saved. Ready when you are.');
    screen.getByTestId('quiz-final-see-results');
    screen.getByText('Wait, just one more!');
    expect(screen.queryByTestId('quiz-dispute-button')).toBeNull();
    expect(screen.queryByText('Not quite right?')).toBeNull();
  });

  it('shows dispute button after a wrong answer', async () => {
    mockCheckAnswer.mockResolvedValueOnce({
      correct: false,
      correctAnswer: 'Bratislava',
    });
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-1'));

    await waitFor(() => {
      screen.getByText('Not quite');
    });
    expect(screen.queryByTestId('quiz-correct-celebration')).toBeNull();
    screen.getByTestId('quiz-dispute-button');
  });
});

describe('QuizPlayScreen — Guess Who finish autosave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRound = {
      id: 'round-guess-who',
      activityType: 'guess_who' as const,
      theme: 'Inventors',
      total: 1,
      questions: [
        {
          type: 'guess_who' as const,
          clues: [
            'He imagined many inventions before building them.',
            'He worked with electricity.',
            'He has a unit of magnetic flux density named after him.',
          ],
          mcFallbackOptions: [
            'Nikola Tesla',
            'Thomas Edison',
            'Albert Einstein',
            'Isaac Newton',
          ],
          funFact: 'Tesla held hundreds of patents.',
        },
      ],
    };
  });

  it('celebrates and autosaves when a person guess finishes the round', async () => {
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('guess-who-resolve-correct'));

    await waitFor(() => {
      screen.getByTestId('quiz-correct-celebration');
    });
    screen.getByText('You found them in 3 clues!');
    screen.getByText('Saved. Ready when you are.');
    screen.getByTestId('quiz-final-see-results');
    screen.getByText('Wait, just one more!');

    expect(mockCompleteRoundMutate).toHaveBeenCalledWith(
      {
        roundId: 'round-guess-who',
        results: [
          expect.objectContaining({
            questionIndex: 0,
            correct: true,
            answerGiven: 'Nikola Tesla',
            cluesUsed: 3,
            answerMode: 'free_text',
          }),
        ],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(mockSetCompletionResult).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith('/(app)/quiz/results');
  });

  it('can start one more round after the final autosave', async () => {
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('guess-who-resolve-correct'));
    await waitFor(() => screen.getByTestId('quiz-final-one-more'));

    fireEvent.press(screen.getByTestId('quiz-final-one-more'));

    expect(mockSetRound).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz/launch');
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
        }),
    );

    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));

    expect(mockCheckAnswer).toHaveBeenCalledTimes(1);
    expect(mockCheckAnswer).toHaveBeenCalledWith({
      roundId: 'round-stable',
      questionIndex: 0,
      answerGiven: 'Bratislava',
      answerMode: 'multiple_choice',
    });

    resolveCheck?.({ correct: true });

    await waitFor(() => {
      expect(screen.queryByText('Correct')).toBeTruthy();
    });
  });
});

// [BUG-STALE-OPTIONS] The one-frame window between currentQuestion updating
// and shuffledOptions updating (via useEffect) allowed a tap to pass a stale
// option string to handleAnswer. Fix: shuffledOptions is now a useMemo
// derived from currentQuestion — the new options are available in the same
// render that shows the new prompt. This test simulates advancing to question
// 2 and immediately tapping; it asserts the recorded answerGiven is one of
// the NEW question's options, not the previous question's options.
describe('QuizPlayScreen — shuffledOptions derived synchronously (BUG-STALE-OPTIONS)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAnswer.mockResolvedValue({ correct: false, correctAnswer: 'Cat' });
  });

  it('after question advance, tapping option-0 records an option from the NEW question', async () => {
    const q1Options = ['Dog', 'Fish', 'Horse', 'Rabbit'];
    const q2Options = ['Cat', 'Parrot', 'Hamster', 'Turtle'];
    mockRound = {
      id: 'round-stale',
      activityType: 'vocabulary' as const,
      theme: 'Animals',
      total: 2,
      questions: [
        {
          type: 'vocabulary' as const,
          term: 'der Hund',
          options: q1Options,
          cefrLevel: 'A1',
          isLibraryItem: false,
          freeTextEligible: false,
        },
        {
          type: 'vocabulary' as const,
          term: 'die Katze',
          options: q2Options,
          cefrLevel: 'A1',
          isLibraryItem: false,
          freeTextEligible: false,
        },
      ],
    };

    // First answer on Q1 so the "continue" gate opens
    mockCheckAnswer.mockResolvedValueOnce({ correct: true });
    render(<QuizPlayScreen />);

    // Tap option-0 on Q1 and wait for the result to commit
    fireEvent.press(screen.getByTestId('quiz-option-0'));
    await waitFor(() => screen.getByText('Correct'));

    // Advance to Q2 via the body continue Pressable (after 250ms guard)
    await new Promise((r) => setTimeout(r, 280));
    fireEvent.press(screen.getByTestId('quiz-play-body'));

    // Now immediately tap option-0; with useMemo, shuffledOptions is already
    // bound to Q2's options in the same render that shows Q2.
    mockCheckAnswer.mockResolvedValueOnce({
      correct: false,
      correctAnswer: 'Cat',
    });
    fireEvent.press(screen.getByTestId('quiz-option-0'));

    await waitFor(() => {
      // The second call to checkAnswer must use an option from Q2, not Q1.
      const calls = mockCheckAnswer.mock.calls;
      const secondCall = calls[1];
      expect(secondCall).not.toBeUndefined();
      const answerGiven = secondCall[0].answerGiven;
      expect(q2Options).toContain(answerGiven);
      expect(q1Options).not.toContain(answerGiven);
    });
  });
});

// [BUG-929] Tap-to-continue must reset answerState SYNCHRONOUSLY in the same
// React batch as setCurrentIndex. Without the synchronous reset, the first
// commit of Q+1 still carried answerState='correct' (or 'wrong') from Q+0,
// so every option Pressable rendered with `disabled={answerState !==
// 'unanswered'}` === true. The reset only ran in the [currentIndex,
// currentQuestion] useEffect AFTER that commit, leaving a window between
// paint and the next render in which the user's first option tap landed on
// a disabled Pressable and was silently dropped. The reported symptom: no
// red/green animation, no /quiz/rounds/:id/check, and a second tap on the
// same option then registered correctly.
//
// jsdom + RTL's act() flushes useEffects between fireEvents, so the original
// race does not reproduce verbatim in unit tests. These tests instead pin
// the *contract* the fix establishes:
//   1. After advancing to Q+1, option Pressables expose
//      accessibilityState.disabled === false in the rendered tree.
//   2. A single fireEvent.press on option-0 of Q+1 records exactly one
//      checkAnswer call against Q+1's options (no silent drop, no re-tap).
// If the synchronous reset is ever reverted, web users will see the bug
// again; if anyone removes the option's disabled binding from answerState,
// (1) still locks down the externally visible state.
describe('QuizPlayScreen — tap-to-continue synchronous reset (BUG-929)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes option Pressables as enabled on the first render of Q+1', async () => {
    const q1Options = ['Bratislava', 'Prague', 'Warsaw', 'Budapest'];
    const q2Options = ['Paris', 'Lyon', 'Madrid', 'Rome'];
    mockRound = {
      id: 'round-929-a',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 2,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: q1Options,
          isLibraryItem: true,
          freeTextEligible: false,
        },
        {
          type: 'capitals' as const,
          country: 'France',
          options: q2Options,
          isLibraryItem: true,
          freeTextEligible: false,
        },
      ],
    };

    mockCheckAnswer.mockResolvedValueOnce({ correct: true });
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));
    await waitFor(() => screen.getByText('Correct'));

    // Wait past the 250ms continue gate, then tap the body to advance.
    await new Promise((r) => setTimeout(r, 280));
    fireEvent.press(screen.getByTestId('quiz-play-body'));

    // Q2 is now showing. Every option Pressable must report disabled === false
    // on this render. Before the fix, all four were disabled until the next
    // render flushed the useEffect's setAnswerState('unanswered').
    for (let i = 0; i < q2Options.length; i++) {
      const opt = screen.getByTestId(`quiz-option-${i}`);
      expect(opt.props.accessibilityState).toMatchObject({ disabled: false });
    }
  });

  it('records a single option-tap on Q+1 immediately after continue [break test]', async () => {
    const q1Options = ['Bratislava', 'Prague', 'Warsaw', 'Budapest'];
    const q2Options = ['Paris', 'Lyon', 'Madrid', 'Rome'];
    mockRound = {
      id: 'round-929-b',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 2,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: q1Options,
          isLibraryItem: true,
          freeTextEligible: false,
        },
        {
          type: 'capitals' as const,
          country: 'France',
          options: q2Options,
          isLibraryItem: true,
          freeTextEligible: false,
        },
      ],
    };

    mockCheckAnswer.mockResolvedValueOnce({ correct: true }); // Q1 correct
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));
    await waitFor(() => screen.getByText('Correct'));

    await new Promise((r) => setTimeout(r, 280));
    fireEvent.press(screen.getByTestId('quiz-play-body'));

    // Single tap on Q+1's option-0 must record. No re-tap allowed.
    mockCheckAnswer.mockResolvedValueOnce({
      correct: false,
      correctAnswer: 'Paris',
    });
    fireEvent.press(screen.getByTestId('quiz-option-0'));

    await waitFor(() => {
      expect(mockCheckAnswer).toHaveBeenCalledTimes(2);
    });

    const secondCall = mockCheckAnswer.mock.calls[1]?.[0];
    expect(secondCall).toMatchObject({
      roundId: 'round-929-b',
      questionIndex: 1,
      answerGiven: q2Options[0],
      answerMode: 'multiple_choice',
    });
  });

  it('does not surface the previous question banner on Q+1 first render', async () => {
    // Symptom guard: feedback renders 'Correct' / 'Not quite' / ready-copy
    // to continue' only when answerState is correct/wrong. If reset is not
    // synchronous, these banners briefly bleed into Q+1.
    const q1Options = ['A', 'B', 'C', 'D'];
    const q2Options = ['W', 'X', 'Y', 'Z'];
    mockRound = {
      id: 'round-929-c',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 2,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: q1Options,
          isLibraryItem: true,
          freeTextEligible: false,
        },
        {
          type: 'capitals' as const,
          country: 'France',
          options: q2Options,
          isLibraryItem: true,
          freeTextEligible: false,
        },
      ],
    };

    mockCheckAnswer.mockResolvedValueOnce({ correct: true });
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));
    await waitFor(() => screen.getByText('Correct'));

    await new Promise((r) => setTimeout(r, 280));
    fireEvent.press(screen.getByTestId('quiz-play-body'));

    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByText('Not quite')).toBeNull();
    expect(screen.queryByText('Tap anywhere to continue')).toBeNull();
  });

  // [BUG-929] freeTextAnswer stale-text break test: after advancing from a
  // free-text question, the next free-text input must render empty — not with
  // the previous question's typed text. The [currentIndex, currentQuestion]
  // useEffect also resets it, but only AFTER the commit, leaving a one-frame
  // window. The synchronous reset in handleContinue closes that window.
  it('free-text input renders empty on Q+1 after typing an answer on Q+0', async () => {
    mockRound = {
      id: 'round-929-ft',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 2,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
          isLibraryItem: true,
          freeTextEligible: true,
        },
        {
          type: 'capitals' as const,
          country: 'France',
          options: ['Paris', 'Lyon', 'Madrid', 'Rome'],
          isLibraryItem: true,
          freeTextEligible: true,
        },
      ],
    };

    mockCheckAnswer.mockResolvedValueOnce({ correct: true });
    render(<QuizPlayScreen />);

    // Type an answer in Q1's free-text field and submit it.
    fireEvent.changeText(
      screen.getByTestId('quiz-free-text-field'),
      'Bratislava',
    );
    fireEvent.press(screen.getByTestId('quiz-free-text-submit'));

    await waitFor(() => screen.getByText('Correct'));

    // Advance to Q2.
    await new Promise((r) => setTimeout(r, 280));
    fireEvent.press(screen.getByTestId('quiz-play-body'));

    // Q2 is now showing. The free-text field must be EMPTY — not 'Bratislava'.
    const field = screen.getByTestId('quiz-free-text-field');
    expect(field.props.value).toBe('');
  });

  // [CR-PR129-M4] Per-question timer must reset in the same batch as
  // answerState so the first render of Q+1 shows 0s, not the stale elapsed
  // time from Q+0. This is a break test: if setElapsedMs(0) /
  // questionStartTimeRef reset are removed from handleContinue, the elapsed
  // display will briefly show a non-zero value on Q+1's first render.
  it('elapsed timer reads 0s on the first render of Q+1 after continue [CR-PR129-M4]', async () => {
    const q1Options = ['Bratislava', 'Prague', 'Warsaw', 'Budapest'];
    const q2Options = ['Paris', 'Lyon', 'Madrid', 'Rome'];
    mockRound = {
      id: 'round-929-timer',
      activityType: 'capitals' as const,
      theme: 'Europe',
      total: 2,
      questions: [
        {
          type: 'capitals' as const,
          country: 'Slovakia',
          options: q1Options,
          isLibraryItem: true,
          freeTextEligible: false,
        },
        {
          type: 'capitals' as const,
          country: 'France',
          options: q2Options,
          isLibraryItem: true,
          freeTextEligible: false,
        },
      ],
    };

    mockCheckAnswer.mockResolvedValueOnce({ correct: true });
    render(<QuizPlayScreen />);

    // Answer Q1 correctly to reach the 'correct' answerState.
    fireEvent.press(screen.getByTestId('quiz-option-0'));
    await waitFor(() => screen.getByText('Correct'));

    // Elapsed time ticks — but we don't need to wait for an actual second
    // since the timer only ticks on the setInterval (1000 ms). The critical
    // check is that advancing resets the display immediately to 0s.
    await new Promise((r) => setTimeout(r, 280));
    fireEvent.press(screen.getByTestId('quiz-play-body'));

    // Q2's first render — elapsed display must show 0s, not stale time.
    // The Text renders as {Math.floor(elapsedMs / 1000)}s → children is [0, "s"].
    // We assert via accessibilityLabel which interpolates both values cleanly.
    const elapsedEl = screen.getByTestId('quiz-play-elapsed');
    expect(elapsedEl.props.accessibilityLabel).toBe('Elapsed time: 0 seconds');
    expect(elapsedEl.props.children).toBe('0:00');
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
    screen.getByTestId('quiz-play-no-round');
    screen.getByTestId('quiz-play-no-round-retry');
    screen.getByTestId('quiz-play-no-round-home');
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
        "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
      );
    });
    expect(mockSentryCapture).toHaveBeenCalledTimes(1);
  });

  it('[BREAK / BUG-799] handles non-Error checkAnswer rejection', async () => {
    mockCheckAnswer.mockRejectedValueOnce({ code: 'QUOTA_EXCEEDED' });

    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));

    await waitFor(() => {
      // Real formatApiError returns the generic fallback for non-Error shapes.
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        "Couldn't check your answer",
        'Something unexpected happened. Please try again.',
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
    await waitFor(() => screen.getByTestId('quiz-play-screen'));
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
      expect.objectContaining({ message: 'Round save failed: 500' }),
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
    await waitFor(() => screen.getByTestId('quiz-play-screen'));
    await new Promise((r) => setTimeout(r, 280));

    // [BUG-892] Press the Quit button. This must open the styled in-app
    // confirmation modal (NOT call platformAlert/window.confirm) and must
    // NOT submit the round (which would mean handleContinue also fired).
    fireEvent.press(screen.getByTestId('quiz-play-quit'));
    screen.getByTestId('quiz-quit-confirm');
    screen.getByTestId('quiz-quit-save');
    screen.getByText('Pause here?');
    screen.getByText(
      "You've answered part of this round. Save it now, or jump back in for one more.",
    );
    screen.getByTestId('quiz-quit-cancel');
    expect(mockPlatformAlert).not.toHaveBeenCalledWith(
      'Quit this round?',
      expect.any(String),
      expect.any(Array),
    );
    expect(mockCompleteRoundMutate).toHaveBeenCalledTimes(1);
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

    screen.getByTestId('quiz-quit-confirm');
    screen.getByTestId('quiz-quit-cancel');
    expect(screen.queryByTestId('quiz-quit-save')).toBeNull();
    screen.getByText('Leave this quiz?');
    screen.getByText('No answers yet, so there is nothing to save.');
    // Critically: platformAlert (which would hit window.confirm on web) is NOT
    // invoked for the quit-confirm flow.
    expect(mockPlatformAlert).not.toHaveBeenCalledWith(
      'Quit this round?',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('[BUG-892] Cancelling the quit modal keeps the user on the quiz', () => {
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-play-quit'));
    fireEvent.press(screen.getByTestId('quiz-quit-cancel'));

    // Cancelling calls setQuitConfirmVisible(false). On iOS, RN Modal keeps
    // children mounted during the close animation so quiz-quit-confirm stays
    // in the tree, but the Modal host reports visible=false. Verify via the
    // backdrop's ancestor (RCTModalHostView) or UNSAFE_queryByProps.
    expect(
      screen.UNSAFE_queryByProps({
        visible: false,
        animationType: 'fade',
        transparent: true,
      }),
    ).not.toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('[BUG-892] Confirming the quit modal replaces to /quiz', () => {
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-play-quit'));
    fireEvent.press(screen.getByTestId('quiz-quit-confirm'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('confirming quit replaces to Practice when launched from Practice', () => {
    mockReturnTo = 'practice';
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-play-quit'));
    fireEvent.press(screen.getByTestId('quiz-quit-confirm'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
  });

  it('saves answered progress from the quit modal', async () => {
    mockRound = {
      id: 'round-err',
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
    mockCheckAnswer.mockResolvedValueOnce({ correct: true });
    render(<QuizPlayScreen />);

    fireEvent.press(screen.getByTestId('quiz-option-0'));
    await waitFor(() => screen.getByText('Correct'));

    fireEvent.press(screen.getByTestId('quiz-play-quit'));
    screen.getByText('Pause here?');

    fireEvent.press(screen.getByTestId('quiz-quit-save'));

    expect(mockCompleteRoundMutate).toHaveBeenCalledWith(
      {
        roundId: 'round-err',
        results: [
          expect.objectContaining({
            questionIndex: 0,
            correct: true,
            answerGiven: 'Bratislava',
          }),
        ],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });
});
