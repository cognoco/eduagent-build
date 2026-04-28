import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import type { Profile } from '../lib/profile';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSwitchProfile = jest.fn().mockResolvedValue(undefined);

const ownerProfile: Profile = {
  id: 'owner-id',
  accountId: 'a1',
  displayName: 'Parent',
  avatarUrl: null,
  birthYear: 1990,
  location: null,
  isOwner: true,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const childProfile: Profile = {
  id: 'child-id',
  accountId: 'a1',
  displayName: 'Alex',
  avatarUrl: null,
  birthYear: 2012,
  location: null,
  isOwner: false,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

const mockUseSubscription = jest.fn().mockReturnValue({ data: null });
const mockUseFamilySubscription = jest.fn().mockReturnValue({ data: null });

jest.mock('../hooks/use-subscription', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
  useFamilySubscription: (...args: unknown[]) =>
    mockUseFamilySubscription(...args),
}));

const mockMutate = jest.fn();
jest.mock('../hooks/use-profiles', () => ({
  useUpdateProfileName: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

jest.mock('../lib/format-api-error', () => ({
  formatApiError: (e: unknown) =>
    e instanceof Error ? e.message : 'Unknown error',
}));

const mockPlatformAlert = jest.fn();
jest.mock('../lib/platform-alert', () => ({
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock('../lib/profile', () => ({
  ...jest.requireActual('../lib/profile'),
  useProfile: jest.fn().mockReturnValue({
    profiles: [],
    activeProfile: null,
    switchProfile: jest.fn(),
    isLoading: false,
  }),
}));

const { useProfile } = require('../lib/profile') as {
  useProfile: jest.Mock;
};

const ProfilesScreen = require('./profiles').default;

describe('ProfilesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('shows empty state when no profiles', () => {
    useProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    expect(screen.getByText('No profiles yet')).toBeTruthy();
    expect(
      screen.getByText('Create your first profile to get started')
    ).toBeTruthy();
    expect(screen.getByTestId('profiles-create-first')).toBeTruthy();
  });

  it('renders profile list with active checkmark', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    expect(screen.getByTestId('profile-row-owner-id')).toBeTruthy();
    expect(screen.getByTestId('profile-row-child-id')).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByTestId('profile-active-check')).toBeTruthy();
  });

  it('shows confirmation before switching from owner to child', async () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-child-id'));

    expect(screen.getByTestId('proxy-confirm-modal')).toBeTruthy();
    expect(screen.getByText("Viewing Alex's account")).toBeTruthy();
    expect(mockSwitchProfile).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('proxy-confirm-view'));

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('child-id');
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('cancels parent-to-child proxy confirmation without switching', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-child-id'));
    expect(screen.getByTestId('proxy-confirm-modal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('proxy-confirm-cancel'));

    expect(mockSwitchProfile).not.toHaveBeenCalled();
    expect(screen.queryByText("Viewing Alex's account")).toBeNull();
  });

  it('switches immediately when a child taps the owner row', async () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-owner-id'));

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('owner-id');
    });
    expect(screen.queryByTestId('proxy-confirm-modal')).toBeNull();
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

  it('shows loading indicator while loading', () => {
    useProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      switchProfile: mockSwitchProfile,
      isLoading: true,
    });

    render(<ProfilesScreen />);

    expect(screen.getByTestId('profiles-loading')).toBeTruthy();
  });

  it('replaces home after switching when there is no back history', async () => {
    mockCanGoBack.mockReturnValue(false);
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-child-id'));
    fireEvent.press(screen.getByTestId('proxy-confirm-view'));

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('child-id');
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('shows edit buttons for owner on all profiles', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    expect(screen.getByTestId('profile-rename-owner-id')).toBeTruthy();
    expect(screen.getByTestId('profile-rename-child-id')).toBeTruthy();
  });

  it('shows edit button only on own profile for non-owner', () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    expect(screen.getByTestId('profile-rename-child-id')).toBeTruthy();
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

    expect(screen.getByTestId('rename-modal')).toBeTruthy();
    expect(screen.getByTestId('rename-input')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('rename-input'), 'Alexander');
    fireEvent.press(screen.getByTestId('rename-save'));

    expect(mockMutate).toHaveBeenCalledWith(
      { profileId: 'child-id', displayName: 'Alexander' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
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
        'Network unreachable'
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
        'Unknown error'
      );
    });
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
    expect(screen.getByTestId('rename-modal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('rename-cancel'));

    // Modal should close — rename-input gone
    expect(screen.queryByTestId('rename-input')).toBeNull();
  });
});
