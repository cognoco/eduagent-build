import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

let mockActiveProfile = {
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
  birthYear: 1990,
};
let mockLearnerProfile: { accommodationMode?: string } | null = {
  accommodationMode: 'none',
};

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
    profiles: [mockActiveProfile],
  }),
}));

jest.mock(
  '../../../hooks/use-learner-profile' /* gc1-allow: unit test boundary */,
  () => ({
    useLearnerProfile: () => ({
      data: mockLearnerProfile,
      isError: false,
      refetch: jest.fn(),
    }),
    useUpdateAccommodationMode: () => ({
      mutate: jest.fn(),
      isPending: false,
    }),
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

const LearningPreferencesScreen = require('./learning-preferences').default;

describe('LearningPreferencesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
      birthYear: 1990,
    };
    mockLearnerProfile = { accommodationMode: 'none' };
  });

  it('renders accommodation and mentor memory sections as nav rows', () => {
    render(<LearningPreferencesScreen />, { wrapper: createWrapper() });

    screen.getByTestId('learning-accommodation-section-header');
    screen.getByTestId('accommodation-link');
    screen.getByTestId('mentor-memory-section-header');
    screen.getByTestId('mentor-memory-link');
  });

  it('navigates to accommodation screen when row is pressed', () => {
    render(<LearningPreferencesScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('accommodation-link'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/accommodation');
  });

  it('shows the active accommodation mode name on the row', () => {
    mockLearnerProfile = { accommodationMode: 'short-burst' };
    render(<LearningPreferencesScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Short-Burst')).toBeTruthy();
  });

  it('navigates to mentor memory with returnTo=learning-preferences', () => {
    render(<LearningPreferencesScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('mentor-memory-link'));

    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/mentor-memory?returnTo=learning-preferences',
    );
  });
});
