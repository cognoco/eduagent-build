import { render, screen, fireEvent } from '@testing-library/react-native';

import { AccountSecurity } from './account-security';

let mockUser: Record<string, unknown> = {};

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: mockUser }),
  useAuth: () => ({ signOut: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

describe('AccountSecurity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      passwordEnabled: true,
      externalAccounts: [],
    };
  });

  it('renders Change Password row for password users', () => {
    render(<AccountSecurity visible />);
    screen.getByText('Change Password');
  });

  it('shows SSO message when passwordEnabled is false', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'google' }],
    };
    render(<AccountSecurity visible />);
    screen.getByText(/Secured via Google/);
    expect(screen.queryByText('Change Password')).toBeNull();
  });

  it('shows Apple in SSO message when provider is apple', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'apple' }],
    };
    render(<AccountSecurity visible />);
    screen.getByText(/Secured via Apple/);
  });

  it('expands password form when Change Password is tapped', () => {
    render(<AccountSecurity visible />);
    fireEvent.press(screen.getByText('Change Password'));
    screen.getByTestId('current-password');
  });

  it('does not render when visible is false', () => {
    const { toJSON } = render(<AccountSecurity visible={false} />);
    expect(toJSON()).toBeNull();
  });
});
