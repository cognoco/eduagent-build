import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import {
  __resetMentorBornCeremonyForTests,
  getMentorBornCeremonySnapshot,
} from '../lib/mentor-born-ceremony';
import { mentorBirthSeenKey } from '../lib/secure-store-keys';

import {
  resolveNavigationContract,
  type NavigationProfile,
} from '../lib/navigation-contract';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: { for?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
    push: mockPush,
  }),
  useLocalSearchParams: () => mockSearchParams,
  // [BUG-375] Redirect stub so auth-gate tests can assert the redirect path.
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>redirect:{href}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let datePickerOnChange: ((event: unknown, date?: Date) => void) | null = null;

jest.mock('@react-native-community/datetimepicker', () => {
  const RN = require('react-native');
  const ReactReq = require('react');
  return {
    __esModule: true,
    default: (props: {
      onChange?: (event: unknown, date?: Date) => void;
      testID?: string;
    }) => {
      datePickerOnChange = props.onChange ?? null;
      return ReactReq.createElement(RN.View, { testID: props.testID });
    },
  };
});

const mockFetch = jest.fn();
jest.mock(
  '../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch replaces network layer */,
  () => {
    const actual = jest.requireActual('../lib/api-client');
    return {
      ...actual,
      useApiClient: () => {
        const { hc } = require('hono/client');
        return hc('http://localhost', { fetch: mockFetch });
      },
    };
  },
);

const mockSwitchProfile = jest.fn().mockResolvedValue(undefined);

// prettier-ignore
jest.mock('../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({ accent: '#0ea5e9', background: '#18181b', border: '#d4d4d8', muted: '#71717a', surface: '#ffffff', textInverse: '#ffffff', textPrimary: '#18181b', textSecondary: '#52525b' }),
  useTheme: () => ({ colorScheme: 'dark' }),
  useTokenVars: () => ({}),
}));

// BUG-301: Made per-test overridable so isParentAddingChild can be tested.
const mockUseProfile = jest.fn();
jest.mock(
  '../lib/profile' /* gc1-allow: pattern-a conversion; useProfile depends on ProfileContext; pattern-a spy controls active-profile shape per-test */,
  () => ({
    ...jest.requireActual('../lib/profile'),
    useProfile: () => mockUseProfile(),
  }),
);

// WI-296: Controllable role so proxy/non-owner gate tests can set role independently.
let mockActiveProfileRole: 'owner' | 'child' | 'impersonated-child' | null =
  'owner';
jest.mock(
  '../hooks/use-active-profile-role', // gc1-allow: hooks depend on ProfileProvider + useParentProxy which require SecureStore; mocking the final hook is cleaner than reconstructing the full context chain
  () => ({
    useActiveProfileRole: () => mockActiveProfileRole,
  }),
);

// WI-371: proxy write-guard in create-profile.tsx now reads navigationContract.isParentProxy.
let mockIsParentProxy = false;
jest.mock(
  '../hooks/use-navigation-contract' /* gc1-allow: pins isParentProxy for proxy access-gate tests */,
  () => ({
    useNavigationContract: () => ({
      isParentProxy: mockIsParentProxy,
      gates: {},
    }),
  }),
);

// Audience carried from the pre-auth chooser. Default 'learner' = clean solo
// setup (matches the bulk of these first-profile tests). Set to 'parent' to
// exercise the family + add-child redirect path. Pattern A — real module with
// the two readers overridden so each test controls the carried value.
let mockAudience: 'learner' | 'parent' | null = 'learner';
jest.mock(
  '../lib/pre-auth-audience' /* gc1-allow: pattern-a conversion; pre-auth-audience reads SecureStore which is a native storage boundary */,
  () => ({
    ...jest.requireActual('../lib/pre-auth-audience'),
    readPreAuthAudienceSync: () => mockAudience,
    readPreAuthAudience: () => Promise.resolve(mockAudience),
    clearPreAuthAudience: () => Promise.resolve(),
  }),
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

function birthDateOneDayYoungerThanMinimumAge(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 13, now.getMonth(), now.getDate() + 1);
}

