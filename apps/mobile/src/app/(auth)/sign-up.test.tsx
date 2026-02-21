import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useSignUp, useSSO } from '@clerk/clerk-expo';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockStartSSOFlow = jest.fn();

const SignUpScreen = require('./sign-up').default;

describe('SignUpScreen', () => {
  const mockCreate = jest.fn();
  const mockPrepareVerification = jest.fn();
  const mockAttemptVerification = jest.fn();
  const mockSetActive = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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

    expect(screen.getByTestId('sign-up-google-sso')).toBeTruthy();
    expect(screen.getByTestId('sign-up-email')).toBeTruthy();
    expect(screen.getByTestId('sign-up-password')).toBeTruthy();
    expect(screen.getByTestId('sign-up-button')).toBeTruthy();
    expect(screen.getByText('or continue with email')).toBeTruthy();
  });

  it('handles Google SSO sign-up', async () => {
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: 'sess_google' });
    mockSetActive.mockResolvedValue(undefined);

    render(<SignUpScreen />);

    fireEvent.press(screen.getByTestId('sign-up-google-sso'));

    await waitFor(() => {
      expect(mockStartSSOFlow).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_google' })
      );
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_google' });
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
    });
  });

  it('transitions to verification phase after sign-up', async () => {
    mockCreate.mockResolvedValue(undefined);
    mockPrepareVerification.mockResolvedValue(undefined);

    render(<SignUpScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-up-email'),
      'new@example.com'
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
      expect(screen.getByTestId('sign-up-code')).toBeTruthy();
      expect(screen.getByTestId('sign-up-verify-button')).toBeTruthy();
    });
  });

  it('completes verification and navigates to learner home', async () => {
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
      'new@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'secure123');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    // Phase 2: verification
    await waitFor(() => {
      expect(screen.getByTestId('sign-up-code')).toBeTruthy();
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

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
    });
  });

  it('displays error on sign-up failure', async () => {
    mockCreate.mockRejectedValue({
      errors: [{ longMessage: 'Email already in use' }],
    });

    render(<SignUpScreen />);

    fireEvent.changeText(
      screen.getByTestId('sign-up-email'),
      'existing@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'password');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    await waitFor(() => {
      expect(screen.getByText('Email already in use')).toBeTruthy();
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
      'new@example.com'
    );
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'secure123');
    fireEvent.press(screen.getByTestId('sign-up-button'));

    await waitFor(() => {
      expect(screen.getByTestId('sign-up-code')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('sign-up-code'), '000000');
    fireEvent.press(screen.getByTestId('sign-up-verify-button'));

    await waitFor(() => {
      expect(screen.getByText('Incorrect code')).toBeTruthy();
    });
  });
});
