import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { AccountSecurity } from './account-security';

let mockUser: Record<string, unknown> = {};

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: mockUser }),
  useAuth: () => ({ signOut: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

// ChangePassword (rendered when the row is expanded) calls useQueryClient()
// and useProfile() — both need providers. Pattern mirrors change-password.test.tsx.
jest.mock('../lib/profile', () => ({ useProfile: () => ({ profiles: [] }) })); // gc1-allow: external boundary stub for QueryClient-dependent child component

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('AccountSecurity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      passwordEnabled: true,
      externalAccounts: [],
    };
  });

  it('renders Change Password row for password users', () => {
    renderWithProviders(<AccountSecurity visible />);
    screen.getByText('Change Password');
  });

  it('shows SSO message when passwordEnabled is false', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'google' }],
    };
    renderWithProviders(<AccountSecurity visible />);
    screen.getByText(/Secured via Google/);
    expect(screen.queryByText('Change Password')).toBeNull();
  });

  it('shows Apple in SSO message when provider is apple', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'apple' }],
    };
    renderWithProviders(<AccountSecurity visible />);
    screen.getByText(/Secured via Apple/);
  });

  it('expands password form when Change Password is tapped', () => {
    renderWithProviders(<AccountSecurity visible />);
    fireEvent.press(screen.getByText('Change Password'));
    screen.getByTestId('current-password');
  });

  it('does not render when visible is false', () => {
    const { toJSON } = renderWithProviders(<AccountSecurity visible={false} />);
    expect(toJSON()).toBeNull();
  });
});
