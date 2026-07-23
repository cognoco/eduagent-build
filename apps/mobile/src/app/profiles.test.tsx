import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import type { Profile } from '../lib/profile';
import { useAuth, useReverification } from '@clerk/expo';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
const mockDismiss = jest.fn();
const mockCanDismiss = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
    dismiss: mockDismiss,
    canDismiss: mockCanDismiss,
  }),
  // [BUG-375] Redirect stub so auth-gate tests can assert the redirect path.
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>redirect:{href}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-i18next', () => require('../test-utils/mock-i18n').i18nMock);

const mockSwitchProfile = jest.fn().mockResolvedValue(undefined);

const ownerProfile: Profile = {
  id: 'owner-id',
  accountId: 'a1',
  displayName: 'Parent',
  avatarUrl: null,
  birthYear: 1990,
  birthMonth: null,
  birthDay: null,
  location: null,
  isOwner: true,
  hasPremiumLlm: false,
  defaultAppContext: null,
  hasFamilyLinks: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  linkCreatedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const childProfile: Profile = {
  id: 'child-id',
  accountId: 'a1',
  displayName: 'Alex',
  avatarUrl: null,
  birthYear: 2012,
  birthMonth: null,
  birthDay: null,
  location: null,
  isOwner: false,
  hasPremiumLlm: false,
  defaultAppContext: null,
  hasFamilyLinks: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  linkCreatedAt: null,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

const mockUseSubscription = jest.fn().mockReturnValue({ data: null });
const mockUseFamilySubscription = jest.fn().mockReturnValue({ data: null });

jest.mock(
  '../hooks/use-subscription', // gc1-allow: hooks require QueryClient + API client infra not available in unit test
  () => ({
    useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
    useFamilySubscription: (...args: unknown[]) =>
      mockUseFamilySubscription(...args),
  }),
);

const mockSetMode = jest.fn();
jest.mock(
  '../lib/app-context', // gc1-allow: ProfilesScreen only needs the mode setter boundary for row-tap navigation assertions
  () => ({
    ...jest.requireActual('../lib/app-context'),
    useAppContext: () => ({
      mode: 'study',
      setMode: mockSetMode,
      familyCapable: true,
    }),
  }),
);

const mockMutate = jest.fn();
jest.mock(
  '../hooks/use-profiles', // gc1-allow: hook requires QueryClient + Clerk auth context not available in unit test
  () => ({
    useUpdateProfileName: () => ({
      mutate: mockMutate,
      isPending: false,
    }),
  }),
);

jest.mock(
  '../lib/format-api-error', // gc1-allow: formatApiError calls i18next.t() which requires i18n initialisation not present in this test suite
  () => ({
    formatApiError: (e: unknown) =>
      e instanceof Error ? e.message : 'Unknown error',
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../lib/platform-alert' /* gc1-allow: pattern-a conversion; Alert.alert is a React Native native UI boundary that cannot be driven in JSDOM */,
  () => ({
    ...jest.requireActual('../lib/platform-alert'),
    platformAlert: mockPlatformAlert,
  }),
);

jest.mock(
  '../lib/profile' /* gc1-allow: pattern-a conversion; useProfile depends on ProfileContext; pattern-a spy controls profile list shape per-test */,
  () => ({
    ...jest.requireActual('../lib/profile'),
    useProfile: jest.fn().mockReturnValue({
      profiles: [],
      activeProfile: null,
      switchProfile: jest.fn(),
      isLoading: false,
    }),
  }),
);

const { useProfile } = require('../lib/profile') as {
  useProfile: jest.Mock;
};

const ProfilesScreen = require('./profiles').default;
const mockUseReverification = useReverification as jest.Mock;
const originalE2EFlag = process.env.EXPO_PUBLIC_E2E;

describe('ProfilesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_E2E;
    mockCanGoBack.mockReturnValue(true);
    // [BUG-375] Default to signed-in so existing tests are unaffected by the
    // new auth guard; auth-gate break tests override below.
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseReverification.mockImplementation(
      (fn: (...args: unknown[]) => unknown) => fn,
    );
  });

  afterEach(() => {
    if (originalE2EFlag === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
    } else {
      process.env.EXPO_PUBLIC_E2E = originalE2EFlag;
    }
  });

  it('shows empty state when no profiles', () => {
    useProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    screen.getByText('No profiles yet');
    expect(
      screen.getByText('Create your first profile to get started'),
    ).toBeTruthy();
    screen.getByTestId('profiles-create-first');
  });

  it('renders profile list with active checkmark', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    screen.getByTestId('profile-row-owner-id');
    screen.getByTestId('profile-row-child-id');
    screen.getByText('Alex');
    screen.getByTestId('profile-active-check');
  });

  it('opens a child row in the parent-native child settings view [BUG-774]', () => {
    // [BUG-774] /profiles is a fullScreenModal; replacing in place left the
    // child-settings screen un-mounted. We now dismiss the modal (via
    // router.dismiss — the documented Expo Router modal-dismiss API
    // required by screen-navigation.test.ts ratchet) then push the
    // child-settings target.
    mockCanDismiss.mockReturnValue(true);
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-child-id'));

    expect(mockSwitchProfile).not.toHaveBeenCalled();
    expect(screen.queryByTestId('proxy-confirm-modal')).toBeNull();
    expect(mockSetMode).toHaveBeenCalledWith('family');
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/child/child-id?mode=settings',
    );
    // replace must NOT be the navigation path — it never dismissed the modal
    // in production (this was the actual symptom of BUG-774).
    expect(mockReplace).not.toHaveBeenCalled();
    // back must NOT be used directly — it's blocked by the BUG-BACK-RATCHET
    // guard. Dismiss is the documented API.
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('pushes child settings even when canDismiss is false [BUG-774]', () => {
    // Edge case: profiles modal opened as the root entry (no modal stack).
    // The push must still fire so the user is not trapped on /profiles.
    mockCanDismiss.mockReturnValue(false);
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-child-id'));

    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/child/child-id?mode=settings',
    );
  });

  it('does not expose a normal UI path into child proxy mode', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-child-id'));

    expect(mockSetMode).toHaveBeenCalledWith('family');
    expect(mockSwitchProfile).not.toHaveBeenCalled();
    expect(screen.queryByText("Viewing Alex's account")).toBeNull();
    expect(screen.queryByTestId('proxy-confirm-view')).toBeNull();
    expect(screen.queryByTestId('proxy-confirm-cancel')).toBeNull();
  });

  it('[WI-1655] activates an owner-linked child on E2E long-press through the real switch contract', async () => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    const childRow = screen.getByTestId('profile-row-child-id');
    fireEvent(childRow, 'longPress');

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledTimes(1);
      expect(mockSwitchProfile).toHaveBeenCalledWith('child-id');
    });
    expect(mockSetMode).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it.each(['unset', 'false'] as const)(
    '[WI-1655] does not expose child activation when EXPO_PUBLIC_E2E is %s',
    (flagState) => {
      if (flagState === 'unset') {
        delete process.env.EXPO_PUBLIC_E2E;
      } else {
        process.env.EXPO_PUBLIC_E2E = flagState;
      }
      useProfile.mockReturnValue({
        profiles: [ownerProfile, childProfile],
        activeProfile: ownerProfile,
        switchProfile: mockSwitchProfile,
        isLoading: false,
      });

      render(<ProfilesScreen />);

      fireEvent(screen.getByTestId('profile-row-child-id'), 'longPress');
      expect(mockSwitchProfile).not.toHaveBeenCalled();
      expect(mockDismiss).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
    },
  );

  it('[BREAK][WI-301] requires reverification before a child switches into the owner row', async () => {
    let runReverifiedAction!: () => Promise<unknown>;
    let capturedAction:
      | ((profileId: string) => Promise<unknown> | unknown)
      | undefined;
    const reverifiedOwnerSwitch = jest.fn(
      (profileId: string) =>
        new Promise((resolve, reject) => {
          runReverifiedAction = async () => {
            try {
              resolve(await capturedAction?.(profileId));
            } catch (err) {
              reject(err);
            }
          };
        }),
    );
    mockUseReverification.mockImplementation((fn) => {
      capturedAction = fn;
      return reverifiedOwnerSwitch;
    });
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-owner-id'));

    expect(reverifiedOwnerSwitch).toHaveBeenCalledWith('owner-id');
    expect(mockSwitchProfile).not.toHaveBeenCalled();

    await act(async () => {
      await runReverifiedAction();
    });

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('owner-id');
    });
    expect(mockSetMode).not.toHaveBeenCalled();
    expect(screen.queryByTestId('proxy-confirm-modal')).toBeNull();
  });

  it('ignores duplicate profile switch taps while a switch is in flight', async () => {
    let resolveSwitch!: (value: { success: true }) => void;
    const slowSwitchProfile = jest.fn(
      () =>
        new Promise<{ success: true }>((resolve) => {
          resolveSwitch = resolve;
        }),
    );
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: slowSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-owner-id'));
    fireEvent.press(screen.getByTestId('profile-row-owner-id'));

    expect(slowSwitchProfile).toHaveBeenCalledTimes(1);
    expect(slowSwitchProfile).toHaveBeenCalledWith('owner-id');

    await act(async () => {
      resolveSwitch({ success: true });
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('warns when the device could not persist the switched profile choice', async () => {
    const switchWithPersistenceFailure = jest
      .fn()
      .mockResolvedValue({ success: true, persistenceFailed: true });
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: switchWithPersistenceFailure,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-owner-id'));

    await waitFor(() => {
      expect(switchWithPersistenceFailure).toHaveBeenCalledWith('owner-id');
    });
    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Profile switched',
        'We could not save this profile choice on this device. You may need to pick it again after reopening the app.',
      );
    });
  });

  it('navigates to create-profile on add button for family tier', () => {
    mockUseSubscription.mockReturnValue({
      data: { tier: 'family' },
    });
    mockUseFamilySubscription.mockReturnValue({
      data: { profileCount: 1, maxProfiles: 4 },
    });
    useProfile.mockReturnValue({
      profiles: [ownerProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profiles-add-button'));

    expect(mockPush).toHaveBeenCalledWith('/create-profile');
  });

  it('navigates to create-profile for Free owners instead of client-paywalling', () => {
    mockUseSubscription.mockReturnValue({
      data: { tier: 'free' },
    });
    mockUseFamilySubscription.mockReturnValue({
      data: { profileCount: 2, maxProfiles: 2 },
    });
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profiles-add-button'));

    expect(mockPlatformAlert).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/create-profile');
  });

  it('[BUG-519] still navigates to create-profile while subscription is loading', () => {
    mockUseSubscription.mockReturnValue({ data: null });
    mockUseFamilySubscription.mockReturnValue({ data: null });
    useProfile.mockReturnValue({
      profiles: [ownerProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profiles-add-button'));

    expect(mockPlatformAlert).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/create-profile');
  });

  it('shows loading indicator while loading', () => {
    useProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      switchProfile: mockSwitchProfile,
      isLoading: true,
    });

    render(<ProfilesScreen />);

    screen.getByTestId('profiles-loading');
  });

  it('pushes child settings when canGoBack is false (no back-stack to dismiss)', () => {
    // [BUG-774] When the profiles modal is the only screen in the stack we
    // skip the back() and push directly to /(app)/child/[profileId] so the
    // user is not stranded on /profiles.
    mockCanGoBack.mockReturnValue(false);
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-child-id'));

    expect(mockSetMode).toHaveBeenCalledWith('family');
    expect(mockSwitchProfile).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/child/child-id?mode=settings',
    );
  });

  it('shows edit buttons for owner on all profiles', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    screen.getByTestId('profile-rename-owner-id');
    screen.getByTestId('profile-rename-child-id');
  });

  it('shows edit button only on own profile for non-owner', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    screen.getByTestId('profile-rename-child-id');
    expect(screen.queryByTestId('profile-rename-owner-id')).toBeNull();
  });

  it('opens rename modal and calls mutate on save', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-rename-child-id'));

    screen.getByTestId('rename-modal');
    screen.getByTestId('rename-input');

    fireEvent.changeText(screen.getByTestId('rename-input'), 'Alexander');
    fireEvent.press(screen.getByTestId('rename-save'));

    expect(mockMutate).toHaveBeenCalledWith(
      { profileId: 'child-id', displayName: 'Alexander' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  // -------------------------------------------------------------------------
  // [BUG-822 / BREAK] handleSwitch must catch thrown errors from switchProfile
  // and surface the typed server reason — not silently swallow + generic toast.
  // -------------------------------------------------------------------------

  it('[BREAK / BUG-822] surfaces thrown switchProfile error in alert', async () => {
    const switchProfileThatThrows = jest
      .fn()
      .mockRejectedValue(new Error('Network unreachable'));

    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: switchProfileThatThrows,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-owner-id'));

    await waitFor(() => {
      expect(switchProfileThatThrows).toHaveBeenCalledWith('owner-id');
    });

    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Could not switch profiles',
        'Network unreachable',
      );
    });

    // Promise rejection must not bubble out — UI stays interactive.
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('[BREAK / BUG-822] handles non-Error rejection without crashing', async () => {
    const switchProfileThatThrowsString = jest
      .fn()
      .mockRejectedValue('string-error');

    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: switchProfileThatThrowsString,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-owner-id'));

    await waitFor(() => {
      expect(switchProfileThatThrowsString).toHaveBeenCalled();
    });

    // formatApiError stub returns 'Unknown error' for non-Error.
    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Could not switch profiles',
        'Unknown error',
      );
    });
  });

  // -------------------------------------------------------------------------
  // [BUG-127 / BREAK] Non-owners (children on a parent's account) must NOT
  // see the "+ Add profile" button. Per AGENTS.md Profile Shapes the
  // add-child affordance requires isOwner; a child acting on the parent's
  // account should have no way to trigger create-profile.
  // -------------------------------------------------------------------------
  it('[BREAK / BUG-127] hides "+ Add profile" button for non-owner active profile', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    // The list still renders — what must be gone is the add affordance.
    screen.getByTestId('profile-row-owner-id');
    screen.getByTestId('profile-row-child-id');
    expect(screen.queryByTestId('profiles-add-button')).toBeNull();
    expect(screen.queryByText('+ Add profile')).toBeNull();
  });

  it('[BUG-127] still shows "+ Add profile" button for owner active profile', () => {
    mockUseSubscription.mockReturnValue({ data: { tier: 'family' } });
    mockUseFamilySubscription.mockReturnValue({
      data: { profileCount: 1, maxProfiles: 4 },
    });
    useProfile.mockReturnValue({
      profiles: [ownerProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    screen.getByTestId('profiles-add-button');
  });

  it('closes rename modal on cancel', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-rename-owner-id'));
    const modal = screen.getByTestId('rename-modal');
    expect(modal.props.visible).toBe(true);

    fireEvent.press(screen.getByTestId('rename-cancel'));

    // Cancelling calls setRenaming(null) → visible={false} on the Modal.
    // On iOS, RN Modal keeps children mounted during the close animation so
    // rename-input stays in the tree, but the Modal itself reports visible=false.
    expect(screen.getByTestId('rename-modal').props.visible).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // [BUG-375] Auth gate — deep-link entry to root-level screen
  // ---------------------------------------------------------------------------
  describe('auth gate [BUG-375]', () => {
    it('redirects to /sign-in when an unauthenticated user opens a profiles deep-link', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: false,
      });

      useProfile.mockReturnValue({
        profiles: [],
        activeProfile: null,
        switchProfile: jest.fn(),
        isLoading: false,
      });

      render(<ProfilesScreen />);

      screen.getByTestId('mock-redirect-/sign-in');
      expect(screen.queryByTestId('profiles-screen')).toBeNull();
    });

    it('shows a spinner (not redirect) while Clerk is still hydrating', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: false,
        isSignedIn: false,
      });

      useProfile.mockReturnValue({
        profiles: [],
        activeProfile: null,
        switchProfile: jest.fn(),
        isLoading: false,
      });

      render(<ProfilesScreen />);

      screen.getByTestId('profiles-auth-loading');
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });

    it('renders the profiles screen when the user is signed in', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
      });

      useProfile.mockReturnValue({
        profiles: [],
        activeProfile: null,
        switchProfile: jest.fn(),
        isLoading: false,
      });

      render(<ProfilesScreen />);

      screen.getByTestId('profiles-screen');
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // [CR-2026-05-21-107] 20s switch timeout must not fire a second alert / close
  // the modal when the in-flight switchProfile() resolves AFTER the timeout.
  // ---------------------------------------------------------------------------

  describe('[CR-2026-05-21-107] 20s switch timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not stack a second alert or close the modal when the switch resolves AFTER the timeout', async () => {
      let resolveSwitch!: (value: { success: true }) => void;
      const verySlowSwitch = jest.fn(
        () =>
          new Promise<{ success: true }>((resolve) => {
            resolveSwitch = resolve;
          }),
      );
      useProfile.mockReturnValue({
        profiles: [ownerProfile, childProfile],
        activeProfile: childProfile,
        switchProfile: verySlowSwitch,
        isLoading: false,
      });

      render(<ProfilesScreen />);
      fireEvent.press(screen.getByTestId('profile-row-owner-id'));

      // Advance past the 20s timeout — the "Taking longer than expected" alert
      // should have been shown by the timer.
      act(() => {
        jest.advanceTimersByTime(20_000);
      });
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Taking longer than expected',
        'Please try again.',
      );
      expect(mockPlatformAlert).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();

      // Now the switchProfile() promise resolves successfully — late resolve.
      // The post-await success path must NOT stack a second alert and must
      // NOT close the modal (handleClose → mockBack).
      await act(async () => {
        resolveSwitch({ success: true });
      });

      expect(mockPlatformAlert).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('does not stack a second alert when the switch throws AFTER the timeout', async () => {
      let rejectSwitch!: (err: Error) => void;
      const slowFailingSwitch = jest.fn(
        () =>
          new Promise((_, reject) => {
            rejectSwitch = reject;
          }),
      );
      useProfile.mockReturnValue({
        profiles: [ownerProfile, childProfile],
        activeProfile: childProfile,
        switchProfile: slowFailingSwitch,
        isLoading: false,
      });

      render(<ProfilesScreen />);
      fireEvent.press(screen.getByTestId('profile-row-owner-id'));

      act(() => {
        jest.advanceTimersByTime(20_000);
      });
      expect(mockPlatformAlert).toHaveBeenCalledTimes(1);

      await act(async () => {
        rejectSwitch(new Error('network down'));
      });

      // No second "Could not switch profiles" alert on top of the timeout one.
      expect(mockPlatformAlert).toHaveBeenCalledTimes(1);
    });
  });
});
