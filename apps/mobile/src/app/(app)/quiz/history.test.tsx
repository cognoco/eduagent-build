import { fireEvent, render, screen } from '@testing-library/react-native';
import QuizHistoryScreen from './history';

const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../../lib/navigation' /* gc1-allow: unit test boundary */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

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
    mockUseRecentRounds.mockReturnValue({
      data: recentRounds,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('navigates back to quiz index via goBackOrReplace', () => {
    render(<QuizHistoryScreen />);
    fireEvent.press(screen.getByTestId('quiz-history-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush }),
      '/(app)/quiz',
    );
  });

  it('navigates to round detail on row press', () => {
    render(<QuizHistoryScreen />);
    fireEvent.press(screen.getByTestId('quiz-history-row-round-guess'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/quiz/round-guess');
  });

  it('shows loading state', () => {
    mockUseRecentRounds.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });
    render(<QuizHistoryScreen />);
    expect(screen.getByTestId('quiz-history-loading')).toBeTruthy();
  });

  it('shows empty state with try-quiz CTA', () => {
    mockUseRecentRounds.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    render(<QuizHistoryScreen />);
    expect(screen.getByTestId('quiz-history-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('quiz-history-try-quiz'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('shows error state with retry and go-back actions', () => {
    const refetch = jest.fn();
    mockUseRecentRounds.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<QuizHistoryScreen />);
    expect(screen.getByTestId('quiz-history-error')).toBeTruthy();

    fireEvent.press(screen.getByTestId('quiz-history-retry'));
    expect(refetch).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('quiz-history-go-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush }),
      '/(app)/quiz',
    );
  });
});
