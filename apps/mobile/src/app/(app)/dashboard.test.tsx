import { fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

jest.mock('../../hooks/use-dashboard', () => ({
  useDashboard: () => ({
    data: { children: [], demoMode: false },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));

jest.mock('../../components/coaching', () => ({
  ParentDashboardSummary: () => null,
}));

const DashboardScreen = require('./dashboard').default;

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(false);
    mockSearchParams = {};
  });

  // [BUG-905] Back button must NOT hardcode "Back to more". The label is now
  // generic "Back" so it works whether the user came from /home or /more.
  it('back button uses neutral "Back" accessibility label [BUG-905]', () => {
    render(<DashboardScreen />);

    const back = screen.getByTestId('dashboard-back');
    expect(back.props.accessibilityLabel).toBe('Back');
  });

  // [BUG-905] When `canGoBack()` returns false, the fallback should respect
  // the `returnTo` query param so users land where they came from.
  it('falls back to /home when returnTo=home and history is empty [BUG-905]', () => {
    mockSearchParams = { returnTo: 'home' };
    render(<DashboardScreen />);

    fireEvent.press(screen.getByTestId('dashboard-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('falls back to /more when returnTo=more and history is empty [BUG-905]', () => {
    mockSearchParams = { returnTo: 'more' };
    render(<DashboardScreen />);

    fireEvent.press(screen.getByTestId('dashboard-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
  });

  it('default fallback is /home when returnTo is missing [BUG-905]', () => {
    render(<DashboardScreen />);

    fireEvent.press(screen.getByTestId('dashboard-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('uses router.back() when canGoBack() is true [BUG-905]', () => {
    mockCanGoBack.mockReturnValue(true);
    render(<DashboardScreen />);

    fireEvent.press(screen.getByTestId('dashboard-back'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
