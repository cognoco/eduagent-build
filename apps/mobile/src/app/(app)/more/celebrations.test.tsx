import { fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockCelebrationLevelMutate = jest.fn();
const mockChildCelebrationLevelMutate = jest.fn();
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
let mockCelebrationLevel: 'all' | 'big_only' | 'off' | undefined = 'big_only';
let mockChildCelebrationLevel: 'all' | 'big_only' | 'off' | undefined =
  'big_only';
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
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
    useChildCelebrationLevel: () => ({
      data: mockChildCelebrationLevel,
      isLoading: false,
    }),
    useUpdateChildCelebrationLevel: () => ({
      mutate: mockChildCelebrationLevelMutate,
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

const CelebrationsScreen = require('./celebrations').default;

describe('CelebrationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
      birthYear: 1990,
    };
    mockProfiles = [mockActiveProfile];
    mockCelebrationLevel = 'big_only';
    mockChildCelebrationLevel = 'big_only';
    mockSearchParams = {};
    mockCanGoBack.mockReturnValue(false);
  });

  it('renders the central celebration level options', () => {
    render(<CelebrationsScreen />);

    screen.getByTestId('celebration-level-all');
    screen.getByTestId('celebration-level-big-only');
    screen.getByTestId('celebration-level-off');
    screen.getByText('Big milestones only');
  });

  it('updates the signed-in learner celebration level', () => {
    render(<CelebrationsScreen />);

    fireEvent.press(screen.getByTestId('celebration-level-off'));

    expect(mockCelebrationLevelMutate).toHaveBeenCalledWith(
      'off',
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(mockChildCelebrationLevelMutate).not.toHaveBeenCalled();
  });

  it('updates a child celebration level when childProfileId is present', () => {
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

    render(<CelebrationsScreen />);

    screen.getByText("Mia's celebration settings");
    fireEvent.press(screen.getByTestId('celebration-level-off'));

    expect(mockChildCelebrationLevelMutate).toHaveBeenCalledWith(
      { childProfileId: 'child-1', celebrationLevel: 'off' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(mockCelebrationLevelMutate).not.toHaveBeenCalled();
  });

  it('returns to the matching child accommodation screen when there is no back stack', () => {
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

    render(<CelebrationsScreen />);

    fireEvent.press(screen.getByTestId('celebrations-back'));

    expect(mockReplace).toHaveBeenCalledWith(
      '/(app)/more/accommodation?childProfileId=child-1',
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('leaves child-editing mode when the active profile is not the owner', () => {
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
    mockSearchParams = { childProfileId: 'child-1' };

    render(<CelebrationsScreen />);

    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
  });
});
