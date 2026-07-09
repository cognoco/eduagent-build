import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { cleanupScreen, renderScreen } from '../test-utils/screen-render';
import { AddPassword } from './add-password';

const mockUpdatePassword = jest.fn();
const mockReload = jest.fn();
const mockOnPasswordAdded = jest.fn();

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ getToken: jest.fn(), signOut: jest.fn() }),
  useUser: () => ({
    user: {
      externalAccounts: [{ provider: 'google' }],
      reload: mockReload,
      updatePassword: mockUpdatePassword,
    },
  }),
  // [CRITICAL-2b] Passthrough: the wrapped updatePassword runs directly.
  useReverification: (fn: (...args: unknown[]) => unknown) => fn,
}));

describe('AddPassword', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePassword.mockResolvedValue({});
    mockReload.mockResolvedValue({});
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('shows provider context for SSO users', () => {
    active = renderScreen(
      <AddPassword onPasswordAdded={mockOnPasswordAdded} />,
    );

    screen.getByText(/Google/);
  });

  it('shows mismatch error when confirmation differs', () => {
    active = renderScreen(
      <AddPassword onPasswordAdded={mockOnPasswordAdded} />,
    );

    fireEvent.changeText(screen.getByTestId('add-password-new'), 'NewPass123!');
    fireEvent.changeText(
      screen.getByTestId('add-password-confirm'),
      'Different1!',
    );
    fireEvent.press(screen.getByTestId('add-password-submit'));

    expect(mockUpdatePassword).not.toHaveBeenCalled();
    screen.getByText('Passwords do not match');
  });

  it('does not submit a weak password', () => {
    active = renderScreen(
      <AddPassword onPasswordAdded={mockOnPasswordAdded} />,
    );

    fireEvent.changeText(screen.getByTestId('add-password-new'), 'short');
    fireEvent.changeText(screen.getByTestId('add-password-confirm'), 'short');
    fireEvent.press(screen.getByTestId('add-password-submit'));

    expect(mockUpdatePassword).not.toHaveBeenCalled();
    screen.getByText('Password must be at least 8 characters');
  });

  it('[auth-3] sets a first password without sending currentPassword', async () => {
    active = renderScreen(
      <AddPassword onPasswordAdded={mockOnPasswordAdded} />,
    );

    fireEvent.changeText(screen.getByTestId('add-password-new'), 'NewPass123!');
    fireEvent.changeText(
      screen.getByTestId('add-password-confirm'),
      'NewPass123!',
    );
    fireEvent.press(screen.getByTestId('add-password-submit'));

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        newPassword: 'NewPass123!',
      });
      expect(mockUpdatePassword).not.toHaveBeenCalledWith(
        expect.objectContaining({ currentPassword: expect.anything() }),
      );
      expect(mockReload).toHaveBeenCalled();
      expect(mockOnPasswordAdded).toHaveBeenCalled();
    });
  });

  it('shows Clerk rejection without marking success', async () => {
    mockUpdatePassword.mockRejectedValue({
      errors: [{ longMessage: 'Password is too weak.' }],
    });
    active = renderScreen(
      <AddPassword onPasswordAdded={mockOnPasswordAdded} />,
    );

    fireEvent.changeText(screen.getByTestId('add-password-new'), 'NewPass123!');
    fireEvent.changeText(
      screen.getByTestId('add-password-confirm'),
      'NewPass123!',
    );
    fireEvent.press(screen.getByTestId('add-password-submit'));

    await waitFor(() => {
      screen.getByText('Password is too weak.');
      expect(mockOnPasswordAdded).not.toHaveBeenCalled();
    });
  });
});
