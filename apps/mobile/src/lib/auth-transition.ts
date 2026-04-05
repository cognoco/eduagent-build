/**
 * Shared session-activation flag for auth screens.
 *
 * After setActive() succeeds in sign-in or sign-up, the auth layout guard
 * fires a redirect to /(learner)/home.  If the learner layout bounces back
 * (e.g. isSignedIn not yet propagated, or stale-token 401 → signOut), the
 * sign-in screen remounts with fresh state — showing a confusing empty form.
 *
 * This module-level timestamp survives component remounts.  Both sign-in and
 * sign-up set it after setActive(); the sign-in screen checks it on mount
 * to show a "Signing you in…" spinner instead of the empty form.
 */

let _sessionActivatedAt: number | null = null;

export const SESSION_TRANSITION_MS = 8_000;

/** Mark that a session was just activated. */
export function markSessionActivated(): void {
  _sessionActivatedAt = Date.now();
}

/** Check whether a session was recently activated (within the timeout). */
export function isWithinTransitionWindow(): boolean {
  if (
    _sessionActivatedAt &&
    Date.now() - _sessionActivatedAt < SESSION_TRANSITION_MS
  ) {
    return true;
  }
  _sessionActivatedAt = null;
  return false;
}

/** Clear the transition flag (for timeout fallback or tests). */
export function clearTransitionState(): void {
  _sessionActivatedAt = null;
}

/** Get the elapsed time since activation (for timeout calculation). */
export function getTransitionElapsed(): number {
  return _sessionActivatedAt ? Date.now() - _sessionActivatedAt : 0;
}
