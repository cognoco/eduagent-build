import { render, screen, fireEvent } from '@testing-library/react-native';

import { AccountSecurity } from './account-security';

let mockUser: Record<string, unknown> = {};
let mockActiveProfile: Record<string, unknown> = {
  id: 'profile-1',
  isOwner: true,
};

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: mockUser }),
  useAuth: () => ({ signOut: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: mockActiveProfile,
  }),
}));

describe('AccountSecurity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveProfile = { id: 'profile-1', isOwner: true };
    mockUser = {
      passwordEnabled: true,
      externalAccounts: [],
    };
  });

  it('renders Account Security section header', () => {
    render(<AccountSecurity />);
    expect(screen.getByText('Account Security')).toBeTruthy();
  });

  it('renders Change Password row for password users', () => {
    render(<AccountSecurity />);
    expect(screen.getByText('Change Password')).toBeTruthy();
  });

  it('shows SSO message when passwordEnabled is false', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'google' }],
    };
    render(<AccountSecurity />);
    expect(screen.getByText(/secured via Google/i)).toBeTruthy();
    expect(screen.queryByText('Change Password')).toBeNull();
  });

  it('shows Apple in SSO message when provider is apple', () => {
    mockUser = {
      passwordEnabled: false,
      externalAccounts: [{ provider: 'apple' }],
    };
    render(<AccountSecurity />);
    expect(screen.getByText(/secured via Apple/i)).toBeTruthy();
  });

  it('expands password form when Change Password is tapped', () => {
    render(<AccountSecurity />);
    fireEvent.press(screen.getByText('Change Password'));
    expect(screen.getByTestId('current-password')).toBeTruthy();
  });

  it('does not render when activeProfile is not owner', () => {
    mockActiveProfile = { id: 'profile-child', isOwner: false };
    const { toJSON } = render(<AccountSecurity />);
    expect(toJSON()).toBeNull();
  });
});
