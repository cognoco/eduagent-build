import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRedirect = jest.fn();
const mockCanEnter = jest.fn(() => true);
const mockClerkSignOut = jest.fn();
const mockQueryClient = { clear: jest.fn() };
const mockSignOutWithCleanup = jest.fn();
const mockPlatformAlert = jest.fn();

let mockGates = {
  sessionIsOwner: true,
  showBilling: true,
  showAccountSecurity: true,
  showExportDelete: true,
  showAddChild: true,
  showRemoveFamilyMember: true,
  showAccommodationChildEditor: true,
  showMentorLanguageChildEditor: true,
};
let mockIsParentProxy = false;
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

const navigationContractModule = jest.requireActual<
  typeof import('../../hooks/use-navigation-contract')
>('../../hooks/use-navigation-contract');
const { resolveNavigationContract } = jest.requireActual<
  typeof import('../../lib/navigation-contract')
>('../../lib/navigation-contract');
const navigationContractDefaults = resolveNavigationContract({
  activeProfile: null,
  profiles: [],
  isParentProxy: false,
  appContext: 'study',
  role: null,
  subscription: {
    status: 'ready',
    tier: null,
    effectiveAccessTier: null,
    billingAccess: null,
  },
  flags: {
    MODE_NAV_V1_ENABLED: true,
    MODE_NAV_V2_ENABLED: true,
  },
});
jest
  .spyOn(navigationContractModule, 'useNavigationContract')
  .mockImplementation(() => ({
    ...navigationContractDefaults,
    gates: { ...navigationContractDefaults.gates, ...mockGates },
    canEnter: mockCanEnter,
    isParentProxy: mockIsParentProxy,
  }));

const profileModule =
  jest.requireActual<typeof import('../../lib/profile')>('../../lib/profile');
jest.spyOn(profileModule, 'useProfile').mockImplementation(
  () =>
    ({
      activeProfile: mockActiveProfile,
      profiles: mockProfiles,
    }) as ReturnType<typeof profileModule.useProfile>,
);

const scopeContextModule = jest.requireActual<
  typeof import('../../lib/scope-context')
>('../../lib/scope-context');
jest.spyOn(scopeContextModule, 'useScopeContext').mockImplementation(
  () =>
    ({
      activeScope: mockActiveScope,
      availableScopes: mockAvailableScopes,
      isLoading: mockScopeLoading,
    }) as ReturnType<typeof scopeContextModule.useScopeContext>,
);

const signOutModule =
  jest.requireActual<typeof import('../../lib/sign-out')>('../../lib/sign-out');
jest
  .spyOn(signOutModule, 'signOutWithCleanup')
  .mockImplementation((...args) => mockSignOutWithCleanup(...args));

const platformAlertModule = jest.requireActual<
  typeof import('../../lib/platform-alert')
>('../../lib/platform-alert');
jest
  .spyOn(platformAlertModule, 'platformAlert')
  .mockImplementation((...args) => mockPlatformAlert(...args));

const { ClerkSignOutTimeoutError } = signOutModule;
const { AccountAdminSheet } = jest.requireActual<
  typeof import('./AccountAdminSheet')
>('./AccountAdminSheet');

