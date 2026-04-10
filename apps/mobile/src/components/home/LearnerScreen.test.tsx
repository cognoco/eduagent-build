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
  });

  it('renders greeting with profile name', () => {
    render(<LearnerScreen {...defaultProps} />);

    expect(screen.getByText('Good morning, Alex!')).toBeTruthy();
    expect(screen.getByText('Fresh mind, fresh start')).toBeTruthy();
  });

  describe('empty library', () => {
    it('shows a clear first-step CTA and homework help', () => {
      render(<LearnerScreen {...defaultProps} />);

      expect(screen.getByText('Start your first subject')).toBeTruthy();
      expect(
        screen.getByText("We'll build a path and get you learning fast")
      ).toBeTruthy();
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

      expect(screen.getByText('Start a fresh session')).toBeTruthy();
      expect(
        screen.getByText('Ask a new question or explore a new topic')
      ).toBeTruthy();
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
    it('navigates to learn-new on the primary learning CTA', () => {
      render(<LearnerScreen {...defaultProps} />);

      fireEvent.press(screen.getByTestId('intent-learn-new'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/learn-new');
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
