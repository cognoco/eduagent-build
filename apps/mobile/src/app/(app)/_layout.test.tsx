import { render, screen } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

const mockUseProfile = jest.fn();
const mockUseConsentStatus = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockUsePathname = jest.fn();
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
  Redirect: ({ href }: { href: unknown }) => {
    const { View } = require('react-native');
    return <View testID="redirect" href={href} />;
  },
  Tabs: mockTabs,
  usePathname: () => mockUsePathname(),
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
  useUser: () => ({
    user: {
      primaryEmailAddress: { emailAddress: 'child@example.com' },
    },
  }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => mockUseProfile(),
  personaFromBirthYear: () => 'learner',
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('../../hooks/use-consent', () => ({
  useConsentStatus: () => mockUseConsentStatus(),
  useRequestConsent: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('../../lib/theme', () => ({
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

jest.mock('../../components/feedback/FeedbackProvider', () => ({
  FeedbackProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const AppLayout = require('./_layout').default;

describe('AppLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/home');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [
        { id: 'p1', isOwner: true, consentStatus: null, birthYear: 1990 },
        { id: 'c1', isOwner: false, consentStatus: null, birthYear: 2014 },
      ],
      activeProfile: {
        id: 'p1',
        isOwner: true,
        consentStatus: null,
        birthYear: 1990,
      },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    mockUseConsentStatus.mockReturnValue({
      data: {
        consentStatus: null,
        parentEmail: null,
        consentType: null,
      },
    });
  });

  it('keeps linked-parent accounts in the learner tab shell for adaptive home', () => {
    render(<AppLayout />);

    expect(screen.getByTestId('tabs')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Auth guard — redirects unauthenticated users to sign-in.
  //
  // This is the guard that caused the navigation race condition: after
  // setActive(), if router.replace('/(app)/home') fired before Clerk's
  // React state propagated, this guard saw isSignedIn: false and bounced
  // the user back to an empty sign-in screen.  The fix removed explicit
  // navigation from auth screens — the auth layout guard now handles it
  // reactively.  These tests verify the app layout guard still works.
  // ---------------------------------------------------------------------------

  it('redirects to sign-in when user is not authenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<AppLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.href).toEqual({
      pathname: '/(auth)/sign-in',
      params: { redirectTo: '/home' },
    });
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  it('preserves the current path when redirecting unauthenticated users', () => {
    mockUsePathname.mockReturnValue('/quiz');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<AppLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.href).toEqual({
      pathname: '/(auth)/sign-in',
      params: { redirectTo: '/quiz' },
    });
  });

  it('strips route-group segments from redirect targets for unauthenticated users', () => {
    mockUsePathname.mockReturnValue('/(app)/quiz');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<AppLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.href).toEqual({
      pathname: '/(auth)/sign-in',
      params: { redirectTo: '/quiz' },
    });
  });

  it('renders nothing while Clerk auth is still loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    render(<AppLayout />);

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
      switchProfile: jest.fn(),
    });

    render(<AppLayout />);

    expect(screen.getByTestId('profile-loading')).toBeTruthy();
    expect(screen.queryByTestId('tabs')).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('tells waiting learners that consent is checked automatically', () => {
    mockUseProfile.mockReturnValue({
      profiles: [
        {
          id: 'c1',
          isOwner: false,
          consentStatus: 'PARENTAL_CONSENT_REQUESTED',
          birthYear: 2014,
        },
      ],
      activeProfile: {
        id: 'c1',
        isOwner: false,
        consentStatus: 'PARENTAL_CONSENT_REQUESTED',
        birthYear: 2014,
      },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    mockUseConsentStatus.mockReturnValue({
      data: {
        consentStatus: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
    });

    render(<AppLayout />);

    expect(screen.getByTestId('consent-pending-gate')).toBeTruthy();
    expect(
      screen.getByText("We'll keep checking automatically while you wait.")
    ).toBeTruthy();
  });
});
