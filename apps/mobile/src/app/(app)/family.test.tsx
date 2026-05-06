import { fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
let mockSearchParams: Record<string, string | undefined> = {};
const mockUseActiveProfileRole = jest.fn();

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

jest.mock('../../hooks/use-active-profile-role', () => ({ // gc1-allow: Family route redirect depends on active role; mocking the hook isolates route-guard behavior from auth state.
  useActiveProfileRole: () => mockUseActiveProfileRole(),
}));

jest.mock('../../components/coaching', () => ({
  ParentDashboardSummary: () => null,
}));

jest.mock('../../components/family/FamilyOrientationCue', () => ({
  FamilyOrientationCue: () => {
    const { View } = require('react-native');
    return <View testID="mock-family-orientation-cue" />;
  },
}));

jest.mock('../../components/family/WithdrawalCountdownBanner', () => ({ // gc1-allow: FamilyScreen only verifies the banner slot is present; banner behavior is covered in its own focused test.
  WithdrawalCountdownBanner: () => {
    const { View } = require('react-native');
    return <View testID="withdrawal-countdown-banner" />;
  },
}));

const FamilyScreen = require('./family').default;

describe('FamilyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(false);
    mockSearchParams = {};
    mockUseActiveProfileRole.mockReturnValue('owner');
  });

  it('redirects child role away from Family deep links', () => {
    mockUseActiveProfileRole.mockReturnValue('child');

    render(<FamilyScreen />);

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByTestId('family-back')).toBeNull();
  });

  it('back button uses neutral "Back" accessibility label', () => {
    render(<FamilyScreen />);

    const back = screen.getByTestId('family-back');
    expect(back.props.accessibilityLabel).toBe('Back');
  });

  it('falls back to /home when returnTo=home and history is empty', () => {
    mockSearchParams = { returnTo: 'home' };
    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('family-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('falls back to /more when returnTo=more and history is empty', () => {
    mockSearchParams = { returnTo: 'more' };
    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('family-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
  });

  it('default fallback is /home when returnTo is missing', () => {
    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('family-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('uses router.back() when canGoBack() is true', () => {
    mockCanGoBack.mockReturnValue(true);
    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('family-back'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders WithdrawalCountdownBanner', () => {
    render(<FamilyScreen />);

    expect(screen.getByTestId('withdrawal-countdown-banner')).toBeTruthy();
  });
});