describe('AccountAdminSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOutWithCleanup.mockReset();
    mockPlatformAlert.mockReset();
    mockCanEnter.mockReturnValue(true);
    mockIsParentProxy = false;
    mockGates = {
      sessionIsOwner: true,
      showBilling: true,
      showAccountSecurity: true,
      showExportDelete: true,
      showAddChild: true,
      showRemoveFamilyMember: true,
      showAccommodationChildEditor: true,
      showMentorLanguageChildEditor: true,
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

  it('keeps every owner-only row absent for a non-owner even when adjacent feature gates are stale true', () => {
    mockGates = {
      ...mockGates,
      sessionIsOwner: false,
    };
    mockActiveProfile = { id: 'child-1', displayName: 'Child', isOwner: false };
    mockProfiles = [mockActiveProfile];

    render(<AccountAdminSheet />);

    screen.getByTestId('account-admin-sheet');
    screen.getByTestId('account-admin-learning-preferences');
    screen.getByTestId('account-admin-mentor-memory');
    screen.getByTestId('account-admin-mentor-language');
    screen.getByTestId('account-admin-profile');
    screen.getByTestId('account-admin-notifications');
    screen.getByTestId('account-admin-privacy');
    screen.getByTestId('account-admin-help');
    screen.getByTestId('account-admin-sign-out');
    expect(screen.queryByTestId('account-admin-security')).toBeNull();
    expect(screen.queryByTestId('account-admin-subscription')).toBeNull();
    expect(screen.queryByTestId('account-admin-add-child')).toBeNull();
    expect(screen.queryByTestId('account-admin-family-settings')).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('fails closed when a parent-proxy session reaches Account by direct route', () => {
    mockIsParentProxy = true;

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

  it('hides learner rows for a live external supportership person that is not an editable managed child', () => {
    mockCanEnter.mockReturnValue(false);
    mockActiveScope = {
      kind: 'person',
      personId: 'external-supportee',
      edgeId: 'external-edge',
      displayName: 'External learner',
    };
    mockAvailableScopes = [
      ...mockAvailableScopes,
      {
        kind: 'person',
        personId: 'external-supportee',
        edgeId: 'external-edge',
        displayName: 'External learner',
      },
    ];

    render(<AccountAdminSheet />);

    expect(
      screen.queryByTestId('account-admin-learning-preferences'),
    ).toBeNull();
    expect(screen.queryByTestId('account-admin-mentor-memory')).toBeNull();
    expect(screen.queryByTestId('account-admin-mentor-language')).toBeNull();
    expect(mockCanEnter).toHaveBeenCalledWith('child/[profileId]', {
      profileId: 'external-supportee',
    });
    expect(
      screen.getByTestId('account-admin-notifications').props
        .accessibilityLabel,
    ).toContain('Owner');
  });

  it('hides learner rows when a managed-child person scope lacks the route editor gate', () => {
    mockCanEnter.mockReturnValue(false);
    mockActiveScope = {
      kind: 'person',
      personId: 'child-1',
      edgeId: 'edge-1',
      displayName: 'Mia',
    };
    mockGates = {
      ...mockGates,
      showAccommodationChildEditor: false,
      showMentorLanguageChildEditor: false,
    };

    render(<AccountAdminSheet />);

    expect(
      screen.queryByTestId('account-admin-learning-preferences'),
    ).toBeNull();
    expect(screen.queryByTestId('account-admin-mentor-memory')).toBeNull();
    expect(screen.queryByTestId('account-admin-mentor-language')).toBeNull();
    expect(mockCanEnter).toHaveBeenCalledWith('child/[profileId]', {
      profileId: 'child-1',
    });
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

  it('forces the sign-in boundary when the cleanup call reports a Clerk timeout', async () => {
    mockSignOutWithCleanup.mockRejectedValue(
      new ClerkSignOutTimeoutError(8_000),
    );

    render(<AccountAdminSheet />);
    fireEvent.press(screen.getByTestId('account-admin-sign-out'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/sign-in'));
    expect(mockPlatformAlert).not.toHaveBeenCalled();
  });

  it('re-enables sign out after a generic error so the user can retry', async () => {
    mockSignOutWithCleanup
      .mockRejectedValueOnce(new Error('temporary Clerk failure'))
      .mockResolvedValueOnce(undefined);

    render(<AccountAdminSheet />);
    fireEvent.press(screen.getByTestId('account-admin-sign-out'));

    await waitFor(() =>
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Could not sign out',
        'Please try again in a moment.',
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('account-admin-sign-out').props.accessibilityState
          .disabled,
      ).toBe(false),
    );

    fireEvent.press(screen.getByTestId('account-admin-sign-out'));
    await waitFor(() =>
      expect(mockSignOutWithCleanup).toHaveBeenCalledTimes(2),
    );
  });
});
