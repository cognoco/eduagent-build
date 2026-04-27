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
jest.mock('../../../hooks/use-quiz', () => ({
  useQuizStats: () => ({
    data: [],
    isError: false,
    refetch: mockRefetchStats,
  }),
}));

const mockRefetchSubjects = jest.fn();
jest.mock('../../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: [],
    isError: false,
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
});
