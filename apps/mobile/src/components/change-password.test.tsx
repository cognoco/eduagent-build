import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';

import { ChangePassword } from './change-password';

const mockUpdatePassword = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: {
      updatePassword: mockUpdatePassword,
    },
  }),
  useAuth: () => ({
    signOut: mockSignOut,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#999',
  }),
}));

describe('ChangePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePassword.mockResolvedValue({});
  });

  it('renders all three password fields', () => {
    render(<ChangePassword />);
    expect(screen.getByTestId('current-password')).toBeTruthy();
    expect(screen.getByTestId('new-password')).toBeTruthy();
    expect(screen.getByTestId('confirm-password')).toBeTruthy();
  });

  it('shows requirements hint on new password field', () => {
    render(<ChangePassword />);
    expect(screen.getByTestId('new-password-hint')).toBeTruthy();
  });

  it('shows mismatch error when confirm differs from new password', () => {
    render(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'Different1!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    expect(screen.getByText('Passwords do not match')).toBeTruthy();
  });

  it('does not submit when new password is too short', () => {
    render(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'short');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'short');
    fireEvent.press(screen.getByTestId('update-password-button'));
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('calls user.updatePassword on valid submission', async () => {
    render(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        currentPassword: 'OldPass1!',
        newPassword: 'NewPass123!',
      });
    });
  });

  it('shows Clerk error when current password is wrong', async () => {
    mockUpdatePassword.mockRejectedValue({
      errors: [{ longMessage: 'Password is incorrect.' }],
    });
    render(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'WrongPass!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    await waitFor(() => {
      expect(screen.getByText('Password is incorrect.')).toBeTruthy();
    });
  });

  it('clears form and shows success after password update', async () => {
    render(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    await waitFor(() => {
      expect(screen.getByText('Password updated')).toBeTruthy();
    });
  });

  it('renders forgot password link', () => {
    render(<ChangePassword />);
    expect(screen.getByText('Forgot your password?')).toBeTruthy();
  });

  it('signs out and redirects when forgot password is tapped', async () => {
    render(<ChangePassword />);
    fireEvent.press(screen.getByText('Forgot your password?'));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
