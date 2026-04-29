import { fireEvent, render, screen } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...rest }: { name: string }) => (
      <Text {...rest}>{name}</Text>
    ),
  };
});

const mockRefetchStats = jest.fn();
let mockStatsState: {
  data: Array<Record<string, unknown>> | undefined;
  isError: boolean;
} = { data: [], isError: false };
jest.mock('../../../hooks/use-quiz', () => ({
  useQuizStats: () => ({
    data: mockStatsState.data,
    isError: mockStatsState.isError,
    refetch: mockRefetchStats,
  }),
}));

const mockRefetchSubjects = jest.fn();
let mockSubjectsState: {
  data: Array<Record<string, unknown>> | undefined;
  isError: boolean;
} = { data: [], isError: false };
jest.mock('../../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: mockSubjectsState.data,
    isError: mockSubjectsState.isError,
    refetch: mockRefetchSubjects,
  }),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#2563eb',
    textPrimary: '#111827',
  }),
}));

jest.mock('./_layout', () => ({
  useQuizFlow: () => ({
    setActivityType: jest.fn(),
    setSubjectId: jest.fn(),
    setLanguageName: jest.fn(),
    setRound: jest.fn(),
    setPrefetchedRoundId: jest.fn(),
    setCompletionResult: jest.fn(),
  }),
}));

const QuizIndexScreen = require('./index').default;

