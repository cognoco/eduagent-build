import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useSignIn } from '@clerk/clerk-expo';

const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
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

    expect(screen.getByTestId('forgot-password-email')).toBeTruthy();
    expect(screen.getByTestId('send-reset-code-button')).toBeTruthy();
    expect(screen.getByText('Forgot password?')).toBeTruthy();
  });

  it('renders back to sign in link', () => {
    render(<ForgotPasswordScreen />);

    expect(screen.getByTestId('back-to-sign-in')).toBeTruthy();
  });

  it('calls signIn.create with reset_password_email_code strategy', async () => {
    mockCreate.mockResolvedValue({});

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com'
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
      'test@example.com'
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      expect(screen.getByTestId('reset-code')).toBeTruthy();
      expect(screen.getByTestId('reset-new-password')).toBeTruthy();
      expect(screen.getByTestId('reset-password-button')).toBeTruthy();
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
      'test@example.com'
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      expect(screen.getByTestId('reset-code')).toBeTruthy();
    });

    // Phase 2: reset password
    fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    fireEvent.changeText(
      screen.getByTestId('reset-new-password'),
      'newPassword123'
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

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
    });
  });

  it('displays error on send code failure', async () => {
    mockCreate.mockRejectedValue({
      errors: [{ longMessage: 'User not found' }],
    });

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'nobody@example.com'
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeTruthy();
    });
  });

  it('displays error on reset failure', async () => {
    mockCreate.mockResolvedValue({});
    mockAttemptFirstFactor.mockRejectedValue({
      errors: [{ longMessage: 'Invalid code' }],
    });

    render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email'),
      'test@example.com'
    );
    fireEvent.press(screen.getByTestId('send-reset-code-button'));

    await waitFor(() => {
      expect(screen.getByTestId('reset-code')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('reset-code'), '000000');
    fireEvent.changeText(
      screen.getByTestId('reset-new-password'),
      'newPass123'
    );
    fireEvent.press(screen.getByTestId('reset-password-button'));

    await waitFor(() => {
      expect(screen.getByText('Invalid code')).toBeTruthy();
    });
  });
});
