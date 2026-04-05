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

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    profiles: mockProfiles,
    activeProfile: mockActiveProfile,
    switchProfile: jest.fn(),
    isLoading: mockIsLoading,
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
  });

  it('renders LearnerScreen for solo learner (owner, no children)', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = mockProfiles[0] ?? null;

    render(<HomeScreen />);

    expect(screen.getByTestId('learner-screen')).toBeTruthy();
    expect(screen.queryByTestId('parent-gateway')).toBeNull();
  });

  // ParentGateway branch commented out (PR109-03) — _layout.tsx redirects parents
  // before this screen renders. Uncomment when adaptive home is re-enabled.
  // it('renders ParentGateway when owner profile has linked children', () => {
  //   mockProfiles = [
  //     { id: 'p1', displayName: 'Maria', isOwner: true },
  //     { id: 'c1', displayName: 'Emma', isOwner: false },
  //   ];
  //   mockActiveProfile = mockProfiles[0] ?? null;
  //
  //   render(<HomeScreen />);
  //
  //   expect(screen.getByTestId('parent-gateway')).toBeTruthy();
  //   expect(screen.queryByTestId('learner-screen')).toBeNull();
  // });

  it('renders LearnerScreen even for owner with linked children (layout redirects parents)', () => {
    mockProfiles = [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ];
    mockActiveProfile = mockProfiles[0] ?? null;

    render(<HomeScreen />);

    expect(screen.getByTestId('learner-screen')).toBeTruthy();
  });

  it('renders LearnerScreen when active profile is a child (non-owner)', () => {
    mockProfiles = [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ];
    mockActiveProfile = mockProfiles[1] ?? null;

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
  });
});
