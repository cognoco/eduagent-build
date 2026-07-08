import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useSignUp, useSSO } from '@clerk/expo';
import { Platform } from 'react-native';
import { CLERK_REQUEST_TIMEOUT_MS } from '../../lib/clerk-timeout';

const mockReplace = jest.fn();
const mockPush = jest.fn();

function neverResolves(): Promise<never> {
  return new Promise<never>((resolve) => {
    void resolve;
  });
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/react-native', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  getCurrentScope: () => ({ clear: jest.fn() }),
  getClient: () => null,
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
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG;
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

  it('keeps the return-to-sign-in link directly with the primary CTA', () => {
    render(<SignUpScreen />);

    const content = screen.getByTestId('sign-up-content');
    const siblings = content.children as {
      props?: { testID?: string };
    }[];
    const signUpButtonIndex = siblings.findIndex(
      (c) => c?.props?.testID === 'sign-up-button',
    );
    const signInRowIndex = siblings.findIndex(
      (c) => c?.props?.testID === 'sign-up-back-to-sign-in-row',
    );
    const termsIndex = siblings.findIndex(
      (c) => c?.props?.testID === 'sign-up-terms-copy',
    );

    expect(signUpButtonIndex).toBeGreaterThanOrEqual(0);
    expect(signInRowIndex).toBe(signUpButtonIndex + 1);
    expect(termsIndex).toBe(signInRowIndex + 1);
    screen.getByTestId('sign-in-link');
  });

  it('renders OpenAI SSO when configured', () => {
    process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG = 'openai';

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

  it('[auth-sign-up-timeout] recovers when signUp.create never resolves', async () => {
    jest.useFakeTimers();
    mockCreate.mockImplementation(neverResolves);

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

    await act(async () => {
      jest.advanceTimersByTime(CLERK_REQUEST_TIMEOUT_MS);
      await Promise.resolve();
    });

    screen.getByText(
      'The security service did not respond in time. Check your connection and try again.',
    );
    expect(mockPrepareVerification).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('sign-up-button').props.accessibilityState,
    ).toEqual(expect.objectContaining({ busy: false, disabled: false }));
  });

  it('[auth-sign-up-timeout] recovers when email verification preparation never resolves', async () => {
    jest.useFakeTimers();
    mockCreate.mockResolvedValue(undefined);
    mockPrepareVerification.mockImplementation(neverResolves);

    render(<SignUpScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-up-email'),
      'new@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'secure123');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    await waitFor(() => {
      expect(mockPrepareVerification).toHaveBeenCalledWith({
        strategy: 'email_code',
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(CLERK_REQUEST_TIMEOUT_MS);
      await Promise.resolve();
    });

    screen.getByText(
      'The security service did not respond in time. Check your connection and try again.',
    );
    expect(
      screen.getByTestId('sign-up-button').props.accessibilityState,
    ).toEqual(expect.objectContaining({ busy: false, disabled: false }));
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
    process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG = 'openai';
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

  // [BUG-510] Break test: when ssoSignIn.status is set, the flow must emit a
  // structured Sentry event before redirecting. Per AGENTS.md: "Silent recovery
  // without escalation is banned." console.warn alone is insufficient; the event
  // must be observable in Sentry so we can query how many times this path fired.
  it('[BUG-510] emits Sentry captureMessage when SSO redirects due to incomplete signIn status', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      signIn: { status: 'needs_first_factor' },
      signUp: null,
    });

    render(<SignUpScreen />);
    fireEvent.press(screen.getByTestId('sign-up-google-sso'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/(auth)/sign-in' }),
      );
    });

    // Sentry must have been called — not just console.warn
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('incomplete signIn'),
      expect.objectContaining({
        level: 'info',
        tags: expect.objectContaining({ flow: 'sign-up-sso' }),
      }),
    );
  });

  // CR-2026-05-21-105 — break test: ssoSignIn.status set means an existing
  // account was matched by the OAuth provider. The fix must redirect to
  // sign-in rather than silently showing a generic error.
  it('redirects to sign-in when SSO matches an existing account needing verification', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      signIn: {
        status: 'needs_first_factor',
        supportedFirstFactors: [{ strategy: 'totp' }],
      },
      signUp: null,
    });

    render(<SignUpScreen />);

    fireEvent.press(screen.getByTestId('sign-up-google-sso'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/(auth)/sign-in' }),
      );
    });

    // Must NOT show generic silent error — user is redirected, not trapped.
    expect(
      screen.queryByText('Sign-up could not be completed. Please try again.'),
    ).toBeNull();
  });

  // CR-2026-05-21-105 — missing fields from the sign-up object surface a
  // concrete actionable message naming the fields, not the generic fallback.
  it('shows missing-fields error when ssoSignUp has missingFields', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      signIn: null,
      signUp: {
        status: 'missing_requirements',
        missingFields: ['phone_number'],
        createdSessionId: null,
      },
    });

    render(<SignUpScreen />);

    fireEvent.press(screen.getByTestId('sign-up-google-sso'));

    await waitFor(() => {
      screen.getByText(
        'Sign-up needs more information: phone_number. Please sign up with email instead.',
      );
    });

    // Must NOT redirect — user stays on screen with actionable message.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // CR-2026-05-21-105 — incomplete ssoSignUp without missingFields shows
  // a provider-specific message rather than the generic fallback.
  it('shows provider-specific error when ssoSignUp status is incomplete without missingFields', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      signIn: null,
      signUp: {
        status: 'abandoned',
        missingFields: [],
        createdSessionId: null,
      },
    });

    render(<SignUpScreen />);

    fireEvent.press(screen.getByTestId('sign-up-google-sso'));

    await waitFor(() => {
      screen.getByText(
        'Sign-up via Google needs additional information. Please sign up with email instead.',
      );
    });
  });

  it('[BUG-591] renders the clerk-captcha mount point so signUp.create can attach the widget', () => {
    render(<SignUpScreen />);
    // RN-Web translates nativeID into DOM id="clerk-captcha"; Clerk's Smart
    // CAPTCHA widget queries for this element on web. Without it, sign-up
    // silently hangs (button disables, no verification UI, no error).
    expect(screen.getByTestId('clerk-captcha')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // [AUTH-03] Email-verification phase: resend, change email, back to sign in,
  // and setActive-failure retry (verification + OAuth contexts) that preserves
  // the created sessionId. Closure proof for WI-870 — deterministic jest
  // coverage of the branches the browser sweep could not reach without a real
  // mailbox/OAuth provider.
  // ---------------------------------------------------------------------------

  // Drives the screen from the email/password form into the pending-verification
  // phase so the verify/resend/back controls are mounted.
  async function reachVerificationPhase() {
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
      screen.getByTestId('sign-up-code');
    });
  }

  it('[AUTH-03] resends the verification code via prepareEmailAddressVerification', async () => {
    await reachVerificationPhase();

    // The create-phase prepare call already fired once; clear so we assert the
    // resend specifically re-issues a fresh email_code prepare.
    mockPrepareVerification.mockClear();
    mockPrepareVerification.mockResolvedValue(undefined);

    fireEvent.press(screen.getByTestId('sign-up-resend-code'));

    await waitFor(() => {
      expect(mockPrepareVerification).toHaveBeenCalledWith({
        strategy: 'email_code',
      });
    });
  });

  it('[AUTH-03] "Use a different email" returns to the form and clears the code', async () => {
    await reachVerificationPhase();

    fireEvent.changeText(screen.getByTestId('sign-up-code'), '123456');
    fireEvent.press(screen.getByTestId('sign-up-back-from-verify'));

    // Back on the email/password form; verification controls are gone.
    await waitFor(() => {
      screen.getByTestId('sign-up-button');
    });
    expect(screen.queryByTestId('sign-up-code')).toBeNull();
    expect(screen.queryByTestId('sign-up-verify-button')).toBeNull();

    // The email field is editable again and retains the typed address so the
    // user can correct it rather than re-typing from scratch.
    expect(screen.getByTestId('sign-up-email').props.value).toBe(
      'new@example.com',
    );
  });

  it('[AUTH-03] "Back to sign in" from the verify phase replaces to /(auth)/sign-in', async () => {
    await reachVerificationPhase();

    fireEvent.press(screen.getByTestId('verify-back-to-sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('[AUTH-03] verification setActive-failure shows retry; retry re-calls setActive with the SAME sessionId', async () => {
    mockCreate.mockResolvedValue(undefined);
    mockPrepareVerification.mockResolvedValue(undefined);
    mockAttemptVerification.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_verify_retry_77',
    });
    // First setActive throws (transient), second succeeds.
    mockSetActive
      .mockRejectedValueOnce(new Error('transient activation failure'))
      .mockResolvedValueOnce(undefined);

    render(<SignUpScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-up-email'),
      'new@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'secure123');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    await waitFor(() => screen.getByTestId('sign-up-code'));

    fireEvent.changeText(screen.getByTestId('sign-up-code'), '123456');
    fireEvent.press(screen.getByTestId('sign-up-verify-button'));

    // setActive threw → activation-failure UI surfaces with a retry control.
    await waitFor(() => screen.getByTestId('sign-up-retry-activation'));
    screen.getByText('Could not activate your session. Please try again.');

    // Retry must re-attempt setActive with the preserved sessionId, not null.
    fireEvent.press(screen.getByTestId('sign-up-retry-activation'));

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledTimes(2);
      expect(mockSetActive).toHaveBeenNthCalledWith(2, {
        session: 'sess_verify_retry_77',
      });
    });
  });

  it('[AUTH-03/AUTH-08] OAuth setActive-failure shows retry; retry re-calls setActive with the SAME sessionId', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: 'sess_oauth_re_42',
    });
    mockSetActive
      .mockRejectedValueOnce(new Error('oauth activation failure'))
      .mockResolvedValueOnce(undefined);

    render(<SignUpScreen />);

    fireEvent.press(screen.getByTestId('sign-up-google-sso'));

    // setActive threw on the OAuth path → oauth-context retry UI appears.
    await waitFor(() => screen.getByTestId('sign-up-oauth-retry'));
    screen.getByTestId('sign-up-oauth-clear');

    fireEvent.press(screen.getByTestId('sign-up-oauth-retry'));

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledTimes(2);
      expect(mockSetActive).toHaveBeenNthCalledWith(2, {
        session: 'sess_oauth_re_42',
      });
    });
  });

  it('[AUTH-03/AUTH-08] OAuth "Try another method" clears the activation-failure UI', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: 'sess_oauth_clr' });
    mockSetActive.mockRejectedValueOnce(new Error('oauth activation failure'));

    render(<SignUpScreen />);

    fireEvent.press(screen.getByTestId('sign-up-google-sso'));

    await waitFor(() => screen.getByTestId('sign-up-oauth-clear'));

    fireEvent.press(screen.getByTestId('sign-up-oauth-clear'));

    expect(screen.queryByTestId('sign-up-oauth-retry')).toBeNull();
    expect(screen.queryByTestId('sign-up-oauth-clear')).toBeNull();
  });
});
