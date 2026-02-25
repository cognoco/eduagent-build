import { render, screen, fireEvent } from '@testing-library/react-native';
import { ProfileSwitcher } from './ProfileSwitcher';
import type { Profile } from '@eduagent/schemas';

const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: '00000000-0000-0000-0000-000000000001',
  accountId: '00000000-0000-0000-0000-000000000099',
  displayName: 'Alex',
  avatarUrl: null,
  birthDate: null,
  personaType: 'LEARNER',
  location: null,
  isOwner: true,
  consentStatus: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

const profiles: Profile[] = [
  makeProfile({
    id: 'p1',
    displayName: 'Alex',
    personaType: 'LEARNER',
  }),
  makeProfile({
    id: 'p2',
    displayName: 'Sam Jones',
    personaType: 'PARENT',
    isOwner: false,
  }),
];

describe('ProfileSwitcher', () => {
  const onSwitch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when only one profile exists', () => {
    const { toJSON } = render(
      <ProfileSwitcher
        profiles={[profiles[0]]}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders chip with active profile name', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByTestId('profile-switcher-chip')).toBeTruthy();
  });

  it('renders initials in the avatar', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p2"
        onSwitch={onSwitch}
      />
    );

    // "Sam Jones" -> "SJ"
    expect(screen.getByText('SJ')).toBeTruthy();
  });

  it('does not show dropdown menu initially', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    expect(screen.queryByTestId('profile-switcher-menu')).toBeNull();
  });

  it('shows dropdown on chip press', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    expect(screen.getByTestId('profile-switcher-menu')).toBeTruthy();
  });

  it('shows all profile options in dropdown', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    expect(screen.getByTestId('profile-option-p1')).toBeTruthy();
    expect(screen.getByTestId('profile-option-p2')).toBeTruthy();
  });

  it('calls onSwitch when selecting a different profile', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    fireEvent.press(screen.getByTestId('profile-option-p2'));

    expect(onSwitch).toHaveBeenCalledWith('p2');
  });

  it('does not call onSwitch when selecting the active profile', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    fireEvent.press(screen.getByTestId('profile-option-p1'));

    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('closes dropdown on backdrop press', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    expect(screen.getByTestId('profile-switcher-menu')).toBeTruthy();

    fireEvent.press(screen.getByTestId('profile-switcher-backdrop'));
    expect(screen.queryByTestId('profile-switcher-menu')).toBeNull();
  });

  it('closes dropdown after selecting a profile', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    fireEvent.press(screen.getByTestId('profile-option-p2'));

    expect(screen.queryByTestId('profile-switcher-menu')).toBeNull();
  });

  it('shows persona badge for each profile', () => {
    render(
      <ProfileSwitcher
        profiles={profiles}
        activeProfileId="p1"
        onSwitch={onSwitch}
      />
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    expect(screen.getByText('Learner')).toBeTruthy();
    expect(screen.getByText('Parent')).toBeTruthy();
  });
});
