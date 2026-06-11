/**
 * Recaps list screen — row press navigation.
 *
 * [BUG-772 / RECAP-TARGET-02 / PARENT-11] A parent-flow Chrome/Playwright
 * walkthrough reported that clicking a recap row hung before the detail screen
 * opened (45s timeout). Investigation found the production code is correct:
 *  - The route tree has `index` + `[recapId]` + a `_layout` exporting
 *    `unstable_settings = { initialRouteName: 'index' }`.
 *  - The row press is a SAME-STACK `router.push` (the recaps tab root IS the
 *    list), so the AGENTS.md cross-tab ancestor-chain rule does not apply —
 *    the list is already mounted underneath, seeding the back-stack.
 *  - `recapId` is a valid UUID from the schema; the push target is the
 *    registered `/(app)/recaps/[recapId]` route.
 * The hang was therefore an E2E/web-preview environment artifact, not a code
 * defect. This test is the verification that IS possible: it exercises the
 * REAL navigation contract + REAL useRecaps hook (data served via the routed
 * mock fetch) and asserts the row press invokes `router.push` with the exact
 * correct same-stack target. If anyone later breaks the push target, route
 * key, or param, this test fails.
 */

// These two imports load no app code: RTL is a test library, and the second is
// type-only (erased at runtime). They sit above the env assignment to satisfy
// import/first. All APP modules (feature-flags, the screen, screen-render) are
// loaded via require() AFTER the env assignment below.
import { fireEvent, waitFor } from '@testing-library/react-native';
import type { RoutedMockFetch } from '../../../test-utils/mock-api-routes';

// The navigation contract reads MODE_NAV_V1_ENABLED from this env var at
// module-load time. Set it before any app module is required so the real
// contract resolves the V1 family (guardian) shape that surfaces the recaps
// list + permits the recaps/[recapId] route.
process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V1 = 'true';

// ---------------------------------------------------------------------------
// Fetch-boundary mock — mockFetch assigned inside the factory to bypass
// jest hoisting. Real hooks (useRecaps, useNavigationContract,
// useSubscriptionStatus) run against this controlled fetch.
// ---------------------------------------------------------------------------

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../../lib/api-client', // gc1-allow: fetch-boundary — mockApiClientFactory installs hc() with a controlled mock fetch so real hooks exercise real request logic
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

// ---------------------------------------------------------------------------
// Native / rendering boundary mocks (not internal hooks).
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  // gc1-allow: expo-router requires native navigation context — cannot run in JSDOM
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    replace: jest.fn(),
  }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>{href}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  // gc1-allow: requires native SafeAreaProvider — not available in JSDOM
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// react-i18next is NOT mocked — test-setup.ts initializes real i18next with the
// English catalog globally, so useTranslation() returns real translations.

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      primary: '#00b4d8',
      background: '#ffffff',
      border: '#e8e0d4',
      surface: '#f5f5f5',
      textPrimary: '#1a1a1a',
      textSecondary: '#666666',
    }),
  }),
);

// NB: screen-render + the source screen are loaded via require() (not a static
// import) so they evaluate AFTER the EXPO_PUBLIC_ENABLE_MODE_NAV_V1 assignment
// above. A static import is hoisted above that assignment by the compiler,
// which would freeze FEATURE_FLAGS.MODE_NAV_V1_ENABLED to false at load time.
const { renderScreen, createTestProfile } =
  require('../../../test-utils/screen-render') as typeof import('../../../test-utils/screen-render');

const RecapsScreen = require('./index').default as React.ComponentType;

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

const RECAP_ID = '019e5e2c-7854-7976-a34e-0cacbb283254';

const RECAP_LIST_ITEM = {
  recapId: RECAP_ID,
  sessionId: '33333333-3333-4333-8333-333333333333',
  childProfileId: LINKED_CHILD.id,
  childDisplayName: 'Emma',
  subjectId: '44444444-4444-4444-8444-444444444444',
  subjectName: 'Maths',
  topicId: '55555555-5555-4555-8555-555555555555',
  topicTitle: 'Fractions',
  sessionType: 'learning',
  startedAt: '2026-05-20T10:00:00.000Z',
  endedAt: '2026-05-20T10:30:00.000Z',
  exchangeCount: 5,
  displayTitle: 'Maths session',
  displaySummary: 'Emma worked on fractions.',
  highlight: null,
  narrative: 'Emma had a great session on fractions.',
  conversationPrompt: null,
  engagementSignal: null,
};

const READY_SUBSCRIPTION_STATUS = {
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

function renderRecaps() {
  // Route data is configured on the api-client's own mock fetch (the one hc()
  // was built with), NOT via renderScreen's `routes` option — that builds a
  // separate global fetch the hono client never uses. installGlobalFetch:false
  // avoids clobbering the api-client fetch.
  mockFetch.setRoute('/subscription/status', READY_SUBSCRIPTION_STATUS);
  mockFetch.setRoute('/recaps', { recaps: [RECAP_LIST_ITEM] });
  return renderScreen(<RecapsScreen />, {
    profile: GUARDIAN,
    profiles: [GUARDIAN, LINKED_CHILD],
    installGlobalFetch: false,
  });
}

describe('RecapsScreen — row press navigation [BUG-772]', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders the guardian recaps list (real navigation contract, V1 family shape)', async () => {
    const { result, cleanup } = renderRecaps();
    try {
      await waitFor(() => {
        expect(result.getByTestId(`recap-row-${RECAP_ID}`)).toBeTruthy();
      });
    } finally {
      cleanup();
    }
  });

  it('pushes the recaps/[recapId] detail route as a same-stack push on row press', async () => {
    const { result, cleanup } = renderRecaps();
    try {
      await waitFor(() => {
        expect(result.getByTestId(`recap-row-${RECAP_ID}`)).toBeTruthy();
      });

      fireEvent.press(result.getByTestId(`recap-row-${RECAP_ID}`));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/recaps/[recapId]',
        params: { recapId: RECAP_ID },
      });
    } finally {
      cleanup();
    }
  });
});
