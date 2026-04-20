import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockSetRound = jest.fn();
const mockMutate = jest.fn();

const challengeRound = {
  id: 'round-1',
  activityType: 'capitals' as const,
  theme: 'Europe',
  total: 4,
  difficultyBump: true,
  questions: [
    {
      type: 'capitals' as const,
      country: 'Slovakia',
      options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
      funFact: 'Bratislava sits on the Danube.',
      isLibraryItem: false,
    },
  ],
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

jest.mock('../../../hooks/use-quiz', () => ({
  useGenerateRound: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
  }),
}));

jest.mock('./_layout', () => ({
  useQuizFlow: () => ({
    activityType: 'capitals',
    subjectId: null,
    setRound: mockSetRound,
  }),
}));

const { default: QuizLaunchScreen, friendlyErrorMessage } = require('./launch');

describe('friendlyErrorMessage', () => {
  it('returns friendly message for UPSTREAM_ERROR code', () => {
    const result = friendlyErrorMessage('UPSTREAM_ERROR', 'anything');
    expect(result).toBe('Something went wrong creating your quiz. Try again!');
  });

  it('returns generic message for long fallback strings (over 60 chars)', () => {
    const longMessage =
      'API error 502: {"code":"UPSTREAM_ERROR","message":"Quiz LLM returned invalid structured output"}';
    const result = friendlyErrorMessage(undefined, longMessage);
    expect(result).toBe('Something went wrong. Try again!');
  });

  it('passes through short non-technical fallback messages', () => {
    const result = friendlyErrorMessage(undefined, 'Try again later');
    expect(result).toBe('Try again later');
  });
});

describe('QuizLaunchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutate.mockImplementation(
      (
        _input: unknown,
        options?: { onSuccess?: (round: typeof challengeRound) => void }
      ) => {
        options?.onSuccess?.(challengeRound);
      }
    );
  });

  it('shows the challenge banner before entering a difficulty bump round', async () => {
    render(<QuizLaunchScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('quiz-challenge-banner')).toBeTruthy();
    });

    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('quiz-challenge-start'));

    expect(mockSetRound).toHaveBeenCalledWith(challengeRound);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz/play');
  });
});
