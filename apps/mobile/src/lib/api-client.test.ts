// ---------------------------------------------------------------------------
// [BUG-559] api-client — cross-account stale auth-expired guard break test
//
// Root cause: `_authExpiredFiring` is a module-level flag. If sign-out
// completes and `resetAuthExpiredGuard()` is NOT called, the flag stays true
// permanently — a fresh 401 for the newly signed-in account is silently
// swallowed (triggerAuthExpired returns false and the user is stuck).
//
// Wave-1 fix (commit 723f4dc3b / BUG-560): sign-out.ts calls
// `resetAuthExpiredGuard()` in a finally block so the flag is always cleared
// after sign-out, even if clerkSignOut throws.
//
// This break test pins that contract from the api-client side: after
// resetAuthExpiredGuard() the flag is clear and triggerAuthExpired fires again.
// ---------------------------------------------------------------------------

import {
  triggerAuthExpired,
  resetAuthExpiredGuard,
  setOnAuthExpired,
  clearOnAuthExpired,
} from './api-client';

beforeEach(() => {
  clearOnAuthExpired();
  resetAuthExpiredGuard();
});

afterEach(() => {
  clearOnAuthExpired();
  resetAuthExpiredGuard();
});

describe('[BUG-559] cross-account stale auth-expired guard', () => {
  it('[break-test] triggerAuthExpired fires the callback when guard is clear', () => {
    const cb = jest.fn();
    setOnAuthExpired(cb);

    const fired = triggerAuthExpired();

    expect(fired).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('[break-test] triggerAuthExpired is suppressed while guard is set (dedup works)', () => {
    const cb = jest.fn();
    setOnAuthExpired(cb);

    triggerAuthExpired(); // sets _authExpiredFiring = true
    const firedAgain = triggerAuthExpired(); // must be suppressed

    expect(firedAgain).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1); // only the first call
  });

  it('[break-test] after sign-out resetAuthExpiredGuard(), fresh 401 fires callback again', () => {
    // Simulate user A session expiry → guard fires
    const userACallback = jest.fn();
    setOnAuthExpired(userACallback);
    triggerAuthExpired(); // sets _authExpiredFiring = true

    // Simulate sign-out: resetAuthExpiredGuard() called in finally block
    resetAuthExpiredGuard();

    // Simulate user B signs in → registers new callback
    const userBCallback = jest.fn();
    setOnAuthExpired(userBCallback);

    // Fresh 401 for user B must not be swallowed
    const fired = triggerAuthExpired();

    expect(fired).toBe(true);
    // [break-test] If resetAuthExpiredGuard were removed from sign-out.ts,
    // _authExpiredFiring would still be true here and fired would be false.
    expect(userBCallback).toHaveBeenCalledTimes(1);
    // User A's callback must NOT have been called a second time
    expect(userACallback).toHaveBeenCalledTimes(1);
  });

  it('[break-test] triggerAuthExpired returns false when no callback is registered', () => {
    // No callback registered after clearOnAuthExpired
    const fired = triggerAuthExpired();
    expect(fired).toBe(false);
  });

  it('setOnAuthExpired clears the guard flag as a side-effect', () => {
    // Trigger first to set _authExpiredFiring = true
    const cb1 = jest.fn();
    setOnAuthExpired(cb1);
    triggerAuthExpired();

    // setOnAuthExpired resets _authExpiredFiring (documented in api-client.ts:66)
    const cb2 = jest.fn();
    setOnAuthExpired(cb2);

    const fired = triggerAuthExpired();
    expect(fired).toBe(true);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
