import { fireEvent, act, waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
  ERROR_RESPONSES,
} from '../../../test-utils/screen-render';
import {
  fetchCallsMatching,
  extractJsonBody,
} from '../../../test-utils/mock-api-routes';

// ─── Boundary mocks (native/external runtime only) ──────────────────────
//
// The real ProfileContext drives the real useProfile and useNavigationContract
// hooks; the real useCelebrationLevel / useChildCelebrationLevel /
// useUpdateCelebrationLevel / useUpdateChildCelebrationLevel hooks run against
// the routed mock fetch installed by renderScreen.

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock(
  '@expo/vector-icons/Ionicons' /* gc1-allow: native-boundary — bundles native font asset */,
  () => {
    const { Text } = require('react-native');
    return function MockIonicons({ name }: { name: string }) {
      return <Text>{name}</Text>;
    };
  },
);

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native-boundary — requires native insets */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

jest.mock(
  '../../../lib/theme' /* gc1-allow: native-boundary — theme hook requires native ColorScheme */,
  () => ({
    useThemeColors: () => ({ textSecondary: '#777', primary: '#6366f1' }),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: native-boundary — wraps native Alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

const CelebrationsScreen = require('./celebrations').default;

// ─── Fixtures ────────────────────────────────────────────────────────────

const owner = createTestProfile({
  id: 'profile-1',
  accountId: 'account-1',
  displayName: 'Alex',
  isOwner: true,
  birthYear: 1990,
});

const child = createTestProfile({
  id: 'child-1',
  accountId: 'account-1',
  displayName: 'Mia',
  isOwner: false,
  birthYear: 2014,
});

function levelRoute(level: 'all' | 'big_only' | 'off' = 'big_only') {
  return { '/settings/celebration-level': { celebrationLevel: level } };
}

describe('CelebrationsScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    mockSearchParams = {};
    mockCanGoBack.mockReturnValue(false);
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
    jest.clearAllMocks();
  });

  it('renders the central celebration level options', async () => {
    active = renderScreen(<CelebrationsScreen />, {
      profile: owner,
      routes: levelRoute('big_only'),
    });

    await waitFor(() => {
      active!.result.getByTestId('celebration-level-all');
    });
    active.result.getByTestId('celebration-level-big-only');
    active.result.getByTestId('celebration-level-off');
    active.result.getByText('Big milestones only');
  });

  it('updates the signed-in learner celebration level', async () => {
    active = renderScreen(<CelebrationsScreen />, {
      profile: owner,
      routes: levelRoute('big_only'),
    });

    await waitFor(() => {
      active!.result.getByTestId('celebration-level-off');
    });
    await act(async () => {
      fireEvent.press(active!.result.getByTestId('celebration-level-off'));
      await Promise.resolve();
    });

    await waitFor(() => {
      const puts = fetchCallsMatching(
        active!.routedFetch,
        '/settings/celebration-level',
      ).filter((c) => c.init?.method === 'PUT');
      expect(puts.length).toBeGreaterThanOrEqual(1);
      // Self mutation body has no childProfileId.
      expect(extractJsonBody(puts[puts.length - 1]?.init)).toEqual({
        celebrationLevel: 'off',
      });
    });
  });

  it('updates a child celebration level when childProfileId is present', async () => {
    mockSearchParams = { childProfileId: 'child-1' };
    active = renderScreen(<CelebrationsScreen />, {
      profile: owner,
      profiles: [owner, child],
      routes: levelRoute('big_only'),
    });

    await active.result.findByText("Mia's celebration settings");
    await waitFor(() => {
      active!.result.getByTestId('celebration-level-off');
    });
    await act(async () => {
      fireEvent.press(active!.result.getByTestId('celebration-level-off'));
      await Promise.resolve();
    });

    await waitFor(() => {
      const puts = fetchCallsMatching(
        active!.routedFetch,
        '/settings/celebration-level',
      ).filter((c) => c.init?.method === 'PUT');
      expect(puts.length).toBeGreaterThanOrEqual(1);
      // Child mutation body carries the childProfileId.
      expect(extractJsonBody(puts[puts.length - 1]?.init)).toEqual({
        childProfileId: 'child-1',
        celebrationLevel: 'off',
      });
    });
  });

  it('returns to the matching child accommodation screen when there is no back stack', async () => {
    mockSearchParams = { childProfileId: 'child-1' };
    active = renderScreen(<CelebrationsScreen />, {
      profile: owner,
      profiles: [owner, child],
      routes: levelRoute('big_only'),
    });

    await active.result.findByTestId('celebrations-back');
    fireEvent.press(active.result.getByTestId('celebrations-back'));

    expect(mockReplace).toHaveBeenCalledWith(
      '/(app)/more/accommodation?childProfileId=child-1',
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('leaves child-editing mode when the active profile is not the owner', async () => {
    mockSearchParams = { childProfileId: 'child-1' };
    // Active profile is the child (non-owner) — canEditChildPreferences is
    // false, so the screen redirects back to /(app)/more.
    active = renderScreen(<CelebrationsScreen />, {
      profile: child,
      profiles: [owner, child],
      routes: levelRoute('big_only'),
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
    });
  });

  it('renders an error block with retry and go-back when the celebration query fails', async () => {
    active = renderScreen(<CelebrationsScreen />, {
      profile: owner,
      routes: {
        '/settings/celebration-level': () =>
          ERROR_RESPONSES.forbidden('nope', 'FORBIDDEN'),
      },
    });

    await active.result.findByTestId('celebrations-retry');
    active.result.getByTestId('celebrations-error-back');
    expect(active.result.queryByTestId('celebration-level-all')).toBeNull();
  });

  it('refetches when the retry button is pressed in the error state', async () => {
    active = renderScreen(<CelebrationsScreen />, {
      profile: owner,
      routes: {
        '/settings/celebration-level': () =>
          ERROR_RESPONSES.forbidden('nope', 'FORBIDDEN'),
      },
    });

    await active.result.findByTestId('celebrations-retry');
    const before = fetchCallsMatching(
      active.routedFetch,
      '/settings/celebration-level',
    ).length;

    await act(async () => {
      fireEvent.press(active!.result.getByTestId('celebrations-retry'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        fetchCallsMatching(active!.routedFetch, '/settings/celebration-level')
          .length,
      ).toBeGreaterThan(before);
    });
  });

  it('calls goBackOrReplace when the go-back button is pressed in the error state', async () => {
    mockCanGoBack.mockReturnValue(false);
    active = renderScreen(<CelebrationsScreen />, {
      profile: owner,
      routes: {
        '/settings/celebration-level': () =>
          ERROR_RESPONSES.forbidden('nope', 'FORBIDDEN'),
      },
    });

    await active.result.findByTestId('celebrations-error-back');
    fireEvent.press(active.result.getByTestId('celebrations-error-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/more/accommodation');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
