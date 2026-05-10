import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockTrack = jest.fn();
const mockAccommodationMutate = jest.fn();
const mockCelebrationLevelMutate = jest.fn();
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
let mockLearnerProfile: { accommodationMode?: string } | null = {
  accommodationMode: 'none',
};
let mockLearnerProfileError = false;
let mockIsParentProxy = false;
let mockCelebrationLevel: 'all' | 'big_only' | 'off' | undefined = 'big_only';
const mockLearnerProfileRefetch = jest.fn();

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
  '../../../hooks/use-learner-profile' /* gc1-allow: unit test boundary */,
  () => ({
    useLearnerProfile: () => ({
      data: mockLearnerProfile,
      isError: mockLearnerProfileError,
      refetch: mockLearnerProfileRefetch,
    }),
    useUpdateAccommodationMode: () => ({
      mutate: mockAccommodationMutate,
      isPending: false,
    }),
  }),
);

jest.mock(
  '../../../hooks/use-settings' /* gc1-allow: unit test boundary */,
  () => ({
    useCelebrationLevel: () => ({
      data: mockCelebrationLevel,
      isLoading: false,
    }),
    useUpdateCelebrationLevel: () => ({
      mutate: mockCelebrationLevelMutate,
      isPending: false,
    }),
  }),
);

jest.mock('../../../lib/analytics' /* gc1-allow: unit test boundary */, () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
  useUser: () => ({
    user: {
      fullName: 'Alex',
      firstName: 'Alex',
      primaryEmailAddress: { emailAddress: 'alex@example.com' },
    },
  }),
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
    mockLearnerProfile = { accommodationMode: 'none' };
    mockLearnerProfileError = false;
    mockIsParentProxy = false;
    mockCelebrationLevel = 'big_only';
  });

  it('renders the master/detail landing rows', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('learning-accommodation-section-header');
    screen.getByTestId('mentor-memory-link');
    screen.getByTestId('add-child-link');
    screen.getByTestId('more-row-notifications');
    screen.getByTestId('more-row-account');
    screen.getByTestId('more-row-privacy');
    screen.getByTestId('more-row-help');
    screen.getByTestId('sign-out-button');
    expect(screen.queryByTestId('notifications-section-header')).toBeNull();
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

  it('shows the inline celebration follow-up only for short-burst and predictable accommodations', () => {
    mockLearnerProfile = { accommodationMode: 'short-burst' };
    const { rerender } = render(<MoreScreen />, { wrapper: createWrapper() });

    screen.getByTestId('celebration-followup-short-burst');
    screen.getByTestId('celebration-level-big-only');

    mockLearnerProfile = { accommodationMode: 'predictable' };
    rerender(<MoreScreen />);
    screen.getByTestId('celebration-followup-predictable');

    mockLearnerProfile = { accommodationMode: 'audio-first' };
    rerender(<MoreScreen />);
    expect(screen.queryByTestId('celebration-level-big-only')).toBeNull();
  });

  it('updates celebration level from the inline follow-up', () => {
    mockLearnerProfile = { accommodationMode: 'predictable' };
    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('celebration-level-off'));

    expect(mockCelebrationLevelMutate).toHaveBeenCalledWith(
      'off',
      expect.objectContaining({ onError: expect.any(Function) }),
    );
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

  it('keeps child preference cross-links for owner profiles with children', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false, birthYear: 2014 },
    ];

    render(<MoreScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-mode-child-link'));

    expect(mockTrack).toHaveBeenCalledWith('child_progress_navigated', {
      source: 'more_preferences_link',
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/child/child-1');
  });

  it('hides sign out in impersonation', () => {
    mockIsParentProxy = true;

    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('sign-out-button')).toBeNull();
  });
});
