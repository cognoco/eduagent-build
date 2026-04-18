import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockUseReviewSummary = jest.fn();
const mockUseQuizStats = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#ffffff',
    primary: '#00b4d8',
  }),
}));

jest.mock('../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../hooks/use-progress', () => ({
  useReviewSummary: () => mockUseReviewSummary(),
}));

jest.mock('../../hooks/use-quiz', () => ({
  useQuizStats: () => mockUseQuizStats(),
}));

const PracticeScreen = require('./practice').default;

describe('PracticeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-04-18T12:00:00.000Z').getTime());
    mockUseReviewSummary.mockReturnValue({
      data: {
        totalOverdue: 2,
        nextReviewTopic: {
          topicId: 'topic-1',
          subjectId: 'subject-1',
          subjectName: 'Math',
          topicTitle: 'Algebra',
        },
        nextUpcomingReviewAt: null,
      },
      isError: false,
    });
    mockUseQuizStats.mockReturnValue({ data: [], isError: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes the back button to home', () => {
    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/home'
    );
  });

  it('navigates to the next overdue review topic when available', () => {
    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-review'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {
        topicId: 'topic-1',
        subjectId: 'subject-1',
        topicName: 'Algebra',
      },
    });
  });

  it('shows the empty-state block without a tap when nothing is overdue', () => {
    mockUseReviewSummary.mockReturnValue({
      data: {
        totalOverdue: 0,
        nextReviewTopic: null,
        nextUpcomingReviewAt: '2026-04-18T15:00:00.000Z',
      },
      isError: false,
    });

    render(<PracticeScreen />);

    expect(screen.getByTestId('review-empty-state')).toBeTruthy();
    expect(screen.getByText('Nothing to review right now')).toBeTruthy();
    expect(screen.getByText('Your next review is in 3 hours')).toBeTruthy();
  });

  it('lets the learner browse topics from the empty state', () => {
    mockUseReviewSummary.mockReturnValue({
      data: {
        totalOverdue: 0,
        nextReviewTopic: null,
        nextUpcomingReviewAt: null,
      },
      isError: false,
    });

    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('review-empty-browse'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/library');
  });
});
