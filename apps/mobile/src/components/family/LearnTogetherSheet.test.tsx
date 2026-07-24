/**
 * LearnTogetherSheet — composition + navigation-contract gating.
 *
 * Exercises the REAL navigation contract (no internal mocks): the clone
 * affordance shows only when the family `showLearnThisToo` gate resolves true
 * and the latest recap carries a topic. Gate ON is driven by seeding a family
 * (guardian) profile + family subscription with MODE_NAV_V1 enabled — the same
 * proven setup as recaps/index.test.tsx. Gate OFF falls out of a solo profile.
 */

import { fireEvent, waitFor } from '@testing-library/react-native';
import type { DashboardChild, Profile, RecapListItem } from '@eduagent/schemas';
import type { RoutedMockFetch } from '../../test-utils/mock-api-routes';

// The navigation contract reads MODE_NAV_V1_ENABLED at module-load time. Set it
// before any app module is required so the real contract can resolve the family
// (guardian) shape that opens the showLearnThisToo gate.
process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V1 = 'true';

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../lib/api-client', // gc1-allow: fetch boundary — real hooks (useNavigationContract, useSubscriptionStatus, useCloneFromChild) run against a controlled mock fetch
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  // gc1-allow: expo-router requires a native navigation container unavailable in JSDOM
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    replace: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  // gc1-allow: requires native SafeAreaProvider — not available in JSDOM
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// react-i18next is NOT mocked — test-setup.ts boots real i18next with en.json.
// theme is NOT mocked — useThemeColors resolves the real light tokens.

// Loaded via require() AFTER the env assignment so FEATURE_FLAGS picks up V1.
const { renderScreen, createTestProfile } =
  require('../../test-utils/screen-render') as typeof import('../../test-utils/screen-render');
const { LearnTogetherSheet } =
  require('./LearnTogetherSheet') as typeof import('./LearnTogetherSheet');

const GUARDIAN = createTestProfile({
  id: '11111111-1111-4111-8111-111111111111',
  accountId: 'account-family',
  displayName: 'Parent',
  isOwner: true,
  birthYear: 1985,
  hasFamilyLinks: true,
  defaultAppContext: 'family',
});

const LINKED_CHILD = createTestProfile({
  id: '22222222-2222-4222-8222-222222222222',
  accountId: 'account-family',
  displayName: 'Emma',
  isOwner: false,
  birthYear: 2012,
});

const SOLO_OWNER = createTestProfile({
  id: '33333333-3333-4333-8333-333333333333',
  accountId: 'account-solo',
  displayName: 'Sam',
  isOwner: true,
  birthYear: 1990,
  hasFamilyLinks: false,
  defaultAppContext: null,
});

const FAMILY_SUBSCRIPTION = {
  status: {
    tier: 'family',
    effectiveAccessTier: 'family',
    billingAccess: 'current',
    status: 'active',
    monthlyLimit: 2000,
    usedThisMonth: 12,
    dailyLimit: null,
    usedToday: 3,
  },
};

function activeDashboardChild(): DashboardChild {
  return {
    profileId: LINKED_CHILD.id,
    displayName: 'Emma',
    consentStatus: null,
    respondedAt: null,
    summary: '',
    sessionsThisWeek: 3,
    sessionsLastWeek: 1,
    totalTimeThisWeek: 40,
    totalTimeLastWeek: 20,
    exchangesThisWeek: 10,
    exchangesLastWeek: 5,
    trend: 'up',
    subjects: [{ name: 'Fractions', retentionStatus: 'strong' }],
    guidedVsImmediateRatio: 0,
    retentionTrend: 'stable',
    totalSessions: 12,
    currentlyWorkingOn: ['Fractions'],
    currentStreak: 0,
    longestStreak: 0,
    totalXp: 0,
  };
}

