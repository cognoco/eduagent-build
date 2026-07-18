import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LearningProfile } from '@eduagent/schemas';
import {
  createRoutedMockFetch,
  extractJsonBody,
  fetchCallsMatching,
} from '../../test-utils/mock-api-routes';
import { ProfileContext, type ProfileContextValue } from '../../lib/profile';
import { createTestProfile } from '../../test-utils/app-hook-test-utils';

// [BUG-815] Regression test: when a legacy profile row has `interests`
// undefined or null, the Interests section renders the empty placeholder
// rather than crashing with "Cannot read property 'map' of undefined".
// The fix is `(profile?.interests ?? []).map(...)`.

const mockProfileBase: Omit<LearningProfile, 'interests'> = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  profileId: '550e8400-e29b-41d4-a716-446655440002',
  // Required scalar fields that the screen reads.
  learningStyle: null,
  strengths: [],
  struggles: [],
  communicationNotes: [],
  interestTimestamps: {},
  // Mentor-memory consent on so the screen renders the data sections.
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

let mockProfileData: unknown = {
  ...mockProfileBase,
  interests: [],
};

let mockActiveProfileBirthYear: number | undefined;
let mockIsExplicitProxyMode = false;
let mockSafeAreaTop = 0;

const mockPlatformAlert = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: mockSafeAreaTop,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

const mockRouter = {
  replace: jest.fn(),
  back: jest.fn(),
  push: jest.fn(),
  canGoBack: jest.fn(() => true),
};
let mockSearchParams: Record<string, string | string[] | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  Redirect: () => null,
}));

// Fetch-boundary: the routed mock fetch is installed as globalThis.fetch by
// `makeWrapper` so the REAL lib/api-client (useApiClient) runs against it. The
// route handler closes over `mockProfileData` by reference — update the
// variable before each test to change what useLearnerProfile() returns.
const mockFetch = createRoutedMockFetch({
  'learner-profile/tell': () => ({
    success: true,
    message: 'Saved',
    fieldsUpdated: [],
  }),
  'learner-profile/consent': () => ({ success: true }),
  'learner-profile/injection': () => ({ success: true }),
  'learner-profile/all': () => ({ success: true }),
  'onboarding/interests/context': () => ({ success: true }),
  'learner-profile': () => ({ profile: mockProfileData }),
});

// use-active-profile-role is derived from useProfile + useParentProxy — no API calls.
let mockActiveRole: 'owner' | 'child' | 'impersonated-child' | null = 'owner';
jest.mock('../../hooks/use-active-profile-role', () => ({
  ...jest.requireActual('../../hooks/use-active-profile-role'),
  useActiveProfileRole: () => mockActiveRole,
}));

// mockCanEnterResult controls what canEnter() returns per-test.
// Default true so most tests exercise normal screen rendering.
// Set to false in proxy-redirect tests to verify the Redirect guard fires.
let mockCanEnterResult = true;

// mockIsParentProxy drives the write-guard branch in mentor-memory.tsx.
// Decoupled from mockCanEnterResult so tests can verify the screen body
// renders (canEnter=true) but controls are disabled (isParentProxy=true).
let mockIsParentProxy = false;

jest.mock(
  '../../hooks/use-navigation-contract' /* gc1-allow: screen test pins navigation gates without the full app provider tree */,
  () => ({
    useNavigationContract: () => ({
      gates: {
        sessionIsOwner: mockActiveRole === 'owner',
      },
      isParentProxy: mockIsParentProxy,
      canEnter: (_route: string) => mockCanEnterResult,
    }),
  }),
);

// mockModeNavV1Enabled controls the feature flag that switches between V0
// (blocked = isParentProxy) and V1 (blocked = !canEnter). WI-274 tests set
// this to true so the screen body renders while isParentProxy=true (V1 uses
// canEnter=true to skip the redirect, then the screen shows disabled controls).
let mockModeNavV0Enabled = false;
let mockModeNavV1Enabled = false;
let mockModeNavV2Enabled = false;
jest.mock(
  '../../lib/feature-flags' /* gc1-allow: compile-time constant that switches redirect branch; needed to test V1-mode proxy write guards */,
  () => ({
    FEATURE_FLAGS: {
      get MODE_NAV_V0_ENABLED() {
        return mockModeNavV0Enabled;
      },
      get MODE_NAV_V1_ENABLED() {
        return mockModeNavV1Enabled;
      },
      get MODE_NAV_V2_ENABLED() {
        return mockModeNavV2Enabled;
      },
    },
  }),
);