function birthDateAtMinimumAge(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const CreateProfileScreen = require('./create-profile').default;
const expoSecureStoreMock = jest.requireMock('expo-secure-store') as {
  __store: Map<string, string>;
};

describe('CreateProfileScreen', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    mockSearchParams = {};
    datePickerOnChange = null;
    mockCanGoBack.mockReturnValue(true);
    mockIsParentProxy = false;
    mockAudience = 'learner';
    // Default: non-parent flow (first-time user / child self-registering)
    mockUseProfile.mockReturnValue({
      switchProfile: mockSwitchProfile,
      activeProfile: null,
      profiles: [],
    });
    // Default: active profile is account owner
    mockActiveProfileRole = 'owner';
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // [BUG-375] Default to signed-in so existing tests are unaffected by the
    // new auth guard; auth-gate break tests override below.
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    __resetMentorBornCeremonyForTests();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders form fields (persona picker hidden, auto-detected)', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    screen.getByTestId('create-profile-name');
    screen.getByTestId('create-profile-birthdate');
    screen.getByTestId('create-profile-submit');
    // Birth date explanatory copy is visible
    expect(
      screen.getByText(/your mentor talks to you the right way/),
    ).toBeTruthy();
    // Persona picker buttons are hidden (auto-detected from birth date)
    expect(screen.queryByTestId('persona-teen')).toBeNull();
    expect(screen.queryByTestId('persona-learner')).toBeNull();
    expect(screen.queryByTestId('persona-parent')).toBeNull();
  });

  it('[ACCOUNT-01] renders first-profile form while no active profile exists yet', () => {
    mockActiveProfileRole = null;
    mockUseProfile.mockReturnValue({
      switchProfile: mockSwitchProfile,
      activeProfile: null,
      profiles: [],
      isLoading: false,
    });

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    screen.getByTestId('create-profile-name');
    screen.getByTestId('create-profile-submit');
    expect(screen.queryByTestId('create-profile-role-loading')).toBeNull();
    expect(screen.queryByTestId('create-profile-access-blocked')).toBeNull();
  });

  // [BUG-900] When a parent (account owner with existing profile) opens the
  // create-profile screen, the copy must address the child, not the parent.
  describe('isParentAddingChild copy [BUG-900]', () => {
    beforeEach(() => {
      mockUseProfile.mockReturnValue({
        switchProfile: mockSwitchProfile,
        activeProfile: { id: 'parent-1', isOwner: true },
        profiles: [{ id: 'parent-1', isOwner: true }],
      });
    });

    it('uses child-referent copy on the explanatory line', () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      expect(
        screen.getByText(/your child's mentor talks to them the right way/),
      ).toBeTruthy();
      // First-person copy must NOT appear when adding a child
      expect(
        screen.queryByText(/your mentor talks to you the right way/),
      ).toBeNull();
    });

    it('shows minimum age 13 hint up front', () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      screen.getByText(/Minimum age is 13/);
    });

    it('uses "Tell us about your child" as the page title', () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      screen.getByText('Tell us about your child');
      expect(screen.queryByText("Who's the learner?")).toBeNull();
    });

    it("uses Child's display name + child-referent placeholder", () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      screen.getByText("Child's display name");
      expect(
        screen.getByPlaceholderText("Enter your child's name"),
      ).toBeTruthy();
    });
  });

  it('[QA-08] uses child-referent copy when opened with ?for=child even before parent state resolves', () => {
    mockSearchParams = { for: 'child' };

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    screen.getByText('Tell us about your child');
    screen.getByText("Child's display name");
    expect(
      screen.getByText(/your child's mentor talks to them the right way/),
    ).toBeTruthy();
    expect(
      screen.queryByText(/your mentor talks to you the right way/),
    ).toBeNull();
  });

  it('disables submit when name is empty', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    const button = screen.getByTestId('create-profile-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });

  it('disables submit when birthdate is not selected', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    const button = screen.getByTestId('create-profile-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });

  it('opens date picker when birthdate field is pressed', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-birthdate'));

    screen.getByTestId('date-picker');
  });

  it('renders a web birthdate input fallback', () => {
    const RN = require('react-native');
    const originalOs = Object.getOwnPropertyDescriptor(RN.Platform, 'OS');

    Object.defineProperty(RN.Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });

    try {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      screen.getByTestId('create-profile-birthdate-input');

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.changeText(
        screen.getByTestId('create-profile-birthdate-input'),
        '2010-06-15',
      );

      // Birth year 2010 → adolescent. With the intent picker removed, submit is
      // enabled as soon as name + birth date are set (no intent tap needed).
      const button = screen.getByTestId('create-profile-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled,
      ).toBeFalsy();
    } finally {
      if (originalOs) {
        Object.defineProperty(RN.Platform, 'OS', originalOs);
      }
    }
  });

  it('[WI-1019] web birthdate input placeholder resolves through the i18n key, not a hardcoded literal', () => {
    // Override the key to a SENTINEL on the real i18next instance so the test
    // distinguishes t('…birthDatePlaceholder') from a hardcoded "YYYY-MM-DD"
    // literal. Reverting the source back to the literal makes this FAIL — a
    // real red-green guard. (i18next.addResource is the test-harness API, not
    // an internal jest.mock.)
    const i18nModule = require('i18next');
    const i18next = i18nModule.default ?? i18nModule;
    const KEY = 'onboarding.createProfile.birthDatePlaceholder';
    const SENTINEL = '__BIRTHDATE_PH__';
    const original = i18next.getResource('en', 'translation', KEY) as
      | string
      | undefined;
    i18next.addResource('en', 'translation', KEY, SENTINEL);

    const RN = require('react-native');
    const originalOs = Object.getOwnPropertyDescriptor(RN.Platform, 'OS');

    Object.defineProperty(RN.Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });

    try {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      const input = screen.getByTestId('create-profile-birthdate-input');
      expect(input.props.placeholder).toBe(SENTINEL);
    } finally {
      if (originalOs) {
        Object.defineProperty(RN.Platform, 'OS', originalOs);
      }
      // Restore the real catalog value so other tests are unaffected.
      if (original !== undefined) {
        i18next.addResource('en', 'translation', KEY, original);
      }
    }
  });

  it('calls POST and navigates back on successful submit (adult, no consent needed)', async () => {
    const newProfile = {
      id: 'new-id',
      accountId: 'a1',
      displayName: 'Sam',
      avatarUrl: null,
      birthYear: 2000,
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      consentStatus: null,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 }),
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    // Open date picker and select a date (26-year-old → no consent)
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('new-id');
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
    expect(getMentorBornCeremonySnapshot()).toMatchObject({
      activeRequest: {
        profileId: 'new-id',
        reason: 'first-profile-created',
      },
      requestCount: 1,
    });
  });

  it('optimistically writes the new profile into scoped profiles cache', async () => {
    const newProfile = {
      id: 'new-id',
      accountId: 'a1',
      displayName: 'Sam',
      avatarUrl: null,
      birthYear: 2000,
      location: null,
      isOwner: true,
      hasPremiumLlm: false,
      consentStatus: null,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    queryClient.setQueryDefaults(['profiles', 'clerk-user-test'], {
      gcTime: Infinity,
    });
    queryClient.setQueryData(['profiles', 'clerk-user-test'], []);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 }),
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(queryClient.getQueryData(['profiles', 'clerk-user-test'])).toEqual(
        [newProfile],
      );
    });
  });

  // [#7] Consent double-surface race fix. The child self-register path no
  // longer pushes /consent itself (that raced with the layout ConsentPendingGate
  // on web). It now switches to the pending child and lets the gate own the
  // single consent surface. This test asserts the deterministic behavior:
  // switchProfile fires, and create-profile does NOT also navigate to /consent.
  it('switches to the pending child and does NOT push /consent (gate owns the surface) for a child under 16', async () => {
    const newProfile = {
      id: 'child-id',
      accountId: 'a1',
      displayName: 'Kid',
      avatarUrl: null,
      birthYear: birthDateAtMinimumAge().getFullYear(),
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      consentStatus: 'PENDING',
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 }),
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Kid');

    // Open date picker and select a 13-year-old date → consent required.
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Switches to the pending child so the layout ConsentPendingGate takes over.
    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('child-id');
    });

    // Must NOT also push/replace to /consent — that is the double-surface race.
    expect(mockPush).not.toHaveBeenCalledWith('/consent');
    expect(mockReplace).not.toHaveBeenCalledWith('/consent');
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/consent' }),
    );
    // And must NOT close the modal (handleClose) on the consent path — the
    // switch-induced gate is the destination, not home/back.
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('auto-detects persona from birthdate (no picker shown)', async () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      // Set birthdate to a 10-year-old → TEEN detected silently
      datePickerOnChange?.({ type: 'set' }, new Date(2016, 0, 1));
    });

    // No persona picker or hint shown — detection is invisible to the user
    expect(screen.queryByTestId('persona-auto-hint')).toBeNull();
    expect(screen.queryByTestId('persona-teen')).toBeNull();
  });

  it('displays error on API failure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('API error: 422', {
        status: 422,
        statusText: 'Unprocessable Entity',
      }),
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    // Select a birthdate so submit is enabled
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2010, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      screen.getByTestId('create-profile-error');
    });
  });

  it('[age-floor] shows specific error and does not POST when the learner is under 13 by exact birth date', async () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Zuzka');
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.(
        { type: 'set' },
        birthDateOneDayYoungerThanMinimumAge(),
      );
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    screen.getByText(
      'Learners must be at least 13 years old. Please choose an earlier birth date.',
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSwitchProfile).not.toHaveBeenCalled();
  });

  // [BUG-947] 402 PROFILE_LIMIT_EXCEEDED is an upgrade gate, not a server fault.
  // Without the special-case, the catch block rendered the generic
  // "Something went wrong on our end" inline error — the symptom QA reported as
  // a fake 500. The screen must instead surface an upgrade alert that routes to
  // the subscription screen on confirm.
  it('[BUG-947] surfaces upgrade alert and routes to subscription on PROFILE_LIMIT_EXCEEDED', async () => {
    const upgradeMessage =
      'Your subscription does not support additional profiles. Please upgrade to Family or Pro.';
    // Throw the typed error directly from the mocked fetch — this is what the
    // real `customFetch` in api-client.ts converts a 402+code response into.
    // The test's `useApiClient` mock uses raw `hc(...)` and does not reproduce
    // the customFetch error-classification layer, so we simulate its output
    // here. See api-client.ts:248 for the production conversion.
    const { UpstreamError } = require('../lib/api-errors');
    mockFetch.mockImplementationOnce(() => {
      throw new UpstreamError(upgradeMessage, 'PROFILE_LIMIT_EXCEEDED', 402);
    });

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('create-profile-name'),
      'Test Child',
    );
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2013, 4, 1));
    });
    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    expect(alertCall[0]).toBe('Upgrade required');
    expect(alertCall[1]).toBe(upgradeMessage);
    // Two buttons: "Not now" (cancel) + "See plans" (action)
    const buttons = alertCall[2] as Array<{
      text?: string;
      style?: string;
      onPress?: () => void;
    }>;
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.text).toBe('Not now');
    expect(buttons[0]?.style).toBe('cancel');
    expect(buttons[1]?.text).toBe('See plans');

    // Pressing "See plans" routes to the subscription screen
    buttons[1]?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');

    // The inline error banner must NOT be shown — the alert is the surface.
    expect(screen.queryByTestId('create-profile-error')).toBeNull();
  });

  // [BUG-947] HMR resilience: Metro HMR can reload api-errors.ts and create a
  // new class identity, breaking `instanceof UpstreamError`. The fix reads
  // `.message` via plain property access, so PROFILE_LIMIT_EXCEEDED is
  // classified correctly even when instanceof would return false.
  it('[BUG-947] surfaces upgrade alert with correct message when instanceof would fail (HMR)', async () => {
    const upgradeMessage = 'Server-provided upgrade message for HMR test.';
    // Simulate HMR identity mismatch: throw a plain Error with the same shape
    // as UpstreamError but constructed from a *different* Error class (as if
    // api-errors.ts was reloaded). `instanceof UpstreamError` would return false
    // for this object, but `.code` is still readable.
    const hmrError = Object.assign(new Error(upgradeMessage), {
      name: 'UpstreamError',
      code: 'PROFILE_LIMIT_EXCEEDED',
      status: 402,
    });
    mockFetch.mockImplementationOnce(() => {
      throw hmrError;
    });

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('create-profile-name'),
      'Test Child',
    );
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2013, 4, 1));
    });
    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    expect(alertCall[0]).toBe('Upgrade required');
    // Server-provided message must be surfaced — NOT the fallback string.
    expect(alertCall[1]).toBe(upgradeMessage);
    const buttons = alertCall[2] as Array<{
      text?: string;
      style?: string;
      onPress?: () => void;
    }>;
    expect(buttons).toHaveLength(2);
    expect(buttons[1]?.text).toBe('See plans');

    // Pressing "See plans" routes to the subscription screen
    buttons[1]?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');

    // No inline error banner — alert is the surface.
    expect(screen.queryByTestId('create-profile-error')).toBeNull();
  });

  // [WI-824] ACCOUNT-05/35 coverage gap: the existing BUG-947 test exercises the
  // default (isAddingChild=false / solo first-profile) path. This test covers the
  // isAddingChild=true path (?for=child param) so the same upgrade-alert branch is
  // verified for parent-adds-child flows opened via create-profile.tsx.
  // The catch block is shared, so this is defense-in-depth rather than a new code
  // path, but it anchors the ?for=child entry point explicitly.
  it('[WI-824] surfaces upgrade alert on PROFILE_LIMIT_EXCEEDED when opened with ?for=child', async () => {
    mockSearchParams = { for: 'child' };
    const upgradeMessage =
      'Your subscription does not support additional profiles. Please upgrade to Family or Pro.';
    const { UpstreamError } = require('../lib/api-errors');
    mockFetch.mockImplementationOnce(() => {
      throw new UpstreamError(upgradeMessage, 'PROFILE_LIMIT_EXCEEDED', 402);
    });

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('create-profile-name'),
      'Test Child',
    );
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2013, 4, 1));
    });
    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    expect(alertCall[0]).toBe('Upgrade required');
    expect(alertCall[1]).toBe(upgradeMessage);
    const buttons = alertCall[2] as Array<{
      text?: string;
      style?: string;
      onPress?: () => void;
    }>;
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.text).toBe('Not now');
    expect(buttons[0]?.style).toBe('cancel');
    expect(buttons[1]?.text).toBe('See plans');

    buttons[1]?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');

    expect(screen.queryByTestId('create-profile-error')).toBeNull();
  });

  it('navigates back on cancel', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-cancel'));

    expect(mockBack).toHaveBeenCalled();
  });

  it('replaces home on cancel when there is no back history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-cancel'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  // ---------------------------------------------------------------------------
  // BUG-301: isParentAddingChild code path tests
  // ---------------------------------------------------------------------------

  // [BUG-UX-PROFILE-TIMEOUT] 30s hard UI-level timeout on profile creation POST.
  describe('[BUG-UX-PROFILE-TIMEOUT] 30s safety timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // POST never resolves — simulates a hung network call.
      mockFetch.mockReturnValue(new Promise(() => undefined));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function fillAndSubmit() {
      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(async () => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });
      fireEvent.press(screen.getByTestId('create-profile-submit'));
    }

    it('does NOT show the timeout error before 30s elapses', async () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      act(() => {
        jest.advanceTimersByTime(29_999);
      });

      expect(screen.queryByTestId('create-profile-error')).toBeNull();
    });

    it('shows inline timeout error and restores form after 30s', async () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      // Error message is shown.
      screen.getByTestId('create-profile-error');
      // Form is restored so the user can retry — submit button should be
      // enabled again (loading=false, name + date still set).
      const button = screen.getByTestId('create-profile-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled,
      ).toBeFalsy();
    });

    it('clears the safety timeout when loading flag resets before 30s (cleanup)', async () => {
      // The timeout watches only the create POST. Once the POST resolves or
      // the component unmounts, the timer must be cancelled.
      const { unmount } = render(<CreateProfileScreen />, {
        wrapper: Wrapper,
      });
      await fillAndSubmit();

      // Advance to 15s — still loading, no error yet.
      act(() => {
        jest.advanceTimersByTime(15_000);
      });
      expect(screen.queryByTestId('create-profile-error')).toBeNull();

      // Simulate POST completing: the component resets loading via setLoading(false)
      // in the finally block. We can't easily reach that without a real resolve,
      // so instead unmount and verify the timer doesn't fire after unmount.
      // Unmounting the component calls the useEffect cleanup (clearTimeout).
      unmount();

      // Advance well past 30s — timer should have been cleared on unmount.
      act(() => {
        jest.advanceTimersByTime(20_000);
      });

      // No uncaught timer fire — the test would throw if setLoading/setError
      // were called on an unmounted component without cleanup.
    });

    it('aborts the in-flight create before allowing a post-timeout retry to succeed once', async () => {
      const newProfile = {
        id: 'retry-id',
        accountId: 'a1',
        displayName: 'Sam',
        avatarUrl: null,
        birthYear: 2000,
        location: null,
        isOwner: true,
        hasPremiumLlm: false,
        consentStatus: null,
        createdAt: '2026-02-16T00:00:00Z',
        updatedAt: '2026-02-16T00:00:00Z',
      };
      const abortError = Object.assign(new Error('Aborted'), {
        name: 'AbortError',
      });
      let firstSignal: AbortSignal | undefined;
      mockFetch
        .mockImplementationOnce((_input: RequestInfo, init?: RequestInit) => {
          firstSignal = init?.signal ?? undefined;
          return new Promise((_resolve, reject) => {
            firstSignal?.addEventListener('abort', () => reject(abortError));
          });
        })
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: newProfile }), {
            status: 200,
          }),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(firstSignal).toBeDefined();
      expect(firstSignal?.aborted).toBe(true);
      screen.getByTestId('create-profile-error');

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockSwitchProfile).toHaveBeenCalledWith('retry-id');
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockSwitchProfile).toHaveBeenCalledTimes(1);
    });

    it('ignores a timed-out create response that resolves after the form unlocks', async () => {
      const staleProfile = {
        id: 'stale-id',
        accountId: 'a1',
        displayName: 'Sam',
        avatarUrl: null,
        birthYear: 2000,
        location: null,
        isOwner: true,
        hasPremiumLlm: false,
        consentStatus: null,
        createdAt: '2026-02-16T00:00:00Z',
        updatedAt: '2026-02-16T00:00:00Z',
      };
      const retryProfile = { ...staleProfile, id: 'retry-id' };
      let firstSignal: AbortSignal | undefined;
      let resolveFirst: ((response: Response) => void) | undefined = undefined;
      mockFetch
        .mockImplementationOnce((_input: RequestInfo, init?: RequestInit) => {
          firstSignal = init?.signal ?? undefined;
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          });
        })
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: retryProfile }), {
            status: 200,
          }),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(firstSignal?.aborted).toBe(true);
      await act(async () => {
        resolveFirst?.(
          new Response(JSON.stringify({ profile: staleProfile }), {
            status: 200,
          }),
        );
        await Promise.resolve();
      });
      expect(mockSwitchProfile).not.toHaveBeenCalledWith('stale-id');

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockSwitchProfile).toHaveBeenCalledWith('retry-id');
      });
      expect(mockSwitchProfile).not.toHaveBeenCalledWith('stale-id');
    });

    it('keeps the retry timeout active when a stale first response resolves after retry starts', async () => {
      const staleProfile = {
        id: 'stale-id',
        accountId: 'a1',
        displayName: 'Sam',
        avatarUrl: null,
        birthYear: 2000,
        location: null,
        isOwner: true,
        hasPremiumLlm: false,
        consentStatus: null,
        createdAt: '2026-02-16T00:00:00Z',
        updatedAt: '2026-02-16T00:00:00Z',
      };
      let firstSignal: AbortSignal | undefined;
      let secondSignal: AbortSignal | undefined;
      let resolveFirst: ((response: Response) => void) | undefined = undefined;
      mockFetch
        .mockImplementationOnce((_input: RequestInfo, init?: RequestInit) => {
          firstSignal = init?.signal ?? undefined;
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          });
        })
        .mockImplementationOnce((_input: RequestInfo, init?: RequestInit) => {
          secondSignal = init?.signal ?? undefined;
          return new Promise(() => undefined);
        });

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(firstSignal?.aborted).toBe(true);
      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
      expect(screen.queryByTestId('create-profile-error')).toBeNull();

      await act(async () => {
        resolveFirst?.(
          new Response(JSON.stringify({ profile: staleProfile }), {
            status: 200,
          }),
        );
        await Promise.resolve();
      });

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(secondSignal?.aborted).toBe(true);
      screen.getByTestId('create-profile-error');
      expect(
        screen.getByTestId('create-profile-submit').props.accessibilityState
          ?.disabled,
      ).toBe(false);
    });

    it('keeps duplicate-submit lock active after the POST resolves while success work finishes', async () => {
      const newProfile = {
        id: 'slow-success-id',
        accountId: 'a1',
        displayName: 'Sam',
        avatarUrl: null,
        birthYear: 2000,
        location: null,
        isOwner: true,
        hasPremiumLlm: false,
        consentStatus: null,
        createdAt: '2026-02-16T00:00:00Z',
        updatedAt: '2026-02-16T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: newProfile }), { status: 200 }),
      );
      mockSwitchProfile.mockReturnValueOnce(new Promise(() => undefined));

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      await waitFor(() => {
        expect(mockSwitchProfile).toHaveBeenCalledWith('slow-success-id');
      });

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(screen.queryByTestId('create-profile-error')).toBeNull();
      expect(
        screen.getByTestId('create-profile-submit').props.accessibilityState
          ?.disabled,
      ).toBe(true);

      fireEvent.press(screen.getByTestId('create-profile-submit'));
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('clears the 30s POST timeout when the POST resolves before slower success work finishes', async () => {
      const newProfile = {
        id: 'slow-family-success-id',
        accountId: 'a1',
        displayName: 'Sam',
        avatarUrl: null,
        birthYear: 2000,
        location: null,
        isOwner: true,
        hasPremiumLlm: false,
        consentStatus: null,
        createdAt: '2026-02-16T00:00:00Z',
        updatedAt: '2026-02-16T00:00:00Z',
      };
      let resolveCreate: ((response: Response) => void) | undefined = undefined;
      let resolveAppContext: ((response: Response) => void) | undefined =
        undefined;
      let resolveSwitch: (() => void) | undefined = undefined;
      mockSwitchProfile.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSwitch = resolve;
          }),
      );
      mockFetch
        .mockImplementationOnce(() => {
          return new Promise<Response>((resolve) => {
            resolveCreate = resolve;
          });
        })
        .mockImplementationOnce(() => {
          return new Promise<Response>((resolve) => {
            resolveAppContext = resolve;
          });
        });

      // Parent audience → the family PATCH (2nd fetch) fires; this test
      // exercises the timeout interplay across both the POST and the PATCH.
      mockAudience = 'parent';
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(async () => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });
      fireEvent.press(screen.getByTestId('create-profile-submit'));

      // Advance to 20s — fires the 0ms dispatch_fn state-notification timer
      // (createPostPending=true → "pending" mutation state), so React registers
      // the 30s abort useEffect timer. Leave 10s of fake-time buffer so
      // waitFor's per-poll 1ms advances stay well within the 30s threshold.
      act(() => {
        jest.advanceTimersByTime(20_000);
      });

      // useCreateProfile routes POST through useMutation. execute() does
      // `await undefined` (for onMutate) before calling run(), so mockFetch
      // (1st call) fires as a microtask — NOT synchronously inside the act
      // above. The leading `await Promise.resolve()` yields to the microtask
      // queue so execute() → run() → mockFetch fires and resolveCreate is
      // populated before we call it. Without this yield, resolveCreate is still
      // undefined when called, making the POST deferred Promise never resolve.
      await act(async () => {
        await Promise.resolve();
        resolveCreate?.(
          new Response(JSON.stringify({ profile: newProfile }), {
            status: 200,
          }),
        );
        await Promise.resolve();
      });

      // Use interval:1 so waitFor advances only 1ms of fake time per poll
      // instead of the default 50ms. Default 50ms × ~200 polls = 10s of fake
      // time, which from t=20s pushes past the 30s abort threshold before
      // setCreatePostPending(false) can cancel the timer.
      await waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalledTimes(2);
        },
        { interval: 1 },
      );

      act(() => {
        jest.advanceTimersByTime(1_000);
      });

      expect(screen.queryByTestId('create-profile-error')).toBeNull();
      expect(
        screen.getByTestId('create-profile-submit').props.accessibilityState
          ?.disabled,
      ).toBe(true);

      await act(async () => {
        resolveAppContext?.(
          new Response(JSON.stringify({ profile: newProfile }), {
            status: 200,
          }),
        );
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(mockSwitchProfile).toHaveBeenCalledWith(
          'slow-family-success-id',
        );
      });
      await act(async () => {
        resolveSwitch?.();
        await Promise.resolve();
      });
    });

    it('ignores a timed-out create failure that rejects after a retry succeeds', async () => {
      const retryProfile = {
        id: 'retry-id',
        accountId: 'a1',
        displayName: 'Sam',
        avatarUrl: null,
        birthYear: 2000,
        location: null,
        isOwner: true,
        hasPremiumLlm: false,
        consentStatus: null,
        createdAt: '2026-02-16T00:00:00Z',
        updatedAt: '2026-02-16T00:00:00Z',
      };
      let rejectFirst: ((reason: Error) => void) | undefined = undefined;
      mockFetch
        .mockImplementationOnce(() => {
          return new Promise<Response>((_resolve, reject) => {
            rejectFirst = reject;
          });
        })
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: retryProfile }), {
            status: 200,
          }),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));
      await waitFor(() => {
        expect(mockSwitchProfile).toHaveBeenCalledWith('retry-id');
      });

      await act(async () => {
        rejectFirst?.(new Error('stale network failure'));
        await Promise.resolve();
      });

      expect(screen.queryByTestId('create-profile-error')).toBeNull();
    });

    it('shows an error for AbortError failures not caused by this request signal', async () => {
      const abortError = Object.assign(new Error('Unexpected abort'), {
        name: 'AbortError',
      });
      mockFetch.mockRejectedValueOnce(abortError);

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      await fillAndSubmit();
      await act(async () => {
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          String(screen.getByTestId('create-profile-error').props.children),
        ).toContain("can't be reached");
      });
    });

    it('ignores a synchronous double-tap while profile creation is already in flight', async () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(async () => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });

      const submit = screen.getByTestId('create-profile-submit');
      // Async act so the fake-timer-based React MessageChannel scheduler
      // (used by TanStack Query v5 useMutation) flushes between the presses.
      // A sync act() does not advance fake timers, so the mutation function
      // never fires within the sync boundary.
      await act(async () => {
        fireEvent.press(submit);
        fireEvent.press(submit);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('parent adding child', () => {
    const parentProfile: NavigationProfile = {
      id: 'parent-id',
      accountId: 'a1',
      displayName: 'Mum',
      avatarUrl: null,
      birthYear: 1985,
      location: null,
      isOwner: true,
      hasPremiumLlm: false,
      defaultAppContext: null,
      hasFamilyLinks: false,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: null,
      linkCreatedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const childProfile: NavigationProfile = {
      id: 'child-new',
      accountId: 'a1',
      displayName: 'Lily',
      avatarUrl: null,
      birthYear: birthDateAtMinimumAge().getFullYear(),
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      defaultAppContext: null,
      hasFamilyLinks: true,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: 'CONSENTED',
      linkCreatedAt: '2026-02-16T00:00:00Z',
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    beforeEach(() => {
      mockUseProfile.mockReturnValue({
        switchProfile: mockSwitchProfile,
        activeProfile: parentProfile,
        profiles: [parentProfile],
      });
    });

    it('[QA-08] shows confirmation alert and does NOT switch profile when parent adds child', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: childProfile }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              profile: {
                ...parentProfile,
                defaultAppContext: 'family',
                hasFamilyLinks: true,
              },
            }),
            { status: 200 },
          ),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Profile created',
          "Lily's profile is ready. You can open it from Family mode.",
          undefined,
          undefined,
        );
      });

      // Parent stays on their own profile — switchProfile must NOT be called
      expect(mockSwitchProfile).not.toHaveBeenCalled();
      // Navigation back (handleClose) should fire
      expect(mockBack).toHaveBeenCalled();
      expect(getMentorBornCeremonySnapshot().requestCount).toBe(0);
    });

    it('does not consume the child mentor-born latch when parent admin creates a child', async () => {
      const patchedOwner: NavigationProfile = {
        ...parentProfile,
        defaultAppContext: 'family',
        hasFamilyLinks: true,
      };
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: childProfile }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: patchedOwner }), {
            status: 200,
          }),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(
        expoSecureStoreMock.__store.get(mentorBirthSeenKey(childProfile.id)),
      ).toBeUndefined();
      expect(screen.queryByTestId('mentor-birth-overlay')).toBeNull();
      expect(mockSwitchProfile).not.toHaveBeenCalled();
    });

    it('[WI-1611] persists family context on the active owner, not the returned child, when parent adds first child', async () => {
      const patchedOwner: NavigationProfile = {
        ...parentProfile,
        defaultAppContext: 'family',
        hasFamilyLinks: true,
      };
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: childProfile }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: patchedOwner }), {
            status: 200,
          }),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      const patchCall = mockFetch.mock.calls[1];
      expect(String(patchCall?.[0])).toContain(
        '/profiles/parent-id/app-context',
      );
      expect(String(patchCall?.[0])).not.toContain(
        '/profiles/child-new/app-context',
      );
      const patchInit = patchCall?.[1] as RequestInit | undefined;
      expect(patchInit?.method).toBe('PATCH');
      const patchBody = JSON.parse(String(patchInit?.body)) as Record<
        string,
        unknown
      >;
      expect(patchBody.defaultAppContext).toBe('family');
      expect(mockSwitchProfile).not.toHaveBeenCalled();

      const resolvedProfiles = [patchedOwner, childProfile];
      const flagCases = [
        {
          flags: {
            MODE_NAV_V0_ENABLED: false,
            MODE_NAV_V1_ENABLED: false,
          },
          appContext: null,
        },
        {
          flags: {
            MODE_NAV_V0_ENABLED: true,
            MODE_NAV_V1_ENABLED: false,
          },
          appContext: 'family' as const,
        },
        {
          flags: {
            MODE_NAV_V0_ENABLED: true,
            MODE_NAV_V1_ENABLED: true,
          },
          appContext: null,
        },
      ];
      for (const flagCase of flagCases) {
        const contract = resolveNavigationContract({
          activeProfile: patchedOwner,
          appContext: flagCase.appContext,
          flags: flagCase.flags,
          isParentProxy: false,
          profiles: resolvedProfiles,
          role: 'owner',
          subscription: {
            status: 'ready',
            tier: 'family',
            effectiveAccessTier: 'family',
            billingAccess: null,
          },
        });
        expect(contract.home.screen).toBe('FamilyHome');
      }
    });

    it('[WI-1611] keeps the owner active and updates owner family context when adding another child', async () => {
      const existingChild: NavigationProfile = {
        id: 'child-existing',
        accountId: 'a1',
        displayName: 'Max',
        avatarUrl: null,
        birthYear: birthDateAtMinimumAge().getFullYear(),
        location: null,
        isOwner: false,
        hasPremiumLlm: false,
        defaultAppContext: null,
        hasFamilyLinks: true,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: 'CONSENTED',
        linkCreatedAt: '2026-01-02T00:00:00Z',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      };
      const familyOwner: NavigationProfile = {
        ...parentProfile,
        defaultAppContext: 'study',
        hasFamilyLinks: true,
      };
      const patchedOwner: NavigationProfile = {
        ...familyOwner,
        defaultAppContext: 'family',
      };
      mockUseProfile.mockReturnValue({
        switchProfile: mockSwitchProfile,
        activeProfile: familyOwner,
        profiles: [familyOwner, existingChild],
      });
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: childProfile }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: patchedOwner }), {
            status: 200,
          }),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(String(mockFetch.mock.calls[1]?.[0])).toContain(
        '/profiles/parent-id/app-context',
      );
      expect(mockSwitchProfile).not.toHaveBeenCalled();
      expect(mockSwitchProfile).not.toHaveBeenCalledWith('child-new');
    });

    it('[WI-1611] preserves child creation and shows a family-mode recovery action when owner context PATCH fails', async () => {
      jest.spyOn(console, 'warn').mockImplementationOnce(() => undefined);
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: childProfile }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response('Patch failed', {
            status: 403,
            statusText: 'Forbidden',
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              profile: {
                ...parentProfile,
                defaultAppContext: 'family',
                hasFamilyLinks: true,
              },
            }),
            { status: 200 },
          ),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Profile created',
          "Lily's profile is ready, but we could not switch you to Family mode automatically.",
          [
            { text: 'Not now', style: 'cancel' },
            expect.objectContaining({
              text: 'Switch to Family mode',
            }),
          ],
          undefined,
        );
      });

      const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
      await act(async () => {
        buttons[1].onPress();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });
      expect(String(mockFetch.mock.calls[2]?.[0])).toContain(
        '/profiles/parent-id/app-context',
      );
      expect(mockSwitchProfile).not.toHaveBeenCalled();
    });

    it('[WI-1677] stops offering family-mode retry after the retry also fails', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: childProfile }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response('Patch failed', {
            status: 503,
            statusText: 'Service Unavailable',
          }),
        )
        .mockResolvedValueOnce(
          new Response('Retry failed', {
            status: 503,
            statusText: 'Service Unavailable',
          }),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledTimes(1);
      });

      const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
      await act(async () => {
        buttons[1].onPress();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledTimes(2);
      });
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Profile created',
        "Lily's profile is ready, but we still could not switch you to Family mode. You can switch to Family mode later from More > Account.",
        [{ text: 'Not now', style: 'cancel' }],
        undefined,
      );
      const retryCall = mockFetch.mock.calls[2];
      expect(String(retryCall?.[0])).toContain(
        '/profiles/parent-id/app-context',
      );
      expect(mockSwitchProfile).not.toHaveBeenCalled();
    });

    it('navigates home when parent adds child and no back history', async () => {
      mockCanGoBack.mockReturnValue(false);
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: childProfile }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              profile: {
                ...parentProfile,
                defaultAppContext: 'family',
                hasFamilyLinks: true,
              },
            }),
            { status: 200 },
          ),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      });
      expect(mockSwitchProfile).not.toHaveBeenCalled();
    });

    it('shows error banner on API failure — no alert or navigation', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Server error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Lily');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, birthDateAtMinimumAge());
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        screen.getByTestId('create-profile-error');
      });

      // No confirmation alert or navigation on failure
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockSwitchProfile).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-375] Auth gate — deep-link entry to root-level screen
  // ---------------------------------------------------------------------------
  describe('auth gate [BUG-375]', () => {
    it('redirects to /sign-in when an unauthenticated user opens a create-profile deep-link', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: false,
      });

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      screen.getByTestId('mock-redirect-/sign-in');
      expect(screen.queryByTestId('create-profile-name')).toBeNull();
      expect(screen.queryByTestId('create-profile-submit')).toBeNull();
    });

    it('shows a spinner (not redirect) while Clerk is still hydrating', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: false,
        isSignedIn: false,
      });

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      screen.getByTestId('create-profile-auth-loading');
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });

    it('renders the form when the user is signed in', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
      });

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      screen.getByTestId('create-profile-name');
      screen.getByTestId('create-profile-submit');
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // WI-297 — full birth date submitted with birthMonth + birthDay
  // ---------------------------------------------------------------------------

  describe('WI-297 — full birth date in POST body', () => {
    it('[break-test] submitted body includes birthMonth and birthDay alongside birthYear', async () => {
      const newProfile = {
        id: 'wi297-id',
        accountId: 'a1',
        displayName: 'WI297 Test',
        avatarUrl: null,
        birthYear: 2005,
        location: null,
        isOwner: false,
        hasPremiumLlm: false,
        consentStatus: null,
        createdAt: '2026-02-16T00:00:00Z',
        updatedAt: '2026-02-16T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: newProfile }), { status: 200 }),
      );

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('create-profile-name'),
        'WI297 Test',
      );

      // Select June 15, 2005 — month=6, day=15
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2005, 5, 15)); // June 15 (0-based)
      });

      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Extract the request body from the fetch call
      const fetchCall = mockFetch.mock.calls[0];
      const requestInit = fetchCall?.[1] as RequestInit | undefined;
      const body = JSON.parse(String(requestInit?.body)) as Record<
        string,
        unknown
      >;

      expect(body.birthYear).toBe(2005);
      // WI-297: month is 1-based (June = 6)
      expect(body.birthMonth).toBe(6);
      expect(body.birthDay).toBe(15);
    });
  });

  // ---- WI-296: Entry gates — non-owner role and proxy mode ----

  describe('access gate: non-owner role', () => {
    beforeEach(() => {
      mockActiveProfileRole = 'child';
      mockUseProfile.mockReturnValue({
        switchProfile: mockSwitchProfile,
        activeProfile: { id: 'child-1', isOwner: false },
        profiles: [{ id: 'child-1', isOwner: false }],
      });
    });

    it('renders the blocked state, not the form', () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      screen.getByTestId('create-profile-access-blocked');
      expect(screen.queryByTestId('create-profile-submit')).toBeNull();
    });

    it('does not fire the create mutation when blocked by non-owner role', async () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      // The form is not rendered, so no submit can happen
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('access gate: proxy mode', () => {
    beforeEach(() => {
      // Owner role but in proxy mode (parent viewing child's context)
      mockActiveProfileRole = 'owner';
      mockIsParentProxy = true;
      mockUseProfile.mockReturnValue({
        switchProfile: mockSwitchProfile,
        activeProfile: { id: 'parent-1', isOwner: true },
        profiles: [
          { id: 'parent-1', isOwner: true },
          { id: 'child-1', isOwner: false },
        ],
      });
    });

    it('renders the blocked state, not the form', () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      screen.getByTestId('create-profile-access-blocked');
      expect(screen.queryByTestId('create-profile-submit')).toBeNull();
    });

    it('does not fire the create mutation when blocked by proxy mode', async () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Audience-driven first-profile setup (chooser asks once; no in-form picker)
  // ---------------------------------------------------------------------------

  describe('audience-driven first-profile setup', () => {
    const adultOwner = {
      id: 'adult-id',
      accountId: 'a1',
      displayName: 'Sam',
      avatarUrl: null,
      birthYear: 2000,
      location: null,
      isOwner: true,
      hasPremiumLlm: false,
      consentStatus: null,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    it('never renders the removed Study/Family intent picker (learner, adult)', async () => {
      mockAudience = 'learner';
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });
      expect(screen.queryByTestId('create-profile-intent-picker')).toBeNull();
      expect(screen.queryByTestId('create-profile-intent-study')).toBeNull();
      expect(screen.queryByTestId('create-profile-intent-family')).toBeNull();
    });

    it('never renders the picker (parent audience, adult)', async () => {
      mockAudience = 'parent';
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });
      expect(screen.queryByTestId('create-profile-intent-picker')).toBeNull();
    });

    it('parent audience asks for the adult account holder, not the learner', () => {
      mockAudience = 'parent';

      render(<CreateProfileScreen />, { wrapper: Wrapper });

      screen.getByText('Tell us about you');
      screen.getByText('Your display name');
      screen.getByText('Your birth date');
      screen.getByText(/You can add your child next/);
      expect(screen.queryByText("Who's the learner?")).toBeNull();
    });

    it('enables submit for an adult first-profile with no intent tap', async () => {
      render(<CreateProfileScreen />, { wrapper: Wrapper });
      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });
      const button = screen.getByTestId('create-profile-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled,
      ).toBeFalsy();
    });

    it('parent audience (adult): PATCHes app-context to family and routes to add-a-child', async () => {
      mockAudience = 'parent';
      const patchedProfile = { ...adultOwner, defaultAppContext: 'family' };
      // 1st call = POST /profiles, 2nd = PATCH /profiles/:id/app-context
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: adultOwner }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ profile: patchedProfile }), {
            status: 200,
          }),
        );

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });
      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      const patchCall = mockFetch.mock.calls[1];
      expect(String(patchCall?.[0])).toContain(
        '/profiles/adult-id/app-context',
      );
      const patchInit = patchCall?.[1] as RequestInit | undefined;
      expect(patchInit?.method).toBe('PATCH');
      const patchBody = JSON.parse(String(patchInit?.body)) as Record<
        string,
        unknown
      >;
      expect(patchBody.defaultAppContext).toBe('family');

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith({
          pathname: '/create-profile',
          params: { for: 'child' },
        });
      });
      expect(mockSwitchProfile).toHaveBeenCalledWith('adult-id');
      expect(getMentorBornCeremonySnapshot().requestCount).toBe(0);
    });

    it('learner audience (adult): no PATCH, no add-child redirect, returns to home', async () => {
      mockAudience = 'learner';
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: adultOwner }), { status: 200 }),
      );

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
      });
      fireEvent.press(screen.getByTestId('create-profile-submit'));

      await waitFor(() => {
        expect(mockSwitchProfile).toHaveBeenCalledWith('adult-id');
      });
      // Single POST only — no family PATCH.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // handleClose → back (canGoBack true); NOT the add-child redirect.
      expect(mockBack).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalledWith({
        pathname: '/create-profile',
        params: { for: 'child' },
      });
      expect(getMentorBornCeremonySnapshot()).toMatchObject({
        activeRequest: {
          profileId: 'adult-id',
          reason: 'first-profile-created',
        },
        requestCount: 1,
      });
    });

    it('parent audience with a minor birth date: shows adult-account error and does not create a solo learner', async () => {
      mockAudience = 'parent';

      render(<CreateProfileScreen />, { wrapper: Wrapper });
      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Kid');
      fireEvent.press(screen.getByTestId('create-profile-birthdate'));
      await act(() => {
        datePickerOnChange?.({ type: 'set' }, new Date(2014, 5, 15));
      });
      fireEvent.press(screen.getByTestId('create-profile-submit'));

      screen.getByText(
        'Parent accounts need an adult birth date. Enter your own details first, then add your child next.',
      );
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSwitchProfile).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalledWith({
        pathname: '/create-profile',
        params: { for: 'child' },
      });
    });
  });
});
