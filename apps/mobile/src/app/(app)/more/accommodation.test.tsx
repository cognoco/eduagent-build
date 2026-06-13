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
// hooks; the real useLearnerProfile / useChildLearnerProfile /
// useUpdateAccommodationMode hooks run against the routed mock fetch.

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
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

const AccommodationScreen = require('./accommodation').default;

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

function modeRoute(mode = 'none') {
  return {
    '/learner-profile': { profile: { accommodationMode: mode } },
  };
}

describe('AccommodationScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    mockSearchParams = {};
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
    jest.clearAllMocks();
  });

  it('renders all four accommodation mode cards', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('none'),
    });

    await waitFor(() => {
      active!.result.getByTestId('accommodation-mode-none');
    });
    active.result.getByTestId('accommodation-mode-short-burst');
    active.result.getByTestId('accommodation-mode-audio-first');
    active.result.getByTestId('accommodation-mode-predictable');
  });

  it('PATCHes accommodation mode when a card is pressed', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('none'),
    });

    await waitFor(() => {
      active!.result.getByTestId('accommodation-mode-short-burst');
    });
    await act(async () => {
      fireEvent.press(
        active!.result.getByTestId('accommodation-mode-short-burst'),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      const patches = fetchCallsMatching(
        active!.routedFetch,
        '/learner-profile',
      ).filter((c) => c.init?.method === 'PATCH');
      expect(patches.length).toBeGreaterThanOrEqual(1);
      expect(extractJsonBody(patches[patches.length - 1]?.init)).toEqual({
        accommodationMode: 'short-burst',
      });
    });
  });

  it('shows the celebration settings link only for short-burst and predictable', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('short-burst'),
    });

    await waitFor(() => {
      active!.result.getByTestId('celebration-followup-short-burst');
    });
    active.result.getByTestId('celebration-settings-link');
    active.cleanup();

    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('predictable'),
    });
    await waitFor(() => {
      active!.result.getByTestId('celebration-followup-predictable');
    });
    active.cleanup();

    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('audio-first'),
    });
    await waitFor(() => {
      active!.result.getByTestId('accommodation-mode-audio-first');
    });
    expect(active.result.queryByTestId('celebration-settings-link')).toBeNull();
  });

  it('opens the central celebrations screen from the follow-up link', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('predictable'),
    });

    await waitFor(() => {
      active!.result.getByTestId('celebration-settings-link');
    });
    fireEvent.press(active.result.getByTestId('celebration-settings-link'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/celebrations');
  });

  it('renders an error block with retry when the learner profile fails to load', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: {
        '/learner-profile': () =>
          ERROR_RESPONSES.forbidden('nope', 'FORBIDDEN'),
      },
    });

    await active.result.findByTestId('accommodation-mode-retry');
    const before = fetchCallsMatching(
      active.routedFetch,
      '/learner-profile',
    ).length;
    await act(async () => {
      fireEvent.press(active!.result.getByTestId('accommodation-mode-retry'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        fetchCallsMatching(active!.routedFetch, '/learner-profile').length,
      ).toBeGreaterThan(before);
    });
  });

  it('renders a go-back button in the error state and calls goBackOrReplace on press', async () => {
    mockCanGoBack.mockReturnValue(false);
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: {
        '/learner-profile': () =>
          ERROR_RESPONSES.forbidden('nope', 'FORBIDDEN'),
      },
    });

    await active.result.findByTestId('accommodation-mode-error-back');
    fireEvent.press(active.result.getByTestId('accommodation-mode-error-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('toggles the "Not sure which to pick?" guide', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('none'),
    });

    await waitFor(() => {
      active!.result.getByTestId('accommodation-guide-toggle');
    });
    expect(
      active.result.queryByTestId('accommodation-guide-content'),
    ).toBeNull();

    fireEvent.press(active.result.getByTestId('accommodation-guide-toggle'));
    active.result.getByTestId('accommodation-guide-content');
    active.result.getByTestId('guide-pick-short-burst');
    active.result.getByTestId('guide-pick-audio-first');
    active.result.getByTestId('guide-pick-predictable');
    active.result.getByTestId('guide-pick-none');
  });

  it('selects accommodation mode from the guide and closes it', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('none'),
    });

    await waitFor(() => {
      active!.result.getByTestId('accommodation-guide-toggle');
    });
    fireEvent.press(active.result.getByTestId('accommodation-guide-toggle'));
    await act(async () => {
      fireEvent.press(active!.result.getByTestId('guide-pick-audio-first'));
      await Promise.resolve();
    });

    await waitFor(() => {
      const patches = fetchCallsMatching(
        active!.routedFetch,
        '/learner-profile',
      ).filter((c) => c.init?.method === 'PATCH');
      expect(patches.length).toBeGreaterThanOrEqual(1);
      expect(extractJsonBody(patches[patches.length - 1]?.init)).toEqual({
        accommodationMode: 'audio-first',
      });
    });
    expect(
      active.result.queryByTestId('accommodation-guide-content'),
    ).toBeNull();
  });

  it('shows "Active" marker on the current mode in the guide', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('audio-first'),
    });

    await waitFor(() => {
      active!.result.getByTestId('accommodation-guide-toggle');
    });
    fireEvent.press(active.result.getByTestId('accommodation-guide-toggle'));

    await waitFor(() => {
      expect(active!.result.getByText(/Audio-First · Active/)).toBeTruthy();
    });
  });

  describe('child mode (childProfileId param)', () => {
    beforeEach(() => {
      mockSearchParams = { childProfileId: 'child-1' };
    });

    it('shows the child name in the title', async () => {
      active = renderScreen(<AccommodationScreen />, {
        profile: owner,
        profiles: [owner, child],
        routes: modeRoute('none'),
      });

      await waitFor(() => {
        expect(
          active!.result.getByText(/Mia's learning preferences/),
        ).toBeTruthy();
      });
    });

    it('passes childProfileId when changing accommodation mode', async () => {
      active = renderScreen(<AccommodationScreen />, {
        profile: owner,
        profiles: [owner, child],
        routes: modeRoute('none'),
      });

      await waitFor(() => {
        active!.result.getByTestId('accommodation-mode-short-burst');
      });
      await act(async () => {
        fireEvent.press(
          active!.result.getByTestId('accommodation-mode-short-burst'),
        );
        await Promise.resolve();
      });

      await waitFor(() => {
        const patches = fetchCallsMatching(
          active!.routedFetch,
          '/learner-profile',
        ).filter((c) => c.init?.method === 'PATCH');
        expect(patches.length).toBeGreaterThanOrEqual(1);
        expect(extractJsonBody(patches[patches.length - 1]?.init)).toEqual({
          accommodationMode: 'short-burst',
        });
        // The child PATCH targets the child profile route.
        expect(patches[patches.length - 1]?.url).toContain('child-1');
      });
    });

    it('preserves childProfileId when opening the central celebrations screen', async () => {
      active = renderScreen(<AccommodationScreen />, {
        profile: owner,
        profiles: [owner, child],
        routes: modeRoute('predictable'),
      });

      await waitFor(() => {
        active!.result.getByTestId('celebration-settings-link');
      });
      fireEvent.press(active.result.getByTestId('celebration-settings-link'));

      expect(mockPush).toHaveBeenCalledWith(
        '/(app)/more/celebrations?childProfileId=child-1',
      );
    });

    it('returns to the learner More root when a cached child-editing route opens outside parent mode', async () => {
      // Active profile is the child (non-owner) — the showAccommodationChildEditor
      // gate is owner-only, so canEditChildPreferences is false and the screen
      // redirects back to /(app)/more.
      active = renderScreen(<AccommodationScreen />, {
        profile: child,
        profiles: [owner, child],
        routes: modeRoute('none'),
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
      });
      expect(
        active.result.queryByText(/Mia's learning preferences/),
      ).toBeNull();
    });
  });

  describe('back navigation', () => {
    it('calls router.back() when back stack exists', async () => {
      mockCanGoBack.mockReturnValue(true);
      active = renderScreen(<AccommodationScreen />, {
        profile: owner,
        routes: modeRoute('none'),
      });

      await waitFor(() => {
        active!.result.getByTestId('accommodation-back');
      });
      fireEvent.press(active.result.getByTestId('accommodation-back'));

      expect(mockBack).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('replaces to the More hub when no back stack', async () => {
      mockCanGoBack.mockReturnValue(false);
      active = renderScreen(<AccommodationScreen />, {
        profile: owner,
        routes: modeRoute('none'),
      });

      await waitFor(() => {
        active!.result.getByTestId('accommodation-back');
      });
      fireEvent.press(active.result.getByTestId('accommodation-back'));

      expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('replaces to the child settings route in child-editing mode', async () => {
      mockSearchParams = { childProfileId: 'child-1' };
      mockCanGoBack.mockReturnValue(false);
      active = renderScreen(<AccommodationScreen />, {
        profile: owner,
        profiles: [owner, child],
        routes: modeRoute('none'),
      });

      await waitFor(() => {
        active!.result.getByTestId('accommodation-back');
      });
      fireEvent.press(active.result.getByTestId('accommodation-back'));

      expect(mockReplace).toHaveBeenCalledWith(
        '/(app)/child/child-1?mode=settings',
      );
      expect(mockBack).not.toHaveBeenCalled();
    });
  });
});
