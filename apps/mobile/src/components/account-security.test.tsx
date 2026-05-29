import { screen, fireEvent } from '@testing-library/react-native';
import React from 'react';

import { renderScreen, cleanupScreen } from '../test-utils/screen-render';
import { AccountSecurity } from './account-security';

let mockUser: Record<string, unknown> = {};

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: mockUser }),
  useAuth: () => ({ signOut: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
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

  it('shows SSO message when passwordEnabled is false', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'google' }],
    };
    active = renderWithProviders(<AccountSecurity visible />);
    screen.getByText(/Secured via Google/);
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

  it('does not render when visible is false', () => {
    active = renderWithProviders(<AccountSecurity visible={false} />);
    expect(active.result.toJSON()).toBeNull();
  });
});