jest.mock('../../lib/platform-alert', () => ({
  ...jest.requireActual('../../lib/platform-alert'),
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock(
  '../../lib/sentry' /* gc1-allow: @sentry/react-native external boundary */,
  () => ({
    Sentry: { captureException: jest.fn() },
  }),
);

// Break test: catch blocks must surface the server's specific error message,
// not the generic "Please try again." fallback.
// Strategy: mock TellMentorInput to expose a testID-tagged submit button so
// we can trigger onSubmit directly without depending on TellMentorInput internals.
jest.mock('../../components/tell-mentor-input', () => ({
  ...jest.requireActual('../../components/tell-mentor-input'),
  TellMentorInput: ({
    onSubmit,
    onChangeText,
  }: {
    onSubmit: () => void;
    onChangeText: (text: string) => void;
  }) => {
    const { Pressable, TextInput } = require('react-native');
    return (
      <>
        <TextInput
          testID="tell-mentor-text-input"
          onChangeText={onChangeText}
        />
        <Pressable testID="tell-mentor-submit" onPress={onSubmit} />
      </>
    );
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  // Install the routed mock fetch so the REAL lib/api-client runs against it.
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    mockFetch as unknown as typeof fetch;

  // Real ProfileContext supplies the active profile the screen reads via
  // useProfile() (displayName + birthYear). Proxy behavior is driven by the
  // mocked useNavigationContract().isParentProxy, which the screen consults —
  // not by isExplicitProxyMode here.
  const activeProfile = createTestProfile({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test Learner',
    isOwner: true,
    birthYear: mockActiveProfileBirthYear as number,
  });
  const profileContextValue: ProfileContextValue = {
    profiles: [activeProfile],
    activeProfile,
    isExplicitProxyMode: mockIsExplicitProxyMode,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider value={profileContextValue}>
          {children}
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };
}

const MentorMemoryScreen = require('./mentor-memory').default;

describe('MentorMemoryScreen — interests null guard', () => {
  afterEach(() => {
    mockProfileData = { ...mockProfileBase, interests: [] };
    mockSearchParams = {};
    mockIsParentProxy = false;
    mockModeNavV0Enabled = false;
    mockModeNavV1Enabled = false;
    mockModeNavV2Enabled = false;
    mockSafeAreaTop = 0;
    jest.clearAllMocks();
  });

  it.each([
    { shell: 'flags-off', v0: false, v1: false, v2: false, expected: 47 },
    { shell: 'V0', v0: true, v1: false, v2: false, expected: 47 },
    { shell: 'V1', v0: true, v1: true, v2: false, expected: 47 },
    { shell: 'V2', v0: true, v1: true, v2: true, expected: 0 },
  ])(
    'owns the native top inset on $shell only when the root does not',
    async ({ v0, v1, v2, expected }) => {
      mockModeNavV0Enabled = v0;
      mockModeNavV1Enabled = v1;
      mockModeNavV2Enabled = v2;
      mockSafeAreaTop = 47;

      render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

      expect(
        (await screen.findByTestId('mentor-memory-screen')).props.style
          ?.paddingTop ?? 0,
      ).toBe(expected);
    },
  );

  it('does not crash when profile.interests is undefined', () => {
    mockProfileData = { ...mockProfileBase, interests: undefined };
    expect(() =>
      render(<MentorMemoryScreen />, { wrapper: makeWrapper() }),
    ).not.toThrow();
  });

  it('does not crash when profile.interests is null', () => {
    mockProfileData = { ...mockProfileBase, interests: null };
    expect(() =>
      render(<MentorMemoryScreen />, { wrapper: makeWrapper() }),
    ).not.toThrow();
  });

  it('renders interest labels when interests is a populated array', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [
        { label: 'Football', context: 'free_time' },
        { label: 'Astronomy', context: 'school' },
      ],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });
    await screen.findByText('Football');
    await screen.findByText('Astronomy');
  });

  it('renders context controls for interests', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [{ label: 'Football', context: 'free_time' }],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('mentor-memory-interests-section');
    expect(
      screen.getByTestId('interest-context-Football-free_time').props
        .accessibilityState?.selected,
    ).toBe(true);
  });

  it('tapping a context writes the full interests array', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [
        { label: 'Football', context: 'free_time' },
        { label: 'Astronomy', context: 'school' },
      ],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    const bothOption = await screen.findByTestId(
      'interest-context-Football-both',
    );
    await act(async () => {
      fireEvent.press(bothOption);
    });

    const calls = fetchCallsMatching(mockFetch, 'onboarding/interests/context');
    expect(calls).toHaveLength(1);
    expect(extractJsonBody(calls[0]?.init)).toEqual({
      interests: [
        { label: 'Football', context: 'both' },
        { label: 'Astronomy', context: 'school' },
      ],
    });
  });

  it('shows the tapped context optimistically', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [{ label: 'Football', context: 'free_time' }],
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    const bothOption = await screen.findByTestId(
      'interest-context-Football-both',
    );
    await act(async () => {
      fireEvent.press(bothOption);
    });

    expect(
      screen.getByTestId('interest-context-Football-both').props
        .accessibilityState?.selected,
    ).toBe(true);
  });

  it('hides the interests section when there are no interests', () => {
    mockProfileData = { ...mockProfileBase, interests: [] };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    expect(screen.queryByTestId('mentor-memory-interests-section')).toBeNull();
  });
});

