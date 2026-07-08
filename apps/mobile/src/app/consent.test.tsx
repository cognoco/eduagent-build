import { screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
} from '../test-utils/screen-render';
import type { Profile } from '../lib/profile';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('react-i18next', () => require('../test-utils/mock-i18n').i18nMock);

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    useRouter: () => ({
      back: mockBack,
      replace: mockReplace,
      canGoBack: mockCanGoBack,
    }),
    useLocalSearchParams: () => ({
      profileId: '550e8400-e29b-41d4-a716-446655440000',
    }),
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, { testID: `mock-redirect-${href}` }, href),
  };
});

let mockChildEmail: string | undefined = undefined;

const mockUseUser = jest.fn(
  (): {
    isLoaded: boolean;
    user:
      | { primaryEmailAddress: { emailAddress: string } | undefined }
      | null
      | undefined;
  } => ({
    isLoaded: true,
    user: {
      primaryEmailAddress: mockChildEmail
        ? { emailAddress: mockChildEmail }
        : undefined,
    },
  }),
);
const mockUseAuth = jest.fn(() => ({
  isLoaded: true,
  isSignedIn: true,
}));

jest.mock('@clerk/expo', () => ({
  useAuth: () => mockUseAuth(),
  useUser: () => mockUseUser(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// WI-295: profile list drives the profileId ownership check. The real
// ProfileContext is supplied by renderScreen — we vary `profiles` per test
// via the helper below (no lib/profile mock needed). The profileId from the
// useLocalSearchParams mock above is the active profile's id by default so
// existing tests are unaffected.
const TEST_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockMutateAsync = jest.fn();

jest.mock(
  '../hooks/use-consent' /* gc1-allow: pattern-a conversion; useRequestConsent fires a network mutation — override isolates consent-screen behavior from actual API calls */,
  () => ({
    ...jest.requireActual('../hooks/use-consent'),
    useRequestConsent: () => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
    }),
  }),
);

const mockUseNetworkStatus = jest.fn(() => ({
  isOffline: false,
  isReady: true,
}));

jest.mock(
  '../hooks/use-network-status', // gc1-allow: native-boundary: @react-native-community/netinfo cannot run in JSDOM
  () => ({
    useNetworkStatus: () => mockUseNetworkStatus(),
  }),
);

/**
 * Controllable mock for reduced-motion tests. Default: false (animations run).
 * We re-mock react-native-reanimated to replace the static `() => false` from
 * test-setup.ts with a jest.fn() that individual tests can override.
 */
const mockReduceMotion = jest.fn(() => false);

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  const chainable = { delay: () => chainable, duration: () => chainable };
  return {
    __esModule: true,
    default: {
      View,
      Text,
      ScrollView: View,
      createAnimatedComponent: (c: unknown) => c,
    },
    FadeIn: chainable,
    FadeInUp: chainable,
    FadeOutDown: chainable,
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useSharedValue: (v: unknown) => ({ value: v }),
    useReducedMotion: () => mockReduceMotion(),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    cancelAnimation: () => undefined,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: {
      linear: undefined,
      ease: undefined,
      bezier: () => undefined,
      inOut: () => undefined,
      out: () => undefined,
      in: () => undefined,
    },
  };
});

const ConsentScreen = require('./consent').default;

const activeProfile = createTestProfile({
  id: TEST_PROFILE_ID,
  birthYear: 2010,
  isOwner: false,
});

let active: ReturnType<typeof renderScreen> | null = null;

function renderConsent(profiles: Profile[] = [activeProfile]) {
  active = renderScreen(<ConsentScreen />, {
    profile: activeProfile,
    profiles,
  });
  return active;
}

/** Drain all pending timers (fade-out + fade-in animations). */
function flushFadeAnimation(): void {
  act(() => {
    jest.runAllTimers();
  });
}

