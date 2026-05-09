import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockUseReviewSummary = jest.fn();
const mockUseQuizStats = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#ffffff',
    primary: '#00b4d8',
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  homeHrefForReturnTo: (returnTo: unknown) =>
    returnTo === 'learner-home' ? '/(app)/home' : '/(app)/home',
}));

jest.mock('../../../hooks/use-progress', () => ({
  useReviewSummary: () => mockUseReviewSummary(),
}));

jest.mock('../../../hooks/use-quiz', () => ({
  useQuizStats: () => mockUseQuizStats(),
}));

jest.mock('../../../hooks/use-assessments', () => ({
  useAssessmentEligibleTopics: () => ({ data: [], isError: false }),
}));

const PracticeScreen = require('./index').default;

describe('PracticeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
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

  it('frames the hub as a test-yourself surface', () => {
    render(<PracticeScreen />);

    screen.getByText('Test yourself');
    screen.getByText('Review what is fading, then check yourself.');
    screen.getByText('Refresh topics');
    screen.getByText('Quiz yourself');
    screen.getByText('Prove I know this');
  });

  it('routes the back button to home', () => {
    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/home',
    );
  });

  it('routes the back button to the learner home view when launched from learner home', () => {
    mockSearchParams = { returnTo: 'learner-home' };

    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/home',
    );
  });

  it('navigates to the relearn picker when review topics are available', () => {
    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-review'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {},
    });
  });

  it('keeps the learner home return target when opening relearn from practice', () => {
    mockSearchParams = { returnTo: 'learner-home' };

    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-review'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {
        returnTo: 'learner-home',
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

    screen.getByTestId('review-empty-state');
    screen.getByText('Nothing to review right now');
    screen.getByText('Your next review is in 3 hours');
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

  it('shows quiz XP even before any XP is earned', () => {
    render(<PracticeScreen />);

    screen.getByText('Test yourself with multiple choice questions · 0 XP');
  });

  it('places recitation and dictation after the main review and test actions', () => {
    const view = render(<PracticeScreen />);

    // node is typed as ReactTestInstance (from react-test-renderer which ships no
    // .d.ts in v19), so the predicate parameter is effectively `any`. Explicit
    // structural annotation silences noImplicitAny without using `any` directly.
    type RNTestNode = { props?: Record<string, unknown> };
    const cardOrder = view.UNSAFE_root.findAll(
      (node: RNTestNode) =>
        typeof node.props?.testID === 'string' &&
        (node.props.testID as string).startsWith('practice-') &&
        !(node.props.testID as string).includes('-icon') &&
        !(node.props.testID as string).includes('-chevron'),
    )
      .map((node: RNTestNode) => node.props?.testID as string)
      .filter((testID: string) =>
        [
          'practice-review',
          'practice-quiz',
          'practice-assessment',
          'practice-recitation',
          'practice-dictation',
          'practice-quiz-history',
        ].includes(testID),
      );
    const uniqueCardOrder = [...new Set(cardOrder)];

    expect(uniqueCardOrder).toEqual([
      'practice-review',
      'practice-quiz',
      'practice-assessment',
      'practice-recitation',
      'practice-dictation',
      'practice-quiz-history',
    ]);
  });

  it('renders quiz history with a quieter visual treatment', () => {
    render(<PracticeScreen />);

    const quizHistoryCard = screen.getByTestId('practice-quiz-history');
    expect(quizHistoryCard.props.className).toContain(
      'bg-surface border-border',
    );
  });
});
