import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { AccountAdminSheet } from './AccountAdminSheet';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRedirect = jest.fn();
const mockClerkSignOut = jest.fn();
const mockQueryClient = { clear: jest.fn() };
const mockSignOutWithCleanup = jest.fn();

let mockGates = {
  sessionIsOwner: true,
  showBilling: true,
  showAccountSecurity: true,
  showExportDelete: true,
  showAddChild: true,
  showRemoveFamilyMember: true,
};
let mockProfiles = [
  { id: 'owner-1', displayName: 'Owner', isOwner: true },
  { id: 'child-1', displayName: 'Mia', isOwner: false },
  { id: 'child-2', displayName: 'Noah', isOwner: false },
];
let mockActiveProfile = mockProfiles[0];
let mockActiveScope = {
  kind: 'me',
} as
  | { kind: 'me' | 'supporter-hub' }
  | {
      kind: 'person';
      personId: string;
      edgeId: string;
      displayName: string;
    };
let mockAvailableScopes = [
  { kind: 'supporter-hub' as const },
  {
    kind: 'person' as const,
    personId: 'child-1',
    edgeId: 'edge-1',
    displayName: 'Mia',
  },
  {
    kind: 'person' as const,
    personId: 'child-2',
    edgeId: 'edge-2',
    displayName: 'Noah',
  },
  { kind: 'me' as const },
];
let mockScopeLoading = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));

jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ signOut: mockClerkSignOut, userId: 'user-1' }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('../../hooks/use-navigation-contract', () => ({
  ...jest.requireActual('../../hooks/use-navigation-contract'),
  useNavigationContract: () => ({ gates: mockGates }),
}));

jest.mock('../../lib/profile', () => ({
  ...jest.requireActual('../../lib/profile'),
  useProfile: () => ({
    activeProfile: mockActiveProfile,
    profiles: mockProfiles,
  }),
}));

jest.mock('../../lib/scope-context', () => ({
  ...jest.requireActual('../../lib/scope-context'),
  useScopeContext: () => ({
    activeScope: mockActiveScope,
    availableScopes: mockAvailableScopes,
    isLoading: mockScopeLoading,
  }),
}));

jest.mock('../../lib/sign-out', () => ({
  ...jest.requireActual('../../lib/sign-out'),
  signOutWithCleanup: (...args: unknown[]) => mockSignOutWithCleanup(...args),
}));

jest.mock('../../lib/platform-alert', () => ({
  ...jest.requireActual('../../lib/platform-alert'),
  platformAlert: jest.fn(),
}));

