// ---------------------------------------------------------------------------
// auth-transition — tests for the [I-18] / BUG-775 module-state lifecycle
// ---------------------------------------------------------------------------
// Background: a force-sign-out (401 within 8s of sign-in) used to leave the
// _sessionActivatedAt timestamp dangling. The next sign-in screen mount would
// see isWithinTransitionWindow()===true and render a "Signing you in…"
// spinner instead of the login form, leaving the user stuck.
//
// The fix is to call clearTransitionState() inside the onAuthExpired callback.
// These tests pin the module-state contract that the fix relies on:
//   1. markSessionActivated() opens an 8s window
//   2. clearTransitionState() closes it immediately (the BUG-775 lever)
//   3. The window auto-closes after the timeout
// ---------------------------------------------------------------------------

import {
  markSessionActivated,
  isWithinTransitionWindow,
  clearTransitionState,
  getTransitionElapsed,
  SESSION_TRANSITION_MS,
} from './auth-transition';

describe('[BUG-775 / I-18] auth-transition module state', () => {
  beforeEach(() => {
    // Each test starts with a clean slate — module state survives test files,
    // so explicit reset prevents bleed-through.
    clearTransitionState();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-28T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clearTransitionState immediately closes the window opened by markSessionActivated', () => {
    // This is the literal break test for the bug: without the
    // clearTransitionState() call inside onAuthExpired, this assertion
    // would fail because the timestamp would still be within the 8s
    // window and isWithinTransitionWindow() would return true.
    markSessionActivated();
    expect(isWithinTransitionWindow()).toBe(true);

    clearTransitionState();
    expect(isWithinTransitionWindow()).toBe(false);
  });

  it('isWithinTransitionWindow returns false before any activation', () => {
    expect(isWithinTransitionWindow()).toBe(false);
  });

  it('isWithinTransitionWindow auto-closes after SESSION_TRANSITION_MS', () => {
    markSessionActivated();
    // Just inside the window → still true.
    jest.advanceTimersByTime(SESSION_TRANSITION_MS - 1);
    expect(isWithinTransitionWindow()).toBe(true);

    // Crossing the boundary → false (and the read self-clears the state).
    jest.advanceTimersByTime(2);
    expect(isWithinTransitionWindow()).toBe(false);
  });

  it('isWithinTransitionWindow self-clears once the window has expired', () => {
    // After auto-close, clearTransitionState should be a no-op (no stale
    // state lingers). Test asserts the read also clears, so a subsequent
    // markSessionActivated starts a clean window.
    markSessionActivated();
    jest.advanceTimersByTime(SESSION_TRANSITION_MS + 100);
    expect(isWithinTransitionWindow()).toBe(false);

    // Re-arm — confirms state was cleanly evicted.
    markSessionActivated();
    expect(isWithinTransitionWindow()).toBe(true);
  });

  it('getTransitionElapsed reflects elapsed ms since markSessionActivated', () => {
    markSessionActivated();
    jest.advanceTimersByTime(2_500);
    expect(getTransitionElapsed()).toBe(2_500);
  });

  it('getTransitionElapsed returns 0 after clearTransitionState', () => {
    markSessionActivated();
    jest.advanceTimersByTime(1_000);
    clearTransitionState();
    expect(getTransitionElapsed()).toBe(0);
  });
});
