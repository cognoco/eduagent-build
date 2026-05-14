import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useSignUp, useSSO } from '@clerk/clerk-expo';
import { Platform } from 'react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// prettier-ignore
jest.mock('../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({ muted: '#71717a', textPrimary: '#18181b' }),
  useTheme: () => ({ colorScheme: 'dark' }),
  useTokenVars: () => ({}),
}));

const mockStartSSOFlow = jest.fn();

const SignUpScreen = require('./sign-up').default;

describe('SignUpScreen', () => {
  const mockCreate = jest.fn();
  const mockPrepareVerification = jest.fn();
  const mockAttemptVerification = jest.fn();
  const mockSetActive = jest.fn();

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY;
    (useSignUp as jest.Mock).mockReturnValue({
      isLoaded: true,
      signUp: {
        create: mockCreate,
        prepareEmailAddressVerification: mockPrepareVerification,
        attemptEmailAddressVerification: mockAttemptVerification,
      },
      setActive: mockSetActive,
    });
    (useSSO as jest.Mock).mockReturnValue({
      startSSOFlow: mockStartSSOFlow,
    });
  });

  it('renders sign-up form with SSO buttons', () => {
    render(<SignUpScreen />);

    // On iOS (default test platform), Google SSO is hidden; Apple SSO is shown instead
    expect(screen.queryByTestId('sign-up-google-sso')).toBeNull();
    expect(screen.queryByTestId('sign-up-openai-sso')).toBeNull();
    screen.getByTestId('sign-up-email');
    screen.getByTestId('sign-up-password');
    screen.getByTestId('sign-up-button');
    screen.getByText('or continue with email');
  });

  // [BUG-959] sign-up-button sits below the fold on 1080x1920 once the
  // logo + SSO + form fields stack up. The Maestro suite needs an
  // always-above-fold container testID for screen-loaded waits.
  it('exposes screen + scroll testIDs for Maestro screen-loaded waits', () => {
    render(<SignUpScreen />);

    screen.getByTestId('sign-up-screen');
    screen.getByTestId('sign-up-scroll');
  });

  // BUG-959 regression: a future refactor that re-introduces an expanding
  // flex-1 spacer above the heading would push the primary CTA below the
  // first viewport on small phones. Mirror sign-in's regression guard.
  it('does not insert a flex-1 spacer between the logo and the heading', () => {
    render(<SignUpScreen />);

    const content = screen.getByTestId('sign-up-content');
    const siblings = content.children as {
      props?: { className?: string; testID?: string };
    }[];
    const headingIndex = siblings.findIndex(
      (c) => c?.props?.testID === 'sign-up-heading',
    );
    expect(headingIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < headingIndex; i++) {
      const className: string = siblings[i]?.props?.className ?? '';
      expect(className.split(/\s+/)).not.toContain('flex-1');
    }
  });

  it('renders OpenAI SSO when configured', () => {
    process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY = 'openai';

    render(<SignUpScreen />);

    screen.getByTestId('sign-up-openai-sso');
    screen.getByText('Continue with OpenAI');
  });

  it('handles Google SSO sign-up', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: 'sess_google' });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignUpScreen />);

    fireEvent.press(screen.getByTestId('sign-up-google-sso'));

    await waitFor(() => {
      expect(mockStartSSOFlow).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_google' }),
      );
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_google' });
    });

    // Auth layout guard handles navigation — no explicit router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('transitions to verification phase after sign-up', async () => {
    mockCreate.mockResolvedValue(undefined);
    mockPrepareVerification.mockResolvedValue(undefined);

    render(<SignUpScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-up-email'),
      'new@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'secure123');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        emailAddress: 'new@example.com',
        password: 'secure123',
      });
    });

    await waitFor(() => {
      expect(mockPrepareVerification).toHaveBeenCalledWith({
        strategy: 'email_code',
      });
    });

    await waitFor(() => {
      screen.getByTestId('sign-up-code');
      screen.getByTestId('sign-up-verify-button');
    });
  });

  it('completes verification and navigates to app home', async () => {
    mockCreate.mockResolvedValue(undefined);
    mockPrepareVerification.mockResolvedValue(undefined);
    mockAttemptVerification.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_new',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignUpScreen />);

    // Phase 1: sign-up
    fireEvent.changeText(
      screen.getByTestId('sign-up-email'),
      'new@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'secure123');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    // Phase 2: verification
    await waitFor(() => {
      screen.getByTestId('sign-up-code');
    });

    fireEvent.changeText(screen.getByTestId('sign-up-code'), '123456');
    fireEvent.press(screen.getByTestId('sign-up-verify-button'));

    await waitFor(() => {
      expect(mockAttemptVerification).toHaveBeenCalledWith({
        code: '123456',
      });
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_new',
      });
    });

    // Auth layout guard handles navigation — no explicit router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('displays error on sign-up failure', async () => {
    mockCreate.mockRejectedValue({
      errors: [{ longMessage: 'Email already in use' }],
    });

    render(<SignUpScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-up-email'),
      'existing@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'password');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    await waitFor(() => {
      screen.getByText('Email already in use');
    });
  });

  it('displays error on verification failure', async () => {
    mockCreate.mockResolvedValue(undefined);
    mockPrepareVerification.mockResolvedValue(undefined);
    mockAttemptVerification.mockRejectedValue({
      errors: [{ message: 'Incorrect code' }],
    });

    render(<SignUpScreen />);

    // Get to phase 2
    fireEvent.changeText(
      screen.getByTestId('sign-up-email'),
      'new@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'secure123');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    await waitFor(() => {
      screen.getByTestId('sign-up-code');
    });

    fireEvent.changeText(screen.getByTestId('sign-up-code'), '000000');
    fireEvent.press(screen.getByTestId('sign-up-verify-button'));

    await waitFor(() => {
      screen.getByText('Incorrect code');
    });
  });

  it('handles OpenAI SSO sign-up when configured', async () => {
    process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY = 'openai';
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: 'sess_openai' });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignUpScreen />);

    fireEvent.press(screen.getByTestId('sign-up-openai-sso'));

    await waitFor(() => {
      expect(mockStartSSOFlow).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_custom_openai' }),
      );
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_openai' });
    });
  });
});
