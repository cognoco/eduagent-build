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
} from '../../../test-utils/screen-render-harness';
import { AppContextProvider } from '../../lib/app-context';
import { FEATURE_FLAGS } from '../../lib/feature-flags';

const mockFetch = createRoutedMockFetch({
  '/celebrations/pending': { pendingCelebrations: [] },
  '/learner-profile': { profile: { accommodationMode: 'none' } },
  '/settings/celebration-level': { celebrationLevel: 'all' },
});

jest.mock(
  '../../lib/api-client',
  /* gc1-allow: test boundary - avoids real Hono fetch client and network calls */ () =>
    require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

let mockOnAllComplete: (() => void) | null = null;

jest.mock(
  '../../hooks/use-celebration' /* gc1-allow: avoids native celebration animation timers and async side effects in render tests */,
  () => ({
    useCelebration: ({ onAllComplete }: { onAllComplete: () => void }) => {
      mockOnAllComplete = onAllComplete;
      return { CelebrationOverlay: null };
    },
  }),
);

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock(
  '../../components/home' /* gc1-allow: avoids full native component tree render; home.test.tsx tests routing logic not component internals */,
  () => {
    const { Text, View } = require('react-native');
    return {
      LearnerScreen: ({ mode }: { mode?: string | null }) => (
        <View testID="learner-screen">
          <Text>LearnerScreen</Text>
          <Text>mode:{mode ?? 'none'}</Text>
        </View>
      ),
    };
  },
);

const HomeScreen = require('./home').default;

function createModeScreenWrapper(
  options: Parameters<typeof createScreenWrapper>[0],
) {
  const { wrapper: BaseWrapper, ...rest } = createScreenWrapper(options);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <BaseWrapper>
      <AppContextProvider>{children}</AppContextProvider>
    </BaseWrapper>
  );

  return { wrapper: Wrapper, ...rest };
}

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

describe('HomeScreen mode switch', () => {
  const originalFlag = FEATURE_FLAGS.MODE_NAV_V0_ENABLED;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      true;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      originalFlag;
  });

  it('switches the Family home chip to My Learning', () => {
    const parent = createTestProfile({
      id: 'p1',
      displayName: 'Maria',
      isOwner: true,
      birthYear: 1985,
    });
    const child = createTestProfile({
      id: 'c1',
      displayName: 'Emma',
      isOwner: false,
      birthYear: 2014,
    });
    const { wrapper } = createModeScreenWrapper({
      activeProfile: parent,
      profiles: [parent, child],
    });

    render(<HomeScreen />, { wrapper });

    screen.getByText('mode:family');

    fireEvent.press(screen.getByTestId('home-mode-chip'));

    screen.getByText('mode:study');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/home');
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
      .mockImplementation(jest.fn());
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