describe('QuizIndexScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockCanGoBack.mockReturnValue(true);
    mockStatsState = { data: [], isError: false };
    mockSubjectsState = { data: [], isError: false };
  });

  it('returns to the learner home view when opened from learner home', () => {
    mockSearchParams = { returnTo: 'learner-home' };

    render(<QuizIndexScreen />);

    fireEvent.press(screen.getByTestId('quiz-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home?view=learner');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('falls back to practice when opened without a return target and no history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<QuizIndexScreen />);

    fireEvent.press(screen.getByTestId('quiz-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
  });

  // [BUG-752] Render coverage: empty / data / error / subject states.
  describe('[BUG-752] render states', () => {
    it('renders Capitals and Guess Who cards with default subtitles when no stats', () => {
      render(<QuizIndexScreen />);
      expect(screen.getByTestId('quiz-capitals')).toBeTruthy();
      expect(screen.getByTestId('quiz-guess-who')).toBeTruthy();
      expect(screen.getByText(/test yourself on world capitals/i)).toBeTruthy();
      expect(screen.getByText(/name the famous person/i)).toBeTruthy();
    });

    it('renders best-score subtitles when stats include bestScore', () => {
      mockStatsState = {
        data: [
          {
            activityType: 'capitals',
            bestScore: 8,
            bestTotal: 10,
            roundsPlayed: 5,
          },
          {
            activityType: 'guess_who',
            bestScore: 4,
            bestTotal: 5,
            roundsPlayed: 2,
          },
        ],
        isError: false,
      };
      render(<QuizIndexScreen />);
      expect(screen.getByText(/Best: 8\/10 · Played: 5/)).toBeTruthy();
      expect(screen.getByText(/Best: 4\/5 · Played: 2/)).toBeTruthy();
    });

    it('shows the locked Vocabulary card when there are no four_strands subjects', () => {
      render(<QuizIndexScreen />);
      expect(screen.getByTestId('quiz-vocab-locked')).toBeTruthy();
    });

    // [BUG-926] Per-language stats: stat rows now include languageCode so each
    // vocabulary card only shows stats for rounds played in that language.
    it('shows per-language stats on the matching card only (BUG-926 fix)', () => {
      mockStatsState = {
        data: [
          // Italian stat row — only the Italian card should show this.
          {
            activityType: 'vocabulary',
            languageCode: 'it',
            bestScore: 2,
            bestTotal: 6,
            roundsPlayed: 1,
          },
        ],
        isError: false,
      };
      mockSubjectsState = {
        data: [
          {
            id: 'sub-it',
            name: 'Italian',
            pedagogyMode: 'four_strands',
            languageCode: 'it',
            status: 'active',
          },
          {
            id: 'sub-es',
            name: 'Spanish',
            pedagogyMode: 'four_strands',
            languageCode: 'es',
            status: 'active',
          },
        ],
        isError: false,
      };
      render(<QuizIndexScreen />);

      expect(screen.getByTestId('quiz-vocabulary-sub-it')).toBeTruthy();
      expect(screen.getByTestId('quiz-vocabulary-sub-es')).toBeTruthy();
      // Italian card shows its specific stats.
      expect(screen.getByText(/Best: 2\/6 · Played: 1/)).toBeTruthy();
      // Spanish card has no stat row — must show neutral fallback, not the Italian stats.
      expect(
        screen.getAllByText(/Practice new words and phrases/).length
      ).toBeGreaterThanOrEqual(1);
    });

    it('shows neutral fallback on a language card with no matching stat row (BUG-926 fix)', () => {
      mockStatsState = {
        // Only Spanish stats present.
        data: [
          {
            activityType: 'vocabulary',
            languageCode: 'es',
            bestScore: 5,
            bestTotal: 6,
            roundsPlayed: 3,
          },
        ],
        isError: false,
      };
      mockSubjectsState = {
        data: [
          {
            id: 'sub-it',
            name: 'Italian',
            pedagogyMode: 'four_strands',
            languageCode: 'it',
            status: 'active',
          },
          {
            id: 'sub-es',
            name: 'Spanish',
            pedagogyMode: 'four_strands',
            languageCode: 'es',
            status: 'active',
          },
        ],
        isError: false,
      };
      render(<QuizIndexScreen />);

      // Spanish card shows its stats.
      expect(screen.getByText(/Best: 5\/6 · Played: 3/)).toBeTruthy();
      // Italian card has no stat row — neutral fallback must appear.
      expect(screen.getByText(/Practice new words and phrases/)).toBeTruthy();
      // Spanish stats must NOT bleed onto Italian card — there should be
      // exactly one "Best: 5/6" text node (on the Spanish card only).
      expect(screen.getAllByText(/Best: 5\/6 · Played: 3/).length).toBe(1);
    });

    it('renders a Vocabulary card per active four_strands language subject', () => {
      mockSubjectsState = {
        data: [
          {
            id: 'sub-fr',
            name: 'French class',
            pedagogyMode: 'four_strands',
            languageCode: 'fr',
            status: 'active',
          },
          {
            id: 'sub-archived',
            name: 'Archived Spanish',
            pedagogyMode: 'four_strands',
            languageCode: 'es',
            status: 'archived',
          },
          {
            id: 'sub-non-language',
            name: 'Maths',
            pedagogyMode: 'standard',
            languageCode: null,
            status: 'active',
          },
        ],
        isError: false,
      };
      render(<QuizIndexScreen />);
      expect(screen.getByTestId('quiz-vocabulary-sub-fr')).toBeTruthy();
      expect(screen.queryByTestId('quiz-vocabulary-sub-archived')).toBeNull();
      expect(screen.queryByTestId('quiz-vocab-locked')).toBeNull();
    });

    it('shows the error state with retry + go-back when stats fail to load', () => {
      mockStatsState = { data: undefined, isError: true };
      render(<QuizIndexScreen />);
      expect(screen.getByTestId('quiz-load-retry')).toBeTruthy();
      expect(screen.getByTestId('quiz-error-back')).toBeTruthy();
      // Activity cards must be hidden in error state.
      expect(screen.queryByTestId('quiz-capitals')).toBeNull();
      expect(screen.queryByTestId('quiz-guess-who')).toBeNull();
    });

    it('error retry button refetches both queries', () => {
      mockSubjectsState = { data: undefined, isError: true };
      render(<QuizIndexScreen />);
      fireEvent.press(screen.getByTestId('quiz-load-retry'));
      expect(mockRefetchStats).toHaveBeenCalledTimes(1);
      expect(mockRefetchSubjects).toHaveBeenCalledTimes(1);
    });
  });
});
