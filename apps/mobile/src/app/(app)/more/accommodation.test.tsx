import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockAccommodationMutate = jest.fn();
const mockCelebrationLevelMutate = jest.fn();
const mockPlatformAlert = jest.fn();
const mockTrack = jest.fn();

let mockActiveProfile = {
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
  birthYear: 1990,
};
let mockProfiles: Array<{
  id: string;
  displayName: string;
  isOwner: boolean;
  birthYear: number;
}> = [mockActiveProfile];
let mockLearnerProfile: { accommodationMode?: string } | null = {
  accommodationMode: 'none',
};
let mockLearnerProfileError = false;
let mockCelebrationLevel: 'all' | 'big_only' | 'off' | undefined = 'big_only';
const mockLearnerProfileRefetch = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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

jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: unit test boundary */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

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

const AccommodationScreen = require('./accommodation').default;

describe('AccommodationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
      birthYear: 1990,
    };
    mockProfiles = [mockActiveProfile];
    mockLearnerProfile = { accommodationMode: 'none' };
    mockLearnerProfileError = false;
    mockCelebrationLevel = 'big_only';
  });

  it('renders all four accommodation mode cards', () => {
    render(<AccommodationScreen />, { wrapper: createWrapper() });

    screen.getByTestId('accommodation-mode-none');
    screen.getByTestId('accommodation-mode-short-burst');
    screen.getByTestId('accommodation-mode-audio-first');
    screen.getByTestId('accommodation-mode-predictable');
  });

  it('changes accommodation mode when a card is pressed', () => {
    render(<AccommodationScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-mode-short-burst'));

    expect(mockAccommodationMutate).toHaveBeenCalledWith(
      { accommodationMode: 'short-burst' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('shows the inline celebration follow-up only for short-burst and predictable', () => {
    mockLearnerProfile = { accommodationMode: 'short-burst' };
    const { rerender } = render(<AccommodationScreen />, {
      wrapper: createWrapper(),
    });

    screen.getByTestId('celebration-followup-short-burst');
    screen.getByTestId('celebration-level-big-only');

    mockLearnerProfile = { accommodationMode: 'predictable' };
    rerender(<AccommodationScreen />);
    screen.getByTestId('celebration-followup-predictable');

    mockLearnerProfile = { accommodationMode: 'audio-first' };
    rerender(<AccommodationScreen />);
    expect(screen.queryByTestId('celebration-level-big-only')).toBeNull();
  });

  it('updates celebration level from the inline follow-up', () => {
    mockLearnerProfile = { accommodationMode: 'predictable' };
    render(<AccommodationScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('celebration-level-off'));

    expect(mockCelebrationLevelMutate).toHaveBeenCalledWith(
      'off',
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('shows child cross-link for an owner with one linked child', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false, birthYear: 2014 },
    ];

    render(<AccommodationScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-mode-child-link'));

    expect(mockTrack).toHaveBeenCalledWith('child_progress_navigated', {
      source: 'accommodation_screen',
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/home');
  });

  it('shows family cross-link for an owner with multiple linked children', () => {
    mockProfiles = [
      mockActiveProfile,
      { id: 'child-1', displayName: 'Mia', isOwner: false, birthYear: 2014 },
      { id: 'child-2', displayName: 'Sam', isOwner: false, birthYear: 2016 },
    ];

    render(<AccommodationScreen />, { wrapper: createWrapper() });

    screen.getByTestId('accommodation-mode-family-link');
    expect(screen.queryByTestId('accommodation-mode-child-link')).toBeNull();
  });

  it('renders an error block with retry when the learner profile fails to load', () => {
    mockLearnerProfile = null;
    mockLearnerProfileError = true;

    render(<AccommodationScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-mode-retry'));

    expect(mockLearnerProfileRefetch).toHaveBeenCalled();
  });

  it('toggles the "Not sure which to pick?" guide', () => {
    render(<AccommodationScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('accommodation-guide-content')).toBeNull();

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));
    screen.getByTestId('accommodation-guide-content');
    screen.getByTestId('guide-pick-short-burst');
    screen.getByTestId('guide-pick-audio-first');
    screen.getByTestId('guide-pick-predictable');
    screen.getByTestId('guide-pick-none');
  });

  it('selects accommodation mode from the guide and closes it', () => {
    render(<AccommodationScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));
    fireEvent.press(screen.getByTestId('guide-pick-audio-first'));

    expect(mockAccommodationMutate).toHaveBeenCalledWith(
      { accommodationMode: 'audio-first' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(screen.queryByTestId('accommodation-guide-content')).toBeNull();
  });

  it('shows "Active" marker on the current mode in the guide', () => {
    mockLearnerProfile = { accommodationMode: 'audio-first' };
    render(<AccommodationScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-guide-toggle'));

    expect(screen.getByText(/Audio-First · Active/)).toBeTruthy();
  });
});
