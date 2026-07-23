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
    const actual = jest.requireActual('../../../../lib/api-client');
    const { hc } = require('hono/client');
    return {
      ...actual,
      useApiClient: () => hc('http://localhost', { fetch: mockFetch }),
    };
  },
);

const ChildMentorMemoryScreen = require('./mentor-memory').default;

// ─── Test data ──────────────────────────────────────────────────────────

const childProfileBase = {
  id: '20000000-0000-4000-8000-000000000011',
  profileId: '20000000-0000-4000-8000-000000000012',
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
  effectivenessSessionCount: 0,
  memoryEnabled: true,
  memoryConsentStatus: 'granted',
  memoryCollectionEnabled: true,
  memoryInjectionEnabled: true,
  accommodationMode: 'none',
  recentlyResolvedTopics: [],
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Guardian (owner) + linked child are required for the screen's IDOR guard:
// the URL profileId must appear in `profiles[]`.
const guardianProfile = {
  ...NAMED_PROFILES.guardian,
  id: 'profile-parent',
  accountId: 'account-family',
  defaultAppContext: 'family' as const,
  hasFamilyLinks: true,
};
const linkedChildProfile = {
  ...NAMED_PROFILES.linkedChild,
  id: 'child-001',
  accountId: 'account-family',
  displayName: 'Emma',
  defaultAppContext: null,
  hasFamilyLinks: true,
};

type MemoryCategory = {
  label: string;
  items: Array<{
    category: string;
    value: string;
    statement: string;
    confidence?: 'low' | 'medium' | 'high';
  }>;
};

function setRoutes(
  profileOverrides: Partial<typeof childProfileBase> = {},
  memoryCategories: MemoryCategory[] = [],
): void {
  // /dashboard/children/:profileId branches: detail GET vs memory vs sessions.
  mockFetch.setRoute(
    '/dashboard/children/child-001',
    (url: string, init?: RequestInit) => {
      // Memory endpoint — hook unwraps `data.memory`.
      if (url.includes('/memory')) {
        return {
          memory: {
            categories: memoryCategories,
            parentContributions: [],
            settings: {
              memoryEnabled: true,
              collectionEnabled: true,
              injectionEnabled: true,
              accommodationMode: null,
            },
          },
        };
      }
      // Sessions endpoint — hook returns `data.sessions`.
      if (url.includes('/sessions')) return { sessions: [] };
      if (init?.method && init.method !== 'GET') return {};
      // Child detail — hook returns `data.child`.
      return {
        child: {
          profileId: '20000000-0000-4000-8000-000000000012',
          displayName: 'Emma',
          organizationTimezone: null,
          consentStatus: null,
          respondedAt: null,
          summary: '',
          sessionsThisWeek: 0,
          sessionsLastWeek: 0,
          totalTimeThisWeek: 0,
          totalTimeLastWeek: 0,
          exchangesThisWeek: 0,
          exchangesLastWeek: 0,
          trend: 'stable',
          subjects: [],
          guidedVsImmediateRatio: 0,
          retentionTrend: 'stable',
          totalSessions: 0,
        },
      };
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

  // /consent/:childProfileId/status → useChildConsentStatus
  // Must be registered so parseJson can validate against childConsentStatusSchema.
  // All nullable: no consent collected in this test scenario.
  mockFetch.setRoute('/consent/child-001/status', () => ({
    consentStatus: null,
    respondedAt: null,
    consentType: null,
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

  it('exposes stable screen and empty-state selectors for native journeys', async () => {
    const { result, cleanup } = renderWithGuardian();

    await waitFor(() => {
      result.getByTestId('child-mentor-memory-screen');
      result.getByTestId('child-mentor-memory-empty-state');
    });

    cleanup();
  });

  it('exposes a positive selector only when populated memory categories load', async () => {
    setRoutes({}, [
      {
        label: 'Learning pace & notes',
        items: [
          {
            category: 'communicationNotes',
            value: 'short-visual-start',
            statement: 'Short visual examples help Emma get started.',
          },
        ],
      },
    ]);
    const { result, cleanup } = renderWithGuardian();

    await waitFor(() => {
      result.getByTestId('child-mentor-memory-populated-category');
    });
    expect(result.queryByTestId('child-mentor-memory-empty-state')).toBeNull();

    cleanup();
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

// ---------------------------------------------------------------------------
// WI-264: consent-withdrawn blocks all reads, exports, and mutations
// ---------------------------------------------------------------------------

describe('ChildMentorMemoryScreen — consent-withdrawn empty state (WI-264)', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  function setWithdrawnRoutes(): void {
    // Consent endpoint returns WITHDRAWN.
    mockFetch.setRoute('/consent/child-001/status', () => ({
      consentStatus: 'WITHDRAWN',
      respondedAt: new Date().toISOString(),
      consentType: 'GDPR',
    }));
    // These endpoints must NOT be fetched when consent is withdrawn.
    mockFetch.setRoute('/learner-profile/child-001', () => ({
      profile: { ...childProfileBase },
    }));
    mockFetch.setRoute(
      '/dashboard/children/child-001',
      (url: string, init?: RequestInit) => {
        if (url.includes('/memory')) return { memory: { categories: [] } };
        if (url.includes('/sessions')) return { sessions: [] };
        if (init?.method && init.method !== 'GET') return {};
        return {
          child: {
            displayName: 'Emma',
            profileId: 'child-001',
            organizationTimezone: null,
          },
        };
      },
    );
  }

  it('[WI-264] renders the consent-withdrawn empty state when consent is WITHDRAWN', async () => {
    setWithdrawnRoutes();

    const { result, cleanup } = renderScreen(<ChildMentorMemoryScreen />, {
      profile: guardianProfile,
      profiles: [guardianProfile, linkedChildProfile],
      installGlobalFetch: false,
      routedFetch: mockFetch,
    });

    await waitFor(() => {
      result.getByTestId('child-mentor-memory-consent-withdrawn');
    });

    cleanup();
  });

  it('[WI-264] shows empty state (not memory content) once consent resolves as WITHDRAWN', async () => {
    // The memory fetch may fire on the initial render before consent resolves;
    // the security guarantee is that once WITHDRAWN is known, the screen renders
    // the consent-withdrawn empty state and does NOT render memory content.
    setWithdrawnRoutes();

    const { result, cleanup } = renderScreen(<ChildMentorMemoryScreen />, {
      profile: guardianProfile,
      profiles: [guardianProfile, linkedChildProfile],
      installGlobalFetch: false,
      routedFetch: mockFetch,
    });

    await waitFor(() => {
      result.getByTestId('child-mentor-memory-consent-withdrawn');
    });

    // After consent resolves as WITHDRAWN, memory content must NOT render.
    expect(
      result.queryByTestId('child-mentor-memory-interests-section'),
    ).toBeNull();
    expect(result.queryByLabelText('Learn about child')).toBeNull();

    cleanup();
  });

  it('[WI-264] does NOT fetch the learner-profile or memory endpoints with the real childProfileId when consent is WITHDRAWN', async () => {
    // Negative-path: the learner-profile and memory hooks must never be
    // called with the real childProfileId when consent is WITHDRAWN.
    // They are gated as `consentResolved && !consentWithdrawn ? id : undefined`
    // in the screen, so the only calls that may appear must carry undefined.
    setWithdrawnRoutes();

    const { result, cleanup } = renderScreen(<ChildMentorMemoryScreen />, {
      profile: guardianProfile,
      profiles: [guardianProfile, linkedChildProfile],
      installGlobalFetch: false,
      routedFetch: mockFetch,
    });

    await waitFor(() => {
      result.getByTestId('child-mentor-memory-consent-withdrawn');
    });

    // Assert that no fetch was made to the learner-profile or memory endpoints
    // with the real child profile id. The routed mock would record any call.
    const profileCalls = fetchCallsMatching(
      mockFetch,
      '/learner-profile/child-001',
    );
    const memoryCalls = fetchCallsMatching(
      mockFetch,
      '/dashboard/children/child-001',
    ).filter(({ url }) => url.includes('/memory'));

    expect(profileCalls).toHaveLength(0);
    expect(memoryCalls).toHaveLength(0);

    cleanup();
  });
});
