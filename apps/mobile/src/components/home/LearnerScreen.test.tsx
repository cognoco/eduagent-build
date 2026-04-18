import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReadSessionRecoveryMarker = jest.fn();
const mockClearSessionRecoveryMarker = jest.fn();
const mockIsRecoveryMarkerFresh = jest.fn();
const mockUseContinueSuggestion = jest.fn();
const mockUseReviewSummary = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../common', () => ({
  ProfileSwitcher: () => null,
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ textPrimary: '#ffffff', primary: '#00b4d8' }),
}));

jest.mock('../../lib/greeting', () => ({
  getGreeting: (name: string) => ({
    title: `Good morning, ${name}!`,
    subtitle: 'Fresh mind, fresh start',
  }),
}));

let mockSubjects: Array<{ id: string; name: string; status: string }> = [];
let mockSubjectsIsLoading = false;
let mockSubjectsIsError = false;
const mockRefetchSubjects = jest.fn();

jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: mockSubjects,
    isLoading: mockSubjectsIsLoading,
    isError: mockSubjectsIsError,
    refetch: mockRefetchSubjects,
  }),
}));

jest.mock('../../hooks/use-progress', () => ({
  useContinueSuggestion: () => mockUseContinueSuggestion(),
  useReviewSummary: () => mockUseReviewSummary(),
}));

const mockUseQuizDiscoveryCard = jest.fn();
const mockMarkSurfacedMutate = jest.fn();
jest.mock('../../hooks/use-coaching-card', () => ({
  useQuizDiscoveryCard: () => mockUseQuizDiscoveryCard(),
  useMarkQuizDiscoverySurfaced: () => ({ mutate: mockMarkSurfacedMutate }),
}));

jest.mock('../../lib/session-recovery', () => ({
  readSessionRecoveryMarker: (...args: unknown[]) =>
    mockReadSessionRecoveryMarker(...args),
  clearSessionRecoveryMarker: (...args: unknown[]) =>
    mockClearSessionRecoveryMarker(...args),
  isRecoveryMarkerFresh: (...args: unknown[]) =>
    mockIsRecoveryMarkerFresh(...args),
}));

const { LearnerScreen } = require('./LearnerScreen');

const defaultProps = {
  profiles: [{ id: 'p1', displayName: 'Alex', isOwner: true }],
  activeProfile: { id: 'p1', displayName: 'Alex', isOwner: true },
  switchProfile: jest.fn(),
};

