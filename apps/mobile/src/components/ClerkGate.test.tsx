/**
 * Tests for ClerkGate — the Clerk initialisation guard that shows a timeout UI
 * when Clerk hasn't loaded within 12 seconds (BUG-507).
 *
 * Extracted from `apps/mobile/src/app/_layout.tsx` so the test only needs to
 * exercise its real dependencies (react-native, design-tokens, the global
 * `@clerk/expo` mock from test-setup.ts). No `_layout.tsx` import means
 * no module-graph side effects to silence.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useAuth } from '@clerk/expo';

import { ClerkGate } from './ClerkGate';

describe('ClerkGate — BUG-507 retry / offline recovery', () => {
  const noOp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: false });
  });

  it('renders a visible loading fallback while Clerk is loading and not timed out', () => {
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={false}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );
    expect(screen.getByTestId('clerk-loading-screen')).toBeTruthy();
    expect(screen.getByText('Connecting securely...')).toBeTruthy();
  });

  it('renders the timeout screen when timedOut=true and Clerk not loaded', () => {
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );

    expect(screen.getByTestId('clerk-timeout-screen')).toBeTruthy();
    expect(screen.getByTestId('clerk-retry-button')).toBeTruthy();
    expect(screen.getByTestId('clerk-offline-button')).toBeTruthy();
  });

  it('calls onRetry when "Try again" is pressed — Clerk never loads + user retries -> Clerk re-inits (BUG-507)', () => {
    const onRetry = jest.fn();
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={onRetry}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );

    fireEvent.press(screen.getByTestId('clerk-retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does NOT call platformAlert on retry — no dead-end "close and reopen" dialog (BUG-507)', () => {
    const onRetry = jest.fn();
    const platformAlertMock = jest.spyOn(
      require('../lib/platform-alert'),
      'platformAlert',
    );

    render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={onRetry}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );

    fireEvent.press(screen.getByTestId('clerk-retry-button'));

    expect(platformAlertMock).not.toHaveBeenCalled();
    platformAlertMock.mockRestore();
  });

  it('calls onContinueOffline when "Continue without account" is pressed', () => {
    const onContinueOffline = jest.fn();
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={noOp}
        onContinueOffline={onContinueOffline}
      >
        {null}
      </ClerkGate>,
    );

    fireEvent.press(screen.getByTestId('clerk-offline-button'));
    expect(onContinueOffline).toHaveBeenCalledTimes(1);
  });

  it('calls onReady when Clerk loads normally (isLoaded becomes true)', () => {
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: true });
    const onReady = jest.fn();
    render(
      <ClerkGate
        onReady={onReady}
        timedOut={false}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('renders children once Clerk is loaded (no timeout screen visible)', () => {
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: true });
    render(
      <ClerkGate
        onReady={noOp}
        timedOut={false}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        {null}
      </ClerkGate>,
    );
    expect(screen.queryByTestId('clerk-timeout-screen')).toBeNull();
  });

  // [BUG-507] Regression: the 12-second failsafe must NOT silently route into
  // the authenticated app layout when Clerk is not loaded (isLoaded=false,
  // i.e. the user is not signed in). It must instead show the timeout/retry UI.
  it('[BUG-507] does NOT render children (authenticated layout) when timedOut=true but Clerk not loaded', () => {
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: false });
    const { View } = require('react-native');
    const { toJSON } = render(
      <ClerkGate
        onReady={noOp}
        timedOut={true}
        onRetry={noOp}
        onContinueOffline={noOp}
      >
        <View testID="authenticated-layout-sentinel" />
      </ClerkGate>,
    );

    expect(screen.getByTestId('clerk-timeout-screen')).toBeTruthy();
    expect(toJSON()).not.toBeNull();
    expect(screen.queryByTestId('authenticated-layout-sentinel')).toBeNull();
  });
});
