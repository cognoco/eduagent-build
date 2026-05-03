import { render, screen } from '@testing-library/react-native';

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
});
