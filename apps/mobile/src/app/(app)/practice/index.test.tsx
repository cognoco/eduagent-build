import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockUseReviewSummary = jest.fn();
const mockUseQuizStats = jest.fn();
const mockUseAssessmentEligibleTopics = jest.fn();
const mockUseParentProxy = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush }),
    useLocalSearchParams: () => mockSearchParams,
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect">{href}</Text>
    ),
  };
});

jest.mock(
  '../../../hooks/use-parent-proxy' /* gc1-allow: grandfathered pattern, used in mentor-memory/relearn/session-summary */,
  () => ({
    useParentProxy: () => mockUseParentProxy(),
  }),
);

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
  useAssessmentEligibleTopics: () => mockUseAssessmentEligibleTopics(),
}));

const PracticeScreen = require('./index').default;

describe('PracticeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockUseParentProxy.mockReturnValue({ isParentProxy: false });
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
    mockUseAssessmentEligibleTopics.mockReturnValue({
      data: [
        {
          topicId: 'topic-1',
          subjectId: 'subject-1',
          subjectName: 'Math',
          topicTitle: 'Algebra',
        },
      ],
      isError: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('frames the hub as a test-yourself surface', () => {
    render(<PracticeScreen />);

    screen.getByText('Test yourself');
    screen.getByText('Pick a quick win. Every round helps your memory stick.');
    screen.getByText("Today's review");
    screen.getByText('Prove I know this');
    screen.getByText('Quick quiz');
    screen.getByText('Capitals');
    screen.getByText("Who's who");
    screen.getByText('Recite from memory');
    screen.getByText('Beta');
    screen.getByText('Dictation');
    screen.getByText('Quiz history');
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
    screen.getAllByText('All caught up');
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

  it('shows quiz XP in the header and quick quiz cue before any XP is earned', () => {
    render(<PracticeScreen />);

    // XP appears in both the header pill and the quiz card; target by testID
    expect(
      screen
        .getByTestId('practice-xp-header')
        .findByProps({ children: '0 XP' }),
    ).toBeTruthy();
    expect(
      screen.getByTestId('practice-quiz-xp').findByProps({ children: '0 XP' }),
    ).toBeTruthy();
    screen.getByText('Test yourself with multiple choice questions · 0 XP');
  });

  it('navigates to the assessment picker when assessment topics are available', () => {
    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-assessment'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/practice/assessment-picker');
  });

  it('routes the assessment row to library when no topics are ready', () => {
    mockUseAssessmentEligibleTopics.mockReturnValue({
      data: [],
      isError: false,
    });

    render(<PracticeScreen />);

    screen.getByText('Available after you finish a topic');
    fireEvent.press(screen.getByTestId('practice-assessment'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/library');
  });

  it('routes every quiz entry point to the quiz index', () => {
    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-quiz'));
    fireEvent.press(screen.getByTestId('practice-quiz-capitals'));
    fireEvent.press(screen.getByTestId('practice-quiz-guess-who'));

    expect(mockPush).toHaveBeenCalledTimes(3);
    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/quiz');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(app)/quiz');
    expect(mockPush).toHaveBeenNthCalledWith(3, '/(app)/quiz');
  });

  it('routes recitation, dictation, and quiz history to their flows', () => {
    render(<PracticeScreen />);

    fireEvent.press(screen.getByTestId('practice-recitation'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { mode: 'recitation' },
    });

    fireEvent.press(screen.getByTestId('practice-dictation'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/dictation');

    fireEvent.press(screen.getByTestId('practice-quiz-history'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/quiz/history');
  });

  it('shows per-option quiz cues from activity stats', () => {
    mockUseQuizStats.mockReturnValue({
      data: [
        {
          activityType: 'capitals',
          languageCode: null,
          roundsPlayed: 3,
          bestScore: 4,
          bestTotal: 5,
          totalXp: 120,
        },
        {
          activityType: 'guess_who',
          languageCode: null,
          roundsPlayed: 2,
          bestScore: null,
          bestTotal: null,
          totalXp: 80,
        },
      ],
      isError: false,
    });

    render(<PracticeScreen />);

    screen.getByText('Best 4/5');
    screen.getByText('Played 2');
    // 200 XP appears in both header pill and quiz card; target the quiz card chip
    expect(
      screen
        .getByTestId('practice-quiz-xp')
        .findByProps({ children: '200 XP' }),
    ).toBeTruthy();
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
          'practice-assessment',
          'practice-quiz',
          'practice-recitation',
          'practice-dictation',
          'practice-quiz-history',
        ].includes(testID),
      );
    const uniqueCardOrder = [...new Set(cardOrder)];

    expect(uniqueCardOrder).toEqual([
      'practice-review',
      'practice-assessment',
      'practice-quiz',
      'practice-dictation',
      'practice-recitation',
      'practice-quiz-history',
    ]);
  });

  it('renders quiz history as a quiet recent-progress row', () => {
    render(<PracticeScreen />);

    const quizHistoryRow = screen.getByTestId('practice-quiz-history');
    expect(quizHistoryRow.props.className).toContain('min-h-[56px]');
    screen.getByText('No rounds yet');
  });

  it('redirects to home when in parent proxy session', () => {
    mockUseParentProxy.mockReturnValue({ isParentProxy: true });

    render(<PracticeScreen />);

    expect(screen.getByTestId('redirect').props.children).toBe('/(app)/home');
  });
});