// [BUG-918] Regression test: the "Set by your parent in their settings."
// helper text below the accommodation badge must be hidden for owner profiles
// (parents on their own account have no parent to attribute the setting to)
// and shown for child profiles. Driven by `useActiveProfileRole() !== 'owner'`.
// The text element carries testID="accommodation-set-by-parent" for stable
// assertions that are independent of i18n key resolution state.
describe('MentorMemoryScreen — accommodation helper copy is role-gated [BUG-918]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveRole = 'owner';
    mockIsParentProxy = false;
    mockModeNavV1Enabled = false;
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      accommodationMode: 'audio-first',
    };
  });

  afterEach(() => {
    mockActiveRole = 'owner';
  });

  it('hides "Set by your parent" for owner profiles even with accommodation badge visible', async () => {
    mockActiveRole = 'owner';
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('accommodation-badge');
    expect(screen.queryByTestId('accommodation-set-by-parent')).toBeNull();
  });

  it('shows "Set by your parent" for child profiles with accommodation badge visible', async () => {
    mockActiveRole = 'child';
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('accommodation-badge');
    await screen.findByTestId('accommodation-set-by-parent');
  });

  it('hides "Set by your parent" when accommodation badge is not shown', () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      accommodationMode: 'none',
    };
    mockActiveRole = 'child';
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    expect(screen.queryByTestId('accommodation-badge')).toBeNull();
    expect(screen.queryByTestId('accommodation-set-by-parent')).toBeNull();
  });
});

describe('MentorMemoryScreen — accommodation badge text by age bracket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
    mockModeNavV1Enabled = false;
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      accommodationMode: 'audio-first',
    };
  });

  afterEach(() => {
    mockActiveProfileBirthYear = undefined;
  });

  // [BUG-577] AgeBracket 'child' was removed (strictly-11+ product constraint).
  // The under-11 'young label' branch no longer exists in the screen, so the
  // previous test that asserted it has been deleted. Adolescent and adult are
  // the only valid brackets.

  it('shows mid label for adolescent bracket', async () => {
    mockActiveProfileBirthYear = new Date().getFullYear() - 15;
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });
    const badge = await screen.findByTestId('accommodation-badge');
    expect(badge).toHaveTextContent(/Learning style: Audio-First/);
  });

  it('shows mid label when birthYear is null (adolescent fallback)', async () => {
    mockActiveProfileBirthYear = undefined;
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });
    const badge = await screen.findByTestId('accommodation-badge');
    expect(badge).toHaveTextContent(/Learning style: Audio-First/);
  });

  // [WI-875] Adult bracket takes the `labels.older` branch (mentor-memory.tsx
  // `return labels.older`), which renders the "Accommodation mode: …" copy —
  // distinct from the adolescent "Learning style: …" copy above. Both prior
  // tests asserted only the mid label, leaving the older branch unexercised.
  it('shows older label for adult bracket', async () => {
    mockActiveProfileBirthYear = new Date().getFullYear() - 30;
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });
    const badge = await screen.findByTestId('accommodation-badge');
    expect(badge).toHaveTextContent(/Accommodation mode: Audio-First/);
    // Guards against the mid/older branches collapsing to the same copy.
    expect(badge).not.toHaveTextContent(/Learning style: Audio-First/);
  });
});

