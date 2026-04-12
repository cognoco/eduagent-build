import { render, screen } from '@testing-library/react-native';

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
  useMarkCelebrationsSeen: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../hooks/use-celebration', () => ({
  useCelebration: () => ({ CelebrationOverlay: null }),
}));

jest.mock('../../hooks/use-settings', () => ({
  useCelebrationLevel: () => ({ data: 'all' }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
  });

  it('renders Add First Child screen for owner with no children (free tier)', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockSubscriptionTier = 'free';

    render(<HomeScreen />);

    expect(screen.getByTestId('add-first-child-screen')).toBeTruthy();
    expect(screen.queryByTestId('parent-gateway')).toBeNull();
    expect(screen.queryByTestId('learner-screen')).toBeNull();
  });

  it('renders Add First Child screen for owner with no children (plus tier)', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;
    mockSubscriptionTier = 'plus';

    render(<HomeScreen />);

    expect(screen.getByTestId('add-first-child-screen')).toBeTruthy();
    expect(screen.queryByTestId('learner-screen')).toBeNull();
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