describe('AccountAdminSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGates = {
      sessionIsOwner: true,
      showBilling: true,
      showAccountSecurity: true,
      showExportDelete: true,
      showAddChild: true,
      showRemoveFamilyMember: true,
    };
    mockProfiles = [
      { id: 'owner-1', displayName: 'Owner', isOwner: true },
      { id: 'child-1', displayName: 'Mia', isOwner: false },
      { id: 'child-2', displayName: 'Noah', isOwner: false },
    ];
    mockActiveProfile = mockProfiles[0];
    mockActiveScope = { kind: 'me' };
    mockScopeLoading = false;
    mockAvailableScopes = [
      { kind: 'supporter-hub' },
      {
        kind: 'person',
        personId: 'child-1',
        edgeId: 'edge-1',
        displayName: 'Mia',
      },
      {
        kind: 'person',
        personId: 'child-2',
        edgeId: 'edge-2',
        displayName: 'Noah',
      },
      { kind: 'me' },
    ];
  });

  it('shows owner-gated admin rows when the navigation contract allows them', () => {
    render(<AccountAdminSheet />);

    screen.getByTestId('account-admin-learning-preferences');
    screen.getByTestId('account-admin-mentor-memory');
    screen.getByTestId('account-admin-mentor-language');
    screen.getByTestId('account-admin-profile');
    screen.getByTestId('account-admin-security');
    screen.getByTestId('account-admin-subscription');
    screen.getByTestId('account-admin-notifications');
    screen.getByTestId('account-admin-add-child');
    screen.getByTestId('account-admin-family-settings');
    screen.getByTestId('account-admin-privacy');
    screen.getByTestId('account-admin-help');
    screen.getByTestId('account-admin-sign-out');
  });

  it('fails closed for non-owner and proxy sessions reached by direct link', () => {
    mockGates = {
      sessionIsOwner: false,
      showBilling: false,
      showAccountSecurity: false,
      showExportDelete: false,
      showAddChild: false,
      showRemoveFamilyMember: false,
    };
    mockActiveProfile = { id: 'child-1', displayName: 'Child', isOwner: false };
    mockProfiles = [mockActiveProfile];

    render(<AccountAdminSheet />);

    expect(mockRedirect).toHaveBeenCalledWith('/(app)/home');
    expect(screen.queryByTestId('account-admin-sheet')).toBeNull();
  });

  it('hides learner mutations when a stale person scope is not in the live authorized scope list', () => {
    mockActiveScope = {
      kind: 'person',
      personId: 'stale-child',
      edgeId: 'stale-edge',
      displayName: 'Stale learner',
    };

    render(<AccountAdminSheet />);

    expect(
      screen.queryByTestId('account-admin-learning-preferences'),
    ).toBeNull();
    expect(screen.queryByTestId('account-admin-mentor-memory')).toBeNull();
    expect(screen.queryByTestId('account-admin-mentor-language')).toBeNull();
    expect(
      screen.getByTestId('account-admin-notifications').props
        .accessibilityLabel,
    ).toContain('Owner');
  });

  it('keeps learner mutations unavailable until the persisted scope has loaded', () => {
    mockScopeLoading = true;

    render(<AccountAdminSheet />);

    expect(
      screen.queryByTestId('account-admin-learning-preferences'),
    ).toBeNull();
    expect(screen.queryByTestId('account-admin-mentor-memory')).toBeNull();
    expect(screen.queryByTestId('account-admin-mentor-language')).toBeNull();
    expect(
      screen.getByTestId('account-admin-notifications').props
        .accessibilityLabel,
    ).toContain('Owner');
  });

  it('keeps owner-global rows on Owner while learner rows follow the exact authorized V2 person scope', () => {
    mockActiveScope = {
      kind: 'person',
      personId: 'child-1',
      edgeId: 'edge-1',
      displayName: 'Mia',
    };

    const view = render(<AccountAdminSheet />);

    expect(
      screen.getByTestId('account-admin-notifications').props
        .accessibilityLabel,
    ).toContain('Owner');
    expect(
      screen.getByTestId('account-admin-learning-preferences').props
        .accessibilityLabel,
    ).toContain('Mia');

    fireEvent.press(screen.getByTestId('account-admin-learning-preferences'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/more/accommodation?childProfileId=child-1',
    );
    fireEvent.press(screen.getByTestId('account-admin-mentor-memory'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/child/[profileId]/mentor-memory',
      params: { profileId: 'child-1' },
    });
    fireEvent.press(screen.getByTestId('account-admin-mentor-language'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/more/mentor-language?childProfileId=child-1',
    );
    expect(screen.getAllByText('Mentor language')).toHaveLength(1);

    mockActiveScope = {
      kind: 'person',
      personId: 'child-2',
      edgeId: 'edge-2',
      displayName: 'Noah',
    };
    view.rerender(<AccountAdminSheet />);
    expect(
      screen.getByTestId('account-admin-mentor-language').props
        .accessibilityLabel,
    ).toContain('Noah');
    fireEvent.press(screen.getByTestId('account-admin-mentor-language'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/more/mentor-language?childProfileId=child-2',
    );
  });

  it('routes account rows to existing admin screens', () => {
    render(<AccountAdminSheet />);

    fireEvent.press(screen.getByTestId('account-admin-learning-preferences'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/accommodation');

    fireEvent.press(screen.getByTestId('account-admin-mentor-memory'));
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/mentor-memory?returnTo=account',
    );

    fireEvent.press(screen.getByTestId('account-admin-mentor-language'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/mentor-language');

    fireEvent.press(screen.getByTestId('account-admin-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profiles');

    fireEvent.press(screen.getByTestId('account-admin-security'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/account');

    fireEvent.press(screen.getByTestId('account-admin-subscription'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');

    fireEvent.press(screen.getByTestId('account-admin-notifications'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/notifications');

    fireEvent.press(screen.getByTestId('account-admin-add-child'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });

    fireEvent.press(screen.getByTestId('account-admin-family-settings'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more');

    fireEvent.press(screen.getByTestId('account-admin-privacy'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/privacy');

    fireEvent.press(screen.getByTestId('account-admin-help'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/help');
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
      profileIds: ['owner-1', 'child-1', 'child-2'],
      clerkUserId: 'user-1',
    });
    expect(mockClerkSignOut).not.toHaveBeenCalled();
  });
});
