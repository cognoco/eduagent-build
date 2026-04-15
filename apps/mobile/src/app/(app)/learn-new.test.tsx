import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
const mockReadSessionRecoveryMarker = jest.fn();
const mockUseContinueSuggestion = jest.fn();
const mockUseReviewSummary = jest.fn();
const mockUseSubjects = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'p1', displayName: 'Alex' },
    isLoading: false,
  }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ textPrimary: '#ffffff', textSecondary: '#aaaaaa' }),
}));

jest.mock('../../hooks/use-progress', () => ({
  useContinueSuggestion: () => mockUseContinueSuggestion(),
  useReviewSummary: () => mockUseReviewSummary(),
}));

jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => mockUseSubjects(),
}));

jest.mock('../../lib/session-recovery', () => ({
  readSessionRecoveryMarker: (...args: unknown[]) =>
    mockReadSessionRecoveryMarker(...args),
  clearSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
  isRecoveryMarkerFresh: jest.fn().mockReturnValue(true),
}));

const LearnNewScreen = require('./learn-new').default;

describe('LearnNewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadSessionRecoveryMarker.mockResolvedValue(null);
    mockCanGoBack.mockReturnValue(true);
    mockUseContinueSuggestion.mockReturnValue({ data: null });
    mockUseReviewSummary.mockReturnValue({ data: { totalOverdue: 0 } });
    mockUseSubjects.mockReturnValue({ data: undefined });
  });

  it('renders title and two always-visible cards', () => {
    render(<LearnNewScreen />);

    expect(screen.getByText('What would you like to learn?')).toBeTruthy();
    expect(screen.getByText('Pick a subject')).toBeTruthy();
    expect(screen.getByText('Just ask anything')).toBeTruthy();
  });

  it('hides resume card when no recovery marker', () => {
    render(<LearnNewScreen />);

    expect(screen.queryByText('Continue where you left off')).toBeNull();
  });

  it('shows resume card when recovery marker is fresh', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'sess-1',
      subjectName: 'Math',
      updatedAt: new Date().toISOString(),
    });

    render(<LearnNewScreen />);

    await waitFor(() => {
      expect(screen.getByText('Continue where you left off')).toBeTruthy();
      expect(screen.getByText('Math')).toBeTruthy();
    });
  });

  it('navigates to create-subject on "Pick a subject"', () => {
    render(<LearnNewScreen />);

    fireEvent.press(screen.getByTestId('intent-pick-subject'));
    expect(mockPush).toHaveBeenCalledWith('/create-subject');
  });

  it('navigates to freeform session on "Just ask anything"', () => {
    render(<LearnNewScreen />);

    fireEvent.press(screen.getByTestId('intent-freeform'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/session?mode=freeform');
  });

  it('navigates to session with sessionId on resume', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'sess-1',
      subjectId: 'subject-1',
      subjectName: 'Math',
      mode: 'learning',
      updatedAt: new Date().toISOString(),
    });

    render(<LearnNewScreen />);

    const resumeCta = await screen.findByTestId('intent-resume');
    fireEvent.press(resumeCta);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        sessionId: 'sess-1',
        subjectId: 'subject-1',
        subjectName: 'Math',
        mode: 'learning',
      },
    });
  });

  it('back button calls router.back()', () => {
    render(<LearnNewScreen />);

    fireEvent.press(screen.getByTestId('learn-new-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('back button replaces home when there is no back history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<LearnNewScreen />);

    fireEvent.press(screen.getByTestId('learn-new-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  describe('continue-with-subject card', () => {
    it('shows shortcut to most recent subject when no continueSuggestion', () => {
      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Geography of Africa', status: 'active' }],
      });

      render(<LearnNewScreen />);

      expect(
        screen.getByText('Continue with Geography of Africa')
      ).toBeTruthy();
      expect(screen.getByTestId('intent-continue-subject')).toBeTruthy();
    });

    it('navigates to session with subject on press', () => {
      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Geography of Africa', status: 'active' }],
      });

      render(<LearnNewScreen />);

      fireEvent.press(screen.getByTestId('intent-continue-subject'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          subjectId: 'sub-1',
          subjectName: 'Geography of Africa',
          mode: 'learning',
        },
      });
    });

    it('hides when continueSuggestion exists (review takes priority)', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: { subjectId: 's1', subjectName: 'Math', topicId: 't1' },
      });
      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Geography of Africa', status: 'active' }],
      });

      render(<LearnNewScreen />);

      expect(screen.queryByTestId('intent-continue-subject')).toBeNull();
      expect(screen.getByTestId('intent-review')).toBeTruthy();
    });

    it('hides when subjects list is empty', () => {
      mockUseSubjects.mockReturnValue({ data: [] });

      render(<LearnNewScreen />);

      expect(screen.queryByTestId('intent-continue-subject')).toBeNull();
    });
  });

  describe('review card', () => {
    it('shows card when continueSuggestion is available', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          topicTitle: 'Algebra',
        },
      });

      render(<LearnNewScreen />);

      expect(screen.getByTestId('intent-review')).toBeTruthy();
      expect(screen.getByText('Repeat & review')).toBeTruthy();
      expect(screen.getByText('Keep your knowledge fresh')).toBeTruthy();
    });

    it('shows overdue count in subtitle and badge', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          topicTitle: 'Algebra',
        },
      });
      mockUseReviewSummary.mockReturnValue({ data: { totalOverdue: 3 } });

      render(<LearnNewScreen />);

      expect(screen.getByText('3 topics ready for review')).toBeTruthy();
      expect(screen.getByTestId('intent-review-badge')).toBeTruthy();
    });

    it('hides card when no continueSuggestion', () => {
      render(<LearnNewScreen />);

      expect(screen.queryByTestId('intent-review')).toBeNull();
    });

    it('navigates to relearn when overdue topic exists', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          topicTitle: 'Algebra',
        },
      });
      mockUseReviewSummary.mockReturnValue({
        data: {
          totalOverdue: 2,
          nextReviewTopic: { topicId: 't2', subjectId: 's1' },
        },
      });

      render(<LearnNewScreen />);

      fireEvent.press(screen.getByTestId('intent-review'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/topic/relearn',
        params: { topicId: 't2', subjectId: 's1' },
      });
    });

    it('falls back to library when no overdue topic', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          topicTitle: 'Algebra',
        },
      });
      mockUseReviewSummary.mockReturnValue({
        data: { totalOverdue: 0, nextReviewTopic: null },
      });

      render(<LearnNewScreen />);

      fireEvent.press(screen.getByTestId('intent-review'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/library');
    });
  });
});
