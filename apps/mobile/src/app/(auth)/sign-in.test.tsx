import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const SignInScreen = require('./sign-in').default;

describe('SignInScreen', () => {
  const mockCreate = jest.fn();
  const mockPrepareFirstFactor = jest.fn();
  const mockPrepareSecondFactor = jest.fn();
  const mockAttemptFirstFactor = jest.fn();
  const mockAttemptSecondFactor = jest.fn();
  const mockSetActive = jest.fn();
  const mockStartSSOFlow = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders email and password inputs', () => {
    render(<SignInScreen />);

    expect(screen.getByTestId('sign-in-email')).toBeTruthy();
    expect(screen.getByTestId('sign-in-password')).toBeTruthy();
    expect(screen.getByTestId('sign-in-button')).toBeTruthy();
  });

  it('renders OAuth buttons', () => {
    render(<SignInScreen />);

    expect(screen.getByTestId('google-sso-button')).toBeTruthy();
    expect(screen.getByTestId('apple-sso-button')).toBeTruthy();
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.getByText('Continue with Apple')).toBeTruthy();
  });

  it('renders forgot password link', () => {
    render(<SignInScreen />);

    expect(screen.getByTestId('forgot-password-link')).toBeTruthy();
    expect(screen.getByText('Forgot password?')).toBeTruthy();
  });

  it('disables sign-in button when fields are empty', () => {
    render(<SignInScreen />);

    const button = screen.getByTestId('sign-in-button');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('calls signIn.create on submit and navigates on success', async () => {
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

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
    });
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
      expect(screen.getByText('Invalid credentials')).toBeTruthy();
    });
  });

  it('starts email verification when Clerk requests it as the next step', async () => {
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

    await waitFor(() => {
      expect(mockPrepareFirstFactor).toHaveBeenCalledWith({
        strategy: 'email_code',
        emailAddressId: 'email_123',
      });
    });

    expect(screen.getByTestId('sign-in-verify-code')).toBeTruthy();
    expect(screen.getByText('Enter verification code')).toBeTruthy();
  });

  it('continues sign-in with an emailed second-factor code', async () => {
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

    await waitFor(() => {
      expect(mockPrepareSecondFactor).toHaveBeenCalledWith({
        strategy: 'email_code',
        emailAddressId: 'email_456',
      });
    });

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

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
    });
  });

  it('shows a generic unsupported verification message for non-email MFA methods', async () => {
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

    await waitFor(() => {
      expect(
        screen.getByText(
          'Your account needs an additional verification step that this build could not start automatically. Please try again or use a different sign-in method.'
        )
      ).toBeTruthy();
    });
  });

  it('calls startSSOFlow for Google and navigates on success', async () => {
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

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
    });
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
    mockStartSSOFlow.mockRejectedValue({
      errors: [{ longMessage: 'OAuth provider error' }],
    });

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('google-sso-button'));

    await waitFor(() => {
      expect(screen.getByText('OAuth provider error')).toBeTruthy();
    });
  });
});
