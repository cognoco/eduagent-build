import { screen, fireEvent } from '@testing-library/react-native';
import React from 'react';

import { renderScreen, cleanupScreen } from '../test-utils/screen-render';
import { AccountSecurity } from './account-security';

let mockUser: Record<string, unknown> = {};
const mockPush = jest.fn();

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: mockUser }),
  useAuth: () => ({ getToken: jest.fn(), signOut: jest.fn() }),
  // [CRITICAL-2b] Passthrough: wrapped Clerk calls run directly in tests.
  useReverification: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

// prettier-ignore
jest.mock('../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({ accent: '#0ea5e9', background: '#18181b', border: '#d4d4d8', muted: '#71717a', surface: '#ffffff', textInverse: '#ffffff', textPrimary: '#18181b', textSecondary: '#52525b' }),
  useTheme: () => ({ colorScheme: 'dark' }),
  useTokenVars: () => ({}),
}));

function renderWithProviders(ui: React.ReactElement) {
  return renderScreen(ui);
}

describe('AccountSecurity', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      passwordEnabled: true,
      externalAccounts: [],
    };
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('renders Change Password row for password users', () => {
    active = renderWithProviders(<AccountSecurity visible />);
    screen.getByText('Change Password');
  });

  it('renders email and device rows for password users', () => {
    active = renderWithProviders(<AccountSecurity visible />);

    screen.getByTestId('change-email-row');
    screen.getByTestId('manage-devices-row');
  });

  it('visibly and accessibly names the owner on every security mutation', () => {
    active = renderWithProviders(
      <AccountSecurity visible targetName="Owner" />,
    );

    expect(screen.getAllByText('Owner')).toHaveLength(3);
    expect(
      screen.getByTestId('change-password-row').props.accessibilityLabel,
    ).toBe('Change Password. Owner');
    expect(
      screen.getByTestId('change-email-row').props.accessibilityLabel,
    ).toBe('Change email. Owner');
    expect(
      screen.getByTestId('manage-devices-row').props.accessibilityLabel,
    ).toBe('Manage devices. Owner');
  });

  it('[auth-3] shows Add password row for SSO users instead of only a provider note', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'google' }],
    };
    active = renderWithProviders(<AccountSecurity visible />);

    screen.getByText(/Signed in with Google/);
    screen.getByTestId('add-password-row');
    expect(screen.queryByText('Change Password')).toBeNull();
  });

  it('shows Apple in SSO message when provider is apple', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'apple' }],
    };
    active = renderWithProviders(<AccountSecurity visible />);
    screen.getByText(/Secured via Apple/);
  });

  it('expands password form when Change Password is tapped', () => {
    active = renderWithProviders(<AccountSecurity visible />);
    fireEvent.press(screen.getByText('Change Password'));
    screen.getByTestId('current-password');
  });

  it('expands email form when Change email is tapped', () => {
    active = renderWithProviders(<AccountSecurity visible />);
    fireEvent.press(screen.getByTestId('change-email-row'));
    screen.getByTestId('change-email-input');
  });

  it('navigates to device sessions when Manage devices is tapped', () => {
    active = renderWithProviders(<AccountSecurity visible />);
    fireEvent.press(screen.getByTestId('manage-devices-row'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/security-sessions');
  });

  it('does not render when visible is false', () => {
    active = renderWithProviders(<AccountSecurity visible={false} />);
    expect(active.result.toJSON()).toBeNull();
  });
});
