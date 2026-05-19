import { act, fireEvent, waitFor } from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
  extractJsonBody,
} from '../../../../test-utils/mock-api-routes';
import {
  renderScreen,
  NAMED_PROFILES,
} from '../../../../test-utils/screen-render';

// ─── Boundary mocks (allowed: native + i18n + transport) ────────────────

jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — returns en.json strings */,
  () => require('../../../../test-utils/mock-i18n').i18nMock,
);

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ profileId: 'child-001' }),
}));

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native-boundary */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

// Route the Hono RPC client through our mock fetch so real hooks run.
// The `mockApiClientFactory` helper indirection caused a Jest module-cache
// mismatch in this test (Hono client built inside the helper used a
// different `hono/client` instance and never reached our mockFetch). Inline
// the factory body so `require('hono/client')` resolves from the test
// file's own module context — confirmed working.
const mockFetch = createRoutedMockFetch();

jest.mock(
  '../../../../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch */,
  () => {
    const { hc } = require('hono/client');
    return {
      useApiClient: () => hc('http://localhost', { fetch: mockFetch }),
      setActiveProfileId: jest.fn(),
      setProxyMode: jest.fn(),
      setOnAuthExpired: jest.fn(),
      clearOnAuthExpired: jest.fn(),
      resetAuthExpiredGuard: jest.fn(),
      getProxyMode: jest.fn().mockReturnValue(false),
      withIdempotencyKey: jest.fn((h: Record<string, string>) => h),
      isIdempotencyReplay: jest.fn().mockReturnValue(false),
      NetworkError: class NetworkError extends Error {},
      BadRequestError: class BadRequestError extends Error {},
      ConflictError: class ConflictError extends Error {},
      ForbiddenError: class ForbiddenError extends Error {},
      NotFoundError: class NotFoundError extends Error {},
      QuotaExceededError: class QuotaExceededError extends Error {},
      RateLimitedError: class RateLimitedError extends Error {},
      ResourceGoneError: class ResourceGoneError extends Error {},
      UpstreamError: class UpstreamError extends Error {},
    };
  },
);

const ChildMentorMemoryScreen = require('./mentor-memory').default;

// ─── Test data ──────────────────────────────────────────────────────────

const childProfileBase = {
  learningStyle: null,
  interests: [
    { label: 'Football', context: 'free_time' },
    { label: 'Astronomy', context: 'school' },
  ],
  interestTimestamps: {},
  strengths: [],
  struggles: [],
  communicationNotes: [],
  suppressedInferences: [],
  memoryConsentStatus: 'granted',
  memoryCollectionEnabled: true,
  memoryInjectionEnabled: true,
};

// Guardian (owner) + linked child are required for the screen's IDOR guard:
// the URL profileId must appear in `profiles[]`.
const guardianProfile = {
  ...NAMED_PROFILES.guardian,
  id: 'profile-parent',
  accountId: 'account-family',
};
const linkedChildProfile = {
  ...NAMED_PROFILES.linkedChild,
  id: 'child-001',
  accountId: 'account-family',
  displayName: 'Emma',
};

function setRoutes(
  profileOverrides: Partial<typeof childProfileBase> = {},
): void {
  // /dashboard/children/:profileId branches: detail GET vs memory vs sessions.
  mockFetch.setRoute(
    '/dashboard/children/child-001',
    (url: string, init?: RequestInit) => {
      // Memory endpoint — hook unwraps `data.memory`.
      if (url.includes('/memory')) {
        return { memory: { categories: [] } };
      }
      // Sessions endpoint — hook returns `data.sessions`.
      if (url.includes('/sessions')) return { sessions: [] };
      if (init?.method && init.method !== 'GET') return {};
      // Child detail — hook returns `data.child`.
      return { child: { displayName: 'Emma', profileId: 'child-001' } };
    },
  );

  // /learner-profile/:profileId — GET returns the profile envelope;
  // mutations resolve generically.
  mockFetch.setRoute(
    '/learner-profile/child-001',
    (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return { profile: { ...childProfileBase, ...profileOverrides } };
      }
      return { success: true };
    },
  );

  // /onboarding/:profileId/interests/context → useUpdateInterestsContext
  mockFetch.setRoute('/onboarding/child-001/interests/context', () => ({
    success: true,
  }));
}

