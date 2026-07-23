import {
  render,
  screen,
  fireEvent,
  within,
} from '@testing-library/react-native';
import QuizRoundDetailScreen from './[roundId]';
import type { CompletedRoundDetailResponse } from '@eduagent/schemas';

const mockReplace = jest.fn();
let mockSearchParams: Record<string, string> = { roundId: 'round-1' };

// i18n mock — returns English values for quiz.round namespace so tests can
// assert on the same English strings as before the migration.
// Note: jest.mock factories are hoisted and must be self-contained.
jest.mock('react-i18next', () => {
  const TRANSLATIONS: Record<string, string> = {
    'quiz.round.goBack': 'Go back',
    'quiz.round.couldNotLoad': 'Could not load round details',
    'quiz.round.correct': 'Correct',
    'quiz.round.wrong': 'Wrong',
    'quiz.round.capitalQuestion': 'Capital of {{country}}',
    'quiz.round.vocabularyQuestion': 'Translate: {{term}}',
    'quiz.round.guessWhoFallback': 'Guess Who',
    'quiz.round.yourAnswer': 'Your answer: {{answer}}',
    'quiz.round.correctAnswer': 'Correct answer: {{answer}}',
    'quiz.round.notNeeded': '(not needed)',
    'quiz.round.cluesHeader': 'Clues',
    'quiz.round.didYouKnow': 'Did you know?',
    'quiz.round.expandedLabel': 'Q{{num}}, {{correctness}}, tap to hide hints',
    'quiz.round.collapsedLabel': 'Q{{num}}, {{correctness}}, tap to see hints',
    'quiz.round.questionLabel': 'Q{{num}}',
    'common.tryAgain': 'Try Again',
    'common.goBack': 'Go Back',
  };
  const t = (key: string, opts?: Record<string, unknown>) => {
    const template = TRANSLATIONS[key] ?? key;
    if (!opts) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
      String(opts[k] ?? `{{${k}}}`),
    );
  };
  return { useTranslation: () => ({ t }) };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseRoundDetail = jest.fn();
jest.mock(
  '../../../hooks/use-quiz' /* gc1-allow: native-boundary; use-quiz transitively loads native-only API/profile modules in JSDOM */,
  () => ({
    useRoundDetail: (...args: unknown[]) => mockUseRoundDetail(...args),
  }),
);

function buildGuessWhoRound(): CompletedRoundDetailResponse {
  return {
    id: '00000000-0000-4000-8000-000000000281',
    activityType: 'guess_who',
    activityLabel: 'Guess Who',
    theme: 'Pioneers in Technology',
    status: 'completed',
    score: 1,
    total: 2,
    xpEarned: 10,
    celebrationTier: 'great',
    questions: [
      {
        type: 'guess_who',
        clues: [
          'Born in Croatia in 1856.',
          'Worked briefly for Edison.',
          'Pioneered alternating current.',
          'A unit of magnetic flux density bears his name.',
          'His first name is Nikola.',
        ],
        mcFallbackOptions: ['Tesla', 'Edison', 'Bell', 'Eastman'],
        funFact: 'He could speak eight languages.',
        isLibraryItem: false,
        correctAnswer: 'Nikola Tesla',
        acceptedAliases: ['Tesla'],
      },
      {
        type: 'guess_who',
        clues: ['c1', 'c2', 'c3', 'c4', 'c5'],
        mcFallbackOptions: ['A', 'B', 'C', 'D'],
        funFact: 'Trivia.',
        isLibraryItem: false,
        correctAnswer: 'George Eastman',
        acceptedAliases: [],
      },
    ],
    results: [
      {
        questionIndex: 0,
        correct: true,
        correctAnswer: 'Nikola Tesla',
        answerGiven: 'Nikola Tesla',
        cluesUsed: 3,
      },
      {
        questionIndex: 1,
        correct: true,
        correctAnswer: 'George Eastman',
        answerGiven: 'George Eastman',
        cluesUsed: 5,
      },
    ],
  };
}

function buildActiveRoundWithoutResults() {
  return {
    id: '00000000-0000-4000-8000-000000000282',
    activityType: 'guess_who',
    activityLabel: 'Guess Who',
    theme: 'Active Round',
    questions: [
      {
        type: 'guess_who',
        clues: ['c1', 'c2', 'c3', 'c4', 'c5'],
        mcFallbackOptions: ['A', 'B', 'C', 'D'],
        funFact: 'Trivia.',
        isLibraryItem: false,
      },
    ],
    total: 1,
  };
}

beforeEach(() => {
  mockReplace.mockReset();
  mockSearchParams = { roundId: 'round-1' };
});

describe('QuizRoundDetailScreen — route-aware Back', () => {
  beforeEach(() => {
    mockUseRoundDetail.mockReset();
  });

  it('[WI-1864] restores Quiz History with its upstream Practice contract', () => {
    mockSearchParams = {
      roundId: 'round-1',
      historyReturnTo: 'practice',
      historyPracticeReturnTo: 'journal',
    };
    mockUseRoundDetail.mockReturnValue({
      data: buildGuessWhoRound(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);
    fireEvent.press(screen.getByTestId('round-detail-back-btn'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/history',
      params: { returnTo: 'practice', practiceReturnTo: 'journal' },
    });
  });
});

describe('QuizRoundDetailScreen — hint reveal', () => {
  beforeEach(() => {
    mockUseRoundDetail.mockReset();
  });

  it('starts collapsed and reveals clues + fun fact when the question is tapped', () => {
    mockUseRoundDetail.mockReturnValue({
      data: buildGuessWhoRound(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);

    expect(screen.queryByTestId('round-detail-question-0-hints')).toBeNull();

    fireEvent.press(screen.getByTestId('round-detail-question-0'));

    screen.getByTestId('round-detail-question-0-hints');
    // After [BUG-932] fix the first clue also appears as the collapsed-row
    // prompt, so the same text now exists twice (once in the row prompt,
    // once in the expanded clues list). Both occurrences are intentional.
    expect(
      screen.getAllByText('Born in Croatia in 1856.').length,
    ).toBeGreaterThanOrEqual(1);
    screen.getByText('He could speak eight languages.');
  });

  it('marks clues beyond cluesUsed as "not needed"', () => {
    mockUseRoundDetail.mockReturnValue({
      data: buildGuessWhoRound(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);
    fireEvent.press(screen.getByTestId('round-detail-question-0'));

    // cluesUsed = 3 → indices 0,1,2 shown, 3 and 4 marked "not needed"
    screen.getByTestId('round-detail-question-0-clue-3');
    expect(screen.getAllByText(/not needed/)).toHaveLength(2);
  });

  it('toggles back to collapsed on a second tap', () => {
    mockUseRoundDetail.mockReturnValue({
      data: buildGuessWhoRound(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);

    const card = screen.getByTestId('round-detail-question-0');
    fireEvent.press(card);
    screen.getByTestId('round-detail-question-0-hints');
    fireEvent.press(card);
    expect(screen.queryByTestId('round-detail-question-0-hints')).toBeNull();
  });

  // [BUG-932] The collapsed Guess Who row used to show the literal string
  // "Guess Who" — the activity name repeated for every question, with no
  // way to tell rows apart without expanding each one. The fix renders the
  // first clue (truncated) so each row carries a unique prompt.
  describe('collapsed Guess Who row prompt [BUG-932]', () => {
    it('shows the first clue as the row prompt instead of the literal "Guess Who"', () => {
      mockUseRoundDetail.mockReturnValue({
        data: buildGuessWhoRound(),
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<QuizRoundDetailScreen />);

      // Collapsed state: Q0 row shows first clue. The expanded clue list
      // is gated on tap, so before any press the clue appears exactly once
      // (in the row prompt) — no duplication possible.
      screen.getByText('Born in Croatia in 1856.');
      // The hints panel is NOT rendered in collapsed state — proves the
      // clue we're seeing is the row prompt, not the expanded list.
      expect(screen.queryByTestId('round-detail-question-0-hints')).toBeNull();
    });

    it('truncates clues longer than 60 characters with an ellipsis', () => {
      const longClue =
        'This is a very long first clue that definitely exceeds sixty characters in total length.';
      const data = buildGuessWhoRound();
      const q0 = data.questions[0];
      if (!q0) throw new Error('fixture invariant: questions[0] exists');
      if (q0.type !== 'guess_who')
        throw new Error('fixture invariant: q0 is a guess_who question');
      q0.clues = [longClue, 'short2'];
      mockUseRoundDetail.mockReturnValue({
        data,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<QuizRoundDetailScreen />);

      // Truncated form (60 chars + ellipsis) IS in the row prompt.
      screen.getByText(`${longClue.slice(0, 60)}…`);
      // Full untruncated form is NOT visible in the collapsed view.
      expect(screen.queryByText(longClue)).toBeNull();
    });

    it('falls back to "Guess Who" when clues array is empty', () => {
      const data = buildGuessWhoRound();
      const q0 = data.questions[0];
      if (!q0) throw new Error('fixture invariant: questions[0] exists');
      if (q0.type !== 'guess_who')
        throw new Error('fixture invariant: q0 is a guess_who question');
      q0.clues = [];
      mockUseRoundDetail.mockReturnValue({
        data,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<QuizRoundDetailScreen />);

      // The row prompt falls back to the activity name when no clues exist.
      // The header renders the activity label combined with score
      // ("Guess Who · 1/2"), so its text node won't match the exact string;
      // the only standalone "Guess Who" Text in the tree is the Q0 row
      // prompt fallback.
      screen.getByText('Guess Who');
    });
  });
});

describe('QuizRoundDetailScreen — result lookup with non-index-aligned results', () => {
  beforeEach(() => {
    mockUseRoundDetail.mockReset();
  });

  /**
   * Regression guard for the O(n²) → useMemo Map refactor.
   *
   * The server is free to return results in any order (e.g. wrong answers
   * first, or sparse). A naive index-based lookup (`results[i]`) would read
   * the wrong result for each question. The component must use
   * `result.questionIndex` as the join key — exactly as the original find()
   * did. This test proves the Map lookup uses the same key.
   *
   * Setup: 3 questions whose results arrive in REVERSE order
   * (questionIndex 2, 1, 0), so results[0] corresponds to question index 2,
   * etc. A naive `results[i]` would show "Wrong / Wrong / Correct" instead of
   * the correct "Correct / Correct / Wrong".
   */
  it('matches each question to its own result when results are not in index order', () => {
    const data: CompletedRoundDetailResponse = {
      id: '00000000-0000-4000-8000-000000000290',
      activityType: 'capitals',
      activityLabel: 'Capitals',
      theme: 'Geography',
      status: 'completed',
      score: 2,
      total: 3,
      xpEarned: 20,
      celebrationTier: 'nice',
      questions: [
        {
          type: 'capitals',
          country: 'France',
          options: ['Paris', 'Lyon', 'Nice', 'Bordeaux'],
          funFact: 'Paris is the City of Light.',
          isLibraryItem: false,
          correctAnswer: 'Paris',
        },
        {
          type: 'capitals',
          country: 'Germany',
          options: ['Berlin', 'Munich', 'Hamburg', 'Cologne'],
          funFact: 'Berlin was reunified in 1990.',
          isLibraryItem: false,
          correctAnswer: 'Berlin',
        },
        {
          type: 'capitals',
          country: 'Japan',
          options: ['Tokyo', 'Osaka', 'Kyoto', 'Nagoya'],
          funFact: 'Tokyo is the largest metropolitan area in the world.',
          isLibraryItem: false,
          correctAnswer: 'Tokyo',
        },
      ],
      // Results arrive in REVERSE order — index 2 first, then 1, then 0.
      results: [
        {
          questionIndex: 2,
          correct: false,
          correctAnswer: 'Tokyo',
          answerGiven: 'Osaka',
        },
        {
          questionIndex: 1,
          correct: true,
          correctAnswer: 'Berlin',
          answerGiven: 'Berlin',
        },
        {
          questionIndex: 0,
          correct: true,
          correctAnswer: 'Paris',
          answerGiven: 'Paris',
        },
      ],
    };

    mockUseRoundDetail.mockReturnValue({
      data,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);

    // Q0 card: France (array position 0) → result for questionIndex 0 → correct=true,
    // answerGiven='Paris'. A naive results[i] would give questionIndex 2 (Osaka, wrong).
    const q0Card = screen.getByTestId('round-detail-question-0');
    within(q0Card).getByText('Your answer: Paris'); // proves result matched qi=0
    within(q0Card).getByText('Correct'); // proves correct=true

    // Q1 card: Germany → questionIndex 1 → correct=true, answerGiven='Berlin'.
    const q1Card = screen.getByTestId('round-detail-question-1');
    within(q1Card).getByText('Your answer: Berlin');
    within(q1Card).getByText('Correct');

    // Q2 card: Japan → questionIndex 2 → correct=false, answerGiven='Osaka'.
    // A naive results[i] would give questionIndex 0 (Paris, correct) → 'Correct'.
    const q2Card = screen.getByTestId('round-detail-question-2');
    within(q2Card).getByText('Your answer: Osaka');
    within(q2Card).getByText('Wrong');
  });
});

describe('QuizRoundDetailScreen — round-detail shape regression', () => {
  beforeEach(() => {
    mockUseRoundDetail.mockReset();
  });

  it('renders a completed round with graded results', () => {
    mockUseRoundDetail.mockReturnValue({
      data: buildGuessWhoRound(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);

    screen.getByTestId('round-detail-screen');
    screen.getByText('Pioneers in Technology');
    screen.getByText('Guess Who · 1/2');
    screen.getByTestId('round-detail-question-0');
    screen.getByText('Correct answer: Nikola Tesla');
  });

  it('renders a completed round with an empty results array without crashing', () => {
    const data = { ...buildGuessWhoRound(), score: 0, results: [] };
    mockUseRoundDetail.mockReturnValue({
      data,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    expect(() => render(<QuizRoundDetailScreen />)).not.toThrow();
    screen.getByTestId('round-detail-screen');
    screen.getByTestId('round-detail-question-0');
  });

  it('renders the error fallback for an active round response without results instead of throwing', () => {
    mockUseRoundDetail.mockReturnValue({
      data: buildActiveRoundWithoutResults(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    expect(() => render(<QuizRoundDetailScreen />)).not.toThrow();
    screen.getByTestId('round-detail-error');
    expect(screen.queryByTestId('round-detail-screen')).toBeNull();
  });

  it('renders the error fallback for abandoned or non-completed round details', () => {
    mockUseRoundDetail.mockReturnValue({
      data: {
        ...buildGuessWhoRound(),
        id: '00000000-0000-4000-8000-000000000283',
        status: 'abandoned',
        results: [],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    expect(() => render(<QuizRoundDetailScreen />)).not.toThrow();
    screen.getByTestId('round-detail-error');
    expect(screen.queryByTestId('round-detail-screen')).toBeNull();
  });

  it('keeps the loading timeout state wired', () => {
    mockUseRoundDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);

    screen.getByTestId('round-detail-loading');
  });

  it('keeps the hook error state wired to the existing fallback', () => {
    mockUseRoundDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);

    screen.getByTestId('round-detail-error');
    screen.getByText('Could not load round details');
  });
});
