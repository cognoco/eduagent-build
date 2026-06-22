import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import { renderScreen, cleanupScreen } from '../test-utils/screen-render';
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

function renderWithProviders(ui: React.ReactElement) {
  return renderScreen(ui);
}

describe('ChangePassword', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePassword.mockResolvedValue({});
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('renders all three password fields', () => {
    active = renderWithProviders(<ChangePassword />);
    screen.getByTestId('current-password');
    screen.getByTestId('new-password');
    screen.getByTestId('confirm-password');
  });

  it('shows requirements hint on new password field', () => {
    active = renderWithProviders(<ChangePassword />);
    screen.getByTestId('new-password-hint');
  });

  it('shows mismatch error when confirm differs from new password', () => {
    active = renderWithProviders(<ChangePassword />);
    // [BUG-129] currentPassword is now required — fill it in so the test
    // exercises the mismatch path rather than failing at the new
    // empty-current-password gate.
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'Different1!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    screen.getByText('Passwords do not match');
  });

  it('clears validation error when a password field changes', () => {
    active = renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'Different1!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    screen.getByText('Passwords do not match');

    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');

    expect(screen.queryByText('Passwords do not match')).toBeNull();
  });

  it('does not submit when new password is too short', () => {
    active = renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'short');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'short');
    fireEvent.press(screen.getByTestId('update-password-button'));
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // [BUG-129 / BREAK] currentPassword must be validated client-side. Pre-fix
  // submission with an empty currentPassword would fire a Clerk API request
  // that returned a generic error — wasted round-trip and a poor signal to
  // the user. The fix blocks submission and surfaces a clear "Enter your
  // current password" message.
  // -------------------------------------------------------------------------
  it('[BREAK / BUG-129] does not call updatePassword when current password is empty', () => {
    active = renderWithProviders(<ChangePassword />);
    // Leave current-password blank — fill only new + confirm.
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    expect(mockUpdatePassword).not.toHaveBeenCalled();
    screen.getByText('Enter your current password');
  });

  it('[BREAK / BUG-129] does not call updatePassword when current password is too short', () => {
    active = renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'short');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    expect(mockUpdatePassword).not.toHaveBeenCalled();
    screen.getByText('Enter your current password');
  });

  it('calls user.updatePassword on valid submission', async () => {
    active = renderWithProviders(<ChangePassword />);
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
    active = renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'WrongPass!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    await waitFor(() => {
      screen.getByText('Password is incorrect.');
    });
  });

  it('clears form and shows success after password update', async () => {
    active = renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    await waitFor(() => {
      screen.getByText('Password updated');
    });
  });

  it('clears success message when a password field changes after update', async () => {
    active = renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    await waitFor(() => {
      screen.getByText('Password updated');
    });

    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');

    expect(screen.queryByText('Password updated')).toBeNull();
  });

  it('renders forgot password link', () => {
    active = renderWithProviders(<ChangePassword />);
    screen.getByText('Forgot your password?');
  });

  it('signs out and redirects when forgot password is tapped', async () => {
    active = renderWithProviders(<ChangePassword />);
    fireEvent.press(screen.getByText('Forgot your password?'));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
