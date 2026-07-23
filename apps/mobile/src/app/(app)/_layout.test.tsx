import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import i18n from 'i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import {
  clearPendingAuthRedirect,
  rememberPendingAuthRedirect,
  peekPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';
import {
  setPreviewState,
  clearPreviewState,
  getPreviewState,
} from '../../lib/preview-onboarding-state';
import {
  createRoutedMockFetch,
  extractJsonBody,
  fetchCallsMatching,
} from '../../test-utils/mock-api-routes';

const mockFetch = createRoutedMockFetch();

jest.mock(
  '../../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch replaces real network; all hooks run against mockFetch */,
  () =>
    require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

const mockUseProfile = jest.fn();
const mockUsePathname = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockClerkSignOut = jest.fn();
const mockTabs = Object.assign(
  ({
    children,
    screenOptions,
    ...props
  }: {
    children?: React.ReactNode;
    screenOptions?: (input: { route: { name: string } }) => {
      sceneStyle?: unknown;
    };
  }) => {
    const { View } = require('react-native');
    const pathname =
      String(mockUsePathname() ?? '/mentor').split('?')[0] ?? '/mentor';
    const activeRootRoute = pathname.split('/').filter(Boolean)[0] ?? 'mentor';
    const activeOptions = screenOptions?.({
      route: { name: activeRootRoute },
    });
    return (
      <View testID="tabs" screenOptions={screenOptions} {...props}>
        <View testID="active-root-scene" style={activeOptions?.sceneStyle} />
        {children}
      </View>
    );
  },
  {
    Screen: () => null,
  },
);

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    const { View } = require('react-native');
    return <View testID="redirect" href={href} />;
  },
  Tabs: mockTabs,
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

let mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@clerk/expo', () => ({
  useAuth: jest.fn(),
  useClerk: () => ({ signOut: mockClerkSignOut }),
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
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
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

jest.mock(
  '../../lib/profile' /* gc1-allow: ProfileProvider context not available in jest; requireActual preserves pure helpers (isGuardianProfile etc.); only the context-dependent hook is stubbed */,
  () => ({
    ...jest.requireActual('../../lib/profile'),
    useProfile: () => mockUseProfile(),
  }),
);

// use-consent uses useApiClient — mocked at the fetch boundary via mockFetch.
// Routes: GET /consent/my-status, POST /consent/request

// prettier-ignore
jest.mock('../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useTheme: () => ({ colorScheme: 'light' }),
  useThemeColors: () => ({
    accent: '#0ea5e9',
    border: '#d4d4d8',
    muted: '#71717a',
    surface: '#ffffff',
    textInverse: '#ffffff',
    textPrimary: '#18181b',
    textSecondary: '#52525b',
    warning: '#a16207',
    proxyPreviewBackground: '#fff7ed',
    proxyPreviewBorder: '#f59e0b',
    proxyPreviewSceneBackground: '#fffaf3',
    proxyPreviewTabBackground: '#fff7ed',
  }),
  useTokenVars: () => ({}),
}));

jest.mock(
  '../../hooks/use-revenuecat' /* gc1-allow: native-boundary — wraps react-native-purchases SDK which is unavailable in jest */,
  () => ({
    useRevenueCatIdentity: jest.fn(),
  }),
);

jest.mock(
  '../../hooks/use-mentor-language-sync' /* gc1-allow: hook triggers i18next subscription + API mutations on mount; requireActual preserves module shape; only the side-effectful hook is stubbed */,
  () => ({
    ...jest.requireActual('../../hooks/use-mentor-language-sync'),
    useMentorLanguageSync: jest.fn(),
  }),
);

jest.mock(
  '../../lib/sentry' /* gc1-allow: native-boundary — wraps @sentry/react-native SDK; observability sink that cannot run in jest */,
  () => ({
    evaluateSentryForProfile: jest.fn(),
    // useParentProxy (rendered inside _layout) catches SecureStore failures
    // with Sentry.captureException — provide a no-op so the hook doesn't crash
    // during _layout rendering.
    Sentry: { captureException: jest.fn(), addBreadcrumb: jest.fn() },
  }),
);

jest.mock(
  '../../lib/secure-storage' /* gc1-allow: native-boundary — wraps expo-secure-store which is unavailable in jest */,
  () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
    sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
  }),
);

// FeedbackProvider is real — it composes FeedbackSheet (visible:false) which
// runs against the mocked theme/safe-area boundaries already in this file.
// No internal mock needed.

// use-subjects uses useApiClient — mocked at the fetch boundary via mockFetch.
// Route: GET /subjects → { subjects: [] }

const AppLayout = require('./_layout').default;
const {
  FULL_SCREEN_ROUTES,
  HIDDEN_TAB_ROUTES,
  V2_PUSHED_ROUTE_SAFE_AREA_OWNERSHIP,
  V2_ROOT_SAFE_AREA_EXCEPTIONS,
  assertV2SafeAreaOwnershipInvariant,
  resolveV2PushedScenePaddingTop,
  resolveV2TabIsActive,
} = require('./_layout');
const {
  computeModeVisibleTabs,
  computeVisibleTabs,
  resolveContractHomeTabPresentation,
  resolveHomeTabPresentation,
  resolveShellVisibleTabs,
  resolveTabShape,
} = require('../../lib/legacy-navigation-contract');
const { resolveNavigationContract } = require('../../lib/navigation-contract');

