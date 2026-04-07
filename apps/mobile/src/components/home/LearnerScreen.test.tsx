import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();

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

const mockMutate = jest.fn();
let mockHomeCards:
  | {
      cards: Array<{
        id: string;
        title: string;
        subtitle: string;
        primaryLabel: string;
        secondaryLabel?: string;
        badge?: string;
        priority: number;
        compact?: boolean;
        subjectId?: string;
        topicId?: string;
      }>;
      coldStart: boolean;
    }
  | undefined;

jest.mock('../../hooks/use-home-cards', () => ({
  useHomeCards: () => ({ data: mockHomeCards, isLoading: false }),
  useTrackHomeCardInteraction: () => ({ mutate: mockMutate }),
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
    mockHomeCards = undefined;
  });

  it('renders greeting with profile name', () => {
    render(<LearnerScreen {...defaultProps} />);

    expect(screen.getByText('Good morning, Alex!')).toBeTruthy();
    expect(screen.getByText('Fresh mind, fresh start')).toBeTruthy();
  });

  describe('empty library', () => {
    it('shows "Learn something new!" and "Help with assignment?"', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Learn something new!')).toBeTruthy();
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

    it('shows all three intent cards', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Learn something new!')).toBeTruthy();
      expect(screen.getByText('Help with assignment?')).toBeTruthy();
      expect(screen.getByText('Repeat & review')).toBeTruthy();
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
    it('navigates to learn-new on "Learn something new!"', () => {
      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('intent-learn-new'));
      expect(mockPush).toHaveBeenCalledWith('/(learner)/learn-new');
    });

    it('navigates to homework camera on "Help with assignment?"', () => {
      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('intent-homework'));
      expect(mockPush).toHaveBeenCalledWith('/(learner)/homework/camera');
    });

    it('navigates to library on "Repeat & review"', () => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'active' }];

      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('intent-review'));
      expect(mockPush).toHaveBeenCalledWith('/(learner)/library');
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

  describe('coaching cards', () => {
    it('renders coaching cards from API', () => {
      mockHomeCards = {
        cards: [
          {
            id: 'study',
            title: 'Continue Math',
            subtitle: 'Algebra basics',
            primaryLabel: 'Continue topic',
            badge: 'Continue',
            priority: 80,
            subjectId: 's1',
            topicId: 't1',
          },
        ],
        coldStart: false,
      };

      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Continue Math')).toBeTruthy();
      expect(screen.getByText('Algebra basics')).toBeTruthy();
    });

    it('hides coaching cards section when no cards', () => {
      mockHomeCards = undefined;

      render(<LearnerScreen {...defaultProps} />);

      expect(screen.queryByTestId('coaching-cards')).toBeNull();
    });

    it('dismisses card on tap and tracks interaction', () => {
      mockHomeCards = {
        cards: [
          {
            id: 'study',
            title: 'Continue Math',
            subtitle: 'Pick up where you left off',
            primaryLabel: 'Continue',
            priority: 80,
          },
        ],
        coldStart: false,
      };

      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Continue Math')).toBeTruthy();

      fireEvent.press(screen.getByTestId('coaching-card-study-dismiss'));

      expect(screen.queryByText('Continue Math')).toBeNull();
      expect(mockMutate).toHaveBeenCalledWith({
        cardId: 'study',
        interactionType: 'dismiss',
      });
    });

    it('navigates on primary tap and tracks interaction', () => {
      mockHomeCards = {
        cards: [
          {
            id: 'homework',
            title: 'Homework help',
            subtitle: 'Snap a question',
            primaryLabel: 'Open camera',
            priority: 76,
            compact: true,
          },
        ],
        coldStart: false,
      };

      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('coaching-card-homework-primary'));

      expect(mockPush).toHaveBeenCalledWith('/(learner)/homework/camera');
      expect(mockMutate).toHaveBeenCalledWith({
        cardId: 'homework',
        interactionType: 'tap',
      });
    });
  });
});
