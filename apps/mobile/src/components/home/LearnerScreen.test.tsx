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
  useThemeColors: () => ({ textPrimary: '#ffffff' }),
}));

jest.mock('../../lib/greeting', () => ({
  getGreeting: (name: string) => ({
    title: `Good morning, ${name}!`,
    subtitle: 'Fresh mind, fresh start',
  }),
}));

let mockSubjects: Array<{ id: string; name: string; status: string }> = [];

jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => ({ data: mockSubjects, isLoading: false }),
}));

jest.mock('../../hooks/use-progress', () => ({
  useContinueSuggestion: () => mockUseContinueSuggestion(),
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
    mockReadSessionRecoveryMarker.mockResolvedValue(null);
    mockIsRecoveryMarkerFresh.mockReturnValue(true);
    mockUseContinueSuggestion.mockReturnValue({ data: undefined });
  });

  it('renders greeting with profile name', () => {
    render(<LearnerScreen {...defaultProps} />);

    expect(screen.getByText('Good morning, Alex!')).toBeTruthy();
    expect(screen.getByText('Fresh mind, fresh start')).toBeTruthy();
  });

  describe('empty library', () => {
    it('shows a clear first-step CTA and homework help', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Start learning')).toBeTruthy();
      expect(screen.getByText('Help with assignment?')).toBeTruthy();
    });
  });

  describe('library with active subjects', () => {
    beforeEach(() => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'active' }];
      mockUseContinueSuggestion.mockReturnValue({
        data: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          topicTitle: 'Topic 1',
        },
      });
    });

    it('shows continue card and core intent cards', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Continue where you left off')).toBeTruthy();
      expect(screen.getByText('Math')).toBeTruthy();
      expect(screen.getByText('Start learning')).toBeTruthy();
      expect(screen.getByText('Help with assignment?')).toBeTruthy();
    });

    it('places continue card before primary cards', () => {
      render(<LearnerScreen {...defaultProps} />);

      const cards = within(screen.getByTestId('learner-intent-stack'))
        .getAllByRole('button')
        .map((card) => card.props.testID);

      expect(cards).toEqual([
        'intent-resume-last',
        'intent-learn-new',
        'intent-homework',
      ]);
    });

    it('shows a highlighted resume card first when a fresh recovery marker exists', async () => {
      mockReadSessionRecoveryMarker.mockResolvedValue({
        sessionId: 'session-1',
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        mode: 'learning',
        updatedAt: new Date().toISOString(),
      });
      render(<LearnerScreen {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Continue where you left off')).toBeTruthy();
      });

      const cards = within(screen.getByTestId('learner-intent-stack'))
        .getAllByRole('button')
        .map((card) => card.props.testID);

      expect(cards).toEqual([
        'intent-resume',
        'intent-learn-new',
        'intent-homework',
      ]);

      fireEvent.press(screen.getByTestId('intent-resume'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          sessionId: 'session-1',
          subjectId: 's1',
          subjectName: 'Math',
          mode: 'learning',
          topicId: 't1',
        },
      });
    });

    it('silently clears stale markers without showing a notice', async () => {
      mockReadSessionRecoveryMarker.mockResolvedValue({
        sessionId: 'session-1',
        updatedAt: new Date().toISOString(),
      });
      mockIsRecoveryMarkerFresh.mockReturnValue(false);

      render(<LearnerScreen {...defaultProps} />);

      await waitFor(() => {
        expect(mockClearSessionRecoveryMarker).toHaveBeenCalledWith('p1');
      });

      expect(screen.queryByTestId('intent-resume')).toBeNull();
      expect(screen.queryByTestId('recently-expired-banner')).toBeNull();
    });
  });

  describe('navigation', () => {
    it('navigates to learn-new on the primary learning CTA', () => {
      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('intent-learn-new'));
      expect(mockPush).toHaveBeenCalledWith('/learn-new');
    });

    it('navigates to homework camera on "Help with assignment?"', () => {
      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('intent-homework'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/homework/camera');
    });

    it('navigates to session from continue card', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          topicTitle: 'Topic 1',
        },
      });

      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('intent-resume-last'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          mode: 'learning',
        },
      });
    });
  });

  describe('Start learning card has no subtitle [BUG-252]', () => {
    it('does not render a subtitle on the primary card in empty library state', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(
        screen.queryByText("We'll build a path and get you learning fast")
      ).toBeNull();
      expect(screen.queryByText('Start a fresh session')).toBeNull();
    });

    it('does not render a subtitle on the primary card when library has content', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          topicTitle: 'Fractions',
        },
      });

      render(<LearnerScreen {...defaultProps} />);

      expect(screen.queryByText('Start a fresh session')).toBeNull();
    });
  });

  describe('activeProfile null [BUG-250]', () => {
    it('renders fallback greeting when activeProfile is null', () => {
      render(<LearnerScreen {...defaultProps} activeProfile={null} />);

      // getGreeting('') produces fallback title/subtitle
      expect(screen.getByText('Good morning, !')).toBeTruthy();
    });

    it('reads recovery marker with undefined profileId when activeProfile is null', async () => {
      render(<LearnerScreen {...defaultProps} activeProfile={null} />);

      await waitFor(() => {
        expect(mockReadSessionRecoveryMarker).toHaveBeenCalledWith(undefined);
      });
    });
  });

  describe('back button', () => {
    it('shows back button when onBack provided', () => {
      const onBack = jest.fn();

      render(<LearnerScreen {...defaultProps} onBack={onBack} />);

      fireEvent.press(screen.getByTestId('learner-back'));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('hides back button when onBack not provided', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(screen.queryByTestId('learner-back')).toBeNull();
    });
  });

  describe('continue card behavior', () => {
    it('shows "Continue where you left off" when continueSuggestion exists', () => {
      mockUseContinueSuggestion.mockReturnValue({
        data: {
          subjectId: 's1',
          subjectName: 'Math',
          topicId: 't1',
          topicTitle: 'Fractions',
        },
      });

      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Continue where you left off')).toBeTruthy();
      expect(screen.getByText('Math')).toBeTruthy();
    });

    it('hides continue card when continueSuggestion is null', () => {
      mockUseContinueSuggestion.mockReturnValue({ data: null });

      render(<LearnerScreen {...defaultProps} />);

      expect(screen.queryByTestId('intent-resume-last')).toBeNull();
    });

    it('hides continue card when recovery marker is active', async () => {
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
        subjectName: 'Physics',
        updatedAt: new Date().toISOString(),
      });

      render(<LearnerScreen {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('intent-resume')).toBeTruthy();
      });
      expect(screen.queryByTestId('intent-resume-last')).toBeNull();
    });
  });
});
