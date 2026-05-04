import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// Resolve i18n keys: try the English catalog first, then fall back to the key.
// New keys (not yet in en.json) are overridden in the fallbackMap below so
// assertions on English copy remain stable while the catalog is updated by the
// coordinator in a separate commit.
jest.mock('react-i18next', () => {
  const en = require('../i18n/locales/en.json');
  const fallbackMap: Record<string, string> = {
    'auth.ssoCallback.loadingLabel': 'Finishing sign-in',
    'auth.ssoCallback.finishing': 'Finishing sign-in...',
    'auth.ssoCallback.backToSignIn': 'Back to sign in',
  };
  function resolveDotPath(
    obj: Record<string, unknown>,
    path: string
  ): string | undefined {
    return path
      .split('.')
      .reduce<unknown>(
        (acc, k) =>
          acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[k]
            : undefined,
        obj
      ) as string | undefined;
  }
  return {
    useTranslation: () => ({
      t: (key: string) => resolveDotPath(en, key) ?? fallbackMap[key] ?? key,
      i18n: { language: 'en' },
    }),
  };
});

const WebBrowser = require('expo-web-browser');
const SSOCallbackScreen = require('./sso-callback').default;

describe('SSOCallbackScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading indicator and text', () => {
    render(<SSOCallbackScreen />);

    screen.getByText('Finishing sign-in...');
  });

  it('calls maybeCompleteAuthSession unconditionally on mount [BUG-261]', () => {
    render(<SSOCallbackScreen />);

    expect(WebBrowser.maybeCompleteAuthSession).toHaveBeenCalledTimes(1);
  });

  describe('10s timeout fallback', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not show fallback before 10s', () => {
      render(<SSOCallbackScreen />);

      expect(screen.queryByTestId('sso-fallback-back')).toBeNull();

      act(() => {
        jest.advanceTimersByTime(9_999);
      });

      expect(screen.queryByTestId('sso-fallback-back')).toBeNull();
    });

    it('reveals "Back to sign in" after 10s with no callback completion', () => {
      render(<SSOCallbackScreen />);

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      expect(screen.getByTestId('sso-fallback-back')).toBeTruthy();
      expect(screen.getByText('Back to sign in')).toBeTruthy();
    });

    it('routes back to /(auth)/sign-in when fallback button is pressed', () => {
      render(<SSOCallbackScreen />);

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      fireEvent.press(screen.getByTestId('sso-fallback-back'));

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });
});
