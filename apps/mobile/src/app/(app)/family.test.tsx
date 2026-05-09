import { fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockCanGoBack = jest.fn(() => false);
let mockSearchParams: Record<string, string | undefined> = {};
const mockUseActiveProfileRole = jest.fn();
let mockDashboard: {
  children: {
    profileId: string;
    displayName: string;
    summary: string;
    sessionsThisWeek: number;
    sessionsLastWeek: number;
    totalTimeThisWeek: number;
    totalTimeLastWeek: number;
    exchangesThisWeek: number;
    exchangesLastWeek: number;
    guidedVsImmediateRatio: number;
    trend: string;
    currentStreak: number;
    totalXp: number;
    consentStatus: string | null;
    subjects: { name: string; retentionStatus: string }[];
  }[];
  demoMode: boolean;
} = { children: [], demoMode: false };
let mockSubscription: { tier: string } | null = { tier: 'family' };
let mockFamilySubscription: {
  profileCount: number;
  maxProfiles: number;
} | null = { profileCount: 2, maxProfiles: 4 };
let mockBreakdownSharing = false;
let mockBreakdownSharingLoading = false;
let mockBreakdownSharingPending = false;
const mockBreakdownSharingMutate = jest.fn();

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
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
    data: mockDashboard,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));

jest.mock('../../hooks/use-subscription', () => ({
  useSubscription: () => ({ data: mockSubscription }),
  useFamilySubscription: () => ({ data: mockFamilySubscription }),
}));

jest.mock('../../hooks/use-settings', () => ({
  useFamilyPoolBreakdownSharing: () => ({
    data: mockBreakdownSharing,
    isLoading: mockBreakdownSharingLoading,
  }),
  useUpdateFamilyPoolBreakdownSharing: () => ({
    mutate: mockBreakdownSharingMutate,
    isPending: mockBreakdownSharingPending,
  }),
}));

jest.mock('../../hooks/use-active-profile-role' /* gc1-allow */, () => ({
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

jest.mock(
  '../../components/family/WithdrawalCountdownBanner' /* gc1-allow */,
  () => ({
    WithdrawalCountdownBanner: () => {
      const { View } = require('react-native');
      return <View testID="withdrawal-countdown-banner" />;
    },
  }),
);

const FamilyScreen = require('./family').default;

describe('FamilyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(false);
    mockSearchParams = {};
    mockUseActiveProfileRole.mockReturnValue('owner');
    mockDashboard = { children: [], demoMode: false };
    mockSubscription = { tier: 'family' };
    mockFamilySubscription = { profileCount: 2, maxProfiles: 4 };
    mockBreakdownSharing = false;
    mockBreakdownSharingLoading = false;
    mockBreakdownSharingPending = false;
  });

  it('redirects child role away from Family deep links', () => {
    mockUseActiveProfileRole.mockReturnValue('child');

    render(<FamilyScreen />);

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByTestId('dashboard-back')).toBeNull();
  });

  it('back button uses neutral "Back" accessibility label', () => {
    render(<FamilyScreen />);

    const back = screen.getByTestId('dashboard-back');
    expect(back.props.accessibilityLabel).toBe('Back');
  });

  it('falls back to /home when returnTo=home and history is empty', () => {
    mockSearchParams = { returnTo: 'home' };
    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('dashboard-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('falls back to /more when returnTo=more and history is empty', () => {
    mockSearchParams = { returnTo: 'more' };
    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('dashboard-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
  });

  it('default fallback is /home when returnTo is missing', () => {
    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('dashboard-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('uses router.back() when canGoBack() is true', () => {
    mockCanGoBack.mockReturnValue(true);
    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('dashboard-back'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders WithdrawalCountdownBanner', () => {
    render(<FamilyScreen />);

    expect(screen.getByTestId('withdrawal-countdown-banner')).toBeTruthy();
  });

  it('renders family management controls in the Family hub when children exist', () => {
    mockDashboard = {
      demoMode: false,
      children: [
        {
          profileId: 'child-1',
          displayName: 'Mia',
          summary: 'Making progress',
          sessionsThisWeek: 2,
          sessionsLastWeek: 1,
          totalTimeThisWeek: 30,
          totalTimeLastWeek: 20,
          exchangesThisWeek: 12,
          exchangesLastWeek: 8,
          guidedVsImmediateRatio: 0.7,
          trend: 'up',
          currentStreak: 3,
          totalXp: 120,
          consentStatus: 'CONSENTED',
          subjects: [],
        },
      ],
    };

    render(<FamilyScreen />);

    screen.getByTestId('family-breakdown-sharing-toggle');
    screen.getByTestId('family-add-child-link');
  });

  it('updates family pool breakdown sharing from the Family hub', () => {
    mockDashboard = {
      demoMode: false,
      children: [
        {
          profileId: 'child-1',
          displayName: 'Mia',
          summary: 'Making progress',
          sessionsThisWeek: 2,
          sessionsLastWeek: 1,
          totalTimeThisWeek: 30,
          totalTimeLastWeek: 20,
          exchangesThisWeek: 12,
          exchangesLastWeek: 8,
          guidedVsImmediateRatio: 0.7,
          trend: 'up',
          currentStreak: 3,
          totalXp: 120,
          consentStatus: 'CONSENTED',
          subjects: [],
        },
      ],
    };

    render(<FamilyScreen />);

    fireEvent(
      screen.getByTestId('family-breakdown-sharing-toggle-switch'),
      'valueChange',
      true,
    );

    expect(mockBreakdownSharingMutate).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('navigates to child profile creation from the Family hub', () => {
    mockDashboard = {
      demoMode: false,
      children: [
        {
          profileId: 'child-1',
          displayName: 'Mia',
          summary: 'Making progress',
          sessionsThisWeek: 2,
          sessionsLastWeek: 1,
          totalTimeThisWeek: 30,
          totalTimeLastWeek: 20,
          exchangesThisWeek: 12,
          exchangesLastWeek: 8,
          guidedVsImmediateRatio: 0.7,
          trend: 'up',
          currentStreak: 3,
          totalXp: 120,
          consentStatus: 'CONSENTED',
          subjects: [],
        },
      ],
    };

    render(<FamilyScreen />);

    fireEvent.press(screen.getByTestId('family-add-child-link'));

    expect(mockPush).toHaveBeenCalledWith('/create-profile?for=child');
  });
});
