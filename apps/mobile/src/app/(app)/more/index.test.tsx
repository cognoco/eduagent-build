import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockPlatformAlert = jest.fn();
let mockSubscription: { tier: string } | null = { tier: 'family' };
let mockFamilySubscription: {
  profileCount: number;
  maxProfiles: number;
} | null = {
  profileCount: 1,
  maxProfiles: 4,
};
let mockActiveProfile = {
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
  birthYear: 1990,
};
let mockProfiles = [mockActiveProfile];
let mockIsParentProxy = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = require('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <Text>{name}</Text>;
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/theme' /* gc1-allow: unit test boundary */, () => ({
  useThemeColors: () => ({ textSecondary: '#777', primary: '#6366f1' }),
}));

jest.mock('../../../lib/profile' /* gc1-allow: unit test boundary */, () => ({
  useProfile: () => ({
    activeProfile: mockActiveProfile,
    profiles: mockProfiles,
  }),
}));

jest.mock(
  '../../../hooks/use-parent-proxy' /* gc1-allow: unit test boundary */,
  () => ({
    useParentProxy: () => ({
      isParentProxy: mockIsParentProxy,
      childProfile: null,
      parentProfile: null,
    }),
  }),
);

jest.mock(
  '../../../hooks/use-active-profile-role' /* gc1-allow: unit test boundary */,
  () => ({
    useActiveProfileRole: () =>
      mockIsParentProxy
        ? 'impersonated-child'
        : mockActiveProfile?.isOwner
          ? 'owner'
          : 'child',
  }),
);

jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: unit test boundary */,
  () => ({
    useNavigationContract: () => ({
      effectiveAppContext: 'study',
      isFamilyCapable: mockProfiles.some(
        (profile) => profile.id !== mockActiveProfile?.id && !profile.isOwner,
      ),
      isParentProxy: mockIsParentProxy,
      chrome: { modeSwitcher: 'hidden', proxyBanner: 'hidden' },
      home: {
        screen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
        iconName: 'School',
      },
      visibleTabs: new Set(['home', 'library', 'progress', 'more']),
      gates: {
        // Mirror the real contract: showAddChild requires an adult owner
        // (isAdultOwner) so minor owners and unknown birth years are gated
        // out. Previously the screen called isAdultOwner directly; PR 3
        // routes that decision through the contract gate, so this mock
        // must encode the same rule.
        showAddChild:
          mockActiveProfile?.isOwner === true &&
          typeof mockActiveProfile?.birthYear === 'number' &&
          new Date().getFullYear() - mockActiveProfile.birthYear >= 18 &&
          !mockIsParentProxy,
        showRemoveFamilyMember:
          mockActiveProfile?.isOwner === true && !mockIsParentProxy,
      },
      canEnter: jest.fn(() => true),
      isSurfaced: jest.fn(() => true),
      queryScope: { appContext: 'study', profileId: mockActiveProfile?.id },
      diagnostic: {},
    }),
  }),
);

jest.mock(
  '../../../hooks/use-subscription' /* gc1-allow: unit test boundary */,
  () => ({
    useSubscription: () => ({ data: mockSubscription }),
    useFamilySubscription: () => ({ data: mockFamilySubscription }),
  }),
);

jest.mock(
  '../../../hooks/use-settings' /* gc1-allow: unit test boundary */,
  () => ({
    useFamilyPoolBreakdownSharing: () => ({
      data: false,
      isLoading: false,
    }),
    useUpdateFamilyPoolBreakdownSharing: () => ({
      mutate: jest.fn(),
      isPending: false,
    }),
  }),
);

jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: unit test boundary */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const MoreScreen = require('./index').default;

