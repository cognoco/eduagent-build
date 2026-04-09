import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReadSessionRecoveryMarker = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'p1', displayName: 'Alex' },
  }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ textPrimary: '#ffffff' }),
}));

jest.mock('../../lib/session-recovery', () => ({
  readSessionRecoveryMarker: (...args: unknown[]) =>
    mockReadSessionRecoveryMarker(...args),
  isRecoveryMarkerFresh: jest.fn().mockReturnValue(true),
}));

const LearnNewScreen = require('./learn-new').default;

describe('LearnNewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadSessionRecoveryMarker.mockResolvedValue(null);
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
      subjectName: 'Math',
      updatedAt: new Date().toISOString(),
    });

    render(<LearnNewScreen />);

    const resumeCta = await screen.findByTestId('intent-resume');
    fireEvent.press(resumeCta);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { sessionId: 'sess-1' },
    });
  });

  it('back button calls router.back()', () => {
    render(<LearnNewScreen />);

    fireEvent.press(screen.getByTestId('learn-new-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
