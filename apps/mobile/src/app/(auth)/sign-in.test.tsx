import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'mentomate://sso-callback'),
  openURL: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const signInModule = require('./sign-in');
const SignInScreen = signInModule.default;
const { clearTransitionState } = require('../../lib/auth-transition');
const { clearPendingAuthRedirect } = require('../../lib/pending-auth-redirect');
const {
  markSessionExpired,
  clearSessionExpiredNotice,
} = require('../../lib/auth-expiry');

describe('SignInScreen', () => {
  const mockCreate = jest.fn();
  const mockPrepareFirstFactor = jest.fn();
  const mockPrepareSecondFactor = jest.fn();
  const mockAttemptFirstFactor = jest.fn();
  const mockAttemptSecondFactor = jest.fn();
  const mockSetActive = jest.fn();
  const mockStartSSOFlow = jest.fn();

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearTransitionState();
    clearPendingAuthRedirect();
    clearSessionExpiredNotice();
    delete process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY;
    (useSignIn as jest.Mock).mockReturnValue({
      isLoaded: true,
      signIn: {
        create: mockCreate,
        prepareFirstFactor: mockPrepareFirstFactor,
        prepareSecondFactor: mockPrepareSecondFactor,
        attemptFirstFactor: mockAttemptFirstFactor,
        attemptSecondFactor: mockAttemptSecondFactor,
      },
      setActive: mockSetActive,
    });
    (useSSO as jest.Mock).mockReturnValue({
      startSSOFlow: mockStartSSOFlow,
    });
  });

  it('renders email and password inputs', async () => {
    render(<SignInScreen />);
    await act(async () => undefined);

    screen.getByTestId('sign-in-email');
    screen.getByTestId('sign-in-password');
    screen.getByTestId('sign-in-button');
  });

  // [BUG-959] sign-in-button + sign-up-link sit below the fold on 1080x1920
  // (~5.8" devices) once logo + Google SSO + form fields stack up. The
  // ScrollView is fine — it's the E2E test's screen-loaded signal that
  // breaks, because Maestro waits on sign-in-button which is below-fold.
  // Lock the always-above-fold container testIDs so any future rename
  // surfaces here before the Maestro suite breaks nightly.
  it('exposes screen + scroll testIDs for Maestro screen-loaded waits', async () => {
    render(<SignInScreen />);
    await act(async () => undefined);

    screen.getByTestId('sign-in-screen');
    screen.getByTestId('sign-in-scroll');
  });

  it('renders Apple SSO button on iOS (Google hidden)', async () => {
    render(<SignInScreen />);
    await act(async () => undefined);

    expect(screen.queryByTestId('google-sso-button')).toBeNull();
    screen.getByTestId('apple-sso-button');
    expect(screen.queryByTestId('openai-sso-button')).toBeNull();
    screen.getByText('Continue with Apple');
  });

  it('renders Google SSO button on Android (Apple hidden)', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    render(<SignInScreen />);
    await act(async () => undefined);

    screen.getByTestId('google-sso-button');
    expect(screen.queryByTestId('apple-sso-button')).toBeNull();
    screen.getByText('Continue with Google');
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
      writable: true,
    });
  });

  it('renders OpenAI SSO when configured', async () => {
    process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY = 'openai';

    render(<SignInScreen />);
    await act(async () => undefined);

    screen.getByTestId('openai-sso-button');
    screen.getByText('Continue with OpenAI');
  });

  it('renders forgot password link', async () => {
    render(<SignInScreen />);
    await act(async () => undefined);

    screen.getByTestId('forgot-password-link');
    screen.getByText('Forgot password?');
  });

  it('disables sign-in button when fields are empty', async () => {
    render(<SignInScreen />);
    await act(async () => undefined);

    const button = screen.getByTestId('sign-in-button');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('calls signIn.create on submit and activates session on success', async () => {
    mockCreate.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_123',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        strategy: 'password',
        identifier: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_123',
      });
    });

    // Auth layout guard handles navigation — no explicit router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('displays error message on sign-in failure', async () => {
    mockCreate.mockRejectedValue({
      errors: [{ longMessage: 'Invalid credentials' }],
    });

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'wrong');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByText('Invalid credentials');
    });
  });

  // ---------------------------------------------------------------------------
  // Client Trust / verification flow — auto-send behavior
  // ---------------------------------------------------------------------------

  it('auto-sends verification code when first factor is required (Client Trust)', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_first_factor',
      createdSessionId: null,
      supportedFirstFactors: [
        {
          strategy: 'email_code',
          emailAddressId: 'email_123',
          safeIdentifier: 't***@example.com',
        },
      ],
    });
    mockPrepareFirstFactor.mockResolvedValue(undefined);

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    // Auto-send: prepareFirstFactor called without user tapping a button
    await waitFor(() => {
      expect(mockPrepareFirstFactor).toHaveBeenCalledWith({
        strategy: 'email_code',
        emailAddressId: 'email_123',
      });
    });

    // Goes straight to code entry screen (no intermediate banner)
    await waitFor(() => {
      screen.getByTestId('sign-in-verify-code');
    });
    expect(screen.queryByTestId('sign-in-verification-offer')).toBeNull();
  });

  it('completes first-factor verification end-to-end', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_first_factor',
      createdSessionId: null,
      supportedFirstFactors: [
        {
          strategy: 'email_code',
          emailAddressId: 'email_123',
          safeIdentifier: 't***@example.com',
        },
      ],
    });
    mockPrepareFirstFactor.mockResolvedValue(undefined);
    mockAttemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_first_factor_ok',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    // Wait for auto-send → code entry screen
    await waitFor(() => {
      screen.getByTestId('sign-in-verify-code');
    });

    // Enter code and verify
    fireEvent.changeText(screen.getByTestId('sign-in-verify-code'), '123456');
    fireEvent.press(screen.getByTestId('sign-in-verify-button'));

    await waitFor(() => {
      expect(mockAttemptFirstFactor).toHaveBeenCalledWith({
        strategy: 'email_code',
        code: '123456',
      });
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_first_factor_ok',
      });
    });

    // Auth layout guard handles navigation — no explicit router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to manual verification banner when auto-send fails', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_first_factor',
      createdSessionId: null,
      supportedFirstFactors: [
        {
          strategy: 'email_code',
          emailAddressId: 'email_123',
          safeIdentifier: 't***@example.com',
        },
      ],
    });
    // Auto-send fails (e.g. rate limited)
    mockPrepareFirstFactor.mockRejectedValueOnce(
      new Error('Too many requests')
    );

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    // Falls back to the passive banner (no code entry screen yet)
    await waitFor(() => {
      screen.getByTestId('sign-in-verification-offer');
    });
    expect(screen.queryByTestId('sign-in-verify-code')).toBeNull();
    screen.getByText('Send verification code');

    // User can manually retry from the banner
    mockPrepareFirstFactor.mockResolvedValueOnce(undefined);
    fireEvent.press(screen.getByTestId('sign-in-start-verification'));

    await waitFor(() => {
      expect(mockPrepareFirstFactor).toHaveBeenCalledTimes(2);
    });

    // Now shows code entry screen
    await waitFor(() => {
      screen.getByTestId('sign-in-verify-code');
    });
  });

  it('auto-sends verification code for second factor and completes', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [
        {
          strategy: 'email_code',
          emailAddressId: 'email_456',
          safeIdentifier: 't***@example.com',
        },
      ],
    });
    mockPrepareSecondFactor.mockResolvedValue(undefined);
    mockAttemptSecondFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_second_factor_123',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    // Auto-send: prepareSecondFactor called without user tapping a button
    await waitFor(() => {
      expect(mockPrepareSecondFactor).toHaveBeenCalledWith({
        strategy: 'email_code',
        emailAddressId: 'email_456',
      });
    });

    // Goes straight to code entry screen
    await waitFor(() => {
      screen.getByTestId('sign-in-verify-code');
    });

    // Enter code and verify
    fireEvent.changeText(screen.getByTestId('sign-in-verify-code'), '123456');
    fireEvent.press(screen.getByTestId('sign-in-verify-button'));

    await waitFor(() => {
      expect(mockAttemptSecondFactor).toHaveBeenCalledWith({
        strategy: 'email_code',
        code: '123456',
      });
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_second_factor_123',
      });
    });

    // Auth layout guard handles navigation — no explicit router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // TOTP (authenticator app) 2FA
  // ---------------------------------------------------------------------------

  it('goes straight to TOTP code entry without prepare step', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [{ strategy: 'totp' }],
    });

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    // Goes straight to code entry — no prepare call needed for TOTP
    await waitFor(() => {
      screen.getByTestId('sign-in-verify-code');
    });
    screen.getByText('Enter authenticator code');
    screen.getByText('Open your authenticator app and enter the 6-digit code.');

    // No prepare calls — TOTP codes are generated locally
    expect(mockPrepareFirstFactor).not.toHaveBeenCalled();
    expect(mockPrepareSecondFactor).not.toHaveBeenCalled();

    // No "Resend code" button for TOTP
    expect(screen.queryByTestId('sign-in-resend-code')).toBeNull();
  });

  it('completes TOTP second-factor verification end-to-end', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [{ strategy: 'totp' }],
    });
    mockAttemptSecondFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_totp_ok',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    // Wait for code entry screen
    await waitFor(() => {
      screen.getByTestId('sign-in-verify-code');
    });

    // Enter TOTP code and verify
    fireEvent.changeText(screen.getByTestId('sign-in-verify-code'), '482901');
    fireEvent.press(screen.getByTestId('sign-in-verify-button'));

    await waitFor(() => {
      expect(mockAttemptSecondFactor).toHaveBeenCalledWith({
        strategy: 'totp',
        code: '482901',
      });
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_totp_ok',
      });
    });

    // Auth layout guard handles navigation — no explicit router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('prefers TOTP over email_code when both are available as second factor', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [
        {
          strategy: 'email_code',
          emailAddressId: 'email_789',
          safeIdentifier: 't***@example.com',
        },
        { strategy: 'totp' },
      ],
    });

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    // Should use TOTP (no prepare, no email sent)
    await waitFor(() => {
      screen.getByText('Enter authenticator code');
    });
    expect(mockPrepareSecondFactor).not.toHaveBeenCalled();
  });

  it('shows unsupported message for unknown MFA methods (no SSO available)', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [{ strategy: 'webauthn' }],
      supportedFirstFactors: [], // no SSO providers
    });

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByText(
        "This account requires a security key or passkey which isn't available on mobile yet."
      );
    });

    screen.getByTestId('sign-in-unsupported-factor-help');
    // No SSO providers: help text should NOT mention "Google or Apple"
    expect(screen.queryByText(/Google or Apple/)).toBeNull();
  });

  it('shows backup_code entry form when backup_code is only supported second factor', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [{ strategy: 'backup_code' }],
    });

    render(<SignInScreen />);
    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByText('Enter a backup code');
    });
    screen.getByTestId('sign-in-verify-code');
  });

  it('successfully verifies with backup_code strategy', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [{ strategy: 'backup_code' }],
    });
    mockAttemptSecondFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_backup_ok',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByText('Enter a backup code');
    });

    screen.getByText(
      'Enter one of the backup codes you saved when you set up two-factor authentication.'
    );

    // No "Resend code" button for backup_code
    expect(screen.queryByTestId('sign-in-resend-code')).toBeNull();

    fireEvent.changeText(
      screen.getByTestId('sign-in-verify-code'),
      'ABCD-1234'
    );
    fireEvent.press(screen.getByTestId('sign-in-verify-button'));

    await waitFor(() => {
      expect(mockAttemptSecondFactor).toHaveBeenCalledWith({
        strategy: 'backup_code',
        code: 'ABCD-1234',
      });
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_backup_ok' });
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('uses backup_code when available before falling back to unsupported message', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [
        { strategy: 'webauthn' },
        { strategy: 'backup_code' },
      ],
    });

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    // backup_code is supported — should go to code entry, not unsupported message
    await waitFor(() => {
      screen.getByText('Enter a backup code');
    });
    expect(screen.queryByTestId('sign-in-unsupported-factor-help')).toBeNull();
  });

  it('shows SSO suggestion in help block when account has SSO providers linked', async () => {
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [{ strategy: 'webauthn' }],
      supportedFirstFactors: [
        { strategy: 'oauth_google' },
        { strategy: 'password' },
      ],
    });

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByTestId('sign-in-unsupported-factor-help');
    });

    screen.getByText(/Google or Apple/);
  });

  it('opens support email when unsupported MFA help is used', async () => {
    (Linking.openURL as jest.Mock).mockResolvedValue(true);
    mockCreate.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
      supportedSecondFactors: [{ strategy: 'webauthn' }],
    });

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByTestId('sign-in-contact-support');
    });

    fireEvent.press(screen.getByTestId('sign-in-contact-support'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('mailto:support@mentomate.app')
      );
    });
  });

  it('shows a session-expired banner after forced sign-out', async () => {
    markSessionExpired();

    render(<SignInScreen />);

    await waitFor(() => {
      screen.getByText(
        'Your session expired. Sign in again to continue learning.'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // SSO sign-in
  // ---------------------------------------------------------------------------

  it('calls startSSOFlow for Google and activates session on success', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: 'sess_google_123',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('google-sso-button'));

    await waitFor(() => {
      expect(mockStartSSOFlow).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_google' })
      );
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_google_123',
      });
    });

    // Auth layout guard handles navigation — no explicit router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('calls startSSOFlow for Apple and navigates on success', async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: 'sess_apple_123',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('apple-sso-button'));

    await waitFor(() => {
      expect(mockStartSSOFlow).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_apple' })
      );
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_apple_123',
      });
    });
  });

  it('displays error on OAuth failure', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockRejectedValue({
      errors: [{ longMessage: 'OAuth provider error' }],
    });

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('google-sso-button'));

    await waitFor(() => {
      screen.getByText('OAuth provider error');
    });
  });

  it('shows error when SSO returns no session', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
      writable: true,
    });
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
    });

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('google-sso-button'));

    await waitFor(() => {
      screen.getByText('Sign-in could not be completed. Please try again.');
    });
    expect(mockSetActive).not.toHaveBeenCalled();
  });

  it('calls startSSOFlow for OpenAI when configured', async () => {
    process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY = 'openai';
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: 'sess_openai_123',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('openai-sso-button'));

    await waitFor(() => {
      expect(mockStartSSOFlow).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_custom_openai' })
      );
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_openai_123',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Navigation contract — regression guard for sign-in bounce-back bug.
  //
  // BUG (2026-04-05): After successful verification, router.replace() fired
  // before Clerk's React state propagated.  The app layout guard saw
  // isSignedIn: false and bounced the user to an empty sign-in screen.
  //
  // FIX: Auth screens must NEVER call router.replace() or router.push()
  // after setActive().  The (auth)/_layout guard reactively redirects to
  // /(app)/home when useAuth().isSignedIn becomes true.
  //
  // These tests verify that contract holds for EVERY auth completion path.
  // If you add a new sign-in method, add a test here proving it does NOT
  // navigate after setActive().
  // ---------------------------------------------------------------------------

  describe('navigation contract: never navigate after setActive()', () => {
    // Helper: complete the password + first-factor verification flow
    async function completeFirstFactorVerification() {
      mockCreate.mockResolvedValue({
        status: 'needs_first_factor',
        createdSessionId: null,
        supportedFirstFactors: [
          {
            strategy: 'email_code',
            emailAddressId: 'email_nav',
            safeIdentifier: 'u***@test.com',
          },
        ],
      });
      mockPrepareFirstFactor.mockResolvedValue(undefined);
      mockAttemptFirstFactor.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'sess_nav_first',
      });
      mockSetActive.mockResolvedValue(undefined);

      render(<SignInScreen />);

      fireEvent.changeText(screen.getByTestId('sign-in-email'), 'u@test.com');
      fireEvent.changeText(screen.getByTestId('sign-in-password'), 'pw');
      fireEvent.press(screen.getByTestId('sign-in-button'));

      await waitFor(() => screen.getByTestId('sign-in-verify-code'));

      fireEvent.changeText(screen.getByTestId('sign-in-verify-code'), '111111');
      fireEvent.press(screen.getByTestId('sign-in-verify-button'));

      await waitFor(() =>
        expect(mockSetActive).toHaveBeenCalledWith({
          session: 'sess_nav_first',
        })
      );
    }

    it('password sign-in: no navigation after setActive()', async () => {
      mockCreate.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'sess_pw',
      });
      mockSetActive.mockResolvedValue(undefined);

      render(<SignInScreen />);

      fireEvent.changeText(screen.getByTestId('sign-in-email'), 'a@b.com');
      fireEvent.changeText(screen.getByTestId('sign-in-password'), 'pw');
      fireEvent.press(screen.getByTestId('sign-in-button'));

      await waitFor(() =>
        expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_pw' })
      );

      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('first-factor verification: no navigation after setActive()', async () => {
      await completeFirstFactorVerification();

      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('second-factor verification: no navigation after setActive()', async () => {
      mockCreate.mockResolvedValue({
        status: 'needs_second_factor',
        createdSessionId: null,
        supportedSecondFactors: [
          {
            strategy: 'email_code',
            emailAddressId: 'email_2fa',
            safeIdentifier: 'x***@test.com',
          },
        ],
      });
      mockPrepareSecondFactor.mockResolvedValue(undefined);
      mockAttemptSecondFactor.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'sess_nav_second',
      });
      mockSetActive.mockResolvedValue(undefined);

      render(<SignInScreen />);

      fireEvent.changeText(screen.getByTestId('sign-in-email'), 'x@test.com');
      fireEvent.changeText(screen.getByTestId('sign-in-password'), 'pw');
      fireEvent.press(screen.getByTestId('sign-in-button'));

      await waitFor(() => screen.getByTestId('sign-in-verify-code'));

      fireEvent.changeText(screen.getByTestId('sign-in-verify-code'), '222222');
      fireEvent.press(screen.getByTestId('sign-in-verify-button'));

      await waitFor(() =>
        expect(mockSetActive).toHaveBeenCalledWith({
          session: 'sess_nav_second',
        })
      );

      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('TOTP verification: no navigation after setActive()', async () => {
      mockCreate.mockResolvedValue({
        status: 'needs_second_factor',
        createdSessionId: null,
        supportedSecondFactors: [{ strategy: 'totp' }],
      });
      mockAttemptSecondFactor.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'sess_nav_totp',
      });
      mockSetActive.mockResolvedValue(undefined);

      render(<SignInScreen />);

      fireEvent.changeText(screen.getByTestId('sign-in-email'), 'y@test.com');
      fireEvent.changeText(screen.getByTestId('sign-in-password'), 'pw');
      fireEvent.press(screen.getByTestId('sign-in-button'));

      await waitFor(() => screen.getByTestId('sign-in-verify-code'));

      fireEvent.changeText(screen.getByTestId('sign-in-verify-code'), '333333');
      fireEvent.press(screen.getByTestId('sign-in-verify-button'));

      await waitFor(() =>
        expect(mockSetActive).toHaveBeenCalledWith({
          session: 'sess_nav_totp',
        })
      );

      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('Google SSO: no navigation after setActive()', async () => {
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
        writable: true,
      });
      mockStartSSOFlow.mockResolvedValue({
        createdSessionId: 'sess_nav_google',
      });
      mockSetActive.mockResolvedValue(undefined);

      render(<SignInScreen />);
      fireEvent.press(screen.getByTestId('google-sso-button'));

      await waitFor(() =>
        expect(mockSetActive).toHaveBeenCalledWith({
          session: 'sess_nav_google',
        })
      );

      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('Apple SSO: no navigation after setActive()', async () => {
      mockStartSSOFlow.mockResolvedValue({
        createdSessionId: 'sess_nav_apple',
      });
      mockSetActive.mockResolvedValue(undefined);

      render(<SignInScreen />);
      fireEvent.press(screen.getByTestId('apple-sso-button'));

      await waitFor(() =>
        expect(mockSetActive).toHaveBeenCalledWith({
          session: 'sess_nav_apple',
        })
      );

      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