describe('MoreScreen landing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscription = { tier: 'family' };
    mockFamilySubscription = { profileCount: 1, maxProfiles: 4 };
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
      birthYear: 1990,
    };
    mockProfiles = [
      mockActiveProfile,
      {
        id: 'profile-2',
        displayName: 'Sam',
        isOwner: false,
        birthYear: 2015,
      },
    ];
    mockIsParentProxy = false;
  });

  it('renders the master/detail landing rows', () => {
    const { root } = render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('more-row-learning-preferences');
    screen.getByText('Your learning');
    screen.getByText('Preferences');
    screen.getByTestId('more-row-mentor-memory');
    screen.getByTestId('more-row-mentor-language');
    screen.getByTestId('add-child-link');
    screen.getByTestId('more-row-notifications');
    screen.getByTestId('more-row-account');
    screen.getByTestId('more-row-privacy');
    screen.getByTestId('more-row-help');
    screen.getByTestId('sign-out-button');
    expect(
      screen.queryByTestId('learning-accommodation-section-header'),
    ).toBeNull();
    expect(screen.queryByTestId('mentor-memory-link')).toBeNull();
    screen.getByTestId('family-breakdown-sharing-toggle');
    screen.getByText('Share family usage');
    screen.getByText('Show usage per profile.');

    const textValues = root
      .findAllByType(Text)
      .map((node: { props: { children: unknown } }) => node.props.children);
    expect(textValues.indexOf('Your learning')).toBeLessThan(
      textValues.indexOf('Preferences'),
    );
    expect(textValues.indexOf('Preferences')).toBeLessThan(
      textValues.indexOf('Mentor memory'),
    );
    expect(textValues.indexOf('Mentor memory')).toBeLessThan(
      textValues.indexOf('Mentor language'),
    );
    expect(textValues.indexOf('Mentor language')).toBeLessThan(
      textValues.indexOf('Profile'),
    );
  });

  it('navigates directly to the accommodation picker from Preferences', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('more-row-learning-preferences'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/accommodation');
  });

  it('navigates to the four More sub-screens', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('more-row-notifications'));
    fireEvent.press(screen.getByTestId('more-row-account'));
    fireEvent.press(screen.getByTestId('more-row-privacy'));
    fireEvent.press(screen.getByTestId('more-row-help'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/notifications');
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/account');
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/privacy');
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/help');
  });

  it('hides Add a child for minor owners and unknown birth years', () => {
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
      birthYear: new Date().getFullYear() - 17,
    };
    mockProfiles = [mockActiveProfile];
    const { rerender } = render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('add-child-link')).toBeNull();

    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
      birthYear: null as unknown as number,
    };
    mockProfiles = [mockActiveProfile];
    rerender(<MoreScreen />);

    expect(screen.queryByTestId('add-child-link')).toBeNull();
  });

  it('navigates to create-profile when Add a child is pressed', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('hides add-child for non-owner (child on parent account)', () => {
    mockActiveProfile = {
      id: 'profile-2',
      displayName: 'Sam',
      isOwner: false,
      birthYear: 2010,
    };
    mockProfiles = [mockActiveProfile];

    render(<MoreScreen />, { wrapper: createWrapper() });

    // Break test: a non-owner (child account) must never see the add-child link.
    // Showing it would let a child attempt to add siblings, hitting the family plan gate
    // with a confusing error and leaking billing context.
    expect(screen.queryByTestId('add-child-link')).toBeNull();
    // Regular More rows are still visible for non-owner users
    screen.getByTestId('more-row-learning-preferences');
    screen.getByTestId('more-row-account');
  });

  it('locks More settings in parent preview', () => {
    mockIsParentProxy = true;

    render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('more-proxy-preview-locked');
    screen.getByText('Settings are paused in parent preview');
    expect(screen.queryByTestId('more-row-learning-preferences')).toBeNull();
    expect(screen.queryByTestId('more-row-mentor-memory')).toBeNull();
    expect(screen.queryByTestId('more-row-mentor-language')).toBeNull();
    expect(screen.queryByTestId('more-row-account')).toBeNull();
    expect(screen.queryByTestId('more-row-notifications')).toBeNull();
    expect(screen.queryByTestId('more-row-privacy')).toBeNull();
    expect(screen.queryByTestId('more-row-help')).toBeNull();
    expect(screen.queryByTestId('add-child-link')).toBeNull();
    expect(screen.queryByTestId('sign-out-button')).toBeNull();
  });

  it('shows upgrade-required alert when tier is free', () => {
    mockSubscription = { tier: 'free' };

    render(<MoreScreen />, { wrapper: createWrapper() });
    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPlatformAlert).toHaveBeenCalledWith(
      'Upgrade required',
      'Adding child profiles requires a Family or Pro subscription.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'View plans' }),
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
      ]),
    );
    expect(mockPush).not.toHaveBeenCalledWith('/create-profile?for=child');
  });

  it('shows profile-limit alert when family-tier is at max', () => {
    mockSubscription = { tier: 'family' };
    mockFamilySubscription = { profileCount: 4, maxProfiles: 4 };

    render(<MoreScreen />, { wrapper: createWrapper() });
    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPlatformAlert).toHaveBeenCalledWith(
      'Profile limit reached',
      'Your Family plan supports up to 4 profiles.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'View plans' }),
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
      ]),
    );
    expect(mockPush).not.toHaveBeenCalledWith('/create-profile?for=child');
  });

  it('shows profile-limit alert when pro-tier is at max', () => {
    mockSubscription = { tier: 'pro' };
    mockFamilySubscription = { profileCount: 4, maxProfiles: 4 };

    render(<MoreScreen />, { wrapper: createWrapper() });
    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPlatformAlert).toHaveBeenCalledWith(
      'Profile limit reached',
      'Your Pro plan supports up to 4 profiles.',
      [expect.objectContaining({ text: 'OK' })],
    );
    expect(mockPush).not.toHaveBeenCalledWith('/create-profile?for=child');
  });
});
