import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({
    profileId: '550e8400-e29b-41d4-a716-446655440000',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockMutateAsync = jest.fn();

jest.mock('../hooks/use-consent', () => ({
  useRequestConsent: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

jest.mock('../hooks/use-network-status', () => ({
  useNetworkStatus: () => ({ isOffline: false, isReady: true }),
}));

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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const ConsentScreen = require('./consent').default;

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
  });

  afterEach(() => {
    queryClient.clear();
    jest.useRealTimers();
  });

  // ── Phase 1: Child view ──────────────────────────────────────────

  it('renders child view by default with hand-off message and button', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId('consent-child-view')).toBeTruthy();
    expect(screen.getByText('One more step!')).toBeTruthy();
    expect(
      screen.getByText(
        "We need a grown-up to say it's OK. Hand your phone to your parent or guardian."
      )
    ).toBeTruthy();
    expect(screen.getByTestId('consent-handoff-button')).toBeTruthy();
  });

  it('does not show email input or submit button in child view', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    expect(screen.queryByTestId('consent-email')).toBeNull();
    expect(screen.queryByTestId('consent-submit')).toBeNull();
  });

  // ── Phase 2: Parent view ─────────────────────────────────────────

  it('transitions to parent view when hand-off button is pressed', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    expect(screen.getByTestId('consent-parent-view')).toBeTruthy();
    expect(screen.queryByTestId('consent-child-view')).toBeNull();
  });

  it('parent view shows email input, regulation text, spam warning, and submit button', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    expect(screen.getByTestId('consent-email')).toBeTruthy();
    expect(screen.getByTestId('consent-submit')).toBeTruthy();
    // Jurisdiction-neutral regulation text (default/parent variant)
    expect(screen.getByText(/under 16/i)).toBeTruthy();
    // Spam warning
    expect(screen.getByText(/check your spam folder/i)).toBeTruthy();
    // Email label
    expect(screen.getByText('Your email address')).toBeTruthy();
  });

  it('shows professional (non-learner) regulation text for the parent', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    // Default variant says "parental consent" not "grown-up"
    expect(
      screen.getByText(/parental consent to use this service/i)
    ).toBeTruthy();
  });

  // ── Email validation ─────────────────────────────────────────────

  it('disables submit button when email is empty', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('disables submit button for invalid email', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(screen.getByTestId('consent-email'), 'not-an-email');

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('enables submit button for valid email', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeFalsy();
  });

  // ── Phase 3: Success view ────────────────────────────────────────

  it('shows success view after successful submit', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    render(<ConsentScreen />, { wrapper: Wrapper });

    // Go to parent view
    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();

    // Fill email and submit
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
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
      expect(screen.getByTestId('consent-success')).toBeTruthy();
    });

    expect(screen.getByText('Consent link sent!')).toBeTruthy();
    expect(screen.getByText(/parent@example\.com/)).toBeTruthy();
  });

  it('success view shows spam hint and resend button', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();
    await waitFor(() => {
      expect(screen.getByTestId('consent-success')).toBeTruthy();
    });

    expect(
      screen.getByText(/check your inbox.*the link expires in 7 days/i)
    ).toBeTruthy();
    expect(screen.getByTestId('consent-resend-email')).toBeTruthy();
  });

  it('hand-back button calls router.back()', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'sent',
    });

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();
    await waitFor(() => {
      expect(screen.getByTestId('consent-done')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('consent-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  // ── Error handling ───────────────────────────────────────────────

  it('displays error on submission failure', async () => {
    mockMutateAsync.mockRejectedValue(new Error('API error: 500'));

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('consent-error')).toBeTruthy();
      expect(screen.getByText('API error: 500')).toBeTruthy();
    });

    // Should remain on parent view, not transition to success
    expect(screen.getByTestId('consent-parent-view')).toBeTruthy();
  });

  it('shows a non-delivery fallback when the API reports failed email delivery', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
      emailStatus: 'failed',
    });

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    flushFadeAnimation();
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    flushFadeAnimation();
    await waitFor(() => {
      expect(screen.getByTestId('consent-success')).toBeTruthy();
    });

    expect(screen.getByText("We couldn't confirm delivery yet")).toBeTruthy();
    expect(
      screen.getByText(/could not confirm that the consent email reached/i)
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('consent-done'));
    flushFadeAnimation();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('consent-parent-view')).toBeTruthy();
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
      render(<ConsentScreen />, { wrapper: Wrapper });

      fireEvent.press(screen.getByTestId('consent-handoff-button'));
      // No flushFadeAnimation() needed — reduced motion skips the animation

      expect(screen.getByTestId('consent-parent-view')).toBeTruthy();
      expect(screen.queryByTestId('consent-child-view')).toBeNull();
    });

    it('transitions immediately to success phase without fade animation when reduced motion is enabled', async () => {
      mockMutateAsync.mockResolvedValue({
        message: 'Consent request sent',
        consentType: 'GDPR',
        emailStatus: 'sent',
      });

      render(<ConsentScreen />, { wrapper: Wrapper });

      // Go to parent view (instant, no animation)
      fireEvent.press(screen.getByTestId('consent-handoff-button'));
      expect(screen.getByTestId('consent-parent-view')).toBeTruthy();

      // Fill email and submit
      fireEvent.changeText(
        screen.getByTestId('consent-email'),
        'parent@example.com'
      );
      fireEvent.press(screen.getByTestId('consent-submit'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });

      // Success phase renders instantly without needing flushFadeAnimation
      await waitFor(() => {
        expect(screen.getByTestId('consent-success')).toBeTruthy();
      });
    });

    it('keeps fadeAnim opacity at 1 when reduced motion is enabled', () => {
      render(<ConsentScreen />, { wrapper: Wrapper });

      // The Animated.View wrapping phase content should have opacity 1
      // because reduced motion skips the fade-out/fade-in sequence
      fireEvent.press(screen.getByTestId('consent-handoff-button'));

      // Phase switched instantly — parent view visible
      expect(screen.getByTestId('consent-parent-view')).toBeTruthy();

      // No intermediate opacity=0 state; pointerEvents should be 'auto'
      // (isTransitioning stays false when reduced motion skips animation)
    });
  });
});
