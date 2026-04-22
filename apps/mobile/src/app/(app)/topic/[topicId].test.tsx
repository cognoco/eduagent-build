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
const mockResolveTopicSubject = jest.fn<
  {
    data:
      | { subjectId: string; subjectName: string; topicTitle: string }
      | undefined;
    isLoading: boolean;
  },
  []
>(() => ({
  data: undefined,
  isLoading: false,
}));

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
  useResolveTopicSubject: () => mockResolveTopicSubject(),
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
        mode: 'learning',
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
        mode: 'learning',
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

// ---------------------------------------------------------------------------
// UX resilience: error, empty, missing-params states (restored from prior suite)
// ---------------------------------------------------------------------------

describe('TopicDetailScreen error / empty / missing-params states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: 's1',
      topicId: 't1',
    });
  });

  it('shows missing-params state when route params are absent', () => {
    mockUseLocalSearchParams.mockReturnValue(
      {} as { subjectId: string; topicId: string }
    );
    mockTopicProgress.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockTopicRetention.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockEvaluateEligibility.mockReturnValue({ data: undefined });
    mockActiveSession.mockReturnValue({ data: null });
    mockParkingLot.mockReturnValue({ data: [], isLoading: false });
    mockTopicNote.mockReturnValue({ data: null });

    render(<TopicDetailScreen />);

    expect(screen.getByTestId('topic-detail-missing-params-back')).toBeTruthy();
    expect(screen.getByText('Topic not found')).toBeTruthy();

    fireEvent.press(screen.getByTestId('topic-detail-missing-params-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalled();
  });

  it('shows empty state when topic data is null after loading', () => {
    mockTopicProgress.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockTopicRetention.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockEvaluateEligibility.mockReturnValue({ data: undefined });
    mockActiveSession.mockReturnValue({ data: null });
    mockParkingLot.mockReturnValue({ data: [], isLoading: false });
    mockTopicNote.mockReturnValue({ data: null });

    render(<TopicDetailScreen />);

    expect(screen.getByTestId('topic-detail-empty')).toBeTruthy();
    expect(screen.getByText('Topic not found')).toBeTruthy();
    expect(screen.getByTestId('topic-detail-empty-back')).toBeTruthy();
  });

  it('shows retry, go-back, and go-home when queries error [3B.6]', () => {
    const mockRefetchProgress = jest.fn().mockResolvedValue(undefined);
    const mockRefetchRetention = jest.fn().mockResolvedValue(undefined);

    mockTopicProgress.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: mockRefetchProgress,
    });
    mockTopicRetention.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: mockRefetchRetention,
    });
    mockEvaluateEligibility.mockReturnValue({ data: undefined });
    mockActiveSession.mockReturnValue({ data: null });
    mockParkingLot.mockReturnValue({ data: [], isLoading: false });
    mockTopicNote.mockReturnValue({ data: null });

    render(<TopicDetailScreen />);

    expect(screen.getByTestId('topic-detail-retry')).toBeTruthy();
    expect(screen.getByTestId('topic-detail-go-back')).toBeTruthy();
    expect(screen.getByTestId('topic-detail-go-home')).toBeTruthy();
    expect(screen.getByText("We couldn't load this topic")).toBeTruthy();

    fireEvent.press(screen.getByTestId('topic-detail-retry'));
    expect(mockRefetchProgress).toHaveBeenCalled();
    expect(mockRefetchRetention).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('topic-detail-go-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalled();
  });

  it('[F-009] shows loading spinner while resolving subjectId from a deep-link (no subjectId param)', () => {
    // Simulate a deep-link: topicId present but no subjectId in route params
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 't1',
    } as { subjectId: string; topicId: string });
    mockResolveTopicSubject.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    mockTopicProgress.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockTopicRetention.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockEvaluateEligibility.mockReturnValue({ data: undefined });
    mockActiveSession.mockReturnValue({ data: null });
    mockParkingLot.mockReturnValue({ data: [], isLoading: false });
    mockTopicNote.mockReturnValue({ data: null });

    render(<TopicDetailScreen />);

    // While resolve is loading, the screen shows a spinner, not "Topic not found"
    expect(screen.queryByText('Topic not found')).toBeNull();
  });

  it('[F-009] renders topic content after resolving subjectId from deep-link', () => {
    // Simulate a deep-link that resolved successfully
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 't1',
    } as { subjectId: string; topicId: string });
    mockResolveTopicSubject.mockReturnValue({
      data: {
        subjectId: 's1',
        subjectName: 'Mathematics',
        topicTitle: 'Algebra',
      },
      isLoading: false,
    });

    setupDefaults({ completionStatus: 'in_progress' });

    render(<TopicDetailScreen />);

    expect(screen.getByTestId('primary-action-button')).toBeTruthy();
    expect(screen.getByText('Continue learning')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Rendering: retention details, parking lot, back navigation
// ---------------------------------------------------------------------------

describe('TopicDetailScreen rendering details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: 's1',
      topicId: 't1',
    });
  });

  it('renders retention card with interval, repetitions, and next review', () => {
    mockTopicProgress.mockReturnValue({
      data: {
        topicId: 't1',
        title: 'Algebra Basics',
        description: 'Introduction to algebraic expressions',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: 0.85,
        summaryExcerpt: 'Learned about variables and equations',
        xpStatus: 'verified',
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockTopicRetention.mockReturnValue({
      data: {
        topicId: 't1',
        easeFactor: 2.7,
        intervalDays: 14,
        repetitions: 5,
        nextReviewAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        lastReviewedAt: null,
        xpStatus: 'verified',
        failureCount: 0,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockEvaluateEligibility.mockReturnValue({ data: undefined });
    mockActiveSession.mockReturnValue({ data: null });
    mockParkingLot.mockReturnValue({
      data: [
        {
          id: 'parked-1',
          question: 'Why does factoring help here?',
          explored: false,
          createdAt: '2026-02-15T10:00:00.000Z',
        },
      ],
      isLoading: false,
    });
    mockTopicNote.mockReturnValue({ data: null });

    render(<TopicDetailScreen />);

    expect(screen.getByText('Algebra Basics')).toBeTruthy();
    expect(
      screen.getByText('Introduction to algebraic expressions')
    ).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('14 days')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(
      screen.getByText('Learned about variables and equations')
    ).toBeTruthy();
    expect(screen.getByText('Parking Lot')).toBeTruthy();
    expect(screen.getByText('Why does factoring help here?')).toBeTruthy();
  });

  it('shows struggle status when not normal', () => {
    mockTopicProgress.mockReturnValue({
      data: {
        topicId: 't1',
        title: 'Calculus',
        description: 'Derivatives and integrals',
        completionStatus: 'in_progress',
        retentionStatus: 'weak',
        struggleStatus: 'needs_deepening',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockTopicRetention.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockEvaluateEligibility.mockReturnValue({ data: undefined });
    mockActiveSession.mockReturnValue({ data: null });
    mockParkingLot.mockReturnValue({ data: [], isLoading: false });
    mockTopicNote.mockReturnValue({ data: null });

    render(<TopicDetailScreen />);

    expect(screen.getByText('Exploring further')).toBeTruthy();
  });

  it('navigates back on back button press', () => {
    setupDefaults({ completionStatus: 'completed' });

    render(<TopicDetailScreen />);

    fireEvent.press(screen.getByTestId('topic-detail-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalled();
  });

  it('does not show parked questions when parking lot is empty', () => {
    mockParkingLot.mockReset();
    mockParkingLot.mockReturnValue({ data: [], isLoading: false });
    setupDefaults({ completionStatus: 'completed' });

    render(<TopicDetailScreen />);

    // With no parked questions, individual question text should not appear
    expect(screen.queryByText('Why does factoring help here?')).toBeNull();
  });
});
