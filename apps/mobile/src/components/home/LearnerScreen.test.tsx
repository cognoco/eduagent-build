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
  useReviewSummary: () => mockUseReviewSummary(),
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
    mockUseReviewSummary.mockReturnValue({ data: { totalOverdue: 0 } });
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

    it('hides "Repeat & review"', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(screen.queryByText('Repeat & review')).toBeNull();
    });
  });

  describe('library with active subjects', () => {
    beforeEach(() => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'active' }];
    });

    it('shows all three intent cards with default review copy', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Start learning')).toBeTruthy();
      expect(screen.getByText('Help with assignment?')).toBeTruthy();
      expect(screen.getByText('Repeat & review')).toBeTruthy();
      expect(screen.getByText('Keep your knowledge fresh')).toBeTruthy();
    });

    it('moves review to the front and shows a badge when many reviews are due', () => {
      mockUseReviewSummary.mockReturnValue({ data: { totalOverdue: 6 } });

      render(<LearnerScreen {...defaultProps} />);

      const cards = within(screen.getByTestId('learner-intent-stack'))
        .getAllByRole('button')
        .map((card) => card.props.testID);

      expect(cards).toEqual([
        'intent-review',
        'intent-learn-new',
        'intent-homework',
      ]);
      expect(screen.getByText('6 topics ready for review')).toBeTruthy();
      expect(screen.getByTestId('intent-review-badge')).toBeTruthy();
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
      mockUseReviewSummary.mockReturnValue({ data: { totalOverdue: 6 } });

      render(<LearnerScreen {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Continue where you left off')).toBeTruthy();
      });

      const cards = within(screen.getByTestId('learner-intent-stack'))
        .getAllByRole('button')
        .map((card) => card.props.testID);

      expect(cards).toEqual([
        'intent-resume',
        'intent-review',
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

    it('shows expired session notice for stale markers instead of clearing them [3C.4]', async () => {
      mockReadSessionRecoveryMarker.mockResolvedValue({
        sessionId: 'session-1',
        updatedAt: new Date().toISOString(),
      });
      mockIsRecoveryMarkerFresh.mockReturnValue(false);

      render(<LearnerScreen {...defaultProps} />);

      // [3C.4] The marker should NOT be cleared optimistically — SessionScreen
      // is responsible for clearing after server acknowledges close.
      await waitFor(() => {
        expect(
          screen.getByText(
            'Your previous session has expired and can no longer be resumed.'
          )
        ).toBeTruthy();
      });

      expect(mockClearSessionRecoveryMarker).not.toHaveBeenCalled();
      expect(screen.queryByText('Continue where you left off')).toBeNull();
    });
  });

  describe('library with only inactive subjects', () => {
    it('hides "Repeat & review" when all subjects are archived', () => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'archived' }];

      render(<LearnerScreen {...defaultProps} />);

      expect(screen.queryByText('Repeat & review')).toBeNull();
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

    it('navigates to library on "Repeat & review"', () => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'active' }];

      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('intent-review'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/library');
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
      mockSubjects = [{ id: 's1', name: 'Math', status: 'active' }];

      render(<LearnerScreen {...defaultProps} />);

      expect(screen.queryByText('Start a fresh session')).toBeNull();
    });
  });

  describe('review priority threshold boundary [BUG-251]', () => {
    beforeEach(() => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'active' }];
    });

    it('promotes review card above primary when reviewDueCount is exactly 5 (threshold)', () => {
      mockUseReviewSummary.mockReturnValue({ data: { totalOverdue: 5 } });

      render(<LearnerScreen {...defaultProps} />);

      const cards = within(screen.getByTestId('learner-intent-stack'))
        .getAllByRole('button')
        .map((card) => card.props.testID);

      expect(cards).toEqual([
        'intent-review',
        'intent-learn-new',
        'intent-homework',
      ]);
    });

    it('keeps review card below primary when reviewDueCount is 4 (below threshold)', () => {
      mockUseReviewSummary.mockReturnValue({ data: { totalOverdue: 4 } });

      render(<LearnerScreen {...defaultProps} />);

      const cards = within(screen.getByTestId('learner-intent-stack'))
        .getAllByRole('button')
        .map((card) => card.props.testID);

      expect(cards).toEqual([
        'intent-learn-new',
        'intent-homework',
        'intent-review',
      ]);
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
});
