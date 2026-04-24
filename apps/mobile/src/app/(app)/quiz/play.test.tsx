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

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: jest.fn(),
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
    mutate: jest.fn(),
  }),
  usePrefetchRound: () => ({
    mutate: mockPrefetchMutate,
  }),
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
