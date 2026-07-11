import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createScreenWrapper,
  createTestProfile,
} from '../../../test-utils/screen-render';
import {
  ProfileContext,
  type Profile,
  type ProfileContextValue,
} from '../../../lib/profile';
import { Sentry } from '../../../lib/sentry';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

let mockSearchParams: Record<string, string> = {
  subjectId: 'subject-1',
  subjectName: 'English',
  step: '2',
  totalSteps: '4',
};

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme */,
  () => ({
    useThemeColors: () => ({
      primary: '#6366f1',
      textSecondary: '#6b7280',
    }),
  }),
);

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: wraps native Alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

// The real ProfileContext is supplied per-render via `createScreenWrapper`
// (see `renderPronouns`). These holders describe the active profile + load
// state the screen reads through the real `useProfile()` hook.
let mockActiveProfile:
  | {
      id: string;
      birthYear?: number;
      pronouns?: string | null;
    }
  | undefined = {
  id: 'profile-1',
  birthYear: 2005,
  pronouns: null,
};
let mockProfileIsLoading = false;

const mockUpdatePronounsMutate = jest.fn();
let mockUpdatePronounsIsPending = false;

jest.mock(
  '../../../hooks/use-onboarding-dimensions' /* gc1-allow: onboarding hook fetches from API via React Query */,
  () => ({
    useUpdatePronouns: () => ({
      mutate: mockUpdatePronounsMutate,
      isPending: mockUpdatePronounsIsPending,
    }),
  }),
);

const mockStartFirstCurriculumMutate = jest.fn();

jest.mock(
  '../../../hooks/use-sessions' /* gc1-allow: session hook fetches from API via React Query */,
  () => ({
    useStartFirstCurriculumSession: () => ({
      mutate: mockStartFirstCurriculumMutate,
      isPending: false,
    }),
  }),
);

// OnboardingStepIndicator stub
jest.mock(
  '../../../components/onboarding/OnboardingStepIndicator' /* gc1-allow: screen test only needs step indicator presence */,
  () => ({
    OnboardingStepIndicator: () => {
      const { View } = require('react-native');
      return <View testID="step-indicator" />;
    },
  }),
);

jest.mock(
  '../../../lib/onboarding-step-labels' /* gc1-allow: deterministic labels for route-param test */,
  () => ({
    getOnboardingStepLabels: () => ['Step 1', 'Step 2', 'Step 3', 'Step 4'],
  }),
);

// PRONOUNS_PROMPT_MIN_AGE is imported from the real @eduagent/schemas package.
// The threshold is 13 (see packages/schemas/src/profiles.ts) — if that value
// changes, the age-gate test below ("age-gates below-13 learners") should
// continue to use a birthYear that yields an age below the real constant.

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

const mockReportActivationEvent = jest.fn();
jest.mock('../../../lib/activation-events', () => ({
  ...jest.requireActual('../../../lib/activation-events'),
  useReportActivationEvent: () => mockReportActivationEvent,
}));

const PronounsScreen = require('./pronouns').default as React.ComponentType;

// Render the screen against the REAL ProfileContext, projecting the current
// `mockActiveProfile` / `mockProfileIsLoading` holders into a full Profile.
// `createScreenWrapper` accepts `activeProfile: null` + `isLoading` so the
// loading / not-yet-present cases (#6b) are exercised through the real hook.
function renderPronouns() {
  const activeProfile: Profile | null = mockActiveProfile
    ? createTestProfile({
        id: mockActiveProfile.id,
        birthYear: mockActiveProfile.birthYear,
        pronouns: mockActiveProfile.pronouns ?? null,
      })
    : null;
  const { wrapper } = createScreenWrapper({
    activeProfile,
    profiles: activeProfile ? [activeProfile] : [],
    isLoading: mockProfileIsLoading,
  });
  return render(<PronounsScreen />, { wrapper });
}

