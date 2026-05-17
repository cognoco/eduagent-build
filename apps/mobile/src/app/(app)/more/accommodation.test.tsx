import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockAccommodationMutate = jest.fn();
const mockPlatformAlert = jest.fn();

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
let mockChildLearnerProfile: { accommodationMode?: string } | null = null;
let mockLearnerProfileError = false;
let mockChildLearnerProfileError = false;
const mockLearnerProfileRefetch = jest.fn();
const mockChildLearnerProfileRefetch = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
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
    useChildLearnerProfile: () => ({
      data: mockChildLearnerProfile,
      isError: mockChildLearnerProfileError,
      refetch: mockChildLearnerProfileRefetch,
    }),
    useUpdateAccommodationMode: () => ({
      mutate: mockAccommodationMutate,
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
    mockChildLearnerProfile = null;
    mockLearnerProfileError = false;
    mockChildLearnerProfileError = false;
    mockSearchParams = {};
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

  it('shows the celebration settings link only for short-burst and predictable', () => {
    mockLearnerProfile = { accommodationMode: 'short-burst' };
    const { rerender } = render(<AccommodationScreen />, {
      wrapper: createWrapper(),
    });

    screen.getByTestId('celebration-followup-short-burst');
    screen.getByTestId('celebration-settings-link');

    mockLearnerProfile = { accommodationMode: 'predictable' };
    rerender(<AccommodationScreen />);
    screen.getByTestId('celebration-followup-predictable');

    mockLearnerProfile = { accommodationMode: 'audio-first' };
    rerender(<AccommodationScreen />);
    expect(screen.queryByTestId('celebration-settings-link')).toBeNull();
  });

  it('opens the central celebrations screen from the follow-up link', () => {
    mockLearnerProfile = { accommodationMode: 'predictable' };
    render(<AccommodationScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('celebration-settings-link'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/celebrations');
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

  describe('child mode (childProfileId param)', () => {
    beforeEach(() => {
      mockProfiles = [
        mockActiveProfile,
        {
          id: 'child-1',
          displayName: 'Mia',
          isOwner: false,
          birthYear: 2014,
        },
      ];
      mockSearchParams = { childProfileId: 'child-1' };
      mockChildLearnerProfile = { accommodationMode: 'none' };
    });

    it('shows the child name in the title', () => {
      render(<AccommodationScreen />, { wrapper: createWrapper() });

      expect(screen.getByText(/Mia's learning preferences/)).toBeTruthy();
    });

    it('passes childProfileId when changing accommodation mode', () => {
      render(<AccommodationScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('accommodation-mode-short-burst'));

      expect(mockAccommodationMutate).toHaveBeenCalledWith(
        { accommodationMode: 'short-burst', childProfileId: 'child-1' },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it('preserves childProfileId when opening the central celebrations screen', () => {
      mockChildLearnerProfile = { accommodationMode: 'predictable' };
      render(<AccommodationScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('celebration-settings-link'));

      expect(mockPush).toHaveBeenCalledWith(
        '/(app)/more/celebrations?childProfileId=child-1',
      );
    });

    it('returns to the learner More root when a cached child-editing route opens outside parent mode', () => {
      mockActiveProfile = {
        id: 'child-1',
        displayName: 'Mia',
        isOwner: false,
        birthYear: 2014,
      };
      mockProfiles = [
        {
          id: 'profile-1',
          displayName: 'Alex',
          isOwner: true,
          birthYear: 1990,
        },
        mockActiveProfile,
      ];

      render(<AccommodationScreen />, { wrapper: createWrapper() });

      expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
      expect(screen.queryByText(/Mia's learning preferences/)).toBeNull();
    });
  });

  describe('back navigation', () => {
    it('calls router.back() when back stack exists', () => {
      mockCanGoBack.mockReturnValue(true);
      render(<AccommodationScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('accommodation-back'));

      expect(mockBack).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('replaces to learning-preferences when no back stack', () => {
      mockCanGoBack.mockReturnValue(false);
      render(<AccommodationScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('accommodation-back'));

      expect(mockReplace).toHaveBeenCalledWith(
        '/(app)/more/learning-preferences',
      );
      expect(mockBack).not.toHaveBeenCalled();
    });
  });
});
