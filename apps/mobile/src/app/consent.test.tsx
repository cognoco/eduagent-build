import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({
    profileId: '550e8400-e29b-41d4-a716-446655440000',
    consentType: 'GDPR',
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const ConsentScreen = require('./consent').default;

describe('ConsentScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
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

    expect(screen.getByTestId('consent-parent-view')).toBeTruthy();
    expect(screen.queryByTestId('consent-child-view')).toBeNull();
  });

  it('parent view shows email input, regulation text, spam warning, and submit button', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));

    expect(screen.getByTestId('consent-email')).toBeTruthy();
    expect(screen.getByTestId('consent-submit')).toBeTruthy();
    // GDPR regulation text (default/parent variant)
    expect(screen.getByText(/under 16/i)).toBeTruthy();
    // Spam warning
    expect(screen.getByText(/check your spam folder/i)).toBeTruthy();
    // Email label
    expect(screen.getByText('Your email address')).toBeTruthy();
  });

  it('shows professional (non-learner) regulation text for the parent', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));

    // Default variant says "parental consent" not "grown-up"
    expect(
      screen.getByText(/parental consent to use this service/i)
    ).toBeTruthy();
  });

  // ── Email validation ─────────────────────────────────────────────

  it('disables submit button when email is empty', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('disables submit button for invalid email', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    fireEvent.changeText(screen.getByTestId('consent-email'), 'not-an-email');

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('enables submit button for valid email', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
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
    });

    render(<ConsentScreen />, { wrapper: Wrapper });

    // Go to parent view
    fireEvent.press(screen.getByTestId('consent-handoff-button'));

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
    });

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

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
    });

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-handoff-button'));
    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

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
});
