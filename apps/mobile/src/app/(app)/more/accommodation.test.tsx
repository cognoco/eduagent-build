import { fireEvent, act, waitFor } from '@testing-library/react-native';
import type { AccommodationMode, LearningProfile } from '@eduagent/schemas';
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
let mockSafeAreaTop = 0;

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
    useSafeAreaInsets: () => ({
      top: mockSafeAreaTop,
      bottom: 0,
      left: 0,
      right: 0,
    }),
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

function modeRoute(mode: AccommodationMode = 'none') {
  const profile: LearningProfile = {
    id: '10000000-0000-4000-8000-000000000011',
    profileId: '10000000-0000-4000-8000-000000000012',
    learningStyle: null,
    interests: [],
    strengths: [],
    struggles: [],
    communicationNotes: [],
    suppressedInferences: [],
    interestTimestamps: {},
    effectivenessSessionCount: 0,
    memoryEnabled: true,
    memoryConsentStatus: 'granted',
    memoryCollectionEnabled: true,
    memoryInjectionEnabled: true,
    accommodationMode: mode,
    recentlyResolvedTopics: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    '/learner-profile': { profile },
  };
}

describe('AccommodationScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    mockSearchParams = {};
    mockSafeAreaTop = 0;
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

  it.each([
    { shell: 'flags-off', v0: false, v1: false, v2: false, expected: 47 },
    { shell: 'V0', v0: true, v1: false, v2: false, expected: 47 },
    { shell: 'V1', v0: true, v1: true, v2: false, expected: 47 },
    { shell: 'V2', v0: true, v1: true, v2: true, expected: 0 },
  ])(
    'owns the native top inset on $shell only when the root does not',
    async ({ v0, v1, v2, expected }) => {
      const flags = require('../../../lib/feature-flags') as {
        FEATURE_FLAGS: {
          MODE_NAV_V0_ENABLED: boolean;
          MODE_NAV_V1_ENABLED: boolean;
          MODE_NAV_V2_ENABLED: boolean;
        };
      };
      const original = { ...flags.FEATURE_FLAGS };
      try {
        Object.assign(flags.FEATURE_FLAGS, {
          MODE_NAV_V0_ENABLED: v0,
          MODE_NAV_V1_ENABLED: v1,
          MODE_NAV_V2_ENABLED: v2,
        });
        mockSafeAreaTop = 47;
        active = renderScreen(<AccommodationScreen />, {
          profile: owner,
          routes: modeRoute('none'),
        });

        expect(
          (await active.result.findByTestId('accommodation-screen')).props.style
            ?.paddingTop ?? 0,
        ).toBe(expected);
      } finally {
        Object.assign(flags.FEATURE_FLAGS, original);
      }
    },
  );

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

  // [WI-875] Picker restore/no-op edge: handleSelectAccommodation early-returns
  // when the pressed mode equals the current mode (`if (mode === currentMode)
  // return;`), so re-selecting the already-active card must NOT fire a PATCH.
  it('does not PATCH when the already-active mode is re-selected', async () => {
    active = renderScreen(<AccommodationScreen />, {
      profile: owner,
      routes: modeRoute('short-burst'),
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

    // Allow any erroneous mutation a tick to flush, then assert none happened.
    await act(async () => {
      await Promise.resolve();
    });
    const patches = fetchCallsMatching(
      active.routedFetch,
      '/learner-profile',
    ).filter((c) => c.init?.method === 'PATCH');
    expect(patches).toHaveLength(0);
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
