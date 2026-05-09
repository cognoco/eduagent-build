import { render, screen, act, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoutedMockFetch } from '../../test-utils/mock-api-routes';

const mockFetch = createRoutedMockFetch({
  '/celebrations/pending': { pendingCelebrations: [] },
  '/settings/celebration-level': { celebrationLevel: 'all' },
});

jest.mock('../../lib/api-client', () =>
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

type MockProfile = {
  id: string;
  displayName: string;
  isOwner: boolean;
};

type MockActiveProfile = {
  id: string;
  accountId: string;
  displayName: string;
  isOwner: boolean;
  hasPremiumLlm: boolean;
  conversationLanguage: string;
  pronouns: string | null;
  consentStatus: string | null;
};

function makeActiveProfile(partial: MockProfile): MockActiveProfile {
  return {
    accountId: 'test-account-id',
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    pronouns: null,
    consentStatus: null,
    ...partial,
  };
}

let mockProfiles: MockProfile[] = [];
let mockActiveProfile: MockActiveProfile | null = null;
let mockIsLoading = false;
let mockOnAllComplete: (() => void) | null = null;
jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    profiles: mockProfiles,
    activeProfile: mockActiveProfile,
    switchProfile: jest.fn(),
    isLoading: mockIsLoading,
  }),
}));

jest.mock('../../hooks/use-celebration', () => ({
  useCelebration: ({ onAllComplete }: { onAllComplete: () => void }) => {
    mockOnAllComplete = onAllComplete;
    return { CelebrationOverlay: null };
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock('../../components/home', () => {
  const { Text, View } = require('react-native');
  return {
    LearnerScreen: () => (
      <View testID="learner-screen">
        <Text>LearnerScreen</Text>
      </View>
    ),
  };
});

const HomeScreen = require('./home').default;

describe('HomeScreen intent router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoading = false;
    mockOnAllComplete = null;
  });

  it('renders LearnerScreen for owner with no children [BUG-522]', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = makeActiveProfile(mockProfiles[0]!);
    const Wrapper = createWrapper();

    render(<HomeScreen />, { wrapper: Wrapper });

    // BUG-522: owners without children always see LearnerScreen — no forced
    // add-child gate regardless of subscription tier
    screen.getByTestId('learner-screen');
  });

  it('renders LearnerScreen directly for owner with linked children', () => {
    mockProfiles = [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ];
    mockActiveProfile = makeActiveProfile(mockProfiles[0]!);
    const Wrapper = createWrapper();

    render(<HomeScreen />, { wrapper: Wrapper });

    screen.getByTestId('learner-screen');
  });

  it('renders LearnerScreen when active profile is a child (non-owner)', () => {
    mockProfiles = [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ];
    mockActiveProfile = makeActiveProfile(mockProfiles[1]!);
    const Wrapper = createWrapper();

    render(<HomeScreen />, { wrapper: Wrapper });

    screen.getByTestId('learner-screen');
  });

  it('renders loading placeholder when profiles are still loading', () => {
    mockProfiles = [];
    mockActiveProfile = null;
    mockIsLoading = true;
    const Wrapper = createWrapper();

    render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.queryByTestId('learner-screen')).toBeNull();
  });
});

describe('HomeScreen 3B.11: timeout error state secondary navigation', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockIsLoading = true;
    mockProfiles = [];
    mockActiveProfile = null;
    Wrapper = createWrapper();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the timeout error UI after 10s of loading', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    screen.getByTestId('home-loading-timeout');
    screen.getByTestId('home-loading-retry');
    screen.getByTestId('timeout-library-button');
    screen.getByTestId('timeout-more-button');
  });

  it('navigates to library when "Go to Library" is pressed [3B.11]', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    fireEvent.press(screen.getByTestId('timeout-library-button'));

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('navigates to more when "More options" is pressed [3B.11]', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    fireEvent.press(screen.getByTestId('timeout-more-button'));

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/more');
  });

  it('resets the timeout flag when Retry is pressed', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    screen.getByTestId('home-loading-timeout');

    fireEvent.press(screen.getByTestId('home-loading-retry'));

    expect(screen.queryByTestId('home-loading-timeout')).toBeNull();
  });
});

describe('HomeScreen SF-1: markCelebrationsSeen error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoading = false;
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = makeActiveProfile(mockProfiles[0]!);
    mockOnAllComplete = null;
  });

  it('logs error when markCelebrationsSeen.mutateAsync rejects — no unhandled rejection [SF-1]', async () => {
    const consoleSpy = jest
      .spyOn(console, 'warn')
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
    // Make the /celebrations/seen endpoint return a server error so the real
    // useMarkCelebrationsSeen mutation rejects.
    mockFetch.setRoute(
      '/celebrations/seen',
      new Response('{}', { status: 500 }),
    );
    const Wrapper = createWrapper();

    render(<HomeScreen />, { wrapper: Wrapper });

    // Trigger the onAllComplete callback to simulate celebration completion
    expect(mockOnAllComplete).not.toBeNull();
    await act(async () => {
      mockOnAllComplete?.();
    });

    // The error must be logged — not silently swallowed
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Celebrations] Failed to mark as seen, will retry on next visit:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
