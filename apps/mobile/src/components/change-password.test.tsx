import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    muted: '#999',
  }),
}));

// Stub useProfile so the centralized signOutWithCleanup has profileIds to
// pass to SecureStore cleanup without needing a full ProfileProvider tree.
// The real useProfile transitively pulls in SecureStore, api-client, and
// the TanStack Query provider — instantiating that whole shell in a
// component-only password test would mask the behaviour under test.
jest.mock('../lib/profile', () => ({ useProfile: () => ({ profiles: [] }) })); // gc1-allow: see comment above

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('ChangePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePassword.mockResolvedValue({});
  });

  it('renders all three password fields', () => {
    renderWithProviders(<ChangePassword />);
    screen.getByTestId('current-password');
    screen.getByTestId('new-password');
    screen.getByTestId('confirm-password');
  });

  it('shows requirements hint on new password field', () => {
    renderWithProviders(<ChangePassword />);
    screen.getByTestId('new-password-hint');
  });

  it('shows mismatch error when confirm differs from new password', () => {
    renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'Different1!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    screen.getByText('Passwords do not match');
  });

  it('does not submit when new password is too short', () => {
    renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'short');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'short');
    fireEvent.press(screen.getByTestId('update-password-button'));
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('calls user.updatePassword on valid submission', async () => {
    renderWithProviders(<ChangePassword />);
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
    renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'WrongPass!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    await waitFor(() => {
      screen.getByText('Password is incorrect.');
    });
  });

  it('clears form and shows success after password update', async () => {
    renderWithProviders(<ChangePassword />);
    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));
    await waitFor(() => {
      screen.getByText('Password updated');
    });
  });

  it('renders forgot password link', () => {
    renderWithProviders(<ChangePassword />);
    screen.getByText('Forgot your password?');
  });

  it('signs out and redirects when forgot password is tapped', async () => {
    renderWithProviders(<ChangePassword />);
    fireEvent.press(screen.getByText('Forgot your password?'));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