function recapWithTopic(): RecapListItem {
  return {
    recapId: 'r1',
    sessionId: 's1',
    childProfileId: LINKED_CHILD.id,
    childDisplayName: 'Emma',
    subjectId: '44444444-4444-4444-8444-444444444444',
    subjectName: 'Maths',
    topicId: '55555555-5555-4555-8555-555555555555',
    topicTitle: 'Fractions',
    sessionType: 'learning',
    startedAt: '2026-05-29T10:00:00.000Z',
    endedAt: '2026-05-29T10:30:00.000Z',
    exchangeCount: 5,
    displayTitle: 'Maths session',
    displaySummary: null,
    highlight: null,
    narrative: null,
    conversationPrompt: null,
    engagementSignal: null,
    nextTopicTitle: null,
    nextTopicReason: null,
    verifiedProof: { status: 'absent' },
  };
}

beforeEach(() => {
  mockPush.mockClear();
});

describe('LearnTogetherSheet', () => {
  it('shows the clone affordance when the family gate is open and a recap topic exists', async () => {
    mockFetch.setRoute('/subscription/status', FAMILY_SUBSCRIPTION);

    const { result } = renderScreen(
      <LearnTogetherSheet
        child={LINKED_CHILD as Profile}
        dashboardChild={activeDashboardChild()}
        latestRecap={recapWithTopic()}
        onClose={jest.fn()}
      />,
      {
        profile: GUARDIAN,
        profiles: [GUARDIAN, LINKED_CHILD],
        installGlobalFetch: false,
      },
    );

    await waitFor(() => {
      expect(result.queryByTestId('add-to-my-learning')).not.toBeNull();
    });
    // The "try together" proposals also render.
    expect(
      result.queryByTestId('learn-together-proposals-section'),
    ).not.toBeNull();
  });

  it('hides the clone affordance when the gate is closed but still shows proposals', async () => {
    mockFetch.setRoute('/subscription/status', FAMILY_SUBSCRIPTION);

    const { result } = renderScreen(
      <LearnTogetherSheet
        child={SOLO_OWNER as Profile}
        dashboardChild={activeDashboardChild()}
        latestRecap={recapWithTopic()}
        onClose={jest.fn()}
      />,
      {
        profile: SOLO_OWNER,
        profiles: [SOLO_OWNER],
        installGlobalFetch: false,
      },
    );

    // Proposals render synchronously from the pure prompt builder.
    expect(
      result.queryByTestId('learn-together-proposals-section'),
    ).not.toBeNull();
    expect(result.queryByTestId('learn-together-clone-section')).toBeNull();
    expect(result.queryByTestId('add-to-my-learning')).toBeNull();
  });

  it('renders the empty state with a library escape when nothing is available', () => {
    mockFetch.setRoute('/subscription/status', FAMILY_SUBSCRIPTION);

    const { result } = renderScreen(
      <LearnTogetherSheet
        child={SOLO_OWNER as Profile}
        dashboardChild={undefined}
        latestRecap={null}
        onClose={jest.fn()}
      />,
      {
        profile: SOLO_OWNER,
        profiles: [SOLO_OWNER],
        installGlobalFetch: false,
      },
    );

    expect(result.queryByTestId('learn-together-empty')).not.toBeNull();
    expect(result.queryByTestId('learn-together-clone-section')).toBeNull();
    expect(result.queryByTestId('learn-together-proposals-section')).toBeNull();
  });

  it('calls onClose from the close button', () => {
    mockFetch.setRoute('/subscription/status', FAMILY_SUBSCRIPTION);
    const onClose = jest.fn();

    const { result } = renderScreen(
      <LearnTogetherSheet
        child={SOLO_OWNER as Profile}
        dashboardChild={activeDashboardChild()}
        latestRecap={null}
        onClose={onClose}
      />,
      {
        profile: SOLO_OWNER,
        profiles: [SOLO_OWNER],
        installGlobalFetch: false,
      },
    );

    fireEvent.press(result.getByTestId('learn-together-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
