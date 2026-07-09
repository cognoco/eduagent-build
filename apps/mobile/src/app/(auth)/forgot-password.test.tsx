import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { useSignIn } from '@clerk/expo';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
    push: mockPush,
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const ForgotPasswordScreen = require('./forgot-password').default;

describe('ForgotPasswordScreen', () => {
  const mockCreate = jest.fn();
  const mockAttemptFirstFactor = jest.fn();
  const mockSetActive = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useSignIn as jest.Mock).mockReturnValue({
      isLoaded: true,
      signIn: {
        create: mockCreate,
        attemptFirstFactor: mockAttemptFirstFactor,
      },
      setActive: mockSetActive,
    });
  });

  it('renders email input and send button', () => {
    render(<ForgotPasswordScreen />);

    screen.getByTestId('forgot-password-email');
    screen.getByTestId('send-reset-code-button');
    screen.getByText('Forgot password?');
  });

  it('renders back to sign in link', () => {
    render(<ForgotPasswordScreen />);

    screen.getByTestId('back-to-sign-in');
  });

  // [BUG-963] Pressing the "Back to sign in" link from forgot-password must
  // hand control back to the sign-in stack via goBackOrReplace, not synthesize
  // a 1-deep stack via router.push('/sign-in') (which leaves Maestro on the
  // sign-in screen scrolled to top with sign-in-button below the fold and no
  // way back to the previous tab). The press goes through router.back() when
  // canGoBack is true, falling back to router.replace otherwise.
  it('[BUG-963] back-to-sign-in press routes through router.back when possible', () => {
    render(<ForgotPasswordScreen />);

    fireEvent.press(screen.getByTestId('back-to-sign-in'));

    // canGoBack is true in this test setup, so router.back() runs and
    // router.replace must NOT be invoked (replace would discard history).
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('calls signIn.create with reset_password_email_code strategy', async () => {
    mockCreate.mockResolvedValue({});

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com',
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        strategy: 'reset_password_email_code',
        identifier: 'test@example.com',
      });
    });
  });

  it('transitions to reset form after sending code', async () => {
    mockCreate.mockResolvedValue({});

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com',
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      screen.getByTestId('reset-code');
      screen.getByTestId('reset-new-password');
      screen.getByTestId('reset-password-button');
    });
  });

  it('calls signIn.attemptFirstFactor with code and password', async () => {
    mockCreate.mockResolvedValue({});
    mockAttemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_reset_123',
    });
    mockSetActive.mockResolvedValue(undefined);

    render(<ForgotPasswordScreen />);

    // Phase 1: send code
    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com',
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      screen.getByTestId('reset-code');
    });

    // Phase 2: reset password
    fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    fireEvent.changeText(
      screen.getByTestId('reset-new-password'),
      'newPassword123',
    );
    fireEvent.press(screen.getByTestId('reset-password-button'));

    await waitFor(() => {
      expect(mockAttemptFirstFactor).toHaveBeenCalledWith({
        strategy: 'reset_password_email_code',
        code: '123456',
        password: 'newPassword123',
      });
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        session: 'sess_reset_123',
      });
    });

    // Auth layout guard handles navigation — no explicit router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('displays error on send code failure', async () => {
    mockCreate.mockRejectedValue({
      errors: [{ longMessage: 'User not found' }],
    });

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'nobody@example.com',
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      screen.getByText('User not found');
    });
  });

  // ---------------------------------------------------------------------------
  // [#511] setActive throws after successful password reset
  // Break test: assert Retry button is rendered, sessionId preserved,
  // retry calls setActive again with the same sessionId.
  // ---------------------------------------------------------------------------

  it('[#511] shows Retry button when setActive throws after reset success', async () => {
    mockCreate.mockResolvedValue({});
    mockAttemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_reset_fail_123',
    });
    mockSetActive.mockRejectedValue(new Error('setActive blew up'));

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com',
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => screen.getByTestId('reset-code'));

    fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    fireEvent.changeText(
      screen.getByTestId('reset-new-password'),
      'NewPassword1!',
    );
    fireEvent.press(screen.getByTestId('reset-password-button'));

    // Retry button must appear; form fields hidden (code is spent)
    await waitFor(() => screen.getByTestId('reset-retry-activation'));
    expect(screen.queryByTestId('reset-password-button')).toBeNull();
    expect(screen.queryByTestId('reset-code')).toBeNull();
  });

  it('[#511] retry button calls setActive again with the preserved sessionId', async () => {
    mockCreate.mockResolvedValue({});
    mockAttemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_reset_retry_999',
    });
    // First setActive throws; second succeeds
    mockSetActive
      .mockRejectedValueOnce(new Error('Transient error'))
      .mockResolvedValueOnce(undefined);

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com',
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => screen.getByTestId('reset-code'));

    fireEvent.changeText(screen.getByTestId('reset-code'), '654321');
    fireEvent.changeText(
      screen.getByTestId('reset-new-password'),
      'NewPassword1!',
    );
    fireEvent.press(screen.getByTestId('reset-password-button'));

    await waitFor(() => screen.getByTestId('reset-retry-activation'));

    // Tap Retry — must call setActive with the SAME session id, not null
    fireEvent.press(screen.getByTestId('reset-retry-activation'));

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledTimes(2);
      expect(mockSetActive).toHaveBeenNthCalledWith(2, {
        session: 'sess_reset_retry_999',
      });
    });
  });

  it('[#511] secondary link navigates to sign-in on permanent setActive failure', async () => {
    mockCreate.mockResolvedValue({});
    mockAttemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_reset_perm_fail',
    });
    mockSetActive.mockRejectedValue(new Error('Permanent failure'));

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com',
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => screen.getByTestId('reset-code'));

    fireEvent.changeText(screen.getByTestId('reset-code'), '111222');
    fireEvent.changeText(
      screen.getByTestId('reset-new-password'),
      'NewPassword1!',
    );
    fireEvent.press(screen.getByTestId('reset-password-button'));

    await waitFor(() => screen.getByTestId('reset-continue-to-sign-in'));

    fireEvent.press(screen.getByTestId('reset-continue-to-sign-in'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(auth)/sign-in' }),
    );
  });

  // ---------------------------------------------------------------------------
  // [#617 / AUTH-06] Forgot-password reset request can spin indefinitely.
  // Clerk's signIn.create has no client-side timeout; when it never resolves
  // (network stall, dev email delivery hang) `loading` never flips back and
  // the user is stranded on a disabled spinner with no actionable recovery.
  // Break test: signIn.create returns a never-resolving promise; after 21s of
  // fake time, the user-facing timeout message must render AND the primary
  // button must be re-enabled.
  // ---------------------------------------------------------------------------
  it('[#617] surfaces a timeout error and re-enables the button when signIn.create hangs', async () => {
    jest.useFakeTimers();
    try {
      // Never-resolving promise — simulates Clerk hang
      mockCreate.mockImplementation(() => new Promise<never>(() => undefined));

      render(<ForgotPasswordScreen />);

      fireEvent.changeText(
        screen.getByTestId('forgot-password-email'),
        'stuck@example.com',
      );
      fireEvent.press(screen.getByTestId('send-reset-code-button'));

      // Advance past the 20s timeout window
      await act(async () => {
        await jest.advanceTimersByTimeAsync(21_000);
      });

      // (a) Timeout message renders
      await waitFor(() => {
        screen.getByText(
          "We couldn't reach the reset service in time. Check your connection and try again.",
        );
      });

      // (b) Primary button is re-enabled (loading cleared, email still
      // filled so canSubmitEmail is true again).
      const button = screen.getByTestId('send-reset-code-button');
      expect(button.props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );

      // Sanity: the screen did not advance to the reset-code form
      expect(screen.queryByTestId('reset-code')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('displays error on reset failure', async () => {
    mockCreate.mockResolvedValue({});
    mockAttemptFirstFactor.mockRejectedValue({
      errors: [{ longMessage: 'Invalid code' }],
    });

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com',
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      screen.getByTestId('reset-code');
    });

    fireEvent.changeText(screen.getByTestId('reset-code'), '000000');
    fireEvent.changeText(
      screen.getByTestId('reset-new-password'),
      'newPass123',
    );
    fireEvent.press(screen.getByTestId('reset-password-button'));

    await waitFor(() => {
      screen.getByText('Invalid code');
    });
  });
});