// Like `renderPronouns`, but the ProfileContext value is recomputed from the
// `mockActiveProfile` / `mockProfileIsLoading` holders on EVERY render. This
// lets a test mutate the holders then call `rerender(...)` to simulate the
// profile resolving after the initial (loading) render — the real
// late-profile-resolve race that BUG-799 fixes. (`renderPronouns` freezes the
// context value at call time, so its `rerender` cannot model a profile change.)
function renderPronounsLive() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  function LiveWrapper({ children }: { children: React.ReactNode }) {
    const activeProfile: Profile | null = mockActiveProfile
      ? createTestProfile({
          id: mockActiveProfile.id,
          birthYear: mockActiveProfile.birthYear,
          pronouns: mockActiveProfile.pronouns ?? null,
        })
      : null;
    const value: ProfileContextValue = {
      profiles: activeProfile ? [activeProfile] : [],
      activeProfile,
      isExplicitProxyMode: false,
      switchProfile: async () => ({ success: true }),
      isLoading: mockProfileIsLoading,
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: () => undefined,
    };
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider value={value}>
          {children}
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  }
  return render(<PronounsScreen />, { wrapper: LiveWrapper });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PronounsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePronounsIsPending = false;
    mockProfileIsLoading = false;
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: 2005, // ~19 years old — above age gate
      pronouns: null,
    };
    mockSearchParams = {
      subjectId: 'subject-1',
      subjectName: 'English',
      step: '2',
      totalSteps: '4',
    };
  });

  it('renders pronoun options and skip/continue buttons', () => {
    const { getByTestId } = renderPronouns();
    getByTestId('pronouns-option-she-her');
    getByTestId('pronouns-option-he-him');
    getByTestId('pronouns-option-they-them');
    getByTestId('pronouns-option-other');
    getByTestId('pronouns-continue');
    getByTestId('pronouns-skip');
  });

  it('selects she/her option when pressed', () => {
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-option-she-her'));
    // Continue should now be enabled
    expect(
      getByTestId('pronouns-continue').props.accessibilityState?.disabled,
    ).toBeFalsy();
  });

  it('shows custom input when "Other" is selected', () => {
    const { getByTestId, queryByTestId } = renderPronouns();
    // Initially no custom input
    expect(queryByTestId('pronouns-custom-input')).toBeNull();
    fireEvent.press(getByTestId('pronouns-option-other'));
    getByTestId('pronouns-custom-input');
  });

  it('continue is disabled when "Other" selected but no custom text', () => {
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-option-other'));
    // No text entered — continue should be disabled
    expect(
      getByTestId('pronouns-continue').props.accessibilityState?.disabled,
    ).toBeTruthy();
  });

  it('continue is enabled after typing custom pronouns', () => {
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-option-other'));
    fireEvent.changeText(getByTestId('pronouns-custom-input'), 'ze/zir');
    expect(
      getByTestId('pronouns-continue').props.accessibilityState?.disabled,
    ).toBeFalsy();
  });

  it('calls updatePronouns.mutate with selected preset when continue pressed', () => {
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-option-she-her'));
    fireEvent.press(getByTestId('pronouns-continue'));
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: 'she/her' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('calls updatePronouns.mutate with custom text when other + custom text continue pressed', () => {
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-option-other'));
    fireEvent.changeText(getByTestId('pronouns-custom-input'), 'ze/zir');
    fireEvent.press(getByTestId('pronouns-continue'));
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: 'ze/zir' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('starts the next onboarding step before best-effort clearing pronouns on skip', () => {
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-skip'));
    expect(mockStartFirstCurriculumMutate).toHaveBeenCalledWith(
      { sessionType: 'learning', inputMode: 'text' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: null },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    const startCallOrder =
      mockStartFirstCurriculumMutate.mock.invocationCallOrder[0];
    const clearCallOrder = mockUpdatePronounsMutate.mock.invocationCallOrder[0];
    expect(startCallOrder).toBeDefined();
    expect(clearCallOrder).toBeDefined();
    expect(startCallOrder!).toBeLessThan(clearCallOrder!);
  });

  it('captures skip clear failures to Sentry without blocking navigation', () => {
    const clearError = new Error('pronoun clear failed');
    const { getByTestId } = renderPronouns();

    fireEvent.press(getByTestId('pronouns-skip'));
    const skipClearCall = mockUpdatePronounsMutate.mock.calls[0];
    skipClearCall[1].onError(clearError);

    expect(mockStartFirstCurriculumMutate).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      clearError,
      expect.objectContaining({
        tags: expect.objectContaining({
          screen: 'onboarding_pronouns',
          action: 'skip_clear_pronouns',
        }),
      }),
    );
    expect(mockPlatformAlert).not.toHaveBeenCalled();
  });

  it('shows error alert on save failure', () => {
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-option-she-her'));
    fireEvent.press(getByTestId('pronouns-continue'));
    // Trigger the onError callback
    const call = mockUpdatePronounsMutate.mock.calls[0];
    call[1].onError();
    expect(mockPlatformAlert).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
  });

  it('navigates back to home when back button pressed', () => {
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/home',
    );
  });

  it('redirects to settings return path when returnTo=settings on skip', () => {
    mockSearchParams = { returnTo: 'settings' };
    const { getByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-skip'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/more',
    );
    // [WI-1689] A Settings re-edit is not onboarding completing.
    expect(mockReportActivationEvent).not.toHaveBeenCalled();
  });

  it('replaces home immediately on skip when no onboarding subject is present', () => {
    mockSearchParams = {};
    const { getByTestId, queryByTestId } = renderPronouns();
    fireEvent.press(getByTestId('pronouns-skip'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: null },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    // [WI-1689] Pronouns is the final onboarding step; reaching home via the
    // real onboarding flow (not a Settings re-edit) fires onboarding_completed.
    expect(mockReportActivationEvent).toHaveBeenCalledWith(
      'onboarding_completed',
      { route: 'onboarding.pronouns' },
    );
    expect(queryByTestId('pronouns-skip')).toBeNull();
  });

  it('age-gates below-13 learners (shows empty view, not form)', () => {
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: new Date().getFullYear() - 10, // 10 years old
      pronouns: null,
    };
    const { queryByTestId } = renderPronouns();
    // The pronoun options should NOT be rendered for under-13
    expect(queryByTestId('pronouns-option-she-her')).toBeNull();
    expect(queryByTestId('pronouns-continue')).toBeNull();
  });

  // [F-145] Break-test: the gate must fail CLOSED when the profile is resolved
  // but birthYear is missing/zero (anomalous data). Age cannot be verified, so
  // a possibly-sub-13 learner must NOT see the pronouns field. Previously
  // learnerAge === null made `ageGated` false and the form rendered (fail-open).
  it.each([null, 0, undefined])(
    'fails closed: hides the pronouns field when birthYear is %s on a resolved profile',
    (birthYear) => {
      mockProfileIsLoading = false;
      mockActiveProfile = {
        id: 'profile-1',
        birthYear: birthYear as unknown as number,
        pronouns: null,
      };
      const { queryByTestId } = renderPronouns();
      expect(queryByTestId('pronouns-option-she-her')).toBeNull();
      expect(queryByTestId('pronouns-continue')).toBeNull();
    },
  );

  it('pre-populates preset choice from existing profile pronouns', () => {
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: 2005,
      pronouns: 'he/him',
    };
    const { getByTestId } = renderPronouns();
    // he/him option should have selected state
    const heHim = getByTestId('pronouns-option-he-him');
    expect(heHim.props.accessibilityState?.selected).toBe(true);
  });

  // [#6b] While the profile is still resolving, the age gate cannot be
  // evaluated. The screen must NOT render the pronouns form — a possibly-
  // sub-13 learner could otherwise briefly see the field.
  it('[#6b] does NOT show the pronouns field while the profile is still loading', () => {
    mockProfileIsLoading = true;
    mockActiveProfile = undefined;
    const { queryByTestId, getByTestId } = renderPronouns();
    // Holding view is rendered instead of the form.
    getByTestId('pronouns-loading');
    expect(queryByTestId('pronouns-option-she-her')).toBeNull();
    expect(queryByTestId('pronouns-continue')).toBeNull();
  });

  // [#6b] Even when isLoading is false, if activeProfile is not yet present
  // (undefined) we cannot know the age — still hide the form.
  it('[#6b] does NOT show the pronouns field when activeProfile is not yet present', () => {
    mockProfileIsLoading = false;
    mockActiveProfile = undefined;
    const { queryByTestId, getByTestId } = renderPronouns();
    getByTestId('pronouns-loading');
    expect(queryByTestId('pronouns-option-she-her')).toBeNull();
  });

  // [BUG-799] Delayed profile load must not silently clear existing pronouns.
  // The screen can first render while the profile is still loading
  // (activeProfile undefined). When the profile later resolves with stored
  // pronouns, local `choice` must adopt them so pressing Continue PRESERVES
  // the value rather than submitting `pronouns: null` (data loss).
  it('[BUG-799] preserves existing pronouns when the profile resolves after the initial render', () => {
    // First render: profile still loading, no activeProfile.
    mockProfileIsLoading = true;
    mockActiveProfile = undefined;
    const { rerender, getByTestId } = renderPronounsLive();
    getByTestId('pronouns-loading');

    // Profile resolves with existing pronouns = "he/him".
    mockProfileIsLoading = false;
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: 2005,
      pronouns: 'he/him',
    };
    // Re-render through the real ProfileContext with the resolved profile.
    rerender(<PronounsScreen />);

    // The resolved pronoun must be reflected as selected and Continue enabled.
    const heHim = getByTestId('pronouns-option-he-him');
    expect(heHim.props.accessibilityState?.selected).toBe(true);
    expect(
      getByTestId('pronouns-continue').props.accessibilityState?.disabled,
    ).toBeFalsy();

    // Pressing Continue must PRESERVE "he/him", never send null.
    fireEvent.press(getByTestId('pronouns-continue'));
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: 'he/him' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockUpdatePronounsMutate).not.toHaveBeenCalledWith(
      { pronouns: null },
      expect.anything(),
    );
  });

  it('[BUG-799] Continue is disabled until an explicit pronoun choice is made (no accidental null clear)', () => {
    // Profile already loaded but has no stored pronouns and the user has not
    // chosen anything: Continue must not be pressable to avoid writing null.
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: 2005,
      pronouns: null,
    };
    const { getByTestId } = renderPronouns();
    expect(
      getByTestId('pronouns-continue').props.accessibilityState?.disabled,
    ).toBeTruthy();
    // Skip remains the explicit-clear / skip path.
    fireEvent.press(getByTestId('pronouns-skip'));
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: null },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('[BUG-799] an explicit user change wins over a late profile resolve', () => {
    // Render while loading, user picks they/them, THEN profile resolves with
    // a different stored value. The user's explicit choice must not be clobbered.
    mockProfileIsLoading = true;
    mockActiveProfile = undefined;
    const { rerender, getByTestId } = renderPronounsLive();

    // Profile resolves WITHOUT pronouns first so the form renders.
    mockProfileIsLoading = false;
    mockActiveProfile = { id: 'profile-1', birthYear: 2005, pronouns: null };
    rerender(<PronounsScreen />);

    // User explicitly chooses they/them.
    fireEvent.press(getByTestId('pronouns-option-they-them'));

    // A subsequent profile resolve carrying "he/him" must NOT overwrite the
    // user's explicit they/them selection (dirty guard).
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: 2005,
      pronouns: 'he/him',
    };
    rerender(<PronounsScreen />);

    fireEvent.press(getByTestId('pronouns-continue'));
    expect(mockUpdatePronounsMutate).toHaveBeenLastCalledWith(
      { pronouns: 'they/them' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  // [#6a] The age-gate effect calls navigateForward, which fires
  // startFirstCurriculumSession.mutate (a server side-effect). navigateForward's
  // identity changes whenever the mutation hook returns a new object, so a
  // re-render with ageGated still true must NOT fire mutate a second time.
  it('[#6a] fires the first-curriculum-session mutation at most once when re-rendered while age-gated', () => {
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: new Date().getFullYear() - 10, // 10 years old — age-gated
      pronouns: null,
    };
    const { rerender } = renderPronouns();
    // First render: age gate forwards once.
    expect(mockStartFirstCurriculumMutate).toHaveBeenCalledTimes(1);
    // Re-render (e.g. mutation hook returns a new object → navigateForward
    // identity changes → age-gate effect re-runs). Must not duplicate the
    // session-creation side-effect.
    rerender(<PronounsScreen />);
    rerender(<PronounsScreen />);
    expect(mockStartFirstCurriculumMutate).toHaveBeenCalledTimes(1);
  });
});
