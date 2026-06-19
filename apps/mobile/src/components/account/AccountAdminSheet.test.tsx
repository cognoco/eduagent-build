import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { AccountAdminSheet } from './AccountAdminSheet';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockClerkSignOut = jest.fn();
const mockQueryClient = { clear: jest.fn() };
const mockSignOutWithCleanup = jest.fn();

let mockGates = {
  showBilling: true,
  showAccountSecurity: true,
  showExportDelete: true,
  showAddChild: true,
  showRemoveFamilyMember: true,
};
let mockProfiles = [
  { id: 'owner-1', displayName: 'Owner', isOwner: true },
  { id: 'child-1', displayName: 'Child', isOwner: false },
];
let mockActiveProfile = mockProfiles[0];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ signOut: mockClerkSignOut, userId: 'user-1' }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock(
  '../../hooks/use-navigation-contract' /* gc1-allow: component gate rendering test; navigation-contract behavior has dedicated coverage */,
  () => ({
    useNavigationContract: () => ({ gates: mockGates }),
  }),
);

jest.mock(
  '../../lib/profile' /* gc1-allow: component composition test controls active profile shape */,
  () => ({
    useProfile: () => ({
      activeProfile: mockActiveProfile,
      profiles: mockProfiles,
    }),
  }),
);

jest.mock(
  '../../lib/sign-out' /* gc1-allow: break test asserts wrapper is invoked, not its SecureStore internals */,
  () => ({
    ClerkSignOutTimeoutError: class ClerkSignOutTimeoutError extends Error {},
    signOutWithCleanup: (...args: unknown[]) => mockSignOutWithCleanup(...args),
  }),
);

jest.mock(
  '../../lib/platform-alert' /* gc1-allow: external user-alert side effect boundary */,
  () => ({
    platformAlert: jest.fn(),
  }),
);

describe('AccountAdminSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGates = {
      showBilling: true,
      showAccountSecurity: true,
      showExportDelete: true,
      showAddChild: true,
      showRemoveFamilyMember: true,
    };
    mockProfiles = [
      { id: 'owner-1', displayName: 'Owner', isOwner: true },
      { id: 'child-1', displayName: 'Child', isOwner: false },
    ];
    mockActiveProfile = mockProfiles[0];
  });

  it('shows owner-gated admin rows when the navigation contract allows them', () => {
    render(<AccountAdminSheet />);

    screen.getByTestId('account-admin-security');
    screen.getByTestId('account-admin-subscription');
    screen.getByTestId('account-admin-add-child');
    screen.getByTestId('account-admin-family-settings');
    screen.getByTestId('account-admin-privacy');
  });

  it('hides owner-gated admin rows when the navigation contract denies them', () => {
    mockGates = {
      showBilling: false,
      showAccountSecurity: false,
      showExportDelete: false,
      showAddChild: false,
      showRemoveFamilyMember: false,
    };
    mockActiveProfile = { id: 'child-1', displayName: 'Child', isOwner: false };
    mockProfiles = [mockActiveProfile];

    render(<AccountAdminSheet />);

    expect(screen.queryByTestId('account-admin-security')).toBeNull();
    expect(screen.queryByTestId('account-admin-subscription')).toBeNull();
    expect(screen.queryByTestId('account-admin-add-child')).toBeNull();
    expect(screen.queryByTestId('account-admin-family-settings')).toBeNull();
    screen.getByTestId('account-admin-privacy');
  });

  it('routes account rows to existing admin screens', () => {
    render(<AccountAdminSheet />);

    fireEvent.press(screen.getByTestId('account-admin-subscription'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');

    fireEvent.press(screen.getByTestId('account-admin-privacy'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/privacy');
  });

  it('uses signOutWithCleanup for sign out', async () => {
    mockSignOutWithCleanup.mockResolvedValue(undefined);

    render(<AccountAdminSheet />);
    fireEvent.press(screen.getByTestId('account-admin-sign-out'));

    await waitFor(() =>
      expect(mockSignOutWithCleanup).toHaveBeenCalledTimes(1),
    );
    expect(mockSignOutWithCleanup).toHaveBeenCalledWith({
      clerkSignOut: mockClerkSignOut,
      queryClient: mockQueryClient,
      profileIds: ['owner-1', 'child-1'],
      clerkUserId: 'user-1',
    });
    expect(mockClerkSignOut).not.toHaveBeenCalled();
  });
});
