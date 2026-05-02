import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import {
  clearPendingAuthRedirect,
  rememberPendingAuthRedirect,
  peekPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';

const mockUseProfile = jest.fn();
const mockUseConsentStatus = jest.fn();
const mockUsePathname = jest.fn();
const mockReplace = jest.fn();
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
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
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

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest
    .fn()
    .mockResolvedValue({ data: 'ExponentPushToken[mock]' }),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

const mockSpeechGetPermissions = jest
  .fn()
  .mockResolvedValue({ granted: true, canAskAgain: true });
const mockSpeechRequestPermissions = jest
  .fn()
  .mockResolvedValue({ granted: true });
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    getPermissionsAsync: mockSpeechGetPermissions,
    requestPermissionsAsync: mockSpeechRequestPermissions,
  },
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => mockUseProfile(),
  personaFromBirthYear: () => 'learner',
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
  // useParentProxy (rendered inside _layout) catches SecureStore failures
  // with Sentry.captureException — provide a no-op so the hook doesn't crash
  // during _layout rendering.
  Sentry: { captureException: jest.fn(), addBreadcrumb: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../../components/feedback/FeedbackProvider', () => ({
  FeedbackProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockUseSubjects = jest.fn();
jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => mockUseSubjects(),
}));

const AppLayout = require('./_layout').default;

