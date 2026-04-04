import { render, screen, fireEvent } from '@testing-library/react-native';

import { AccountSecurity } from './account-security';

let mockUser: Record<string, unknown> = {};
const mockSignOut = jest.fn();
const mockReplace = jest.fn();
let mockActiveProfile: Record<string, unknown> = {
  id: 'profile-1',
  isOwner: true,
};

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: mockUser }),
  useAuth: () => ({ signOut: mockSignOut }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#999',
  }),
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
      twoFactorEnabled: false,
      externalAccounts: [],
      primaryEmailAddress: {
        emailAddress: 'test@example.com',
        id: 'email_1',
        prepareVerification: jest.fn(),
        attemptVerification: jest.fn(),
      },
      disableTOTP: jest.fn().mockResolvedValue({}),
    };
  });

  it('renders Account Security section header', () => {
    render(<AccountSecurity />);
    expect(screen.getByText('Account Security')).toBeTruthy();
  });

  it('renders email verification toggle for password users', () => {
    render(<AccountSecurity />);
    expect(screen.getByText('Email Verification')).toBeTruthy();
  });

  it('renders Change Password row for password users', () => {
    render(<AccountSecurity />);
    expect(screen.getByText('Change Password')).toBeTruthy();
  });

  it('shows SSO message when passwordEnabled is false', () => {
    mockUser = {
      passwordEnabled: false,
      twoFactorEnabled: false,
      externalAccounts: [{ provider: 'google' }],
    };
    render(<AccountSecurity />);
    expect(screen.getByText(/secured via Google/i)).toBeTruthy();
    expect(screen.queryByText('Email Verification')).toBeNull();
    expect(screen.queryByText('Change Password')).toBeNull();
  });

  it('shows Apple in SSO message when provider is apple', () => {
    mockUser = {
      passwordEnabled: false,
      twoFactorEnabled: false,
      externalAccounts: [{ provider: 'apple' }],
    };
    render(<AccountSecurity />);
    expect(screen.getByText(/secured via Apple/i)).toBeTruthy();
  });

  it('shows toggle ON when twoFactorEnabled is true', () => {
    mockUser = { ...mockUser, twoFactorEnabled: true };
    render(<AccountSecurity />);
    const toggle = screen.getByTestId('email-2fa-toggle');
    expect(toggle.props.value).toBe(true);
  });

  it('shows toggle OFF when twoFactorEnabled is false', () => {
    render(<AccountSecurity />);
    const toggle = screen.getByTestId('email-2fa-toggle');
    expect(toggle.props.value).toBe(false);
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
