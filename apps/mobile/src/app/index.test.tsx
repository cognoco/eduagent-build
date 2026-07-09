import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { useAuth } from '@clerk/expo';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`redirect-${href}`}>{href}</Text>;
  },
}));

// Resolve i18n keys from the English catalog so copy assertions stay stable.
jest.mock('react-i18next', () => {
  const en = require('../i18n/locales/en.json');
  function resolveDotPath(
    obj: Record<string, unknown>,
    path: string,
  ): string | undefined {
    return path
      .split('.')
      .reduce<unknown>(
        (acc, k) =>
          acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[k]
            : undefined,
        obj,
      ) as string | undefined;
  }
  return {
    useTranslation: () => ({
      t: (key: string) => resolveDotPath(en, key) ?? key,
      i18n: { language: 'en' },
    }),
  };
});

// prettier-ignore
jest.mock('../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({ muted: '#71717a' }),
  useTheme: () => ({ colorScheme: 'dark' }),
  useTokenVars: () => ({}),
}));

jest.mock(
  '../components/common' /* gc1-allow: Reanimated worklets and SVG animations cannot run in JSDOM */,
  () => ({
    ErrorFallback: ({
      title,
      message,
      primaryAction,
      secondaryAction,
    }: {
      title?: string;
      message?: string;
      primaryAction?: { label: string; onPress: () => void; testID?: string };
      secondaryAction?: { label: string; onPress: () => void; testID?: string };
    }) => {
      const { Pressable, Text, View } = require('react-native');
      return (
        <View testID="error-fallback">
          {title ? <Text testID="error-fallback-title">{title}</Text> : null}
          {message ? (
            <Text testID="error-fallback-message">{message}</Text>
          ) : null}
          {primaryAction ? (
            <Pressable
              onPress={primaryAction.onPress}
              testID={primaryAction.testID ?? 'error-fallback-primary'}
            >
              <Text>{primaryAction.label}</Text>
            </Pressable>
          ) : null}
          {secondaryAction ? (
            <Pressable
              onPress={secondaryAction.onPress}
              testID={secondaryAction.testID ?? 'error-fallback-secondary'}
            >
              <Text>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
  }),
);

jest.mock(
  '@sentry/react-native' /* gc1-allow: Sentry is an external observability boundary */,
  () => ({
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
  }),
);

// SecureStore is a native boundary. The real intro-state + preview helpers
// are exercised; only the underlying expo-secure-store wrapper is stubbed.
jest.mock(
  '../lib/secure-storage' /* gc1-allow: native-boundary — wraps expo-secure-store which is unavailable in jest */,
  () => ({
    getItemAsync: jest.fn().mockResolvedValue(null),
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
    sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  }),
);

// Track helper from analytics shouldn't be invoked by the routing tests, but
// import-time evaluation requires it to be defined. Pattern A — preserve the
// rest of the analytics surface so any future indirect consumer doesn't trip.
jest.mock(
  '../lib/analytics' /* gc1-allow: pattern-a conversion; analytics is a side-effect boundary — real calls hit external telemetry; pattern-a preserves other exports */,
  () => ({
    ...jest.requireActual('../lib/analytics'),
    track: jest.fn(),
  }),
);

const Index = require('./index').default;
const SecureStoreMock = require('../lib/secure-storage');
const previewState = require('../lib/preview-onboarding-state');
const introState = require('../lib/intro-state');

describe('Index screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    introState.__resetIntroStateForTests();
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading spinner while Clerk is not loaded', () => {
    render(<Index />);
    screen.getByTestId('index-loading');
  });

  it('shows timeout screen after 15s when Clerk is not loaded', async () => {
    render(<Index />);

    await act(async () => {
      jest.advanceTimersByTime(15_001);
    });

    screen.getByTestId('index-timeout-retry');
    screen.getByText('Taking longer than expected');
  });

  it('redirects signed-in user to home', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<Index />);

    screen.getByTestId('redirect-/(app)/home');
  });

  // -------------------------------------------------------------------------
  // Signed-out first-open routing — preview state + pre-auth intro probe
  // -------------------------------------------------------------------------

  it('redirects a signed-out first-open user to /(auth)/welcome when intro is unseen and no preview state', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
    jest.spyOn(previewState, 'getPreviewState').mockResolvedValue(null);
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);

    render(<Index />);

    await waitFor(() => screen.getByTestId('redirect-/(auth)/welcome'));
    expect(screen.queryByTestId('redirect-/(auth)/sign-in')).toBeNull();
  });

  it('redirects a returning signed-out user to /(auth)/sign-in when intro has been seen', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
    jest.spyOn(previewState, 'getPreviewState').mockResolvedValue(null);
    (SecureStoreMock.getItemAsync as jest.Mock).mockImplementation(
      (key: string) =>
        key === 'preAuthIntroSeen.v1'
          ? Promise.resolve('2026-05-27T10:00:00.000Z')
          : Promise.resolve(null),
    );

    render(<Index />);

    await waitFor(() => screen.getByTestId('redirect-/(auth)/sign-in'));
    expect(screen.queryByTestId('redirect-/(auth)/welcome')).toBeNull();
  });

  it('redirects a signed-out user with valid preview state to /(auth)/sign-in and marks the intro seen', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
    jest.spyOn(previewState, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    const markSpy = jest.spyOn(introState, 'markPreAuthIntroSeenSync');
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);

    render(<Index />);

    await waitFor(() => screen.getByTestId('redirect-/(auth)/sign-in'));
    expect(screen.queryByTestId('redirect-/(auth)/welcome')).toBeNull();
    expect(markSpy).toHaveBeenCalledTimes(1);
  });

  it('fail-opens to /(auth)/sign-in when the SecureStore intro probe rejects', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
    jest.spyOn(previewState, 'getPreviewState').mockResolvedValue(null);
    (SecureStoreMock.getItemAsync as jest.Mock).mockRejectedValue(
      new Error('keystore locked'),
    );
    const markSpy = jest.spyOn(introState, 'markPreAuthIntroSeenSync');

    render(<Index />);

    await waitFor(() => screen.getByTestId('redirect-/(auth)/sign-in'));
    expect(screen.queryByTestId('redirect-/(auth)/welcome')).toBeNull();
    // Failure path does NOT mark the intro as seen — the user gets cards on
    // the next cold open when SecureStore recovers.
    expect(markSpy).not.toHaveBeenCalled();
  });

  it('fail-opens to /(auth)/sign-in when the preview-state probe rejects', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
    jest
      .spyOn(previewState, 'getPreviewState')
      .mockRejectedValue(new Error('disk error'));
    (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);

    render(<Index />);

    await waitFor(() => screen.getByTestId('redirect-/(auth)/sign-in'));
    expect(screen.queryByTestId('redirect-/(auth)/welcome')).toBeNull();
  });

  // [#508] retry restarts the 15s timer — preserved from before.
  it('[#508] retry tap hides timeout screen and re-triggers 15s timer', async () => {
    render(<Index />);

    await act(async () => {
      jest.advanceTimersByTime(15_001);
    });

    screen.getByTestId('index-timeout-retry');

    await act(async () => {
      fireEvent.press(screen.getByTestId('index-timeout-retry'));
    });

    screen.getByTestId('index-loading');
    expect(screen.queryByTestId('index-timeout-retry')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(14_900);
    });
    expect(screen.queryByTestId('index-timeout-retry')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    await waitFor(() => screen.getByTestId('index-timeout-retry'));
  });

  it('[#508] secondary "Sign in instead" button navigates to sign-in', async () => {
    render(<Index />);

    await act(async () => {
      jest.advanceTimersByTime(15_001);
    });

    screen.getByTestId('index-timeout-sign-in');
    fireEvent.press(screen.getByTestId('index-timeout-sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('hides timeout screen when isLoaded becomes true (signed-out → welcome)', async () => {
    jest.spyOn(previewState, 'getPreviewState').mockResolvedValue(null);
    const { rerender } = render(<Index />);

    await act(async () => {
      jest.advanceTimersByTime(15_001);
    });

    screen.getByTestId('index-timeout-retry');

    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    rerender(<Index />);

    expect(screen.queryByTestId('index-timeout-retry')).toBeNull();
    await waitFor(() => screen.getByTestId('redirect-/(auth)/welcome'));
  });
});
