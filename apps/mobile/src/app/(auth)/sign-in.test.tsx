import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { useSignIn, useSSO, useClerk } from '@clerk/clerk-expo';
import i18n from 'i18next';
import { KeyboardAvoidingView, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import deCatalog from '../../i18n/locales/de.json';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockLocalSearchParams: { redirectTo?: string | string[] } = {};

// Mutable flag state so individual tests can toggle the two preview flags.
// Defaults match the real feature-flags.ts: PREVIEW_ONBOARDING_ENABLED true,
// PREVIEW_ENTRY_CTA_ENABLED false. Tests that need the CTA visible flip
// mockPreviewEntryCtaEnabled to true.
let mockPreviewOnboardingEnabled = true;
let mockPreviewEntryCtaEnabled = false;
jest.mock(
  '../../lib/feature-flags' /* gc1-allow: screen test pins flag branch for CTA visibility */,
  () => ({
    get FEATURE_FLAGS() {
      return {
        COACH_BAND_ENABLED: true,
        MIC_IN_PILL_ENABLED: true,
        I18N_ENABLED: true,
        PREVIEW_ONBOARDING_ENABLED: mockPreviewOnboardingEnabled,
        PREVIEW_ENTRY_CTA_ENABLED: mockPreviewEntryCtaEnabled,
        ADULT_OWNER_GATE_ENABLED: true,
      };
    },
  }),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => mockLocalSearchParams,
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'mentomate://sso-callback'),
  openURL: jest.fn(),
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

const signInModule = require('./sign-in');
const SignInScreen = signInModule.default;
const { clearTransitionState } = require('../../lib/auth-transition');
const {
  clearPendingAuthRedirect,
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
} = require('../../lib/pending-auth-redirect');
const {
  markSessionExpired,
  markSessionRevoked,
  clearSessionExpiredNotice,
  clearSessionRevokedNotice,
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
    mockLocalSearchParams = {};
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
    });
    clearTransitionState();
    clearPendingAuthRedirect();
    clearSessionExpiredNotice();
    clearSessionRevokedNotice();
    delete process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG;
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

  // Regression for "Auth layout broken on first render" (Android E2E tracker):
  // sign-in already lacked the flex-1 logo spacer that broke sign-up under
  // BUG-959, but a future refactor that re-introduces an expanding spacer
  // above the "Welcome" heading would push the primary CTA below the first
  // viewport on small phones. Mirror sign-up's regression guard so a single
  // pattern protects both screens.
  it('does not insert a flex-1 spacer between the logo and the heading', async () => {
    render(<SignInScreen />);
    await act(async () => undefined);

    const content = screen.getByTestId('sign-in-content');
    const siblings = content.children as {
      props?: { className?: string; testID?: string };
    }[];
    const headingIndex = siblings.findIndex(
      (c) =>
        typeof c?.props?.testID === 'string' &&
        c.props.testID.startsWith('sign-in-welcome-'),
    );
    expect(headingIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < headingIndex; i++) {
      const className: string = siblings[i]?.props?.className ?? '';
      expect(className.split(/\s+/)).not.toContain('flex-1');
    }
  });

  // [BUG-988] testID on KeyboardAvoidingView is not emitted as Android
  // resource-id, so Maestro can't find the screen on Android dev-client.
  // Lock the testID to a plain View child of KAV to keep resource-id wiring.
  it('places sign-in-screen testID on a View, not on KeyboardAvoidingView', async () => {
    const { UNSAFE_getAllByType } = render(<SignInScreen />);
    await act(async () => undefined);

    const kavs = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(kavs.length).toBeGreaterThan(0);
    for (const kav of kavs) {
      expect(kav.props.testID).not.toBe('sign-in-screen');
    }
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
    process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG = 'openai';

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
      button.props.accessibilityState?.disabled ?? button.props.disabled,
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
      'test@example.com',
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
      'test@example.com',
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
      'test@example.com',
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
      'test@example.com',
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
      new Error('Too many requests'),
    );

    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-in-email'),
      'test@example.com',
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
      'test@example.com',
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
      'test@example.com',
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
      'test@example.com',
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
      'test@example.com',
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
      'test@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByText(
        "This account requires a security key or passkey which isn't available on mobile yet.",
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
      'test@example.com',
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
      'test@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByText('Enter a backup code');
    });

    screen.getByText(
      'Enter one of the backup codes you saved when you set up two-factor authentication.',
    );

    // No "Resend code" button for backup_code
    expect(screen.queryByTestId('sign-in-resend-code')).toBeNull();

    fireEvent.changeText(
      screen.getByTestId('sign-in-verify-code'),
      'ABCD-1234',
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
      'test@example.com',
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
      'test@example.com',
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
      'test@example.com',
    );
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => {
      screen.getByTestId('sign-in-contact-support');
    });

    fireEvent.press(screen.getByTestId('sign-in-contact-support'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('mailto:support@mentomate.app'),
      );
    });
  });

  it('shows a session-expired banner after forced sign-out', async () => {
    markSessionExpired();

    render(<SignInScreen />);

    await waitFor(() => {
      screen.getByText(
        'Your session expired. Sign in again to continue learning.',
      );
    });
  });

  it('keeps the session-expired banner across an auth screen remount', async () => {
    markSessionExpired();

    const firstRender = render(<SignInScreen />);

    await waitFor(() => {
      screen.getByText(
        'Your session expired. Sign in again to continue learning.',
      );
    });

    firstRender.unmount();
    render(<SignInScreen />);

    await waitFor(() => {
      screen.getByText(
        'Your session expired. Sign in again to continue learning.',
      );
    });
  });

  // [BUG-779/780] Discriminated banner testIDs let the mentor-audit smoke
  // assert which forced-signout cause produced the banner. The expired and
  // revoked notices are independent — setting one must not produce the
  // other's testID.
  it('renders the session-expired banner with the session-expired-banner testID', async () => {
    markSessionExpired();

    render(<SignInScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('session-expired-banner')).toBeTruthy();
    });
    expect(screen.queryByTestId('session-revoked-banner')).toBeNull();
  });

  it('renders the session-revoked banner with the session-revoked-banner testID', async () => {
    markSessionRevoked();

    render(<SignInScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('session-revoked-banner')).toBeTruthy();
    });
    expect(screen.queryByTestId('session-expired-banner')).toBeNull();
  });

  it('prefers the revoked banner when both notices are set', async () => {
    // A server-side revoke is a stronger signal than a client-side expiry —
    // when both are set the revoke wins so the user sees the more accurate
    // cause and the audit smoke gets the deterministic testID.
    markSessionExpired();
    markSessionRevoked();

    render(<SignInScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('session-revoked-banner')).toBeTruthy();
    });
    expect(screen.queryByTestId('session-expired-banner')).toBeNull();
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
        expect.objectContaining({ strategy: 'oauth_google' }),
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
        expect.objectContaining({ strategy: 'oauth_apple' }),
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
    process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG = 'openai';
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: 'sess_openai_123',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('openai-sso-button'));

    await waitFor(() => {
      expect(mockStartSSOFlow).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_custom_openai' }),
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
        }),
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
        expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_pw' }),
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
        }),
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
        }),
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
        }),
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
        }),
      );

      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('pending auth redirect preservation', () => {
    async function completePasswordSignIn(): Promise<void> {
      mockCreate.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'sess_redirect',
      });
      mockSetActive.mockResolvedValue(undefined);

      render(<SignInScreen />);

      fireEvent.changeText(screen.getByTestId('sign-in-email'), 'a@b.com');
      fireEvent.changeText(screen.getByTestId('sign-in-password'), 'pw');
      fireEvent.press(screen.getByTestId('sign-in-button'));

      await waitFor(() =>
        expect(mockSetActive).toHaveBeenCalledWith({
          session: 'sess_redirect',
        }),
      );
    }

    it('stores local redirectTo when present', async () => {
      mockLocalSearchParams = { redirectTo: '/quiz' };

      await completePasswordSignIn();

      expect(peekPendingAuthRedirect()).toBe('/(app)/quiz');
    });

    it('stores browser redirectTo when present', async () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { search: '?redirectTo=%2Fchild%2Fabc%3Fmode%3Dprogress' },
        },
        configurable: true,
      });

      await completePasswordSignIn();

      expect(peekPendingAuthRedirect()).toBe('/(app)/child/abc?mode=progress');
    });

    it('preserves pending redirect across a no-param remount', async () => {
      rememberPendingAuthRedirect('/(app)/quiz');

      await completePasswordSignIn();

      expect(peekPendingAuthRedirect()).toBe('/(app)/quiz');
    });

    it('defaults fresh no-redirect sign-in to home', async () => {
      await completePasswordSignIn();

      expect(peekPendingAuthRedirect()).toBe('/(app)/home');
    });
  });
  // ---------------------------------------------------------------------------
  // [#509] transitionStuck "Try again" must call clerk.signOut() BEFORE
  // clearing form state.  Break test: verify signOut is called first.
  // ---------------------------------------------------------------------------

  describe('[#509] transitionStuck Try again calls clerk.signOut before clearing state', () => {
    const mockClerkSignOut = jest.fn();

    beforeEach(() => {
      (useClerk as jest.Mock).mockReturnValue({
        signOut: mockClerkSignOut,
        isSignedIn: false,
      });
      mockClerkSignOut.mockResolvedValue(undefined);
    });

    it('[#509] tapping Try again calls clerk.signOut() before clearing state', async () => {
      // Pre-mark the session as activated so SignInScreen mounts directly in
      // the isTransitioning=true state. This avoids needing async sign-in to
      // fire, letting us use fake timers from the start to control phase-1.
      const {
        markSessionActivated: markTransition,
      } = require('../../lib/auth-transition');
      markTransition();

      jest.useFakeTimers();
      try {
        (useClerk as jest.Mock).mockReturnValue({
          signOut: mockClerkSignOut,
          isSignedIn: false,
        });

        render(<SignInScreen />);

        // Should show the spinner (isTransitioning=true from pre-marked state)
        screen.getByTestId('sign-in-transitioning');

        // Advance past SESSION_TRANSITION_MS (8s) so phase-1 fires → stuck screen
        await act(async () => {
          jest.advanceTimersByTime(8_500);
        });

        await waitFor(() => screen.getByTestId('sign-in-stuck-retry'));

        // Tap Try again
        await act(async () => {
          fireEvent.press(screen.getByTestId('sign-in-stuck-retry'));
        });

        // clerk.signOut() must have been called (fired before state reset)
        await waitFor(() => {
          expect(mockClerkSignOut).toHaveBeenCalledTimes(1);
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // [CR-2026-05-21-111] Cancel sign-in clears stranded pending SSO state so a
  // subsequent provider tap starts from a clean slate (no stale redirect, no
  // stale pendingSessionActivationId).
  // ---------------------------------------------------------------------------

  describe('[CR-2026-05-21-111] Cancel sign-in after failed OAuth activation', () => {
    it('shows a Cancel button alongside Try Again in the OAuth retry UI, and Cancel clears pending state', async () => {
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
        writable: true,
      });
      // SSO succeeds, but setActive throws — this is the path that calls
      // setPendingSessionActivationId + setActivationFailureContext('oauth')
      // inside activateSession (sign-in.tsx:606-613).
      mockStartSSOFlow.mockResolvedValue({
        createdSessionId: 'sess_google_failing',
      });
      mockSetActive.mockRejectedValueOnce(new Error('clerk activation boom'));

      render(<SignInScreen />);
      fireEvent.press(screen.getByTestId('google-sso-button'));

      // Wait for the retry button to appear (proves pendingSessionActivationId
      // is set and the screen rendered the OAuth-retry branch).
      await waitFor(() => {
        screen.getByTestId('sign-in-oauth-retry');
      });
      // The new Cancel button must be visible alongside Retry.
      screen.getByTestId('sign-in-oauth-cancel');

      // Tap Cancel: the retry UI block should be torn down (since both
      // pendingSessionActivationId and activationFailureContext are cleared).
      await act(async () => {
        fireEvent.press(screen.getByTestId('sign-in-oauth-cancel'));
      });
      expect(screen.queryByTestId('sign-in-oauth-retry')).toBeNull();
      expect(screen.queryByTestId('sign-in-oauth-cancel')).toBeNull();
    });

    // [AUTH-08] Retry path: after a transient setActive failure on the OAuth
    // account-linking path, pressing "Try Again" must re-call setActive with
    // the SAME preserved sessionId (not null, not a re-issued one). Closure
    // proof for WI-870 — the browser sweep can reach the failure banner but
    // cannot drive a deterministic success-on-retry.
    it('[AUTH-08] OAuth retry re-calls setActive with the same sessionId after a transient failure', async () => {
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
        writable: true,
      });
      mockStartSSOFlow.mockResolvedValue({
        createdSessionId: 'sess_google_retry_88',
      });
      // First setActive throws; the retry press succeeds.
      mockSetActive
        .mockRejectedValueOnce(new Error('clerk activation boom'))
        .mockResolvedValueOnce(undefined);

      render(<SignInScreen />);
      fireEvent.press(screen.getByTestId('google-sso-button'));

      await waitFor(() => {
        screen.getByTestId('sign-in-oauth-retry');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('sign-in-oauth-retry'));
      });

      await waitFor(() => {
        expect(mockSetActive).toHaveBeenCalledTimes(2);
        expect(mockSetActive).toHaveBeenNthCalledWith(2, {
          session: 'sess_google_retry_88',
        });
      });
    });
  });
});

