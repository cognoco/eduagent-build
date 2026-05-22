/**
 * Tests for ClerkGate — the Clerk initialisation guard that shows a timeout UI
 * when Clerk hasn't loaded within 12 seconds (BUG-507).
 *
 * ClerkGate is exported @internal from _layout.tsx for testability only.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

import { ClerkGate } from './_layout';

// Must be set before the module under test is loaded (hoisted require side-effect).
// jest.mock calls are Babel-hoisted above import statements, so we piggy-back the
// env-var assignment inside a mock factory to guarantee it runs first.
jest.mock(
  '../../global.css',
  () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY =
      'pk_test_mock_key_for_tests';
    return {};
  },
  { virtual: true },
);

// Heavy module-level side-effect imports in _layout.tsx that don't execute
// in JSDOM/Jest test environment. Bare specifiers only — GC1 compliant.
jest.mock('expo-router', () => ({
  Stack: Object.assign(({ children }: { children?: unknown }) => children, {
    Screen: () => null,
  }),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true]),
}));

jest.mock('@expo-google-fonts/atkinson-hyperlegible', () => ({
  AtkinsonHyperlegible_400Regular: 'AtkinsonHyperlegible_400Regular',
  AtkinsonHyperlegible_700Bold: 'AtkinsonHyperlegible_700Bold',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children?: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children?: unknown }) => children,
}));

jest.mock(
  '../i18n',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    ensureI18nReady: jest.fn().mockResolvedValue(undefined),
  }),
);

// prettier-ignore
jest.mock('../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  ThemeContext: require('react').createContext({}),
  useThemeColors: () => ({
    accent: '#0ea5e9',
    background: '#18181b',
    border: '#d4d4d8',
    muted: '#71717a',
    surface: '#ffffff',
    textInverse: '#ffffff',
    textPrimary: '#18181b',
    textSecondary: '#52525b',
    primary: '#14b8a6',
  }),
  useTheme: () => ({ colorScheme: 'dark' }),
  useTokenVars: () => ({}),
}));

jest.mock(
  '../lib/profile',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    ProfileProvider: ({ children }: { children?: unknown }) => children,
    useProfile: jest
      .fn()
      .mockReturnValue({ activeProfile: null, profiles: [] }),
  }),
);

jest.mock(
  '../lib/app-context',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    AppContextProvider: ({ children }: { children?: unknown }) => children,
  }),
);

jest.mock(
  '../lib/api-client',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    setOnAuthExpired: jest.fn(),
    clearOnAuthExpired: jest.fn(),
    resetAuthExpiredGuard: jest.fn(),
  }),
);

jest.mock(
  '../lib/auth-expiry',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    markSessionExpired: jest.fn(),
  }),
);

jest.mock(
  '../lib/sign-out',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    signOutWithCleanup: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock(
  '../lib/secure-storage',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    getItemAsync: jest.fn().mockResolvedValue(null),
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
    sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
  }),
);

jest.mock(
  '../components/common',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    ErrorBoundary: ({ children }: { children?: unknown }) => children,
    OfflineBanner: () => null,
  }),
);

jest.mock(
  '../providers/OutboxDrainProvider',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    OutboxDrainProvider: ({ children }: { children?: unknown }) => children,
  }),
);

jest.mock(
  '../hooks/use-network-status',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    useNetworkStatus: () => ({ isOffline: false }),
  }),
);

jest.mock(
  '../lib/sentry',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    enableSentry: jest.fn(),
    Sentry: { captureException: jest.fn(), addBreadcrumb: jest.fn() },
  }),
);

jest.mock(
  '../lib/revenuecat',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    configureRevenueCat: jest.fn(),
  }),
);

jest.mock(
  '../components/AnimatedSplash',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    AnimatedSplash: ({ onComplete }: { onComplete: () => void }) => {
      require('react').useEffect(() => {
        onComplete();
      }, [onComplete]);
      return null;
    },
  }),
);

jest.mock(
  '../lib/query-persister',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    createScopedPersister: jest.fn().mockReturnValue({}),
  }),
);

jest.mock(
  '../lib/query-error-reporting',
  /* gc1-allow: ClerkGate render test boundary — full stub of native/runtime modules */ () => ({
    shouldReportQueryErrorToSentry: jest.fn().mockReturnValue(false),
  }),
);

