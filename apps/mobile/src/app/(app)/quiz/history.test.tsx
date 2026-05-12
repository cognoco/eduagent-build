import { fireEvent, render, screen } from '@testing-library/react-native';
import QuizHistoryScreen from './history';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: { returnTo?: string } = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'quiz.history.rowLabel') {
        return `${params?.label} ${params?.theme}`;
      }
      return key;
    },
  }),
}));

jest.mock(
  '../../../i18n' /* gc1-allow: i18next init requires native setup not available in unit env */,
  () => ({
    i18next: {
      t: (key: string) => key,
    },
  }),
);

const mockUseRecentRounds = jest.fn();

jest.mock(
  '../../../hooks/use-quiz' /* gc1-allow: hook requires QueryClientProvider; not runnable in unit env */,
  () => ({
    useRecentRounds: () => mockUseRecentRounds(),
  }),
);

jest.mock(
  '../../../lib/theme' /* gc1-allow: useThemeColors requires ThemeContext provider; not runnable in unit env */,
  () => ({
    useThemeColors: () => ({
      textPrimary: '#111111',
    }),
  }),
);

jest.mock(
  '../../../lib/use-screen-top-inset' /* gc1-allow: uses native SafeAreaContext; not runnable in unit env */,
  () => ({
    useScreenTopInset: () => ({ top: 24 }),
  }),
);

jest.mock(
  '../../../lib/extract-vocabulary-language' /* gc1-allow: pure utility stub for unit isolation */,
  () => ({
    extractLanguageFromTheme: () => null,
  }),
);

const recentRounds = [
  {
    id: 'round-guess',
    activityType: 'guess_who',
    theme: 'Famous Scientists and Innovators',
    score: 4,
    total: 4,
    xpEarned: 110,
    completedAt: '2026-04-29T12:00:00.000Z',
  },
];

describe('QuizHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockUseRecentRounds.mockReturnValue({
      data: recentRounds,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('returns to the quiz index by default', () => {
    render(<QuizHistoryScreen />);

    fireEvent.press(screen.getByTestId('quiz-history-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('returns to Practice when opened from the Practice hub', () => {
    mockSearchParams = { returnTo: 'practice' };
    render(<QuizHistoryScreen />);

    fireEvent.press(screen.getByTestId('quiz-history-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
  });

  it('keeps the Practice return target when opening a history round', () => {
    mockSearchParams = { returnTo: 'practice' };
    render(<QuizHistoryScreen />);

    fireEvent.press(screen.getByTestId('quiz-history-row-round-guess'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/[roundId]',
      params: { roundId: 'round-guess', returnTo: 'practice' },
    });
  });
});