function renderWithGuardian() {
  return renderScreen(<ChildMentorMemoryScreen />, {
    profile: guardianProfile,
    profiles: [guardianProfile, linkedChildProfile],
    // Our mocked `useApiClient` already routes through `mockFetch`. Don't
    // also install it as `globalThis.fetch`; the test relies on its mock
    // calls for assertions, not on a global redirect.
    installGlobalFetch: false,
    routedFetch: mockFetch,
  });
}

describe('ChildMentorMemoryScreen — interest context rows', () => {
  beforeEach(() => {
    setRoutes();
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  it('renders a context row for each child interest', async () => {
    const { result, cleanup } = renderWithGuardian();

    await waitFor(() => {
      result.getByTestId('child-mentor-memory-interests-section');
    });

    result.getByText('Football');
    result.getByText('Astronomy');
    expect(
      result.getByTestId('interest-context-Football-free_time').props
        .accessibilityState?.selected,
    ).toBe(true);

    cleanup();
  });

  it('tapping a context option updates the child profile with the full array', async () => {
    const { result, cleanup } = renderWithGuardian();

    await waitFor(() => {
      result.getByTestId('interest-context-Football-both');
    });

    await act(async () => {
      fireEvent.press(result.getByTestId('interest-context-Football-both'));
    });

    await waitFor(() => {
      const calls = fetchCallsMatching(
        mockFetch,
        '/onboarding/child-001/interests/context',
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{
        interests: Array<{ label: string; context: string }>;
      }>(calls[0]?.init);
      expect(body?.interests).toEqual([
        { label: 'Football', context: 'both' },
        { label: 'Astronomy', context: 'school' },
      ]);
    });

    cleanup();
  });

  it('hides the interest context section when the child has no interests', async () => {
    setRoutes({ interests: [] });

    const { result, cleanup } = renderWithGuardian();

    // Wait for the profile query to land — the always-rendered CONTROLS
    // switch is the load signal. Once it's there, we can prove absence
    // of the interests section.
    await waitFor(() => {
      result.getByLabelText('Learn about child');
    });

    expect(
      result.queryByTestId('child-mentor-memory-interests-section'),
    ).toBeNull();

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// [BUG-907] Mentor Memory CONTROLS switches must expose an accessibilityLabel.
//
// Before fix: the two Switch components ("Learn about child" / "Use what the
// mentor knows") rendered with role=switch but no label — VoiceOver and
// TalkBack announced them as "switch, off/on" with no context.
// ---------------------------------------------------------------------------

describe('[BUG-907] CONTROLS switches expose accessibilityLabel', () => {
  beforeEach(() => {
    setRoutes();
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  it('labels the "Learn about child" switch with the adjacent caption', async () => {
    const { result, cleanup } = renderWithGuardian();

    // i18n resolves via the shared mock-i18n.ts to the real en.json string,
    // so the rendered accessibilityLabel is the translated text — not the
    // bare key the original test asserted against.
    const learnSwitch = await waitFor(() =>
      result.getByLabelText('Learn about child'),
    );
    expect(learnSwitch.props.accessibilityLabel).toBe('Learn about child');
    expect(learnSwitch.props.accessibilityHint).toBe(
      "Allow the mentor to build a memory of your child's strengths and focus areas",
    );

    cleanup();
  });

  it('labels the "Use what the mentor knows" switch with the adjacent caption', async () => {
    const { result, cleanup } = renderWithGuardian();

    const useSwitch = await waitFor(() =>
      result.getByLabelText('Use what the mentor knows'),
    );
    expect(useSwitch.props.accessibilityLabel).toBe(
      'Use what the mentor knows',
    );
    expect(useSwitch.props.accessibilityHint).toBe(
      'Let the mentor personalise sessions using what it has learned',
    );

    cleanup();
  });
});
