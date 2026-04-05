import { render, screen } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

const mockUseProfile = jest.fn();
const mockTabs = Object.assign(
  ({ children }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="tabs">{children}</View>;
  },
  {
    Screen: () => null,
  }
);

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
  Tabs: mockTabs,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: jest.fn(),
  useClerk: () => ({ signOut: jest.fn() }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => mockUseProfile(),
}));

jest.mock('../../lib/theme', () => ({
  useTheme: () => ({ persona: 'parent' }),
  useThemeColors: () => ({
    accent: '#0ea5e9',
    border: '#d4d4d8',
    muted: '#71717a',
    surface: '#ffffff',
    textInverse: '#ffffff',
    textPrimary: '#18181b',
    textSecondary: '#52525b',
  }),
  useTokenVars: () => ({}),
}));

jest.mock('../../hooks/use-push-token-registration', () => ({
  usePushTokenRegistration: jest.fn(),
}));

jest.mock('../../hooks/use-revenuecat', () => ({
  useRevenueCatIdentity: jest.fn(),
}));

jest.mock('../../lib/sentry', () => ({
  evaluateSentryForProfile: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const LearnerLayout = require('./_layout').default;

describe('LearnerLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [
        { id: 'p1', isOwner: true, consentStatus: null },
        { id: 'c1', isOwner: false, consentStatus: null },
      ],
      activeProfile: { id: 'p1', isOwner: true, consentStatus: null },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
    });
  });

  it('keeps linked-parent accounts in the learner tab shell for adaptive home', () => {
    render(<LearnerLayout />);

    expect(screen.getByTestId('tabs')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Auth guard — redirects unauthenticated users to sign-in.
  //
  // This is the guard that caused the navigation race condition: after
  // setActive(), if router.replace('/(learner)/home') fired before Clerk's
  // React state propagated, this guard saw isSignedIn: false and bounced
  // the user back to an empty sign-in screen.  The fix removed explicit
  // navigation from auth screens — the auth layout guard now handles it
  // reactively.  These tests verify the learner-side guard still works.
  // ---------------------------------------------------------------------------

  it('redirects to sign-in when user is not authenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<LearnerLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.children).toBe('/(auth)/sign-in');
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  it('renders nothing while Clerk auth is still loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    render(<LearnerLayout />);

    // Should render nothing — no redirect, no tabs, no flash
    expect(screen.queryByTestId('redirect')).toBeNull();
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  it('shows profile loading spinner while profiles load after auth', () => {
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: true,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
    });

    render(<LearnerLayout />);

    expect(screen.getByTestId('profile-loading')).toBeTruthy();
    expect(screen.queryByTestId('tabs')).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });
});
