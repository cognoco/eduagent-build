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
    mockUseSubjects.mockReturnValue({ data: undefined });
  });

  it('renders title and three always-visible cards', () => {
    render(<LearnNewScreen />);

    expect(screen.getByText('What would you like to learn?')).toBeTruthy();
    expect(screen.getByText('Pick a subject')).toBeTruthy();
    expect(screen.getByText('Just ask anything')).toBeTruthy();
    expect(screen.getByText('Practice')).toBeTruthy();
  });

  it('renders always-visible Practice card regardless of continueSuggestion', () => {
    mockUseContinueSuggestion.mockReturnValue({
      data: { subjectId: 's1', subjectName: 'Math', topicId: 't1' },
    });

    render(<LearnNewScreen />);

    expect(screen.getByTestId('intent-practice')).toBeTruthy();
    expect(screen.getByText('Practice')).toBeTruthy();
  });

  it('navigates to practice on "Practice" card press', () => {
    render(<LearnNewScreen />);

    fireEvent.press(screen.getByTestId('intent-practice'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/practice');
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

    it('hides when continueSuggestion exists', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: { subjectId: 's1', subjectName: 'Math', topicId: 't1' },
      });
      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Geography of Africa', status: 'active' }],
      });

      render(<LearnNewScreen />);

      expect(screen.queryByTestId('intent-continue-subject')).toBeNull();
    });

    it('hides when subjects list is empty', () => {
      mockUseSubjects.mockReturnValue({ data: [] });

      render(<LearnNewScreen />);

      expect(screen.queryByTestId('intent-continue-subject')).toBeNull();
    });
  });

});
