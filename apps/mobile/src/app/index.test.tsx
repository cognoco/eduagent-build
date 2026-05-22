import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

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

const Index = require('./index').default;

describe('Index screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
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

  it('redirects unauthenticated user to sign-in', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<Index />);

    screen.getByTestId('redirect-/(auth)/sign-in');
  });

  // [#508] Break test: retry must restart the 15s timer, not just hide the
  // timeout screen. Without the retryCount dependency, setShowTimeout(false)
  // hides the timeout but the timer never re-registers — the spinner shows
  // immediately and the timeout screen never fires again.
  it('[#508] retry tap hides timeout screen and re-triggers 15s timer', async () => {
    render(<Index />);

    // First timeout fires
    await act(async () => {
      jest.advanceTimersByTime(15_001);
    });

    screen.getByTestId('index-timeout-retry');

    // Tap retry → should show spinner (timeout hidden), not immediately timeout
    await act(async () => {
      fireEvent.press(screen.getByTestId('index-timeout-retry'));
    });

    // Spinner visible, timeout screen gone
    screen.getByTestId('index-loading');
    expect(screen.queryByTestId('index-timeout-retry')).toBeNull();

    // Advance 14.9s — still under the new 15s window, so timeout must NOT fire
    await act(async () => {
      jest.advanceTimersByTime(14_900);
    });
    expect(screen.queryByTestId('index-timeout-retry')).toBeNull();

    // Cross the 15s threshold → timeout fires again (proves timer restarted)
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

  it('hides timeout screen when isLoaded becomes true', async () => {
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
    screen.getByTestId('redirect-/(auth)/sign-in');
  });
});
