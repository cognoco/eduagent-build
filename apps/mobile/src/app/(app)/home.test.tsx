import { render, screen, act, fireEvent } from '@testing-library/react-native';

let mockProfiles: Array<{
  id: string;
  displayName: string;
  isOwner: boolean;
}> = [];
let mockActiveProfile: {
  id: string;
  displayName: string;
  isOwner: boolean;
} | null = null;
let mockIsLoading = false;
let mockSubscriptionTier: string | undefined = undefined;

let mockMarkCelebrationsSeen = { mutateAsync: jest.fn() };
let mockOnAllComplete: (() => void) | null = null;

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    profiles: mockProfiles,
    activeProfile: mockActiveProfile,
    switchProfile: jest.fn(),
    isLoading: mockIsLoading,
  }),
}));

jest.mock('../../hooks/use-subscription', () => ({
  useSubscription: () => ({
    data:
      mockSubscriptionTier != null ? { tier: mockSubscriptionTier } : undefined,
  }),
}));

jest.mock('../../hooks/use-celebrations', () => ({
  usePendingCelebrations: () => ({ data: [] }),
  useMarkCelebrationsSeen: () => mockMarkCelebrationsSeen,
}));

jest.mock('../../hooks/use-celebration', () => ({
  useCelebration: ({ onAllComplete }: { onAllComplete: () => void }) => {
    mockOnAllComplete = onAllComplete;
    return { CelebrationOverlay: null };
  },
}));

jest.mock('../../hooks/use-settings', () => ({
  useCelebrationLevel: () => ({ data: 'all' }),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock('../../components/home', () => {
  const { Text, View } = require('react-native');
  return {
    ParentGateway: () => (
      <View testID="parent-gateway">
        <Text>ParentGateway</Text>
      </View>
    ),
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
    mockSubscriptionTier = undefined;
    mockMarkCelebrationsSeen = { mutateAsync: jest.fn() };
    mockOnAllComplete = null;
  });

  it('renders LearnerScreen for owner with no children on free tier', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockSubscriptionTier = 'free';

    render(<HomeScreen />);

    expect(screen.getByTestId('learner-screen')).toBeTruthy();
    expect(screen.queryByTestId('parent-gateway')).toBeNull();
    expect(screen.queryByTestId('add-first-child-screen')).toBeNull();
  });

  it('renders LearnerScreen for owner with no children on plus tier', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockSubscriptionTier = 'plus';

    render(<HomeScreen />);

    expect(screen.getByTestId('learner-screen')).toBeTruthy();
    expect(screen.queryByTestId('add-first-child-screen')).toBeNull();
  });

  it('renders Add First Child screen for family-tier owner with no children', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Maria', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockSubscriptionTier = 'family';

    render(<HomeScreen />);

    expect(screen.getByTestId('add-first-child-screen')).toBeTruthy();
    expect(screen.queryByTestId('learner-screen')).toBeNull();
    expect(screen.queryByTestId('parent-gateway')).toBeNull();
  });

  it('renders Add First Child screen for pro-tier owner with no children', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Maria', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockSubscriptionTier = 'pro';

    render(<HomeScreen />);

    expect(screen.getByTestId('add-first-child-screen')).toBeTruthy();
    expect(screen.queryByTestId('learner-screen')).toBeNull();
  });

  it('renders ParentGateway for owner with linked children', () => {
    mockProfiles = [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockSubscriptionTier = 'family';

    render(<HomeScreen />);

    expect(screen.getByTestId('parent-gateway')).toBeTruthy();
    expect(screen.queryByTestId('learner-screen')).toBeNull();
    expect(screen.queryByTestId('add-first-child-screen')).toBeNull();
  });

  it('renders LearnerScreen when active profile is a child (non-owner)', () => {
    mockProfiles = [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ];
    mockActiveProfile = mockProfiles[1] ?? null;
    mockSubscriptionTier = 'family';

    render(<HomeScreen />);

    expect(screen.getByTestId('learner-screen')).toBeTruthy();
    expect(screen.queryByTestId('parent-gateway')).toBeNull();
  });

  it('renders loading placeholder when profiles are still loading', () => {
    mockProfiles = [];
    mockActiveProfile = null;
    mockIsLoading = true;

    render(<HomeScreen />);

    expect(screen.queryByTestId('learner-screen')).toBeNull();
    expect(screen.queryByTestId('parent-gateway')).toBeNull();
    expect(screen.queryByTestId('add-first-child-screen')).toBeNull();
  });

  it('renders LearnerScreen when subscription is still loading (no tier yet)', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Maria', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockSubscriptionTier = undefined;

    render(<HomeScreen />);

    // Falls back to learner while subscription loads — avoids false Add Child flash
    expect(screen.getByTestId('learner-screen')).toBeTruthy();
    expect(screen.queryByTestId('add-first-child-screen')).toBeNull();
  });
});

describe('HomeScreen 3B.11: timeout error state secondary navigation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockIsLoading = true;
    mockProfiles = [];
    mockActiveProfile = null;
    mockSubscriptionTier = undefined;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the timeout error UI after 10s of loading', () => {
    render(<HomeScreen />);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.getByTestId('home-loading-timeout')).toBeTruthy();
    expect(screen.getByTestId('home-loading-retry')).toBeTruthy();
    expect(screen.getByTestId('timeout-library-button')).toBeTruthy();
    expect(screen.getByTestId('timeout-more-button')).toBeTruthy();
  });

  it('navigates to library when "Go to Library" is pressed [3B.11]', () => {
    render(<HomeScreen />);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    fireEvent.press(screen.getByTestId('timeout-library-button'));

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('navigates to more when "More options" is pressed [3B.11]', () => {
    render(<HomeScreen />);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    fireEvent.press(screen.getByTestId('timeout-more-button'));

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/more');
  });

  it('resets the timeout flag when Retry is pressed', () => {
    render(<HomeScreen />);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.getByTestId('home-loading-timeout')).toBeTruthy();

    fireEvent.press(screen.getByTestId('home-loading-retry'));

    expect(screen.queryByTestId('home-loading-timeout')).toBeNull();
  });
});

describe('HomeScreen SF-1: markCelebrationsSeen error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoading = false;
    mockSubscriptionTier = 'free';
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockOnAllComplete = null;
  });

  it('logs error when markCelebrationsSeen.mutateAsync rejects — no unhandled rejection [SF-1]', async () => {
    const consoleSpy = jest
      .spyOn(console, 'warn')
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
    // In jsdom, unhandledrejection is not fully supported; we verify via console.error
    mockMarkCelebrationsSeen = {
      mutateAsync: jest.fn().mockRejectedValue(new Error('network failure')),
    };

    render(<HomeScreen />);

    // Trigger the onAllComplete callback to simulate celebration completion
    expect(mockOnAllComplete).not.toBeNull();
    await act(async () => {
      mockOnAllComplete?.();
    });

    // The error must be logged — not silently swallowed
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Celebrations] Failed to mark as seen, will retry on next visit:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