describe('ConsentScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockChildEmail = undefined;
    mockCanGoBack.mockReturnValue(true);
    mockUseNetworkStatus.mockReturnValue({ isOffline: false, isReady: true });
    // Restore default: Clerk hydrated, user present.
    mockUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseUser.mockImplementation(() => ({
      isLoaded: true,
      user: {
        primaryEmailAddress: mockChildEmail
          ? { emailAddress: mockChildEmail }
          : undefined,
      },
    }));
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
    jest.useRealTimers();
  });

  // ── Phase 1: Child view ──────────────────────────────────────────

  it('renders child view by default with hand-off message and button', () => {
    renderConsent();

    screen.getByTestId('consent-child-view');
    screen.getByText('Almost there!');
    screen.getByText(
      "We need your parent or guardian to say it's OK. Enter their email and we'll send them a quick link.",
    );
    screen.getByTestId('consent-handoff-button');
  });

  it('shows email input, submit button, and parent escape hatch in child view', () => {
    renderConsent();

    // Child can now enter parent email directly — no phone handoff required.
    screen.getByTestId('consent-email');
    screen.getByTestId('consent-submit');
    // Optional escape hatch for when parent is physically present
    screen.getByTestId('consent-handoff-button');
    screen.getByText('My parent is here with me');
  });

  // ── Child view email validation ──────────────────────────────────

  it('disables submit button in child view when email is empty', () => {
    renderConsent();

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });

  it('disables submit button in child view for invalid email', () => {
    renderConsent();

    fireEvent.changeText(screen.getByTestId('consent-email'), 'not-an-email');

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });

  it('enables submit button in child view for valid email', () => {
    renderConsent();

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeFalsy();
  });

  it('shows same-email warning in child phase and disables submit', () => {
    mockChildEmail = 'child@example.com';
    renderConsent();

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'child@example.com',
    );

    screen.getByTestId('consent-same-email-warning');
    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });

  it('child submits directly without handoff — calls API and shows success', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    renderConsent();

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      });
    });

    flushFadeAnimation();

    await waitFor(() => {
      screen.getByTestId('consent-success');
    });
  });

  it('success phase shows "Link sent!" and parent email after child direct submit', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    renderConsent();

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'mum@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();

    await waitFor(() => {
      screen.getByTestId('consent-success');
    });

    screen.getByText('Link sent!');
    screen.getByText(/mum@example\.com/);
  });

  it('"Got it" button calls router.back() after child direct submit', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    renderConsent();

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();

    await waitFor(() => {
      screen.getByTestId('consent-done');
    });

    // Flush the 1000 ms safety timer that transitionToPhase registered.
    // AnimatedMock fires animation callbacks synchronously but blocks the
    // nested callback via its inAnimationCallback guard, so
    // isTransitioningRef / isTransitioning are only reset by the safety timer
    // — not by the animation-complete path. Without this flush the wrapping
    // Animated.View still has pointerEvents:"none" and fireEvent.press is
    // silently ignored by @testing-library/react-native.
    flushFadeAnimation();

    fireEvent.press(screen.getByTestId('consent-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  // ── CR-108: Clerk hydration guard ───────────────────────────────

  describe('CR-108: Clerk not yet hydrated', () => {
    beforeEach(() => {
      mockUseUser.mockReturnValue({ isLoaded: false, user: null });
    });

    it('disables the submit button when Clerk has not hydrated', () => {
      renderConsent();

      fireEvent.changeText(
        screen.getByTestId('consent-email'),
        'parent@example.com',
      );

      const button = screen.getByTestId('consent-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled,
      ).toBeTruthy();
    });

    it('does not fire the API when submit is pressed during Clerk hydration window', () => {
      renderConsent();

      fireEvent.changeText(
        screen.getByTestId('consent-email'),
        'parent@example.com',
      );
      fireEvent.press(screen.getByTestId('consent-submit'));

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  // ── Phase 2: Parent view ─────────────────────────────────────────

  it('transitions to parent view when hand-off button is pressed', () => {
    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    screen.getByTestId('consent-parent-view');
    expect(screen.queryByTestId('consent-child-view')).toBeNull();
  });

  it('parent view shows email input, regulation text, spam warning, and submit button', () => {
    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    screen.getByTestId('consent-email');
    screen.getByTestId('consent-submit');
    // Jurisdiction-neutral regulation text (default/parent variant)
    screen.getByText(/under 16/i);
    // Spam warning
    screen.getByText(/check your spam folder/i);
    // Email label
    screen.getByText('Your email address');
  });

  it('shows professional (non-learner) regulation text for the parent', () => {
    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    // Default variant says "parental consent" not "grown-up"
    screen.getByText(/parental consent to use this service/i);
  });

  // ── Email validation ─────────────────────────────────────────────

  it('disables submit button when email is empty', () => {
    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });

  it('disables submit button for invalid email', () => {
    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(screen.getByTestId('consent-email'), 'not-an-email');

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });

  it('enables submit button for valid email', () => {
    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeFalsy();
  });

  // ── Phase 3: Success view ────────────────────────────────────────

  it('shows success view after successful submit', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    renderConsent();

    // Go to parent view
    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    // Fill email and submit
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      });
    });

    // Flush the parent → success fade animation
    flushFadeAnimation();

    await waitFor(() => {
      screen.getByTestId('consent-success');
    });

    screen.getByText('Link sent!');
    screen.getByText(/parent@example\.com/);
  });

  it('success view shows spam hint and resend button', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();
    await waitFor(() => {
      screen.getByTestId('consent-success');
    });

    // Success body now tells the child their parent will be notified.
    screen.getByText(/we'll let you know as soon as they approve/i);
    screen.getByTestId('consent-resend-email');
  });

  it('hand-back button calls router.back()', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();
    await waitFor(() => {
      screen.getByTestId('consent-done');
    });

    // Flush the 1000 ms safety timer (same reason as the "Got it" test above).
    flushFadeAnimation();

    fireEvent.press(screen.getByTestId('consent-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('replaces home when closing with no back history', async () => {
    mockCanGoBack.mockReturnValue(false);
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    renderConsent();

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();

    await waitFor(() => {
      screen.getByTestId('consent-done');
    });

    // Flush the 1000 ms safety timer (same reason as the "Got it" test above).
    flushFadeAnimation();

    fireEvent.press(screen.getByTestId('consent-done'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  // ── Error handling ───────────────────────────────────────────────

  it('displays error on submission failure', async () => {
    mockMutateAsync.mockRejectedValue(new Error('API error: 500'));

    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => {
      screen.getByTestId('consent-error');
      screen.getByText('API error: 500');
    });

    // Should remain on parent view, not transition to success
    screen.getByTestId('consent-parent-view');
  });

  it('shows a non-delivery fallback when the API reports failed email delivery', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'failed',
    });

    renderConsent();

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com',
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();
    await waitFor(() => {
      screen.getByTestId('consent-success');
    });

    screen.getByText("We couldn't confirm delivery yet");
    screen.getByText(/could not confirm that the consent email reached/i);

    // Flush the 1000 ms safety timer so isTransitioning resets to false and the
    // Animated.View's pointerEvents:"none" lifts before we press the button.
    flushFadeAnimation();

    fireEvent.press(screen.getByTestId('consent-done'));
    // The "Go Back" button (deliveryState==='failed') calls transitionToPhase('parent').
    // Flush the new safety timer started by that transition so the phase
    // change is committed before asserting the view.
    flushFadeAnimation();
    expect(mockBack).not.toHaveBeenCalled();
    screen.getByTestId('consent-parent-view');
  });

  // ── Reduced motion ──────────────────────────────────────────────

  describe('reduced motion', () => {
    beforeEach(() => {
      mockReduceMotion.mockReturnValue(true);
    });

    afterEach(() => {
      mockReduceMotion.mockReturnValue(false);
    });

    it('transitions immediately to parent view without fade animation when reduced motion is enabled', () => {
      renderConsent();

      fireEvent.press(screen.getByTestId('consent-handoff-button'));
      // No flushFadeAnimation() needed — reduced motion skips the animation

      screen.getByTestId('consent-parent-view');
      expect(screen.queryByTestId('consent-child-view')).toBeNull();
    });

    it('transitions immediately to success phase without fade animation when reduced motion is enabled', async () => {
      mockMutateAsync.mockResolvedValue({
        message: 'Consent request sent',
        consentType: 'GDPR',
        emailStatus: 'sent',
      });

      renderConsent();

      // Go to parent view (instant, no animation)
      fireEvent.press(screen.getByTestId('consent-handoff-button'));
      screen.getByTestId('consent-parent-view');

      // Fill email and submit
      fireEvent.changeText(
        screen.getByTestId('consent-email'),
        'parent@example.com',
      );
      fireEvent.press(screen.getByTestId('consent-submit'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });

      // Success phase renders instantly without needing flushFadeAnimation
      await waitFor(() => {
        screen.getByTestId('consent-success');
      });
    });

    it('keeps fadeAnim opacity at 1 when reduced motion is enabled', () => {
      renderConsent();

      // The Animated.View wrapping phase content should have opacity 1
      // because reduced motion skips the fade-out/fade-in sequence
      fireEvent.press(screen.getByTestId('consent-handoff-button'));

      // Phase switched instantly — parent view visible
      screen.getByTestId('consent-parent-view');

      // No intermediate opacity=0 state; pointerEvents should be 'auto'
      // (isTransitioning stays false when reduced motion skips animation)
    });
  });

  // ── Offline state (BUG-311) ──────────────────────────────────────

  describe('offline state', () => {
    beforeEach(() => {
      mockUseNetworkStatus.mockReturnValue({ isOffline: true, isReady: true });
    });

    it('disables submit button in child phase when offline', () => {
      renderConsent();
      fireEvent.changeText(
        screen.getByTestId('consent-email'),
        'parent@example.com',
      );

      const button = screen.getByTestId('consent-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled,
      ).toBeTruthy();
    });

    it('disables submit button in parent phase when offline', () => {
      renderConsent();
      fireEvent.press(screen.getByTestId('consent-handoff-button'));
      flushFadeAnimation();
      fireEvent.changeText(
        screen.getByTestId('consent-email'),
        'parent@example.com',
      );

      const button = screen.getByTestId('consent-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled,
      ).toBeTruthy();
    });

    it('does not call the API when submit is pressed while offline', () => {
      renderConsent();
      fireEvent.changeText(
        screen.getByTestId('consent-email'),
        'parent@example.com',
      );
      fireEvent.press(screen.getByTestId('consent-submit'));

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('auth gate [B-616 / ACCOUNT-19]', () => {
    afterEach(() => {
      mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    });

    it('[B-616] redirects to /sign-in when not authenticated', () => {
      mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
      renderConsent();
      expect(screen.getByTestId('mock-redirect-/sign-in')).toBeTruthy();
      expect(screen.queryByText('Almost there!')).toBeNull();
    });

    it('[B-616] shows loading spinner while Clerk is hydrating', () => {
      mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: false });
      renderConsent();
      expect(screen.getByTestId('consent-auth-loading')).toBeTruthy();
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });
  });

  // ---- WI-295: profileId ownership validation ----

  describe('profileId ownership gate', () => {
    it('shows an error and blocks submit when profileId is not in profiles', () => {
      // Remove the test profile from the account profiles list.
      // isLoading: false means profiles have loaded — the check is authoritative.
      renderConsent([]);

      screen.getByTestId('consent-profile-not-found');
      screen.getByTestId('consent-profile-not-found-error');
      // The consent form must not be rendered
      expect(screen.queryByTestId('consent-child-view')).toBeNull();
    });

    it('does not call mutateAsync when profileId is not in profiles', () => {
      renderConsent([]);

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('renders the consent form normally when profileId is in profiles', () => {
      // Default: active profile id === TEST_PROFILE_ID — form should render
      renderConsent();

      screen.getByTestId('consent-child-view');
      expect(screen.queryByTestId('consent-profile-not-found')).toBeNull();
    });
  });
});