// ---------------------------------------------------------------------------
// ClerkGate unit tests — BUG-507
// ---------------------------------------------------------------------------

describe('ClerkGate — BUG-507 retry / offline recovery', () => {
  const noOp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: Clerk not yet loaded
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: false });
  });

  it('renders nothing while Clerk is loading and not timed out', () => {
    const { toJSON } = render(
      <ClerkGate
        onReady={noOp}
        timedOut={false}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders the timeout screen when timedOut=true and Clerk not loaded', () => {
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );

    expect(screen.getByTestId('clerk-timeout-screen')).toBeTruthy();
    expect(screen.getByTestId('clerk-retry-button')).toBeTruthy();
    expect(screen.getByTestId('clerk-offline-button')).toBeTruthy();
  });

  it('calls onRetry when "Try again" is pressed — Clerk never loads + user retries -> Clerk re-inits (BUG-507)', () => {
    // Core BUG-507 scenario: Clerk never loads (flaky network), 12s failsafe fires,
    // user sees timeout UI, presses "Try again". onRetry must be called so the
    // coordinator bumps clerkProviderKey and remounts ClerkProvider.
    // The old code called platformAlert instead — a dead-end with no actual retry.
    const onRetry = jest.fn();
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={onRetry}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );

    fireEvent.press(screen.getByTestId('clerk-retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does NOT call platformAlert on retry — no dead-end "close and reopen" dialog (BUG-507)', () => {
    const onRetry = jest.fn();
    const platformAlertMock = jest.spyOn(
      require('../lib/platform-alert'),
      'platformAlert',
    );

    render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={onRetry}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );

    fireEvent.press(screen.getByTestId('clerk-retry-button'));

    expect(platformAlertMock).not.toHaveBeenCalled();
    platformAlertMock.mockRestore();
  });

  it('calls onContinueOffline when "Continue without account" is pressed', () => {
    const onContinueOffline = jest.fn();
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={noOp}
        onContinueOffline={onContinueOffline}
      >
        {null}
      </ClerkGate>,
    );

    fireEvent.press(screen.getByTestId('clerk-offline-button'));
    expect(onContinueOffline).toHaveBeenCalledTimes(1);
  });

  it('calls onReady when Clerk loads normally (isLoaded becomes true)', () => {
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: true });
    const onReady = jest.fn();
    render(
      <ClerkGate
        onReady={onReady}
        timedOut={false}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('renders children once Clerk is loaded (no timeout screen visible)', () => {
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: true });
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={false}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );
    expect(screen.queryByTestId('clerk-timeout-screen')).toBeNull();
  });

  // [BUG-507] Regression: the 12-second failsafe must NOT silently route into
  // the authenticated app layout when Clerk is not loaded (isLoaded=false,
  // i.e. the user is not signed in). It must instead show the timeout/retry UI.
  // The old code called setClerkReady(true) unconditionally, which removed the
  // ClerkGate null-render and let the authenticated tree mount.
  it('[BUG-507] does NOT render children (authenticated layout) when timedOut=true but Clerk not loaded', () => {
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: false });
    const { View } = require('react-native');
    const { toJSON } = render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {/* sentinel testID lets us assert children were NOT mounted */}
        <View testID="authenticated-layout-sentinel" />
      </ClerkGate>,
    );

    // Timeout screen IS visible (retry/offline options shown)
    expect(screen.getByTestId('clerk-timeout-screen')).toBeTruthy();
    // ClerkGate renders the timeout UI — the JSON tree should be non-null
    expect(toJSON()).not.toBeNull();
    // Children (the authenticated app layout) must NOT be in the tree when Clerk
    // is not loaded — they would only appear if ClerkGate bypassed its isLoaded guard.
    expect(screen.queryByTestId('authenticated-layout-sentinel')).toBeNull();
  });
});
