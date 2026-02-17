import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import type { Profile } from '../lib/profile';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
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
  birthDate: null,
  personaType: 'PARENT',
  isOwner: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const childProfile: Profile = {
  id: 'child-id',
  accountId: 'a1',
  displayName: 'Alex',
  avatarUrl: null,
  birthDate: '2012-05-15',
  personaType: 'TEEN',
  isOwner: false,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

jest.mock('../lib/profile', () => ({
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

  it('calls switchProfile on profile tap and navigates back', async () => {
    useProfile.mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
      switchProfile: mockSwitchProfile,
      isLoading: false,
    });

    render(<ProfilesScreen />);

    fireEvent.press(screen.getByTestId('profile-row-child-id'));

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('child-id');
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('navigates to create-profile on add button', () => {
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
});