describe('mode tab helpers', () => {
  it('returns Study tabs for study mode', () => {
    expect([...computeModeVisibleTabs('study')].sort()).toEqual([
      'home',
      'library',
      'more',
      'progress',
    ]);
  });

  it('returns Family tabs for family mode', () => {
    expect([...computeModeVisibleTabs('family')].sort()).toEqual([
      'home',
      'more',
      'progress',
    ]);
  });

  it('returns V1 Family tabs from the navigation contract', () => {
    const parent = {
      id: '00000000-0000-7000-a000-000000000101',
      accountId: '00000000-0000-7000-a000-000000000001',
      avatarUrl: null,
      birthYear: 1985,
      consentStatus: null,
      conversationLanguage: 'en',
      createdAt: '2026-05-21T00:00:00.000Z',
      defaultAppContext: 'family',
      displayName: 'Parent',
      hasFamilyLinks: true,
      hasPremiumLlm: false,
      isOwner: true,
      linkCreatedAt: null,
      location: null,
      pronouns: null,
      updatedAt: '2026-05-21T00:00:00.000Z',
    };
    const child = {
      ...parent,
      id: '00000000-0000-7000-a000-000000000201',
      birthYear: 2014,
      defaultAppContext: null,
      displayName: 'Child',
      hasFamilyLinks: false,
      isOwner: false,
    };
    const contract = resolveNavigationContract({
      activeProfile: parent,
      profiles: [parent, child],
      isParentProxy: false,
      appContext: 'family',
      role: 'owner',
      subscription: {
        status: 'ready',
        tier: 'family',
        effectiveAccessTier: 'family',
        billingAccess: 'current',
      },
      flags: { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: true },
    });

    expect(
      [
        ...resolveShellVisibleTabs({
          familyCapable: true,
          isParentProxy: false,
          mode: 'family',
          navigationContract: contract,
          tabShape: 'guardian',
          useContract: true,
        }),
      ].sort(),
    ).toEqual(['home', 'more', 'progress', 'recaps']);
    expect(resolveContractHomeTabPresentation(contract.home)).toEqual({
      titleKey: 'tabs.children',
      accessibilityLabelKey: 'tabs.childrenLabel',
      iconName: 'Users',
    });
  });

  it('keeps proxy home presentation independent of mode', () => {
    expect(resolveHomeTabPresentation('guardian', true, 'family')).toEqual({
      titleKey: 'tabs.myLearning',
      accessibilityLabelKey: 'tabs.myLearningLabel',
      iconName: 'School',
    });
  });
});

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
    mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    clearPendingAuthRedirect();
    mockReplace.mockReset();
    mockBack.mockReset();
    mockCanGoBack.mockReset();
    mockCanGoBack.mockReturnValue(false);
    mockClerkSignOut.mockReset();
    mockClerkSignOut.mockResolvedValue(undefined);
    mockUsePathname.mockReturnValue('/home');
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
    const SecureStoreMock = require('../../lib/secure-storage');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStoreMock.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [
        {
          id: 'p1',
          displayName: 'Parent',
          isOwner: true,
          consentStatus: null,
          birthYear: 1990,
        },
        {
          id: 'c1',
          displayName: 'Child',
          isOwner: false,
          consentStatus: null,
          birthYear: 2014,
        },
      ],
      activeProfile: {
        id: 'p1',
        displayName: 'Parent',
        isOwner: true,
        consentStatus: null,
        birthYear: 1990,
      },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
      isExplicitProxyMode: false,
    });

    // Default fetch routes for API hooks
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: null,
            parentEmail: null,
            consentType: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/consent/request',
      () =>
        new Response(JSON.stringify({ sent: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/subjects',
      () =>
        new Response(JSON.stringify({ subjects: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/dashboard',
      () =>
        new Response(JSON.stringify({ children: [], demoMode: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/dashboard/demo',
      () =>
        new Response(JSON.stringify({ children: [], demoMode: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/settings/push-token',
      () =>
        new Response(JSON.stringify({ registered: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/subscription/status',
      () =>
        new Response(
          JSON.stringify({
            status: {
              tier: 'family',
              effectiveAccessTier: 'family',
              billingAccess: 'current',
              status: 'active',
              monthlyLimit: 700,
              usedThisMonth: 0,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Ratchet: the welcome intro moved pre-auth
  // (docs/plans/2026-05-27-pre-auth-welcome-flow.md). The (app) layout no
  // longer probes intro SecureStore state and never redirects signed-in users
  // to /(app)/welcome. If a future refactor reintroduces the probe, this test
  // fails and stops the regression at the source.
  it('does not probe or gate on welcome intro state for signed-in users', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '_layout.tsx'), 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*intro-state['"]/);
    expect(source).not.toMatch(/introProbeState/);
    expect(source).not.toMatch(/hasSeenIntro/);
    expect(source).not.toMatch(/\/\(app\)\/welcome/);
  });

  it('renders guardian tab shell for accounts with linked children', async () => {
    renderLayout();

    // await: probe-state effect (getPreviewState Promise) must resolve before
    // the gate logic falls through to the Tabs. findByTestId polls until found.
    await screen.findByTestId('tabs');
    expect(screen.queryByTestId('redirect')).toBeNull();

    const shape = resolveTabShape({
      activeProfile: { isOwner: true },
      profiles: [{ isOwner: true }, { isOwner: false }],
      isParentProxy: false,
    });
    expect(shape).toBe('guardian');
    expect(computeVisibleTabs(shape).has('own-learning')).toBe(true);
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
          args[0].includes('[AUTH-DEBUG] (app) layout'),
      ).length;
      // Re-render with the same auth state — the debug log must not fire again.
      rerender(<AppLayout />);
      rerender(<AppLayout />);
      const afterRerendersAuthLogs = logSpy.mock.calls.filter(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('[AUTH-DEBUG] (app) layout'),
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

    screen.getByTestId('auth-redirect-replay');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('[WI-1849] times out a stuck auth redirect and recovers to Home', () => {
    jest.useFakeTimers();
    rememberPendingAuthRedirect('/(app)/quiz');
    mockUsePathname.mockReturnValue('/home');

    renderLayout();
    screen.getByTestId('auth-redirect-replay');

    act(() => {
      jest.advanceTimersByTime(15_000);
    });

    screen.getByTestId('auth-redirect-timeout');
    fireEvent.press(screen.getByTestId('auth-redirect-timeout-home'));
    expect(mockReplace).toHaveBeenLastCalledWith('/(app)/home');
  });

  it('preserves the query string when replaying a child deep-link [BUG-766]', () => {
    // [BUG-766] Direct hard-load of /child/{id}?mode=progress used to lose
    // the mode query during the sign-in → replay round-trip, landing the
    // user on the unfiltered child detail (which then redirected to home).
    rememberPendingAuthRedirect('/(app)/child/emma-id?mode=progress');
    mockUsePathname.mockReturnValue('/home');

    renderLayout();

    screen.getByTestId('auth-redirect-replay');
    expect(mockReplace).toHaveBeenCalledWith(
      '/(app)/child/emma-id?mode=progress',
    );
  });

  it('preserves the query string when redirecting unauthenticated users [BUG-766]', () => {
    mockUsePathname.mockReturnValue('/child/emma-id?mode=progress');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    renderLayout();

    const redirect = screen.getByTestId('redirect');
    // The redirectTo query param must encode the FULL original deep link
    // including ?mode=progress so post-sign-in replay lands on the correct
    // child detail mode.
    expect(redirect.props.href).toContain('redirectTo=');
    const href = redirect.props.href as string;
    const decoded = decodeURIComponent(href.split('redirectTo=')[1] ?? '');
    expect(decoded).toBe('/(app)/child/emma-id?mode=progress');
    expect(peekPendingAuthRedirect()).toBe(
      '/(app)/child/emma-id?mode=progress',
    );
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
    screen.getByTestId('auth-redirect-replay');
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

  it('clears the default home auth redirect immediately after landing on home', () => {
    rememberPendingAuthRedirect('/(app)/home');
    mockUsePathname.mockReturnValue('/home');

    const view = renderLayout();

    expect(peekPendingAuthRedirect()).toBeNull();

    mockReplace.mockClear();
    mockUsePathname.mockReturnValue('/create-profile');
    view.rerender(<AppLayout />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('auth-redirect-replay')).toBeNull();
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

    screen.getByTestId('profile-loading');
    expect(screen.queryByTestId('tabs')).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('[WI-2240] does not render Account navigation while a restored child proxy state is unresolved', () => {
    mockUsePathname.mockReturnValue('/account/privacy');
    mockUseProfile.mockReturnValue({
      profiles: [
        {
          id: 'c1',
          displayName: 'Child',
          isOwner: false,
          consentStatus: null,
          birthYear: 2014,
        },
      ],
      activeProfile: {
        id: 'c1',
        displayName: 'Child',
        isOwner: false,
        consentStatus: null,
        birthYear: 2014,
      },
      isExplicitProxyMode: false,
      isLoading: true,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });

    renderLayout();

    screen.getByTestId('profile-loading');
    expect(screen.queryByTestId('tabs')).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('[WI-1849] exposes retry and sign-out recovery after profile loading times out', async () => {
    jest.useFakeTimers();
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: true,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });

    renderLayout();
    screen.getByTestId('profile-loading');

    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    screen.getByTestId('profile-loading-timeout');

    fireEvent.press(screen.getByTestId('profile-loading-timeout-retry'));
    screen.getByTestId('profile-loading');

    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    screen.getByTestId('profile-loading-timeout');

    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-loading-timeout-signout'));
      await Promise.resolve();
    });
    expect(mockClerkSignOut).toHaveBeenCalledTimes(1);
  });

  it('[BUG-PROFILE-GATE] shows a retryable profile-load error instead of create-profile gate', () => {
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: false,
      profileLoadError: new Error('profiles failed'),
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });

    renderLayout();

    screen.getByTestId('profile-load-error');
    screen.getByText('We could not load your profile');
    expect(screen.queryByTestId('create-profile-gate')).toBeNull();
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  // [BUG-914] When a parent (isOwner=true) is the active profile — typically
  // because they just tapped "Switch back" while impersonating a child — the
  // post-approval celebration must NOT render. The celebration addresses the
  // child in the second person ("Your parent said yes"), so showing it to the
  // parent is wrong copy and indicates a misclassified state. Pre-fix, the
  // landing showed for any CONSENTED profile with no subjects, including
  // parents.
  it('does not show post-approval landing for parent (owner) profiles (BUG-914)', async () => {
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
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: 'CONSENTED',
            parentEmail: null,
            consentType: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    // No subjects yet — pre-fix this triggered the celebration.
    // Default /subjects route returns [] — no override needed.

    renderLayout();

    // await: probe-state effect must resolve before the tabs render.
    await screen.findByTestId('tabs');
    expect(screen.queryByTestId('post-approval-landing')).toBeNull();
    expect(screen.queryByText("You're approved!")).toBeNull();
  });

  // [BUG-61] A teen-owner (under-18 with their own account) who just
  // transitioned PARENTAL_CONSENT_REQUESTED → CONSENTED IS the audience for
  // "Your parent said yes" — they're the learner, not an impersonating parent.
  // The discriminator vs the BUG-914 adult-owner case is consentData.parentEmail
  // (non-null only after a parental-consent record exists).
  it('shows post-approval landing for a teen-owner whose parent just approved (BUG-61)', async () => {
    mockUseProfile.mockReturnValue({
      profiles: [
        {
          id: 'p1',
          isOwner: true,
          consentStatus: 'CONSENTED',
          birthYear: 2014, // teen
        },
      ],
      activeProfile: {
        id: 'p1',
        isOwner: true,
        consentStatus: 'CONSENTED',
        birthYear: 2014,
      },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: 'CONSENTED',
            parentEmail: 'parent@example.com',
            consentType: 'GDPR',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    // No subjects yet — empty list is the default.

    renderLayout();

    await waitFor(() => {
      expect(screen.getByTestId('post-approval-landing'));
    });
    expect(screen.getByTestId('post-approval-continue'));
  });

  it('does not show post-approval landing when user already has subjects (BUG-544)', async () => {
    mockUseProfile.mockReturnValue({
      profiles: [
        {
          id: '00000000-0000-7000-a000-000000000102',
          isOwner: false,
          consentStatus: 'CONSENTED',
          birthYear: 2014,
        },
      ],
      activeProfile: {
        id: '00000000-0000-7000-a000-000000000102',
        isOwner: false,
        consentStatus: 'CONSENTED',
        birthYear: 2014,
      },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: 'CONSENTED',
            parentEmail: null,
            consentType: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    // User already has a subject — post-approval screen should NOT appear
    mockFetch.setRoute(
      '/subjects',
      () =>
        new Response(
          JSON.stringify({
            subjects: [
              {
                id: '00000000-0000-7000-a000-000000000301',
                profileId: '00000000-0000-7000-a000-000000000101',
                name: 'Spanish',
                rawInput: null,
                status: 'active',
                curriculumStatus: 'ready',
                pedagogyMode: 'socratic',
                languageCode: null,
                createdAt: '2026-05-21T00:00:00.000Z',
                updatedAt: '2026-05-21T00:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    renderLayout();

    // await: probe-state effect must resolve before the tabs render.
    await screen.findByTestId('tabs', { includeHiddenElements: true });
    expect(screen.queryByTestId('post-approval-landing')).toBeNull();
  });

  it('renders in-app toast instead of native alert when profile was removed (BUG-548)', async () => {
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

    // await: probe-state effect must resolve before the tabs+toast render.
    await screen.findByTestId('profile-switched-toast');
    screen.getByText('Profile switched');
    screen.getByText('The profile you were viewing has been removed.');
  });

  it('keeps v2 top and bottom chrome outside system navigation overlays when reported insets are zero', async () => {
    const flags = require('../../lib/feature-flags') as {
      FEATURE_FLAGS: { MODE_NAV_V2_ENABLED: boolean };
    };
    const original = flags.FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    try {
      (
        flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
      ).MODE_NAV_V2_ENABLED = true;
      mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

      renderLayout();

      expect(await screen.findByTestId('account-avatar-shell')).toHaveStyle({
        top: 32,
      });
      const tabs = await screen.findByTestId('tabs');
      const screenOptions = tabs.props.screenOptions as ({
        route,
      }: {
        route: { name: string };
      }) => { tabBarStyle: { height?: number; paddingBottom?: number } };
      expect(screenOptions({ route: { name: 'mentor' } }).tabBarStyle).toEqual(
        expect.objectContaining({
          height: 104,
          paddingBottom: 48,
        }),
      );
    } finally {
      (
        flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
      ).MODE_NAV_V2_ENABLED = original;
    }
  });

  it.each(
    [
      '/dashboard',
      '/billing/manage',
      '/subject-hub/subject-1',
      '/progress/saved',
    ].flatMap((pathname) => [
      { pathname, surface: '360x760 web', safeAreaTop: 0 },
      { pathname, surface: 'native safe area', safeAreaTop: 47 },
    ]),
  )(
    'renders $pathname below the complete fixed v2 chrome once on $surface',
    async ({ pathname, safeAreaTop }) => {
      const flags = require('../../lib/feature-flags') as {
        FEATURE_FLAGS: { MODE_NAV_V2_ENABLED: boolean };
      };
      const original = flags.FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
      try {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = true;
        mockSafeAreaInsets = {
          top: safeAreaTop,
          bottom: 0,
          left: 0,
          right: 0,
        };
        mockUsePathname.mockReturnValue(pathname);

        renderLayout();

        const activeScene = await screen.findByTestId('active-root-scene');
        const avatarShell = screen.getByTestId('account-avatar-shell', {
          includeHiddenElements: true,
        });
        const avatarTop = Math.max(safeAreaTop, 24) + 8;
        expect(avatarShell).toHaveStyle({ top: avatarTop });

        const expectedPushedPadding = avatarTop + 44;
        expect(activeScene).toHaveStyle({
          paddingTop: expectedPushedPadding,
        });
      } finally {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = original;
      }
    },
  );

  it.each([
    '/mentor-memory',
    '/more/accommodation',
    '/subscription',
    '/more/account',
    '/subject/subject-1',
    '/topic/topic-1',
    '/my-notes',
  ])(
    'composes root chrome clearance with child-owned safe area exactly once for %s',
    async (pathname) => {
      const flags = require('../../lib/feature-flags') as {
        FEATURE_FLAGS: { MODE_NAV_V2_ENABLED: boolean };
      };
      const original = flags.FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
      try {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = true;
        const safeAreaTop = 47;
        mockSafeAreaInsets = {
          top: safeAreaTop,
          bottom: 0,
          left: 0,
          right: 0,
        };
        mockUsePathname.mockReturnValue(pathname);

        renderLayout();

        const activeScene = await screen.findByTestId('active-root-scene');
        const rootPadding = (activeScene.props.style as { paddingTop: number })
          .paddingTop;
        const completeChromeClearance = Math.max(safeAreaTop, 24) + 8 + 44;

        expect(rootPadding + safeAreaTop).toBe(completeChromeClearance);
      } finally {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = original;
      }
    },
  );

  it.each(
    [
      { pathname: '/mentor', routeKind: 'Mentor tab', ownsChrome: true },
      { pathname: '/subjects', routeKind: 'Subjects tab', ownsChrome: true },
      { pathname: '/journal', routeKind: 'Journal tab', ownsChrome: true },
      {
        pathname: '/account',
        routeKind: 'full-screen account',
        ownsChrome: false,
      },
      {
        pathname: '/session',
        routeKind: 'full-screen session',
        ownsChrome: false,
      },
    ].flatMap(({ pathname, routeKind, ownsChrome }) => [
      {
        pathname,
        routeKind,
        ownsChrome,
        surface: '360x760 web',
        safeAreaTop: 0,
      },
      {
        pathname,
        routeKind,
        ownsChrome,
        surface: 'native safe area',
        safeAreaTop: 47,
      },
    ]),
  )(
    'keeps $routeKind content below floating v2 controls on $surface',
    async ({ pathname, ownsChrome, safeAreaTop }) => {
      const flags = require('../../lib/feature-flags') as {
        FEATURE_FLAGS: { MODE_NAV_V2_ENABLED: boolean };
      };
      const original = flags.FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
      try {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = true;
        mockSafeAreaInsets = {
          top: safeAreaTop,
          bottom: 0,
          left: 0,
          right: 0,
        };
        mockUsePathname.mockReturnValue(pathname);

        renderLayout();

        expect(await screen.findByTestId('active-root-scene')).toHaveStyle({
          paddingTop: ownsChrome ? Math.max(safeAreaTop, 24) + 8 + 44 : 0,
        });
      } finally {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = original;
      }
    },
  );

  it('moves visible Subjects content below a scope chip that grows for font scaling', async () => {
    const flags = require('../../lib/feature-flags') as {
      FEATURE_FLAGS: { MODE_NAV_V2_ENABLED: boolean };
    };
    const original = flags.FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    try {
      (
        flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
      ).MODE_NAV_V2_ENABLED = true;
      mockSafeAreaInsets = { top: 47, bottom: 0, left: 0, right: 0 };
      mockUsePathname.mockReturnValue('/subjects');

      renderLayout();

      const scopeShell = await screen.findByTestId('scope-chip-shell', {
        includeHiddenElements: true,
      });
      fireEvent(scopeShell, 'layout', {
        nativeEvent: { layout: { height: 64 } },
      });

      expect(await screen.findByTestId('active-root-scene')).toHaveStyle({
        paddingTop: 119,
      });
    } finally {
      (
        flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
      ).MODE_NAV_V2_ENABLED = original;
    }
  });

  it.each([
    { surface: '360x760 web', safeAreaTop: 0, expectedPadding: 76 },
    { surface: 'native safe area', safeAreaTop: 47, expectedPadding: 52 },
  ])(
    'preserves top-level More safe-area ownership on $surface',
    async ({ safeAreaTop, expectedPadding }) => {
      const flags = require('../../lib/feature-flags') as {
        FEATURE_FLAGS: { MODE_NAV_V2_ENABLED: boolean };
      };
      const original = flags.FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
      try {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = true;
        mockSafeAreaInsets = {
          top: safeAreaTop,
          bottom: 0,
          left: 0,
          right: 0,
        };
        mockUsePathname.mockReturnValue('/more');

        renderLayout();

        expect(await screen.findByTestId('active-root-scene')).toHaveStyle({
          paddingTop: expectedPadding,
        });
      } finally {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = original;
      }
    },
  );

  it('keeps pushed content below chrome that grows for font scaling or long scope labels', async () => {
    const flags = require('../../lib/feature-flags') as {
      FEATURE_FLAGS: { MODE_NAV_V2_ENABLED: boolean };
    };
    const original = flags.FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    try {
      (
        flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
      ).MODE_NAV_V2_ENABLED = true;
      mockSafeAreaInsets = { top: 47, bottom: 0, left: 0, right: 0 };
      mockUsePathname.mockReturnValue('/more/accommodation');

      renderLayout();

      const scopeShell = await screen.findByTestId('scope-chip-shell', {
        includeHiddenElements: true,
      });
      fireEvent(scopeShell, 'layout', {
        nativeEvent: { layout: { height: 64 } },
      });

      expect(await screen.findByTestId('active-root-scene')).toHaveStyle({
        // 119px complete measured chrome minus the child's 47px safe inset.
        paddingTop: 72,
      });
    } finally {
      (
        flags.FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
      ).MODE_NAV_V2_ENABLED = original;
    }
  });

  it.each([
    { caseName: 'flags-off', v0: false, v1: false },
    { caseName: 'V0', v0: true, v1: false },
    { caseName: 'V1', v0: true, v1: true },
  ])(
    'does not add v2 pushed-scene clearance to the $caseName shell',
    async ({ v0, v1 }) => {
      const flags = require('../../lib/feature-flags') as {
        FEATURE_FLAGS: {
          MODE_NAV_V0_ENABLED: boolean;
          MODE_NAV_V1_ENABLED: boolean;
          MODE_NAV_V2_ENABLED: boolean;
        };
      };
      const original = { ...flags.FEATURE_FLAGS };
      try {
        Object.assign(flags.FEATURE_FLAGS, {
          MODE_NAV_V0_ENABLED: v0,
          MODE_NAV_V1_ENABLED: v1,
          MODE_NAV_V2_ENABLED: false,
        });
        mockSafeAreaInsets = { top: 47, bottom: 34, left: 0, right: 0 };
        mockUsePathname.mockReturnValue('/mentor-memory');

        renderLayout();

        expect(await screen.findByTestId('active-root-scene')).toHaveStyle({
          paddingTop: 0,
        });
        expect(
          screen.queryByTestId('account-avatar-shell', {
            includeHiddenElements: true,
          }),
        ).toBeNull();
      } finally {
        Object.assign(flags.FEATURE_FLAGS, original);
      }
    },
  );

  it('shows proxy banner and switches back to the owner profile', async () => {
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
      isExplicitProxyMode: true,
    });

    renderLayout();

    // await: probe-state effect must resolve before the tabs+banner render.
    await screen.findByTestId('proxy-banner');
    const tabs = await screen.findByTestId('tabs');
    const screenOptions = tabs.props.screenOptions as ({
      route,
    }: {
      route: { name: string };
    }) => { sceneStyle: { paddingTop: number } };
    expect(
      screenOptions({ route: { name: 'mentor-memory' } }).sceneStyle.paddingTop,
    ).toBe(0);
    // Exact match — a regression that breaks the {{name}} interpolation
    // ("Viewing as " with an empty/literal name) would slip past the broader
    // /Viewing as/ regex. test-setup.ts initializes i18next synchronously
    // with en.json so {{name}} resolves at render.
    screen.getByText('Parent preview');
    screen.getByText('Viewing as Alex');

    fireEvent.press(screen.getByTestId('proxy-banner-switch-back'));

    expect(switchProfile).toHaveBeenCalledWith('p1');
  });

  it('tells waiting learners that consent is checked automatically', async () => {
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
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: 'PARENTAL_CONSENT_REQUESTED',
            parentEmail: 'parent@example.com',
            consentType: 'GDPR',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    renderLayout();

    // await: probe-state effect must resolve before the consent gate renders.
    await screen.findByTestId('consent-pending-gate');
    expect(screen.getByText('Checking automatically…'));
  });

  it('[WI-374/WI-261] resend posts to /consent/resend with NO email — the masked address is never sent back', async () => {
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
    // my-status returns the MASKED address (what the real endpoint does).
    const MASKED = 'p***t@example.com';
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: 'PARENTAL_CONSENT_REQUESTED',
            parentEmail: MASKED,
            consentType: 'GDPR',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/consent/resend',
      () =>
        new Response(
          JSON.stringify({
            message: 'Consent request sent to parent',
            consentType: 'GDPR',
            emailStatus: 'sent',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    renderLayout();

    const resendBtn = await screen.findByTestId('consent-resend');
    mockFetch.mockClear();
    fireEvent.press(resendBtn);

    // A resend call lands on /consent/resend.
    await waitFor(() => {
      const hitResend = mockFetch.mock.calls.some(
        ([input]: [string | URL | Request]) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : (input as Request).url;
          return url.includes('/consent/resend');
        },
      );
      expect(hitResend).toBe(true);
    });

    // No call carried the masked address, and no call hit /consent/request.
    for (const [input, init] of mockFetch.mock.calls) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      const body = String((init as RequestInit | undefined)?.body ?? '');
      expect(body).not.toContain(MASKED);
      expect(body).not.toContain('parentEmail');
      if (url.includes('/consent/')) {
        expect(url).not.toContain('/consent/request');
      }
    }
  });

  // Permission setup gate is JIT-disabled — permissions are requested at
  // feature entry (mic on first voice tap, camera on homework screen,
  // notifications after session value), never via an upfront screen at app
  // launch.
  it('never shows the permission setup gate even when permissions are denied', async () => {
    const ExpoNotifications = require('expo-notifications');
    (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });
    mockSpeechGetPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });

    const SecureStoreMock = require('../../lib/secure-storage');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);

    renderLayout();

    await waitFor(() => {
      screen.getByTestId('tabs');
    });
    expect(screen.queryByTestId('permission-setup-gate')).toBeNull();
  });

  // Accessibility: VoiceOver language annotation
  // The root <View> must carry accessibilityLanguage so iOS VoiceOver uses the
  // correct TTS voice for all descendants via inheritance — instead of falling
  // back to the device's system-default language (which produces nonsensical
  // TTS for e.g. German text read by a Japanese-configured device).
  //
  // Strategy: the test-setup initializes i18next with 'en'. We register a
  // minimal 'de' bundle and call changeLanguage('de') synchronously (no async
  // backend required) BEFORE rendering, then assert the rendered root view
  // carries accessibilityLanguage='de'.
  it('sets accessibilityLanguage on the root view to match the active i18n locale', async () => {
    // i18next's default export is the shared singleton instance (same one the
    // app and test-setup initialize), so changeLanguage here drives the render.
    const originalLanguage = i18n.language;

    // Register a minimal stub so changeLanguage('de') does not trigger a
    // missing-backend async load that never resolves.
    i18n.addResourceBundle('de', 'translation', {}, false, true);
    // changeLanguage is synchronous when the resource bundle is already loaded.
    i18n.changeLanguage('de');

    try {
      renderLayout();

      // await probe-state effect before the tab shell mounts.
      await screen.findByTestId('tabs');

      const rootView = screen.getByTestId('app-root-view');
      expect(rootView.props.accessibilityLanguage).toBe('de');
    } finally {
      i18n.changeLanguage(originalLanguage);
    }
  });
});

// ---------------------------------------------------------------------------
// AppLayout no-profile gate — preview branch
// Tests for the SaveWizardGate inline gate (Task 11 / [CRITICAL-A2]).
// ---------------------------------------------------------------------------

describe('AppLayout no-profile gate — preview branch', () => {
  let testQueryClient: QueryClient;

  // Minimal route handlers needed to prevent fetch errors in the layout hooks.
  function setupDefaultRoutes() {
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: null,
            parentEmail: null,
            consentType: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/subjects',
      () =>
        new Response(JSON.stringify({ subjects: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/dashboard',
      () =>
        new Response(JSON.stringify({ children: [], demoMode: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/settings/push-token',
      () =>
        new Response(JSON.stringify({ registered: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
  }

  // Render the layout with no active profile and no loading state.
  // Returns the render result plus a simulateProfileCreated helper.
  function renderAppLayoutWithNoProfile() {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    const AppLayout = require('./_layout').default;
    const result = render(<AppLayout />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    function simulateProfileCreated(profile: { id: string; isOwner: boolean }) {
      mockUseProfile.mockReturnValue({
        profiles: [profile],
        activeProfile: profile,
        isLoading: false,
        profileWasRemoved: false,
        acknowledgeProfileRemoval: jest.fn(),
        switchProfile: jest.fn(),
      });
      act(() => {
        result.rerender(<AppLayout />);
      });
    }

    return { ...result, simulateProfileCreated };
  }

  // Render the layout with an active profile already set (no-profile gate skipped).
  function renderAppLayoutWithActiveProfile() {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
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
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    const AppLayout = require('./_layout').default;
    return render(<AppLayout />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    mockUsePathname.mockReturnValue('/home');
    const SecureStoreMock = require('../../lib/secure-storage');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStoreMock.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    // Also clear the in-memory preview state between tests.
    await clearPreviewState();
    setupDefaultRoutes();
  });

  afterEach(() => {
    jest.useRealTimers();
    // Restore any spies (e.g. getPreviewState spy in the loading test) so
    // they don't leak into subsequent tests. clearAllMocks() in beforeEach
    // clears call counts but not spy implementations.
    jest.restoreAllMocks();
  });

  it('renders the SaveWizardGate when preview state exists and flag is on', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });

    const { findByTestId, queryByTestId } = renderAppLayoutWithNoProfile();

    // [CRITICAL-A2] The wizard is INLINE — no route navigation; assert the
    // SaveWizardGate testID is present in the same render tree.
    expect(await findByTestId('save-wizard-gate')).toBeTruthy();
    expect(queryByTestId('create-profile-gate')).toBeNull();
  });

  // [MEDIUM-D2 / CJS constraint] The ideal approach is jest.doMock +
  // jest.isolateModulesAsync, but @testing-library/react-native registers
  // afterAll hooks at import time, which Jest forbids inside isolateModules
  // callbacks. jest.isolateModulesAsync with dynamic import() also requires
  // --experimental-vm-modules (not enabled in this Babel/CJS preset).
  //
  // Safe alternative in CJS: patch the shared FEATURE_FLAGS object for the
  // duration of the test and restore it in a finally block. Jest runs tests
  // within a file sequentially (never in parallel within the same worker), so
  // the mutation does not race with other tests in this file. Cross-worker
  // isolation is already guaranteed by Jest's separate-process-per-file model.
  it('falls through to CreateProfileGate when flag is off, even with stale preview state', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });

    const flags = require('../../lib/feature-flags') as {
      FEATURE_FLAGS: { PREVIEW_ONBOARDING_ENABLED: boolean };
    };
    const original = flags.FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED;
    try {
      (
        flags.FEATURE_FLAGS as { PREVIEW_ONBOARDING_ENABLED: boolean }
      ).PREVIEW_ONBOARDING_ENABLED = false;
      const { findByTestId, queryByTestId } = renderAppLayoutWithNoProfile();
      expect(await findByTestId('create-profile-gate')).toBeTruthy();
      expect(queryByTestId('save-wizard-gate')).toBeNull();
    } finally {
      (
        flags.FEATURE_FLAGS as {
          PREVIEW_ONBOARDING_ENABLED: boolean;
        }
      ).PREVIEW_ONBOARDING_ENABLED = original;
    }
  });

  it('renders loading state during preview-state async probe', async () => {
    // Spy getPreviewState to return a pending promise. Assert loading testID
    // is rendered; assert neither gate nor wizard is in the tree.
    let resolve!: (v: null) => void;
    jest
      .spyOn(require('../../lib/preview-onboarding-state'), 'getPreviewState')
      .mockReturnValue(
        new Promise<null>((r) => {
          resolve = r;
        }),
      );

    const { getByTestId, queryByTestId } = renderAppLayoutWithNoProfile();
    expect(getByTestId('preview-state-loading')).toBeTruthy();
    expect(queryByTestId('create-profile-gate')).toBeNull();
    expect(queryByTestId('save-wizard-gate')).toBeNull();

    // Resolve the promise so the effect completes and doesn't cause warnings.
    await act(async () => {
      resolve(null);
    });
  });

  it('[BUG] falls through to the app shell when the preview-state SecureStore probe hangs', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(require('../../lib/preview-onboarding-state'), 'getPreviewState')
      .mockReturnValue(new Promise<null>(() => undefined));

    renderAppLayoutWithActiveProfile();

    expect(screen.getByTestId('preview-state-loading')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    await Promise.resolve();

    expect(screen.queryByTestId('preview-state-loading')).toBeNull();
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });

  // [CRITICAL-A2 / HIGH-A2] Wizard outlives the auto-activation transition.
  it('keeps SaveWizardGate mounted after ProfileProvider auto-activates the first profile', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    const { findByTestId, simulateProfileCreated } =
      renderAppLayoutWithNoProfile();
    await findByTestId('save-wizard-gate');
    // Drive the harness to inject a created profile and let the provider
    // auto-activate it (mirrors what happens at runtime after the owner POST
    // resolves and the cache is updated).
    simulateProfileCreated({ id: 'p1', isOwner: true });
    // Wizard MUST still be mounted; we have NOT signalled wizardDone yet.
    expect(await findByTestId('save-wizard-gate')).toBeTruthy();
  });

  it('ignores and clears stale preview state for an already-profiled account', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });

    const { queryByTestId } = renderAppLayoutWithActiveProfile();

    await waitFor(() => {
      expect(queryByTestId('save-wizard-gate')).toBeNull();
    });
    await waitFor(async () => {
      expect(await getPreviewState()).toBeNull();
    });
  });

  // [CRITICAL-B2] Once the wizard has genuinely started, the layout must not
  // clear preview state when ProfileProvider auto-activates the first profile.
  it('does NOT clear preview state after the wizard has started and activeProfile becomes truthy', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    const { findByTestId, simulateProfileCreated } =
      renderAppLayoutWithNoProfile();
    await findByTestId('save-wizard-gate');
    simulateProfileCreated({ id: 'p1', isOwner: true });

    // The layout must leave the key intact; cleanup is the wizard's job (or TTL/sign-out).
    expect(await getPreviewState()).not.toBeNull();
  });
});

describe('computeVisibleTabs', () => {
  it('returns all 5 tabs for guardian shape', () => {
    const tabs = computeVisibleTabs('guardian');
    expect(tabs).toEqual(
      new Set(['home', 'own-learning', 'library', 'progress', 'more']),
    );
  });

  // When both MODE_NAV_V0_ENABLED and MODE_NAV_V1_ENABLED are off, the shell
  // must still show 5 tabs for a guardian profile (resolveShellVisibleTabs
  // falls through to the V0 helper path with useContract=false). This is the
  // critical production invariant — neither flag mutation should collapse
  // guardian's own-learning tab.
  it('resolveShellVisibleTabs preserves 5-tab guardian shell when both mode-navigation flags are off', () => {
    // useContract=false (V1 off) + familyCapable=false (V0 off) → falls through
    // to computeVisibleTabs(tabShape, isParentProxy)
    const tabs = resolveShellVisibleTabs({
      familyCapable: false,
      isParentProxy: false,
      mode: null,
      // navigationContract is unused when useContract=false; stub the required field
      navigationContract: { visibleTabs: new Set() as ReadonlySet<never> },
      tabShape: 'guardian',
      useContract: false,
    });
    expect(tabs).toEqual(
      new Set(['home', 'own-learning', 'library', 'progress', 'more']),
    );
  });

  it('defaults to guardian shape', () => {
    expect(computeVisibleTabs()).toEqual(computeVisibleTabs('guardian'));
  });

  it('returns 4 tabs for learner shape (no own-learning)', () => {
    const tabs = computeVisibleTabs('learner');
    expect(tabs).toEqual(new Set(['home', 'library', 'progress', 'more']));
    expect(tabs.has('own-learning')).toBe(false);
  });

  it('hides More during parent preview', () => {
    const tabs = computeVisibleTabs('learner', true);
    expect(tabs).toEqual(new Set(['home', 'library', 'progress']));
    expect(tabs.has('more')).toBe(false);
  });
});

// [QA-07 / WI-860] Tab-bar leak regression (Bug 763). Dynamic / nested-layout
// routes (shelf/[subjectId], subject/[subjectId], pick-book/[subjectId],
// child/[profileId], etc.) are auto-discovered by Expo Router on web and can
// surface in the tab bar / debug-link list as /shelf/undefined,
// /subject/undefined, etc. The belt-and-braces guard is an explicit
// `<Tabs.Screen name={route} options={{ href: null }} />` per non-tab route,
// driven by the HIDDEN_TAB_ROUTES list. This asserts the load-bearing dynamic
// routes from Bug 763 are members of that list so they cannot leak.
describe('HIDDEN_TAB_ROUTES — tab-bar leak guard (QA-07 / Bug 763)', () => {
  it('hides every dynamic / non-tab route that Bug 763 surfaced into the tab bar', () => {
    const hidden = new Set<string>(HIDDEN_TAB_ROUTES);
    for (const route of [
      'account',
      'shelf',
      'subject',
      'subject-hub',
      'pick-book',
      'child',
      'session',
      'quiz',
      'homework',
      'dictation',
      'practice',
      'link/initiate',
      'link/[contractId]',
      'vocabulary',
      'topic',
      'my-notes',
    ]) {
      expect(hidden.has(route)).toBe(true);
    }
  });

  it('does not list any of the five real tab routes as hidden', () => {
    const hidden = new Set<string>(HIDDEN_TAB_ROUTES);
    for (const tab of ['home', 'own-learning', 'library', 'progress', 'more']) {
      expect(hidden.has(tab)).toBe(false);
    }
  });
});

describe('FULL_SCREEN_ROUTES — nested ceremony route guard', () => {
  it('keeps the Account-owned stack and its nested leaves out of tab chrome', () => {
    expect(FULL_SCREEN_ROUTES.has('account')).toBe(true);
    expect(HIDDEN_TAB_ROUTES).toContain('account');
    expect(HIDDEN_TAB_ROUTES).not.toContain('account/profiles');
  });

  it('hides chrome for every visibility link ceremony screen', () => {
    for (const route of ['link', 'link/initiate', 'link/[contractId]']) {
      expect(FULL_SCREEN_ROUTES.has(route)).toBe(true);
    }
  });
});

describe('V2 pushed-route safe-area ownership invariant', () => {
  it('audits every chrome-bearing hidden route by root route name', () => {
    expect(V2_PUSHED_ROUTE_SAFE_AREA_OWNERSHIP).toEqual({
      home: 'child',
      'own-learning': 'child',
      library: 'child',
      recaps: 'child',
      progress: 'path-specific',
      more: 'child',
      dashboard: 'root',
      subscription: 'child',
      billing: 'root',
      'mentor-memory': 'child',
      subject: 'child',
      'subject-hub': 'root',
      'pick-book': 'child',
      child: 'child',
      'my-notes': 'child',
      vocabulary: 'child',
      topic: 'child',
    });

    for (const route of HIDDEN_TAB_ROUTES) {
      if (!FULL_SCREEN_ROUTES.has(route)) {
        expect(V2_PUSHED_ROUTE_SAFE_AREA_OWNERSHIP).toHaveProperty(route);
      }
    }
  });

  it('keeps the root-full exception set narrow and path-bound', () => {
    expect(V2_ROOT_SAFE_AREA_EXCEPTIONS).toEqual([
      { routeName: 'dashboard', pathPrefix: '/dashboard' },
      { routeName: 'billing', pathPrefix: '/billing' },
      { routeName: 'subject-hub', pathPrefix: '/subject-hub' },
      { routeName: 'progress', pathPrefix: '/progress/saved' },
    ]);

    expect(
      resolveV2PushedScenePaddingTop({
        routeName: 'billing/manage',
        pathname: '/billing/manage',
        pushedSceneTopInset: 99,
        safeAreaTop: 47,
      }),
    ).toBe(99);
    expect(
      resolveV2PushedScenePaddingTop({
        routeName: 'subject/[subjectId]',
        pathname: '/subject/subject-1',
        pushedSceneTopInset: 99,
        safeAreaTop: 47,
      }),
    ).toBe(52);
    expect(
      resolveV2PushedScenePaddingTop({
        routeName: 'progress/[subjectId]',
        pathname: '/progress/subject-1',
        pushedSceneTopInset: 99,
        safeAreaTop: 47,
      }),
    ).toBe(52);
    expect(
      resolveV2PushedScenePaddingTop({
        routeName: 'billing/manage',
        pathname: '/billingish/manage',
        pushedSceneTopInset: 99,
        safeAreaTop: 47,
      }),
    ).toBe(52);
  });

  it('binds root and path-specific ownership values to audited exceptions', () => {
    expect(() =>
      assertV2SafeAreaOwnershipInvariant(
        {
          ...V2_PUSHED_ROUTE_SAFE_AREA_OWNERSHIP,
          'future-route': 'root',
        },
        V2_ROOT_SAFE_AREA_EXCEPTIONS,
      ),
    ).toThrow(/future-route.*root ownership.*path-bound exception/);

    expect(() =>
      assertV2SafeAreaOwnershipInvariant(
        {
          ...V2_PUSHED_ROUTE_SAFE_AREA_OWNERSHIP,
          'future-route': 'root',
        },
        [
          ...V2_ROOT_SAFE_AREA_EXCEPTIONS,
          { routeName: 'future-route', pathPrefix: '/future-route/special' },
        ],
      ),
    ).toThrow(/future-route.*root ownership.*complete route prefix/);

    expect(() =>
      assertV2SafeAreaOwnershipInvariant(V2_PUSHED_ROUTE_SAFE_AREA_OWNERSHIP, [
        ...V2_ROOT_SAFE_AREA_EXCEPTIONS,
        { routeName: 'subject', pathPrefix: '/subject' },
      ]),
    ).toThrow(/subject.*child ownership.*root exception/);
  });

  it('refuses to silently assign ownership to a future pushed route', () => {
    expect(() =>
      resolveV2PushedScenePaddingTop({
        routeName: 'future-route',
        pathname: '/future-route',
        pushedSceneTopInset: 99,
        safeAreaTop: 47,
      }),
    ).toThrow(/future-route.*safe-area ownership audit/);

    expect(
      resolveV2PushedScenePaddingTop({
        routeName: '_lib/proxy-chrome',
        pathname: '/mentor',
        pushedSceneTopInset: 99,
        safeAreaTop: 47,
      }),
    ).toBe(52);
  });
});

// ---------------------------------------------------------------------------
// [WI-2331 AC-1] V2 pushed screens lose the highlighted owning tab
//
// V2's tab bar only shows Mentor/Subjects/Journal, but every other route
// (progress, subject-hub, child/[id], account, …) is a hidden SIBLING
// Tabs.Screen. React Navigation tracks that hidden sibling as the actually
// focused route, so none of the three visible tab buttons is ever reported
// `focused` while on a pushed screen — the bug this suite locks down.
// ---------------------------------------------------------------------------
describe('resolveV2TabIsActive [WI-2331 AC-1]', () => {
  it('passes React Navigation focus straight through when V2 is disabled', () => {
    expect(resolveV2TabIsActive('/progress', 'mentor', false, true)).toBe(true);
    expect(resolveV2TabIsActive('/progress', 'mentor', false, false)).toBe(
      false,
    );
  });

  it('highlights the owning tab for a pushed route React Navigation does not focus', () => {
    // /progress is a hidden sibling Tabs.Screen — React Navigation reports
    // focused=false for all three real tab buttons while it is active. The
    // pre-fix behavior (bare `focused` passthrough) would leave every tab
    // unhighlighted here; this is the regression this WI closes.
    expect(resolveV2TabIsActive('/progress', 'mentor', true, false)).toBe(true);
    expect(resolveV2TabIsActive('/progress', 'subjects', true, false)).toBe(
      false,
    );
    expect(resolveV2TabIsActive('/progress', 'journal', true, false)).toBe(
      false,
    );
  });

  it('resolves Subjects-owned pushed routes (subject-hub, pick-book, shelf, …)', () => {
    expect(
      resolveV2TabIsActive('/subject-hub/subject-1', 'subjects', true, false),
    ).toBe(true);
    expect(
      resolveV2TabIsActive('/subject-hub/subject-1', 'mentor', true, false),
    ).toBe(false);
    expect(
      resolveV2TabIsActive('/pick-book/subject-1', 'subjects', true, false),
    ).toBe(true);
  });

  it('resolves Journal-owned pushed routes', () => {
    expect(
      resolveV2TabIsActive('/journal/practice', 'journal', true, false),
    ).toBe(true);
    expect(
      resolveV2TabIsActive('/journal/practice', 'mentor', true, false),
    ).toBe(false);
  });

  it('agrees with React Navigation when a real tab root is actually focused', () => {
    expect(resolveV2TabIsActive('/mentor', 'mentor', true, true)).toBe(true);
    expect(resolveV2TabIsActive('/subjects', 'subjects', true, true)).toBe(
      true,
    );
    expect(resolveV2TabIsActive('/journal', 'journal', true, true)).toBe(true);
  });
});

describe('resolveTabShape', () => {
  it('returns learner for a solo owner with no linked profiles', () => {
    expect(
      resolveTabShape({
        activeProfile: { isOwner: true },
        profiles: [{ isOwner: true }],
        isParentProxy: false,
      }),
    ).toBe('learner');
  });

  it('returns learner for a child on a parent account', () => {
    expect(
      resolveTabShape({
        activeProfile: { isOwner: false },
        profiles: [{ isOwner: true }, { isOwner: false }],
        isParentProxy: false,
      }),
    ).toBe('learner');
  });

  it('returns guardian for an owner with linked children', () => {
    expect(
      resolveTabShape({
        activeProfile: { isOwner: true },
        profiles: [{ isOwner: true }, { isOwner: false }],
        isParentProxy: false,
      }),
    ).toBe('guardian');
  });

  it('returns learner during proxy sessions', () => {
    expect(
      resolveTabShape({
        activeProfile: { isOwner: false },
        profiles: [{ isOwner: true }, { isOwner: false }],
        isParentProxy: true,
      }),
    ).toBe('learner');
  });

  // [CCR PR #215 / Bug 305] Unknown/unloaded profile defaults to 'learner'
  // (least-privilege 4-tab shape) rather than 'guardian' (full mentoring
  // hub). A legitimate guardian briefly seeing the learner shape during
  // profile load is acceptable; a non-guardian seeing the mentoring hub
  // leaks intent.
  it('returns learner when activeProfile is null', () => {
    expect(
      resolveTabShape({
        activeProfile: null,
        profiles: [],
        isParentProxy: false,
      }),
    ).toBe('learner');
  });

  it('returns learner when activeProfile is undefined', () => {
    expect(
      resolveTabShape({
        activeProfile: undefined,
        profiles: [],
        isParentProxy: false,
      }),
    ).toBe('learner');
  });

  it('returns learner when activeProfile is null even with linked children present', () => {
    // Defensive: if profiles[] has children but activeProfile hasn't loaded
    // yet, we still pick the safer shape until activeProfile is known.
    expect(
      resolveTabShape({
        activeProfile: null,
        profiles: [{ isOwner: true }, { isOwner: false }],
        isParentProxy: false,
      }),
    ).toBe('learner');
  });
});

describe('resolveHomeTabPresentation', () => {
  it('names the guardian home tab Family Hub in family mode', () => {
    expect(resolveHomeTabPresentation('guardian', false, 'family')).toEqual({
      titleKey: 'tabs.familyHub',
      accessibilityLabelKey: 'tabs.familyHubLabel',
      iconName: 'Home',
    });
  });

  it('names learner home My Learning', () => {
    expect(resolveHomeTabPresentation('learner')).toEqual({
      titleKey: 'tabs.myLearning',
      accessibilityLabelKey: 'tabs.myLearningLabel',
      iconName: 'School',
    });
  });

  it('keeps parent preview on the learner label', () => {
    expect(resolveHomeTabPresentation('guardian', true, 'family')).toEqual({
      titleKey: 'tabs.myLearning',
      accessibilityLabelKey: 'tabs.myLearningLabel',
      iconName: 'School',
    });
  });

  it('uses the Home label for guardians when no app-mode is set so the home tab does not duplicate the own-learning label', () => {
    expect(resolveHomeTabPresentation('guardian', false, null)).toEqual({
      titleKey: 'tabs.home',
      accessibilityLabelKey: 'tabs.homeLabel',
      iconName: 'Home',
    });
  });
});

// ---------------------------------------------------------------------------
// SaveWizard — Step 1 (Where to Save)
// Tests for the multi-step save-wizard skeleton + Step 1 target selection.
// [CRITICAL-A2] The wizard is INLINE — rendered by AppLayout's gate ordering
// when preview state is present and wizardDone is false. Tests render the
// full layout; SaveWizardGate is NOT exported from _layout.tsx.
// ---------------------------------------------------------------------------

describe('SaveWizard — Step 1', () => {
  let testQueryClient: QueryClient;

  function setupDefaultRoutes() {
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: null,
            parentEmail: null,
            consentType: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/subjects',
      () =>
        new Response(JSON.stringify({ subjects: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/dashboard',
      () =>
        new Response(JSON.stringify({ children: [], demoMode: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/settings/push-token',
      () =>
        new Response(JSON.stringify({ registered: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
  }

  function renderWizardLayout() {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    const AppLayout = require('./_layout').default;
    return render(<AppLayout />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    mockUsePathname.mockReturnValue('/home');
    const SecureStoreMock = require('../../lib/secure-storage');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStoreMock.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    await clearPreviewState();
    setupDefaultRoutes();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // [CRITICAL-3] No dead-end when wizard mounts with expired/missing state.
  // Simulates the TTL-expiry race: layout's probe sees state as 'present'
  // (first call), then the TTL expires before the wizard's own internal probe
  // runs (second call returns null). The wizard must call onComplete + navigate
  // home rather than rendering a blank dead-end screen.
  it('redirects to /(app)/home when wizard mounts but state has expired', async () => {
    // First call (layout probe) returns a valid state so the wizard branch is entered.
    // Second call (wizard's internal probe) returns null to simulate TTL expiry.
    const previewModule = require('../../lib/preview-onboarding-state');
    let callCount = 0;
    jest
      .spyOn(previewModule, 'getPreviewState')
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            intent: 'self',
            path: 'learner_value_prop',
            createdAt: new Date().toISOString(),
          };
        }
        return null;
      });

    renderWizardLayout();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
    expect(screen.queryByTestId('save-wizard-step-1')).toBeNull();
  });

  it('preselects "My learning" when intent was self', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 't',
      createdAt: new Date().toISOString(),
    });
    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    expect(
      screen.getByTestId('save-target-self').props.accessibilityState?.selected,
    ).toBe(true);
  });

  it('preselects "My child" when intent was child', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    expect(
      screen.getByTestId('save-target-child').props.accessibilityState
        ?.selected,
    ).toBe(true);
  });

  it('overrides intent when user picks a different target', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-target-self'));
    expect(
      screen.getByTestId('save-target-self').props.accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('save-target-child').props.accessibilityState
        ?.selected,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SaveWizard — Step 2 (Profile Basics)
// [HIGH-A3 / HIGH-B2] Adult-age gate + form field tests.
// ---------------------------------------------------------------------------

describe('SaveWizard — Step 2 (Profile Basics)', () => {
  let testQueryClient: QueryClient;

  function setupDefaultRoutes() {
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: null,
            parentEmail: null,
            consentType: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/subjects',
      () =>
        new Response(JSON.stringify({ subjects: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/dashboard',
      () =>
        new Response(JSON.stringify({ children: [], demoMode: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/settings/push-token',
      () =>
        new Response(JSON.stringify({ registered: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
  }

  function renderWizardLayout() {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    const AppLayout = require('./_layout').default;
    return render(<AppLayout />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    mockUsePathname.mockReturnValue('/home');
    const SecureStoreMock = require('../../lib/secure-storage');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStoreMock.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    await clearPreviewState();
    setupDefaultRoutes();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // [HIGH-A3 / HIGH-B2] Under-18 parent with target=child: Continue must be
  // disabled and the adult-required warning view must be visible.
  it('under-18 parent (target=child) cannot submit; Continue stays disabled', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-05-19T00:00:00Z'));

    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));

    // 2013 → age 13 in 2026 — computeAgeBracket returns 'adolescent'/'child'.
    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-name'),
      'TooYoung',
    );
    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-birth-year'),
      '2013',
    );
    fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Sam');
    fireEvent.changeText(
      screen.getByTestId('save-basics-child-birth-year'),
      '2014',
    );

    const cta = screen.getByTestId('save-basics-continue');
    expect(cta.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('save-basics-adult-required')).toBeTruthy();
  });

  // [HIGH-A3] Boundary: exactly 18 (birthYear 2008 in 2026) must pass the gate.
  it('parent aged exactly 18 (target=child) is allowed to submit', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-05-19T00:00:00Z'));
    // Stub profiles POST so submit doesn't fail on network.
    mockFetch.setRoute(
      '/profiles',
      () =>
        new Response(
          JSON.stringify({
            profile: {
              id: 'p1',
              displayName: 'Pat',
              birthYear: 2008,
              isOwner: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));

    // computeAgeBracket(2008, 2026) → age 18 → 'adult'. Boundary must pass.
    fireEvent.changeText(screen.getByTestId('save-basics-parent-name'), 'Pat');
    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-birth-year'),
      '2008',
    );
    fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Sam');
    fireEvent.changeText(
      screen.getByTestId('save-basics-child-birth-year'),
      '2014',
    );

    const cta = screen.getByTestId('save-basics-continue');
    expect(cta.props.accessibilityState?.disabled).toBe(false);
    expect(screen.queryByTestId('save-basics-adult-required')).toBeNull();
  });

  // [OPT-C] target=self: the adult-age gate must NOT apply regardless of age.
  // Server's 11+ floor covers this case; wizard has no age gate for self.
  it('self target skips the adult gate (any age ≥ 11 allowed)', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'algebra',
      createdAt: new Date().toISOString(),
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-05-19T00:00:00Z'));
    mockFetch.setRoute(
      '/profiles',
      () =>
        new Response(
          JSON.stringify({
            profile: {
              id: 'p1',
              displayName: 'Solo',
              birthYear: 2013,
              isOwner: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));

    // 13-year-old solo learner — gate must NOT apply.
    fireEvent.changeText(
      screen.getByTestId('save-basics-display-name'),
      'Solo',
    );
    fireEvent.changeText(screen.getByTestId('save-basics-birth-year'), '2013');

    const cta = screen.getByTestId('save-basics-continue');
    expect(cta.props.accessibilityState?.disabled).toBe(false);
    expect(screen.queryByTestId('save-basics-adult-required')).toBeNull();
  });

  // [OPT-C / MEDIUM-D2] Flag-off: when ADULT_OWNER_GATE_ENABLED is false, the
  // adult-age gate is bypassed. Uses the established mutation pattern from
  // SaveWizardGate flag-off test (line ~936 of this file) — safe in CJS because
  // Jest runs tests within a file sequentially; the mutation is restored in
  // a finally block.
  it('underage parent allowed through when ADULT_OWNER_GATE_ENABLED is false [OPT-C]', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-05-19T00:00:00Z'));
    mockFetch.setRoute(
      '/profiles',
      () =>
        new Response(
          JSON.stringify({
            profile: {
              id: 'p1',
              displayName: 'TooYoung',
              birthYear: 2013,
              isOwner: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const flags = require('../../lib/feature-flags') as {
      FEATURE_FLAGS: { ADULT_OWNER_GATE_ENABLED: boolean };
    };
    const original = flags.FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED;
    try {
      (
        flags.FEATURE_FLAGS as { ADULT_OWNER_GATE_ENABLED: boolean }
      ).ADULT_OWNER_GATE_ENABLED = false;

      renderWizardLayout();
      await screen.findByTestId('save-wizard-step-1');
      fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));

      // 13-year-old parent — would be blocked by gate but flag is off.
      fireEvent.changeText(
        screen.getByTestId('save-basics-parent-name'),
        'TooYoung',
      );
      fireEvent.changeText(
        screen.getByTestId('save-basics-parent-birth-year'),
        '2013',
      );
      fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Sam');
      fireEvent.changeText(
        screen.getByTestId('save-basics-child-birth-year'),
        '2014',
      );

      const cta = screen.getByTestId('save-basics-continue');
      expect(cta.props.accessibilityState?.disabled).toBe(false);
      expect(screen.queryByTestId('save-basics-adult-required')).toBeNull();
    } finally {
      (
        flags.FEATURE_FLAGS as { ADULT_OWNER_GATE_ENABLED: boolean }
      ).ADULT_OWNER_GATE_ENABLED = original;
    }
  });

  it('keeps parent profile and retries only child after child creation fails', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });
    testQueryClient.setQueryData(['profiles', 'test-user'], []);

    let postCount = 0;
    mockFetch.setRoute('/profiles', (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        return { profiles: [] };
      }
      postCount++;
      if (postCount === 1) {
        return new Response(
          JSON.stringify({
            profile: {
              id: 'parent-1',
              displayName: 'Parent',
              birthYear: 1985,
              isOwner: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (postCount === 2) {
        return new Response(
          JSON.stringify({ error: { message: 'Child creation failed' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          profile: {
            id: 'child-1',
            displayName: 'Kid',
            birthYear: 2014,
            isOwner: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));

    await screen.findByTestId('save-basics-parent-name');
    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-name'),
      'Parent',
    );
    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-birth-year'),
      '1985',
    );
    fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Kid');
    fireEvent.changeText(
      screen.getByTestId('save-basics-child-birth-year'),
      '2014',
    );
    fireEvent.press(screen.getByTestId('save-basics-continue'));

    await screen.findByTestId('save-basics-child-error');
    expect(screen.getByTestId('save-basics-retry-child')).toBeTruthy();

    await expect(getPreviewState()).resolves.toEqual(
      expect.objectContaining({ createdOwnerProfileId: 'parent-1' }),
    );

    fireEvent.press(screen.getByTestId('save-basics-retry-child'));

    await screen.findByTestId('save-wizard-step-3');
    const postBodies = fetchCallsMatching(mockFetch, '/profiles')
      .filter((call: { init?: RequestInit }) => call.init?.method === 'POST')
      .map((call: { init?: RequestInit }) =>
        extractJsonBody<{ displayName: string }>(call.init),
      );
    expect(postBodies).toEqual([
      expect.objectContaining({ displayName: 'Parent' }),
      expect.objectContaining({ displayName: 'Kid' }),
      expect.objectContaining({ displayName: 'Kid' }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// SaveWizard — Step 3 (Confirm + Landing)
// Task 14: Replace ConfirmStep placeholder with real implementation.
// [Task 0 resolution] Dual landing keyed off the wizard's `target` flag:
//   - self (or both+self_first): router.replace to /(app)/session with rawInput
//   - child (or both+child_first): router.replace to /(app)/home
// ---------------------------------------------------------------------------

describe('SaveWizard — Step 3 (Confirm + Landing)', () => {
  let testQueryClient: QueryClient;

  function setupDefaultRoutes() {
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: null,
            parentEmail: null,
            consentType: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/subjects',
      () =>
        new Response(JSON.stringify({ subjects: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/dashboard',
      () =>
        new Response(JSON.stringify({ children: [], demoMode: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/settings/push-token',
      () =>
        new Response(JSON.stringify({ registered: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    // /profiles POST — returns a minimal owner profile for step 2 submission.
    mockFetch.setRoute(
      '/profiles',
      () =>
        new Response(
          JSON.stringify({
            profile: {
              id: 'p1',
              displayName: 'Solo',
              birthYear: 2000,
              isOwner: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
  }

  /** Render the full layout with no active profile (triggers SaveWizardGate). */
  function renderWizardLayout(
    switchProfileImpl?: () => Promise<{ success: boolean; error?: string }>,
  ) {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile:
        switchProfileImpl ?? jest.fn().mockResolvedValue({ success: true }),
    });
    const AppLayout = require('./_layout').default;
    return render(<AppLayout />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
  }

  /**
   * Drive from step 1 through step 2 (self target) and reach step 3.
   * Returns once the "save-confirm-land" CTA is visible.
   */
  async function driveToStep3Self() {
    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));
    // Step 2 — solo learner form
    await screen.findByTestId('save-basics-display-name');
    fireEvent.changeText(
      screen.getByTestId('save-basics-display-name'),
      'Solo',
    );
    fireEvent.changeText(screen.getByTestId('save-basics-birth-year'), '2000');
    fireEvent.press(screen.getByTestId('save-basics-continue'));
    await screen.findByTestId('save-confirm-land');
  }

  /**
   * Drive from step 1 through step 2 (child target) and reach step 3.
   * Returns once the "save-confirm-land" CTA is visible.
   */
  async function driveToStep3Child() {
    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');
    // Override to child target
    fireEvent.press(screen.getByTestId('save-target-child'));
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));
    // Step 2 — parent + child form
    await screen.findByTestId('save-basics-parent-name');
    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-name'),
      'Parent',
    );
    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-birth-year'),
      '1985',
    );
    fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Kid');
    fireEvent.changeText(
      screen.getByTestId('save-basics-child-birth-year'),
      '2014',
    );
    fireEvent.press(screen.getByTestId('save-basics-continue'));
    await screen.findByTestId('save-confirm-land');
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockReplace.mockReset();
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    mockUsePathname.mockReturnValue('/home');
    const SecureStoreMock = require('../../lib/secure-storage');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStoreMock.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    await clearPreviewState();
    setupDefaultRoutes();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('self target: replaces history with session route on CTA press', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'algebra',
      createdAt: new Date().toISOString(),
    });

    await driveToStep3Self();
    fireEvent.press(screen.getByTestId('save-confirm-land'));

    await waitFor(() => {
      const call = mockReplace.mock.calls.find(
        (c) =>
          typeof c[0] === 'object' &&
          (c[0] as { pathname?: string }).pathname === '/(app)/session',
      );
      expect(call).toBeDefined();
    });
  });

  it('child target: replaces history with /(app)/home on CTA press', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });

    await driveToStep3Child();
    fireEvent.press(screen.getByTestId('save-confirm-land'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('clears preview state on save completion', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'fractions',
      createdAt: new Date().toISOString(),
    });

    await driveToStep3Self();
    fireEvent.press(screen.getByTestId('save-confirm-land'));

    await waitFor(async () => {
      expect(await getPreviewState()).toBeNull();
    });
  });

  it('switchProfile failure surfaces error in landing error block', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'history',
      createdAt: new Date().toISOString(),
    });

    // Re-render with a failing switchProfile
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    const switchProfileMock = jest
      .fn()
      .mockResolvedValue({ success: false, error: 'profile switch failed' });
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: switchProfileMock,
    });

    mockFetch.setRoute(
      '/profiles',
      () =>
        new Response(
          JSON.stringify({
            profile: {
              id: 'p1',
              displayName: 'Solo',
              birthYear: 2000,
              isOwner: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const AppLayout = require('./_layout').default;
    render(<AppLayout />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await screen.findByTestId('save-wizard-step-1');
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));
    await screen.findByTestId('save-basics-display-name');
    fireEvent.changeText(
      screen.getByTestId('save-basics-display-name'),
      'Solo',
    );
    fireEvent.changeText(screen.getByTestId('save-basics-birth-year'), '2000');
    fireEvent.press(screen.getByTestId('save-basics-continue'));
    await screen.findByTestId('save-confirm-land');

    fireEvent.press(screen.getByTestId('save-confirm-land'));

    await waitFor(() => {
      expect(screen.getByText('profile switch failed')).toBeTruthy();
    });
    // Must NOT navigate on failure
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/session' }),
    );
    expect(mockReplace).not.toHaveBeenCalledWith('/(app)/home');
  });
});

// ---------------------------------------------------------------------------
// SaveWizard — Back / Cancel navigation
// Spec: back arrow on Steps 2+; cancel ✕ on all steps; cancel calls
// clearPreviewState → onComplete → router.replace('/(app)/home').
// ---------------------------------------------------------------------------

describe('SaveWizard — Back and Cancel navigation', () => {
  let testQueryClient: QueryClient;

  function setupDefaultRoutes() {
    mockFetch.setRoute(
      '/consent/my-status',
      () =>
        new Response(
          JSON.stringify({
            consentStatus: null,
            parentEmail: null,
            consentType: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/subjects',
      () =>
        new Response(JSON.stringify({ subjects: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/dashboard',
      () =>
        new Response(JSON.stringify({ children: [], demoMode: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/settings/push-token',
      () =>
        new Response(JSON.stringify({ registered: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/profiles',
      () =>
        new Response(
          JSON.stringify({
            profile: {
              id: 'p1',
              displayName: 'Solo',
              birthYear: 2000,
              isOwner: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
  }

  function renderWizardLayout() {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
      switchProfile: jest.fn(),
    });
    const AppLayout = require('./_layout').default;
    return render(<AppLayout />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    mockUsePathname.mockReturnValue('/home');
    const SecureStoreMock = require('../../lib/secure-storage');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStoreMock.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    mockReplace.mockReset();
    await clearPreviewState();
    setupDefaultRoutes();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // 1. Back arrow absent on Step 1; present on Step 2 and Step 3.
  it('back arrow is absent on Step 1 and present on Steps 2 and 3', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'maths',
      createdAt: new Date().toISOString(),
    });

    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');

    // Step 1: no back button
    expect(screen.queryByTestId('save-wizard-back')).toBeNull();
    // Cancel is present on Step 1
    expect(screen.getByTestId('save-wizard-cancel')).toBeTruthy();

    // Advance to Step 2
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));
    await screen.findByTestId('save-wizard-step-2');

    // Step 2: back button present
    expect(screen.getByTestId('save-wizard-back')).toBeTruthy();
    expect(screen.getByTestId('save-wizard-cancel')).toBeTruthy();

    // Advance to Step 3 by filling and submitting Step 2
    fireEvent.changeText(
      screen.getByTestId('save-basics-display-name'),
      'Solo',
    );
    fireEvent.changeText(screen.getByTestId('save-basics-birth-year'), '2000');
    fireEvent.press(screen.getByTestId('save-basics-continue'));
    await screen.findByTestId('save-wizard-step-3');

    // Step 3: back button present
    expect(screen.getByTestId('save-wizard-back')).toBeTruthy();
    expect(screen.getByTestId('save-wizard-cancel')).toBeTruthy();
  });

  // 2. Tapping back on Step 2 returns to Step 1 with target preserved.
  it('tapping back on Step 2 returns to Step 1 with previously-selected target preserved', async () => {
    await setPreviewState({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    });

    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');

    // The "child" intent pre-selects save-target-child
    expect(
      screen.getByTestId('save-target-child').props.accessibilityState
        ?.selected,
    ).toBe(true);

    // Advance to Step 2
    fireEvent.press(screen.getByTestId('save-wizard-step-1-continue'));
    await screen.findByTestId('save-wizard-step-2');

    // Go back
    fireEvent.press(screen.getByTestId('save-wizard-back'));
    await screen.findByTestId('save-wizard-step-1');

    // Target selection is preserved
    expect(
      screen.getByTestId('save-target-child').props.accessibilityState
        ?.selected,
    ).toBe(true);
  });

  // 3. Tapping cancel on any step: clearPreviewState, onComplete, router.replace.
  it('tapping cancel calls clearPreviewState, exits the wizard, and navigates home', async () => {
    await setPreviewState({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'biology',
      createdAt: new Date().toISOString(),
    });

    const previewModule = require('../../lib/preview-onboarding-state');
    const clearSpy = jest.spyOn(previewModule, 'clearPreviewState');

    renderWizardLayout();
    await screen.findByTestId('save-wizard-step-1');

    fireEvent.press(screen.getByTestId('save-wizard-cancel'));

    // clearPreviewState called before router.replace
    expect(clearSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
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
const {
  buildSwitchProfileConfirmation,
} = require('./_lib/consent-gate-helpers');

// Minimal t() for unit tests — appends interpolated values so assertions like
// toContain('Alex') pass even though we don't have real translation templates.
function testT(key: string, options?: Record<string, string>): string {
  if (!options || Object.keys(options).length === 0) return key;
  const values = Object.values(options).join(' ');
  return `${key} ${values}`;
}

describe('[BUG-776] buildSwitchProfileConfirmation', () => {
  it('returns null when activeProfile is missing', () => {
    expect(
      buildSwitchProfileConfirmation({
        activeProfile: null,
        profiles: [{ id: 'p1', displayName: 'Alex' }],
        t: testT,
      }),
    ).toBeNull();
  });

  it('returns null when there are no other profiles to switch to', () => {
    expect(
      buildSwitchProfileConfirmation({
        activeProfile: { id: 'p1' },
        profiles: [{ id: 'p1', displayName: 'Alex' }],
        t: testT,
      }),
    ).toBeNull();
  });

  it('names a single sibling clearly in title and message', () => {
    const result = buildSwitchProfileConfirmation({
      activeProfile: { id: 'parent' },
      profiles: [
        { id: 'parent', displayName: 'Mom' },
        { id: 'kid1', displayName: 'Alex' },
      ],
      t: testT,
    });
    expect(result).not.toBeNull();
    expect(result.target.id).toBe('kid1');
    // testT renders `${key} ${interpolated values}` so an exact-match assertion
    // pins both the i18n key chosen and the values fed into it. A weaker
    // toContain('Alex') would pass even if the wrong key were used, or extra
    // siblings leaked in.
    expect(result.title).toBe('tabs.switchProfile.title Alex');
    expect(result.message).toBe('tabs.switchProfile.messageSingle Alex');
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
      t: testT,
    });
    expect(result).not.toBeNull();
    // Picks the first non-current (deterministic) but the user can now SEE
    // who they're being switched to and cancel if it's wrong.
    expect(result.target.id).toBe('kid1');
    expect(result.title).toBe('tabs.switchProfile.title Alex');
    // Exact-match: pins the message structure (target name, others list,
    // cancel hint), the order, and the separator. A weakened toContain would
    // pass even if the wrong sibling were named or the cancel hint dropped.
    expect(result.message).toBe(
      'tabs.switchProfile.messageSingle Alex\n\n' +
        'tabs.switchProfile.otherProfiles Sam, Jordan\n\n' +
        'tabs.switchProfile.cancelHint',
    );
  });
});
