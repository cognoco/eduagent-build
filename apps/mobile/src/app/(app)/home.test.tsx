import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  createTestProfile,
  cleanupScreen,
} from '../../test-utils/screen-render-harness';

const mockFetch = createRoutedMockFetch({
  '/celebrations/pending': { pendingCelebrations: [] },
  '/learner-profile': { profile: { accommodationMode: 'none' } },
  '/settings/celebration-level': { celebrationLevel: 'all' },
});

jest.mock('../../lib/api-client', () =>
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

let mockOnAllComplete: (() => void) | null = null;

jest.mock('../../hooks/use-celebration', () => ({
  useCelebration: ({ onAllComplete }: { onAllComplete: () => void }) => {
    mockOnAllComplete = onAllComplete;
    return { CelebrationOverlay: null };
  },
}));

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
    mockOnAllComplete = null;
  });

  it('renders LearnerScreen for owner with no children [BUG-522]', () => {
    const owner = createTestProfile({
      id: 'p1',
      displayName: 'Alex',
      isOwner: true,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: owner,
      profiles: [owner],
    });

    render(<HomeScreen />, { wrapper });

    // BUG-522: owners without children always see LearnerScreen — no forced
    // add-child gate regardless of subscription tier
    screen.getByTestId('learner-screen');
  });

  it('renders LearnerScreen directly for owner with linked children', () => {
    const parent = createTestProfile({
      id: 'p1',
      displayName: 'Maria',
      isOwner: true,
    });
    const child = createTestProfile({
      id: 'c1',
      displayName: 'Emma',
      isOwner: false,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, child],
    });

    render(<HomeScreen />, { wrapper });

    screen.getByTestId('learner-screen');
  });

  it('renders LearnerScreen when active profile is a child (non-owner)', () => {
    const parent = createTestProfile({
      id: 'p1',
      displayName: 'Maria',
      isOwner: true,
    });
    const child = createTestProfile({
      id: 'c1',
      displayName: 'Emma',
      isOwner: false,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: child,
      profiles: [parent, child],
    });

    render(<HomeScreen />, { wrapper });

    screen.getByTestId('learner-screen');
  });

  it('renders loading placeholder when profiles are still loading', () => {
    const { wrapper } = createScreenWrapper({
      activeProfile: null,
      profiles: [],
      isLoading: true,
    });

    render(<HomeScreen />, { wrapper });

    expect(screen.queryByTestId('learner-screen')).toBeNull();
  });
});

describe('HomeScreen 3B.11: timeout error state secondary navigation', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    ({ wrapper: Wrapper } = createScreenWrapper({
      activeProfile: null,
      profiles: [],
      isLoading: true,
    }));
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
    mockOnAllComplete = null;
  });

  it('logs error when markCelebrationsSeen.mutateAsync rejects — no unhandled rejection [SF-1]', async () => {
    const consoleSpy = jest
      .spyOn(console, 'warn')
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
    // Intercept globalThis.fetch so any request that escapes the Hono
    // mock client returns a 500 without opening a real TCP socket.
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 500 }));
    mockFetch.setRoute(
      '/celebrations/seen',
      new Response('{}', { status: 500 }),
    );
    const owner = createTestProfile({
      id: 'p1',
      displayName: 'Alex',
      isOwner: true,
    });
    const { wrapper, queryClient } = createScreenWrapper({
      activeProfile: owner,
      profiles: [owner],
    });

    render(<HomeScreen />, { wrapper });

    expect(mockOnAllComplete).not.toBeNull();
    await act(async () => {
      mockOnAllComplete?.();
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Celebrations] Failed to mark as seen, will retry on next visit:',
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    await act(async () => {
      cleanupScreen(queryClient);
    });
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