describe('AppLayout', () => {
  let testQueryClient: QueryClient;

  function renderLayout() {
    return render(<AppLayout />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    clearPendingAuthRedirect();
    mockReplace.mockReset();
    mockUsePathname.mockReturnValue('/home');
    mockUseSubjects.mockReturnValue({ data: [], isLoading: false });
    mockSpeechGetPermissions.mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    mockSpeechRequestPermissions.mockResolvedValue({ granted: true });
    const ExpoNotifications = require('expo-notifications');
    (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (ExpoNotifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    const SecureStoreMock = require('expo-secure-store');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStoreMock.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps linked-parent accounts in the learner tab shell for adaptive home', () => {
    renderLayout();

    expect(screen.getByTestId('tabs')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  // [BUG-923] AUTH-DEBUG must log only on auth state transitions, not on
  // every render of the (app) layout. Pre-fix the log fired on every render,
  // drowning real signal in noise during debugging sessions.
  it('logs AUTH-DEBUG only once per mount when auth state is stable (BUG-923)', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(jest.fn());
    try {
      const { rerender } = renderLayout();
      const initialAuthLogs = logSpy.mock.calls.filter(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('[AUTH-DEBUG] (app) layout')
      ).length;
      // Re-render with the same auth state — the debug log must not fire again.
      rerender(<AppLayout />);
      rerender(<AppLayout />);
      const afterRerendersAuthLogs = logSpy.mock.calls.filter(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('[AUTH-DEBUG] (app) layout')
      ).length;
      expect(initialAuthLogs).toBe(1);
      expect(afterRerendersAuthLogs).toBe(initialAuthLogs);
    } finally {
      logSpy.mockRestore();
    }
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

    renderLayout();

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.href).toBe('/sign-in?redirectTo=%2F(app)%2Fhome');
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  it('preserves the current path when redirecting unauthenticated users', () => {
    mockUsePathname.mockReturnValue('/quiz');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    renderLayout();

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.href).toBe('/sign-in?redirectTo=%2F(app)%2Fquiz');
    expect(peekPendingAuthRedirect()).toBe('/(app)/quiz');
  });

  it('replays a pending auth redirect when the signed-in app shell lands on home', () => {
    rememberPendingAuthRedirect('/(app)/quiz');
    mockUsePathname.mockReturnValue('/home');

    renderLayout();

    expect(screen.getByTestId('auth-redirect-replay')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('keeps a matching auth redirect long enough to recover from a late home fallback', () => {
    jest.useFakeTimers();
    rememberPendingAuthRedirect('/(app)/quiz');
    mockUsePathname.mockReturnValue('/quiz');

    const view = renderLayout();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    mockUsePathname.mockReturnValue('/home');
    view.rerender(<AppLayout />);

    expect(peekPendingAuthRedirect()).toBe('/(app)/quiz');
    expect(screen.getByTestId('auth-redirect-replay')).toBeTruthy();
    expect(mockReplace).toHaveBeenLastCalledWith('/(app)/quiz');
  });

  it('clears a pending auth redirect after the target path stays stable', () => {
    jest.useFakeTimers();
    rememberPendingAuthRedirect('/(app)/quiz');
    mockUsePathname.mockReturnValue('/quiz');

    renderLayout();

    expect(peekPendingAuthRedirect()).toBe('/(app)/quiz');

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(peekPendingAuthRedirect()).toBeNull();
  });

  it('strips route-group segments from redirect targets for unauthenticated users', () => {
    mockUsePathname.mockReturnValue('/(app)/quiz');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    renderLayout();

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.href).toBe('/sign-in?redirectTo=%2F(app)%2Fquiz');
  });

  it('renders nothing while Clerk auth is still loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    renderLayout();

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

    renderLayout();

    expect(screen.getByTestId('profile-loading')).toBeTruthy();
    expect(screen.queryByTestId('tabs')).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  // [BUG-914] When a parent (isOwner=true) is the active profile — typically
  // because they just tapped "Switch back" while impersonating a child — the
  // post-approval celebration must NOT render. The celebration addresses the
  // child in the second person ("Your parent said yes"), so showing it to the
  // parent is wrong copy and indicates a misclassified state. Pre-fix, the
  // landing showed for any CONSENTED profile with no subjects, including
  // parents.
  it('does not show post-approval landing for parent (owner) profiles (BUG-914)', () => {
    mockUseProfile.mockReturnValue({
      profiles: [
        {
          id: 'p1',
          isOwner: true,
          consentStatus: 'CONSENTED',
          birthYear: 1990,
        },
      ],
      activeProfile: {
        id: 'p1',
        isOwner: true, // <-- parent
        consentStatus: 'CONSENTED',
        birthYear: 1990,
      },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    mockUseConsentStatus.mockReturnValue({
      data: {
        consentStatus: 'CONSENTED',
        parentEmail: null,
        consentType: null,
      },
    });
    // No subjects yet — pre-fix this triggered the celebration.
    mockUseSubjects.mockReturnValue({
      data: [],
      isLoading: false,
    });

    renderLayout();

    expect(screen.queryByTestId('post-approval-landing')).toBeNull();
    expect(screen.queryByText("You're approved!")).toBeNull();
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });

  it('does not show post-approval landing when user already has subjects (BUG-544)', () => {
    mockUseProfile.mockReturnValue({
      profiles: [
        {
          id: 'c1',
          isOwner: false,
          consentStatus: 'CONSENTED',
          birthYear: 2014,
        },
      ],
      activeProfile: {
        id: 'c1',
        isOwner: false,
        consentStatus: 'CONSENTED',
        birthYear: 2014,
      },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    mockUseConsentStatus.mockReturnValue({
      data: {
        consentStatus: 'CONSENTED',
        parentEmail: null,
        consentType: null,
      },
    });
    // User already has a subject — post-approval screen should NOT appear
    mockUseSubjects.mockReturnValue({
      data: [{ id: 's1', name: 'Spanish', isActive: true }],
      isLoading: false,
    });

    renderLayout();

    expect(screen.queryByTestId('post-approval-landing')).toBeNull();
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });

  it('renders in-app toast instead of native alert when profile was removed (BUG-548)', () => {
    const acknowledgeProfileRemoval = jest.fn();
    mockUseProfile.mockReturnValue({
      profiles: [
        { id: 'p1', isOwner: true, consentStatus: null, birthYear: 1990 },
      ],
      activeProfile: {
        id: 'p1',
        isOwner: true,
        consentStatus: null,
        birthYear: 1990,
      },
      isLoading: false,
      profileWasRemoved: true,
      acknowledgeProfileRemoval,
      switchProfile: jest.fn(),
    });

    renderLayout();

    expect(screen.getByTestId('profile-switched-toast')).toBeTruthy();
    expect(screen.getByText('Profile switched')).toBeTruthy();
  });

  it('shows proxy banner and switches back to the owner profile', () => {
    const switchProfile = jest.fn();
    mockUseProfile.mockReturnValue({
      profiles: [
        { id: 'p1', displayName: 'Parent', isOwner: true, birthYear: 1990 },
        { id: 'c1', displayName: 'Alex', isOwner: false, birthYear: 2014 },
      ],
      activeProfile: {
        id: 'c1',
        displayName: 'Alex',
        isOwner: false,
        consentStatus: null,
        birthYear: 2014,
      },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile,
    });

    renderLayout();

    expect(screen.getByTestId('proxy-banner')).toBeTruthy();
    expect(screen.getByText("Viewing Alex's account")).toBeTruthy();

    fireEvent.press(screen.getByTestId('proxy-banner-switch-back'));

    expect(switchProfile).toHaveBeenCalledWith('p1');
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

    renderLayout();

    expect(screen.getByTestId('consent-pending-gate')).toBeTruthy();
    expect(
      screen.getByText("We'll keep checking automatically while you wait.")
    ).toBeTruthy();
  });

  it('shows permission setup gate when permissions are not granted and flag is not set', async () => {
    const ExpoNotifications = require('expo-notifications');
    (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });
    mockSpeechGetPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });

    const SecureStoreMock = require('expo-secure-store');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);

    renderLayout();

    await waitFor(() => {
      expect(screen.getByTestId('permission-setup-gate')).toBeTruthy();
    });
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  it('skips permission gate when both permissions are already granted', async () => {
    const ExpoNotifications = require('expo-notifications');
    (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    mockSpeechGetPermissions.mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });

    const SecureStoreMock = require('expo-secure-store');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);

    renderLayout();

    await waitFor(() => {
      expect(screen.getByTestId('tabs')).toBeTruthy();
    });
    expect(screen.queryByTestId('permission-setup-gate')).toBeNull();
  });

  it('skips permission gate when SecureStore flag is already set', async () => {
    const ExpoNotifications = require('expo-notifications');
    (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });
    mockSpeechGetPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });

    const SecureStoreMock = require('expo-secure-store');
    (SecureStoreMock.getItemAsync as jest.Mock).mockImplementation(
      (key: string) => {
        if (key.startsWith('permissionSetupSeen_'))
          return Promise.resolve('true');
        return Promise.resolve(null);
      }
    );

    renderLayout();

    await waitFor(() => {
      expect(screen.getByTestId('tabs')).toBeTruthy();
    });
    expect(screen.queryByTestId('permission-setup-gate')).toBeNull();
  });

  it('dismisses permission gate when Continue is tapped', async () => {
    const ExpoNotifications = require('expo-notifications');
    (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });
    mockSpeechGetPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });

    const SecureStoreMock = require('expo-secure-store');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    renderLayout();

    await waitFor(() => {
      expect(screen.getByTestId('permission-setup-gate')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('permission-continue'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('tabs')).toBeTruthy();
    });
    expect(SecureStoreMock.setItemAsync).toHaveBeenCalledWith(
      'permissionSetupSeen_p1',
      'true'
    );
  });

  it('dismisses permission gate when Skip is tapped', async () => {
    const ExpoNotifications = require('expo-notifications');
    (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });
    mockSpeechGetPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });

    const SecureStoreMock = require('expo-secure-store');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    renderLayout();

    await waitFor(() => {
      expect(screen.getByTestId('permission-setup-gate')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('permission-skip'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('tabs')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// [BUG-776 / M-14] buildSwitchProfileConfirmation
// ---------------------------------------------------------------------------
// Pre-fix the consent-gate "Switch profile" handler silently picked the
// first non-current profile, so a 2+ child family could land on a child
// the parent wasn't expecting. This helper builds the platformAlert prompt
// used to confirm the destination by name; these tests pin its behavior
// across all family-size shapes.
const { buildSwitchProfileConfirmation } = require('./_layout');

describe('[BUG-776] buildSwitchProfileConfirmation', () => {
  it('returns null when activeProfile is missing', () => {
    expect(
      buildSwitchProfileConfirmation({
        activeProfile: null,
        profiles: [{ id: 'p1', displayName: 'Alex' }],
      })
    ).toBeNull();
  });

  it('returns null when there are no other profiles to switch to', () => {
    expect(
      buildSwitchProfileConfirmation({
        activeProfile: { id: 'p1' },
        profiles: [{ id: 'p1', displayName: 'Alex' }],
      })
    ).toBeNull();
  });

  it('names a single sibling clearly in title and message', () => {
    const result = buildSwitchProfileConfirmation({
      activeProfile: { id: 'parent' },
      profiles: [
        { id: 'parent', displayName: 'Mom' },
        { id: 'kid1', displayName: 'Alex' },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.target.id).toBe('kid1');
    expect(result.title).toBe('Switch to Alex?');
    expect(result.message).toContain("You'll continue as Alex.");
    // Single-sibling case: NO "other profiles" hint — it would be confusing
    // when there are no others.
    expect(result.message).not.toContain('Other profiles');
  });

  it('lists the other siblings when more than one alternative exists', () => {
    const result = buildSwitchProfileConfirmation({
      activeProfile: { id: 'parent' },
      profiles: [
        { id: 'parent', displayName: 'Mom' },
        { id: 'kid1', displayName: 'Alex' },
        { id: 'kid2', displayName: 'Sam' },
        { id: 'kid3', displayName: 'Jordan' },
      ],
    });
    expect(result).not.toBeNull();
    // Picks the first non-current (deterministic) but the user can now SEE
    // who they're being switched to and cancel if it's wrong.
    expect(result.target.id).toBe('kid1');
    expect(result.title).toBe('Switch to Alex?');
    // Message must enumerate the other siblings so a parent with 3 kids
    // can tell whether they're about to land on the right one.
    expect(result.message).toContain('Sam');
    expect(result.message).toContain('Jordan');
    // And give them an off-ramp.
    expect(result.message.toLowerCase()).toContain('cancel');
  });
});
