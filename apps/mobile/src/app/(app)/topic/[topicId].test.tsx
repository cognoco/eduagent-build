import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({
  subjectId: 's1',
  topicId: 't1',
}));
const mockTopicProgress = jest.fn();
const mockActiveSession = jest.fn();
const mockTopicRetention = jest.fn();
const mockEvaluateEligibility = jest.fn();
const mockParkingLot = jest.fn();
const mockTopicNote = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00b4d8',
    muted: '#888888',
    retentionWeak: '#ff0000',
    retentionFading: '#ffaa00',
    retentionStrong: '#00ff00',
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../../hooks/use-progress', () => ({
  useTopicProgress: () => mockTopicProgress(),
  useActiveSessionForTopic: () => mockActiveSession(),
}));

jest.mock('../../../hooks/use-retention', () => ({
  useTopicRetention: () => mockTopicRetention(),
  useEvaluateEligibility: () => mockEvaluateEligibility(),
}));

jest.mock('../../../hooks/use-sessions', () => ({
  useTopicParkingLot: () => mockParkingLot(),
}));

jest.mock('../../../hooks/use-notes', () => ({
  useGetTopicNote: () => mockTopicNote(),
}));

const TopicDetailScreen = require('./[topicId]').default;

function setupDefaults(overrides?: {
  completionStatus?: string;
  failureCount?: number;
  struggleStatus?: string;
  evaluateEligible?: boolean;
  repetitions?: number;
  easeFactor?: number;
  nextReviewAt?: string | null;
  activeSessionId?: string | null;
}) {
  const {
    completionStatus = 'not_started',
    failureCount = 0,
    struggleStatus = 'normal',
    evaluateEligible = false,
    repetitions = 0,
    easeFactor = 2.5,
    nextReviewAt = null,
    activeSessionId = null,
  } = overrides ?? {};

  mockTopicProgress.mockReturnValue({
    data: {
      topicId: 't1',
      title: 'Algebra',
      description: '',
      completionStatus,
      struggleStatus,
      masteryScore: null,
      summaryExcerpt: null,
      xpStatus: null,
      retentionStatus: null,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  mockTopicRetention.mockReturnValue({
    data: {
      topicId: 't1',
      failureCount,
      repetitions,
      easeFactor,
      nextReviewAt,
      lastReviewedAt: null,
      intervalDays: 1,
      xpStatus: 'pending',
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  mockEvaluateEligibility.mockReturnValue({
    data: {
      eligible: evaluateEligible,
      topicId: 't1',
      topicTitle: 'Algebra',
      currentRung: 1,
      easeFactor,
      repetitions,
    },
  });
  mockActiveSession.mockReturnValue({
    data: activeSessionId ? { sessionId: activeSessionId } : null,
  });
  mockParkingLot.mockReturnValue({ data: [], isLoading: false });
  mockTopicNote.mockReturnValue({ data: null });
}

describe('TopicDetailScreen action buttons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: 's1',
      topicId: 't1',
    });
  });

  it('shows loading state while the topic is loading', () => {
    mockTopicProgress.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });
    mockTopicRetention.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });
    mockEvaluateEligibility.mockReturnValue({ data: undefined });
    mockActiveSession.mockReturnValue({ data: null });
    mockParkingLot.mockReturnValue({ data: [], isLoading: false });
    mockTopicNote.mockReturnValue({ data: null });

    render(<TopicDetailScreen />);

    expect(screen.getByTestId('topic-detail-loading')).toBeTruthy();
  });

  it('shows "Start learning" as primary for not_started topics', () => {
    setupDefaults({ completionStatus: 'not_started' });

    render(<TopicDetailScreen />);

    expect(screen.getByTestId('primary-action-button')).toBeTruthy();
    expect(screen.getByText('Start learning')).toBeTruthy();
  });

  it('navigates into a new learning session from the start button', () => {
    setupDefaults({ completionStatus: 'not_started' });

    render(<TopicDetailScreen />);
    fireEvent.press(screen.getByTestId('primary-action-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'freeform',
        subjectId: 's1',
        topicId: 't1',
        topicName: 'Algebra',
      },
    });
  });

  it('shows "Continue learning" as primary for in_progress topics', () => {
    setupDefaults({
      completionStatus: 'in_progress',
      activeSessionId: 'session-123',
    });

    render(<TopicDetailScreen />);

    expect(screen.getByText('Continue learning')).toBeTruthy();
    fireEvent.press(screen.getByTestId('primary-action-button'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'freeform',
        subjectId: 's1',
        topicId: 't1',
        topicName: 'Algebra',
        sessionId: 'session-123',
      },
    });
  });

  it('shows "Relearn" as primary when the learner is struggling', () => {
    setupDefaults({
      completionStatus: 'completed',
      failureCount: 3,
      struggleStatus: 'needs_deepening',
    });

    render(<TopicDetailScreen />);

    expect(screen.getByText('Relearn')).toBeTruthy();
  });

  it('shows "Review" as primary when a completed topic is overdue', () => {
    setupDefaults({
      completionStatus: 'completed',
      nextReviewAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    render(<TopicDetailScreen />);

    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('hides the secondary section when no secondary actions apply', () => {
    setupDefaults({ completionStatus: 'not_started' });

    render(<TopicDetailScreen />);

    expect(screen.queryByTestId('more-ways-toggle')).toBeNull();
  });

  it('shows expandable secondary section with Recall Check', () => {
    setupDefaults({ completionStatus: 'in_progress' });

    render(<TopicDetailScreen />);

    fireEvent.press(screen.getByTestId('more-ways-toggle'));
    expect(screen.getByText('Recall Check')).toBeTruthy();
    fireEvent.press(screen.getByTestId('secondary-recall-check'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/recall-test',
      params: {
        subjectId: 's1',
        topicId: 't1',
        topicName: 'Algebra',
      },
    });
  });

  it('shows Challenge yourself when eligible', () => {
    setupDefaults({
      completionStatus: 'completed',
      evaluateEligible: true,
    });

    render(<TopicDetailScreen />);

    fireEvent.press(screen.getByTestId('more-ways-toggle'));
    expect(screen.getByText('Challenge yourself')).toBeTruthy();
  });

  it('shows Teach it back when retention qualifies', () => {
    setupDefaults({
      completionStatus: 'completed',
      repetitions: 3,
      easeFactor: 2.5,
    });

    render(<TopicDetailScreen />);

    fireEvent.press(screen.getByTestId('more-ways-toggle'));
    expect(screen.getByText('Teach it back')).toBeTruthy();
  });
});
