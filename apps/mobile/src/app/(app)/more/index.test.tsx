import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
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
    mockProfiles = [mockActiveProfile];
    mockIsParentProxy = false;
  });

  it('renders the master/detail landing rows', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('more-row-learning-preferences');
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
  });

  it('navigates to the learning-preferences screen', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('more-row-learning-preferences'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/learning-preferences');
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

    expect(mockPush).toHaveBeenCalledWith('/create-profile?for=child');
  });

  it('hides sign out in impersonation', () => {
    mockIsParentProxy = true;

    render(<MoreScreen />, { wrapper: createWrapper() });

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