describe('MentorMemoryScreen — catch blocks use formatApiError not generic copy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
    mockModeNavV1Enabled = false;
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
    };
    // Reset the tell route to the default success response
    mockFetch.setRoute('learner-profile/tell', () => ({
      success: true,
      message: 'Saved',
      fieldsUpdated: [],
    }));
  });

  it('shows the server-specific error message from handleTellMentor, not "Please try again."', async () => {
    // Arrange: configure fetch to return a 403 with SUBJECT_INACTIVE for the
    // tell-mentor endpoint so assertOk throws and formatApiError maps it to
    // the friendly "paused" message.
    mockFetch.setRoute(
      'learner-profile/tell',
      () =>
        new Response(
          JSON.stringify({
            message: 'subject is paused',
            code: 'SUBJECT_INACTIVE',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    // Wait for useLearnerProfile query to resolve and TellMentorInput to render.
    const textInput = await screen.findByTestId('tell-mentor-text-input');

    // Type something so handleTellMentor doesn't early-exit on empty draft
    fireEvent.changeText(textInput, 'I prefer visual examples');

    await act(async () => {
      fireEvent.press(screen.getByTestId('tell-mentor-submit'));
    });

    // The alert must NOT use the generic copy; it must use the formatted
    // server message (which for SUBJECT_INACTIVE maps to the friendly text).
    expect(mockPlatformAlert).toHaveBeenCalledTimes(1);
    const alertMessage = mockPlatformAlert.mock.calls[0][1] as string;
    expect(alertMessage).not.toBe('Please try again.');
    // formatApiError for SUBJECT_INACTIVE maps to the friendly paused message
    expect(alertMessage).toMatch(/paused|archived|resume/i);
  });
});

describe('MentorMemoryScreen — self privacy writes [WI-1407]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveRole = 'owner';
    mockIsParentProxy = false;
    mockModeNavV1Enabled = false;
    mockCanEnterResult = true;
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'pending',
      memoryInjectionEnabled: false,
    };
  });

  afterEach(() => {
    mockActiveRole = 'owner';
    mockProfileData = { ...mockProfileBase, interests: [] };
  });

  it('[WI-1407] grants self memory consent without childProfileId', async () => {
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('memory-consent-grant');
    mockFetch.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByTestId('memory-consent-grant'));
    });

    const calls = fetchCallsMatching(mockFetch, 'learner-profile/consent');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).not.toContain('/test-profile-id/');
    expect(extractJsonBody(calls[0]?.init)).toEqual({ consent: 'granted' });
  });

  it('[WI-1407] declines self memory consent without childProfileId', async () => {
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('memory-consent-decline');
    mockFetch.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByTestId('memory-consent-decline'));
    });

    const calls = fetchCallsMatching(mockFetch, 'learner-profile/consent');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).not.toContain('/test-profile-id/');
    expect(extractJsonBody(calls[0]?.init)).toEqual({ consent: 'declined' });
  });

  it('[WI-1407] toggles self memory injection with the new value', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
      memoryInjectionEnabled: true,
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    const switchEl = await screen.findByLabelText('Use saved notes in lessons');
    mockFetch.mockClear();

    await act(async () => {
      fireEvent(switchEl, 'valueChange', false);
    });

    const calls = fetchCallsMatching(mockFetch, 'learner-profile/injection');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).not.toContain('/test-profile-id/');
    expect(extractJsonBody(calls[0]?.init)).toEqual({
      memoryInjectionEnabled: false,
    });
  });

  it('[WI-1407] confirms clear-all through the self memory endpoint', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    const clearButton = await screen.findByLabelText(
      'Clear mentor memory for Test Learner',
    );
    fireEvent.press(clearButton);

    expect(mockPlatformAlert).toHaveBeenCalledTimes(1);
    const buttons = mockPlatformAlert.mock.calls[0][2] as Array<{
      text?: string;
      style?: string;
      onPress?: () => void;
    }>;
    mockFetch.mockClear();

    await act(async () => {
      buttons.find((button) => button.style === 'destructive')?.onPress?.();
    });

    const calls = fetchCallsMatching(mockFetch, 'learner-profile/all');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).not.toContain('/test-profile-id/');
    expect(extractJsonBody(calls[0]?.init)).toBeUndefined();
  });
});