describe('LearnerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubjects = [];
    mockSubjectsIsLoading = false;
    mockSubjectsIsError = false;
    mockReadSessionRecoveryMarker.mockResolvedValue(null);
    mockClearSessionRecoveryMarker.mockResolvedValue(undefined);
    mockIsRecoveryMarkerFresh.mockReturnValue(true);
    mockUseContinueSuggestion.mockReturnValue({ data: null });
    mockUseReviewSummary.mockReturnValue({ data: null });
    mockUseQuizDiscoveryCard.mockReturnValue({ data: undefined });
    mockMarkSurfacedMutate.mockReset();
  });

  it('renders greeting with profile name', () => {
    render(<LearnerScreen {...defaultProps} />);

    expect(screen.getByText('Good morning, Alex!')).toBeTruthy();
    expect(screen.getByText('Fresh mind, fresh start')).toBeTruthy();
  });

  it('shows the four always-visible intent cards in order when continue is hidden', () => {
    render(<LearnerScreen {...defaultProps} />);

    const cardIds = within(screen.getByTestId('learner-intent-stack'))
      .getAllByRole('button')
      .map((card) => card.props.testID);

    expect(cardIds).toEqual([
      'intent-learn',
      'intent-ask',
      'intent-practice',
      'intent-homework',
    ]);
  });

  it('navigates to create-subject on the Learn card', () => {
    render(<LearnerScreen {...defaultProps} />);

    fireEvent.press(screen.getByTestId('intent-learn'));
    expect(mockPush).toHaveBeenCalledWith('/create-subject');
  });

  it('navigates to freeform session on the Ask card', () => {
    render(<LearnerScreen {...defaultProps} />);

    fireEvent.press(screen.getByTestId('intent-ask'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/session?mode=freeform');
  });

  it('navigates to practice on the Practice card', () => {
    render(<LearnerScreen {...defaultProps} />);

    fireEvent.press(screen.getByTestId('intent-practice'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/practice');
  });

  it('navigates to homework camera on the Homework card', () => {
    render(<LearnerScreen {...defaultProps} />);

    fireEvent.press(screen.getByTestId('intent-homework'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/homework/camera');
  });

  it('shows continue card from continue suggestion when available', () => {
    mockUseContinueSuggestion.mockReturnValue({
      data: {
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicTitle: 'Fractions',
        lastSessionId: 'session-1',
      },
    });

    render(<LearnerScreen {...defaultProps} />);

    expect(screen.getByTestId('intent-continue')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
    expect(screen.getByText('Math · Fractions')).toBeTruthy();

    fireEvent.press(screen.getByTestId('intent-continue'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        sessionId: 'session-1',
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicName: 'Fractions',
        mode: 'learning',
      },
    });
  });

  it('shows continue card when overdue topics exist', () => {
    mockUseReviewSummary.mockReturnValue({
      data: {
        totalOverdue: 3,
        nextReviewTopic: {
          topicId: 't1',
          subjectId: 's1',
          subjectName: 'Math',
          topicTitle: 'Algebra',
        },
        nextUpcomingReviewAt: null,
      },
    });

    render(<LearnerScreen {...defaultProps} />);

    expect(screen.getByTestId('intent-continue')).toBeTruthy();
    expect(screen.getByText('Math · 3 topics to review')).toBeTruthy();

    fireEvent.press(screen.getByTestId('intent-continue'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {
        topicId: 't1',
        subjectId: 's1',
        topicName: 'Algebra',
      },
    });
  });

  it('shows quiz discovery card and fires mark-surfaced mutation before navigating', () => {
    mockUseQuizDiscoveryCard.mockReturnValue({
      data: {
        type: 'quiz_discovery',
        activityType: 'capitals',
        title: 'Discover: Capitals',
        body: 'Test your knowledge of world capitals',
      },
    });

    render(<LearnerScreen {...defaultProps} />);

    expect(screen.getByTestId('intent-quiz-discovery')).toBeTruthy();
    expect(screen.getByText('Discover: Capitals')).toBeTruthy();

    fireEvent.press(screen.getByTestId('intent-quiz-discovery'));

    expect(mockMarkSurfacedMutate).toHaveBeenCalledWith('capitals');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz',
      params: { activityType: 'capitals' },
    });
  });

  it('shows recovery continue card first and clears the marker before resuming', async () => {
    mockUseContinueSuggestion.mockReturnValue({
      data: {
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicTitle: 'Fractions',
      },
    });
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'session-1',
      subjectId: 's1',
      subjectName: 'Physics',
      topicId: 't1',
      mode: 'learning',
      updatedAt: new Date().toISOString(),
    });

    render(<LearnerScreen {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Physics · resume')).toBeTruthy();
    });

    const cardIds = within(screen.getByTestId('learner-intent-stack'))
      .getAllByRole('button')
      .map((card) => card.props.testID);

    expect(cardIds).toEqual([
      'intent-continue',
      'intent-learn',
      'intent-ask',
      'intent-practice',
      'intent-homework',
    ]);

    fireEvent.press(screen.getByTestId('intent-continue'));
    expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        sessionId: 'session-1',
        subjectId: 's1',
        subjectName: 'Physics',
        mode: 'learning',
        topicId: 't1',
      },
    });
  });

  it('silently clears stale markers without showing the continue card', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'session-1',
      updatedAt: new Date().toISOString(),
    });
    mockIsRecoveryMarkerFresh.mockReturnValue(false);

    render(<LearnerScreen {...defaultProps} />);

    await waitFor(() => {
      expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
    });

    expect(screen.queryByTestId('intent-continue')).toBeNull();
  });

  it('renders fallback greeting when activeProfile is null', () => {
    render(<LearnerScreen {...defaultProps} activeProfile={null} />);

    expect(screen.getByText('Good morning, !')).toBeTruthy();
  });

  it('reads recovery marker with undefined profileId when activeProfile is null', async () => {
    render(<LearnerScreen {...defaultProps} activeProfile={null} />);

    await waitFor(() => {
      expect(mockReadSessionRecoveryMarker).toHaveBeenCalledWith(undefined);
    });
  });

  it('shows back button when onBack is provided', () => {
    const onBack = jest.fn();

    render(<LearnerScreen {...defaultProps} onBack={onBack} />);

    fireEvent.press(screen.getByTestId('learner-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides back button when onBack is not provided', () => {
    render(<LearnerScreen {...defaultProps} />);

    expect(screen.queryByTestId('learner-back')).toBeNull();
  });
});
