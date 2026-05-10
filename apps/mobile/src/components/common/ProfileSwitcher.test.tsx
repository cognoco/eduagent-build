import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ProfileSwitcher } from './ProfileSwitcher';
import type { Profile } from '@eduagent/schemas';
import { TEST_ACCOUNT_ID, TEST_PROFILE_ID } from '@eduagent/test-utils';

const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: TEST_PROFILE_ID,
  accountId: TEST_ACCOUNT_ID,
  displayName: 'Alex',
  avatarUrl: null,
  birthYear: 2010,
  location: null,
  isOwner: true,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  linkCreatedAt: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

const profiles: Profile[] = [
  makeProfile({
    id: 'p1',
    displayName: 'Alex',
    birthYear: 2010,
  }),
  makeProfile({
    id: 'p2',
    displayName: 'Sam Jones',
    birthYear: 1990,
    isOwner: false,
  }),
];

describe('ProfileSwitcher', () => {
  const onSwitch = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when only one profile exists', () => {
    const { toJSON } = render(
      <ProfileSwitcher
        profiles={[profiles[0]!]}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    expect(toJSON()).toBeNull();
  });

  it('renders chip with active profile name', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    screen.getByText('Alex');
    screen.getByTestId('profile-switcher-chip');
  });

  it('renders initials in the avatar', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p2"
        onSwitch={onSwitch}
      />,
    );

    // "Sam Jones" -> "SJ"
    screen.getByText('SJ');
  });

  it('does not show dropdown menu initially', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    expect(screen.queryByTestId('profile-switcher-menu')).toBeNull();
  });

  it('shows dropdown on chip press', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    screen.getByTestId('profile-switcher-menu');
  });

  it('shows all profile options in dropdown', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    screen.getByTestId('profile-option-p1');
    screen.getByTestId('profile-option-p2');
  });

  it('calls onSwitch when selecting a different profile', async () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-option-p2'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onSwitch).toHaveBeenCalledWith('p2');
  });

  it('does not call onSwitch when selecting the active profile', async () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-option-p1'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('closes dropdown on backdrop press', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    screen.getByTestId('profile-switcher-menu');

    fireEvent.press(screen.getByTestId('profile-switcher-backdrop'));
    expect(screen.queryByTestId('profile-switcher-menu')).toBeNull();
  });

  it('closes dropdown after selecting a profile', async () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));

    // handleSelect is async — flush microtasks so setIsOpen(false) commits
    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-option-p2'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByTestId('profile-switcher-menu')).toBeNull();
  });

  it('shows role label for each profile', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    // LEARNER displays as "Student", PARENT stays "Parent"
    screen.getByText('Student');
    screen.getByText('Parent');
  });
});