describe('MentorMemoryScreen — explicit return target from More', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
    mockModeNavV1Enabled = false;
    mockSearchParams = { returnTo: 'more' };
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
    };
  });

  afterEach(() => {
    mockSearchParams = {};
  });

  it('replaces to /(app)/more instead of calling router.back() when opened from More', async () => {
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    const backButton = await screen.findByLabelText('Go Back');
    fireEvent.press(backButton);

    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/more');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

// Break test: proxy/restricted users must be redirected to home, not shown
// the mentor-memory screen. canEnter('mentor-memory') returns false for proxy
// sessions and any other context where the screen is off-limits.
describe('MentorMemoryScreen — canEnter=false redirects to home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
    mockModeNavV1Enabled = false;
    mockCanEnterResult = false;
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
    };
  });

  afterEach(() => {
    mockCanEnterResult = true;
    mockSearchParams = {};
  });

  it('renders Redirect to home when canEnter returns false (e.g. proxy session)', () => {
    // Redirect renders as null in tests (mocked above); verify the screen
    // body does NOT render — the memory-status-text testID is only present
    // when the screen body renders past the canEnter guard.
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    expect(screen.queryByTestId('memory-status-text')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WI-274: proxy mode disables write controls and shows read-only hint
// ---------------------------------------------------------------------------

describe('MentorMemoryScreen — proxy mode write guard (WI-274)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // V1 mode: blocked = !canEnter(...). With canEnter=true the redirect does
    // NOT fire, so the screen body renders. isParentProxy=true then disables
    // the write controls. This decoupling is only possible under V1.
    mockModeNavV1Enabled = true;
    mockCanEnterResult = true;
    mockIsParentProxy = true;
    mockIsExplicitProxyMode = true;
    mockProfileData = {
      ...mockProfileBase,
      interests: [],
      memoryConsentStatus: 'granted',
      memoryInjectionEnabled: true,
    };
  });

  afterEach(() => {
    mockModeNavV1Enabled = false;
    mockIsParentProxy = false;
    mockIsExplicitProxyMode = false;
  });

  it('[WI-274] shows the proxy read-only hint when isExplicitProxyMode=true', async () => {
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('proxy-read-only-hint');
  });

  it('[WI-274] the injection Switch is disabled when isExplicitProxyMode=true', async () => {
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    // Wait for profile data to land.
    await screen.findByTestId('memory-status-text');

    // Accessibility label comes from the real en.json:
    // session.mentorMemory.status.useMemoryLabel = "Use saved notes in lessons"
    const switchEl = screen.getByLabelText('Use saved notes in lessons');
    expect(switchEl.props.disabled).toBe(true);
  });

  it('[WI-274] the clear-all Pressable is disabled when isExplicitProxyMode=true', async () => {
    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    await screen.findByTestId('memory-status-text');

    // Accessibility label: session.mentorMemory.clearAll.accessibilityLabel
    // = "Clear mentor memory for {{name}}" with name="Test Learner"
    const clearBtn = screen.getByLabelText(
      'Clear mentor memory for Test Learner',
    );
    expect(clearBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('[WI-274] proxy mode: per-item Remove controls are not rendered and an interest-context change dispatches no write', async () => {
    mockProfileData = {
      ...mockProfileBase,
      interests: [{ label: 'Football', context: 'free_time' }],
      memoryConsentStatus: 'granted',
    };

    render(<MentorMemoryScreen />, { wrapper: makeWrapper() });

    // The per-row Remove action is hidden in proxy mode (onRemove undefined →
    // MemoryRow renders no remove button). Default actionLabel is "Remove".
    await screen.findByTestId('mentor-memory-interests-section');
    expect(screen.queryByLabelText('Remove Football')).toBeNull();

    // Even if the context option is pressed, the guarded handler dispatches
    // no write while in proxy mode.
    const bothOption = screen.getByTestId('interest-context-Football-both');
    await act(async () => {
      fireEvent.press(bothOption);
    });
    expect(
      fetchCallsMatching(mockFetch, 'onboarding/interests/context'),
    ).toHaveLength(0);
  });
});
