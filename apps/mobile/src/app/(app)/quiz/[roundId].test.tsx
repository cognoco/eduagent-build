import { render, screen, fireEvent } from '@testing-library/react-native';
import QuizRoundDetailScreen from './[roundId]';

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
  useLocalSearchParams: () => ({ roundId: 'round-1' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseRoundDetail = jest.fn();
jest.mock('../../../hooks/use-quiz', () => ({
  useRoundDetail: (...args: unknown[]) => mockUseRoundDetail(...args),
}));

function buildGuessWhoRound() {
  return {
    id: 'round-1',
    activityType: 'guess_who',
    activityLabel: 'Guess Who',
    theme: 'Pioneers in Technology',
    status: 'completed',
    score: 1,
    total: 2,
    xpEarned: 10,
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
        answerGiven: 'Nikola Tesla',
        timeMs: 5000,
        cluesUsed: 3,
      },
      {
        questionIndex: 1,
        correct: true,
        answerGiven: 'George Eastman',
        timeMs: 4000,
        cluesUsed: 5,
      },
    ],
  };
}

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