// ---------------------------------------------------------------------------
// PREVIEW_ONBOARDING_ENABLED flag gate — Try MentoMate CTA
// ---------------------------------------------------------------------------

describe('SignInScreen — Try MentoMate CTA (PREVIEW_ONBOARDING_ENABLED × PREVIEW_ENTRY_CTA_ENABLED)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTransitionState();
    clearPendingAuthRedirect();
    clearSessionExpiredNotice();
    // Reset both flags to their real defaults before each case.
    mockPreviewOnboardingEnabled = true;
    mockPreviewEntryCtaEnabled = false;
  });

  afterEach(() => {
    mockPreviewOnboardingEnabled = true;
    mockPreviewEntryCtaEnabled = false;
  });

  it('renders the CTA when both PREVIEW_ONBOARDING_ENABLED and PREVIEW_ENTRY_CTA_ENABLED are on', async () => {
    mockPreviewOnboardingEnabled = true;
    mockPreviewEntryCtaEnabled = true;
    render(<SignInScreen />);
    await act(async () => undefined);
    expect(screen.getByTestId('try-mentomate-cta')).toBeTruthy();
  });

  it('uses the localized CTA copy for the accessibility label', async () => {
    const originalLanguage = i18n.language;
    let unmount: (() => void) | undefined;

    try {
      i18n.addResourceBundle('de', 'translation', deCatalog, false, true);
      await i18n.changeLanguage('de');

      mockPreviewOnboardingEnabled = true;
      mockPreviewEntryCtaEnabled = true;
      ({ unmount } = render(<SignInScreen />));
      await act(async () => undefined);

      const cta = screen.getByTestId('try-mentomate-cta');
      expect(cta.props.accessibilityLabel).toBe('MentoMate ausprobieren');
      expect(cta.props.accessibilityLabel).not.toBe('Try MentoMate');
    } finally {
      unmount?.();
      await i18n.changeLanguage(originalLanguage);
    }
  });

  it('hides the CTA when PREVIEW_ENTRY_CTA_ENABLED is off (default product state)', async () => {
    mockPreviewOnboardingEnabled = true;
    mockPreviewEntryCtaEnabled = false;
    render(<SignInScreen />);
    await act(async () => undefined);
    expect(screen.queryByTestId('try-mentomate-cta')).toBeNull();
  });

  // Engine-off branch: even if a future build flips the CTA flag on, the CTA
  // must stay hidden when the preview engine itself is off — otherwise the
  // button would route to /preview, which would dead-end without the engine.
  it('hides the CTA when PREVIEW_ONBOARDING_ENABLED is off, regardless of PREVIEW_ENTRY_CTA_ENABLED', async () => {
    mockPreviewOnboardingEnabled = false;
    mockPreviewEntryCtaEnabled = true;
    render(<SignInScreen />);
    await act(async () => undefined);
    expect(screen.queryByTestId('try-mentomate-cta')).toBeNull();
  });

  it('hides the CTA when both flags are off', async () => {
    mockPreviewOnboardingEnabled = false;
    mockPreviewEntryCtaEnabled = false;
    render(<SignInScreen />);
    await act(async () => undefined);
    expect(screen.queryByTestId('try-mentomate-cta')).toBeNull();
  });
});
