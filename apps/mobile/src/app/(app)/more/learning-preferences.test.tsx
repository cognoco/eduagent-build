import { fireEvent } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
} from '../../../test-utils/screen-render';

const mockPush = jest.fn();

let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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

const LearningPreferencesScreen = require('./learning-preferences').default;

const activeProfile = createTestProfile({
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
  birthYear: 1990,
});

const childProfile = createTestProfile({
  id: 'child-1',
  displayName: 'Emma',
  isOwner: false,
  birthYear: 2015,
});

function learnerProfileRoute(accommodationMode = 'none') {
  return { '/learner-profile': { profile: { accommodationMode } } };
}

/**
 * Routes for child-mode: parent has one accommodation mode, child has another.
 * The child endpoint is keyed first so it wins the substring match over the
 * parent-only key ('/learner-profile' would also match '/learner-profile/child-1').
 */
function childModeRoutes(
  childAccommodationMode = 'none',
  parentAccommodationMode = 'short-burst',
) {
  return {
    '/learner-profile/child-1': {
      profile: { accommodationMode: childAccommodationMode },
    },
    '/learner-profile': {
      profile: { accommodationMode: parentAccommodationMode },
    },
  };
}

describe('LearningPreferencesScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('renders accommodation as the preferences nav row', () => {
    active = renderScreen(<LearningPreferencesScreen />, {
      profile: activeProfile,
      routes: learnerProfileRoute(),
    });

    active.result.getByTestId('learning-accommodation-section-header');
    active.result.getByTestId('accommodation-link');
    expect(
      active.result.queryByTestId('mentor-memory-section-header'),
    ).toBeNull();
    expect(active.result.queryByTestId('mentor-memory-link')).toBeNull();
  });

  it('navigates to accommodation screen when row is pressed', () => {
    active = renderScreen(<LearningPreferencesScreen />, {
      profile: activeProfile,
      routes: learnerProfileRoute(),
    });

    fireEvent.press(active.result.getByTestId('accommodation-link'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/accommodation');
  });

  it('shows the active accommodation mode name on the row', async () => {
    active = renderScreen(<LearningPreferencesScreen />, {
      profile: activeProfile,
      routes: learnerProfileRoute('short-burst'),
    });

    await active.result.findByText('Short-Burst');
  });

  describe('child mode (childProfileId query param)', () => {
    beforeEach(() => {
      mockSearchParams = { childProfileId: 'child-1' };
    });

    it("shows the child's name in the screen title", () => {
      active = renderScreen(<LearningPreferencesScreen />, {
        profile: activeProfile,
        profiles: [activeProfile, childProfile],
        routes: learnerProfileRoute(),
      });

      expect(
        active.result.getByText("Emma's learning preferences"),
      ).toBeTruthy();
    });

    it('navigates to accommodation screen with childProfileId when row is pressed', () => {
      active = renderScreen(<LearningPreferencesScreen />, {
        profile: activeProfile,
        profiles: [activeProfile, childProfile],
        routes: learnerProfileRoute(),
      });

      fireEvent.press(active.result.getByTestId('accommodation-link'));

      expect(mockPush).toHaveBeenCalledWith(
        '/(app)/more/accommodation?childProfileId=child-1',
      );
    });

    // F-163 regression: child mode must show the CHILD's accommodation, not the
    // parent's. Parent has 'short-burst', child has 'none' — the row label must
    // NOT show 'Short-Burst'.
    it("shows the child's accommodation mode, not the parent's (F-163)", async () => {
      active = renderScreen(<LearningPreferencesScreen />, {
        profile: activeProfile,
        profiles: [activeProfile, childProfile],
        routes: childModeRoutes('none', 'short-burst'),
      });

      // Wait for async query to resolve, then assert the parent's mode is absent.
      // The row falls back to the 'view and manage' label when mode is 'none'.
      await active.result.findByTestId('accommodation-link');
      expect(active.result.queryByText('Short-Burst')).toBeNull();
    });
  });
});
