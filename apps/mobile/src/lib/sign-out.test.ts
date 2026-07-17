// ---------------------------------------------------------------------------
// [SEC-SENTRY-SCOPE] sign-out — break tests for Sentry scope wipe
//
// Between sign-out and the next sign-in, any crash would carry the previous
// user's breadcrumbs, tags, contexts, and user identity. Sentry.setUser(null)
// is only called by evaluateSentryForProfile() AFTER the next profile loads —
// too late. The fix calls Sentry.getCurrentScope().clear() + Sentry.setUser(null)
// immediately after queryClient.clear() in signOutWithCleanup.
//
// [BUG-560] sign-out — auth-expired guard reset
//
// After sign-out, _authExpiredFiring must be reset so the next user's 401s
// are not silently swallowed. clerkSignOut() is wrapped in try/finally;
// resetAuthExpiredGuard() is called in the finally block so it fires even
// when clerkSignOut throws.
//
// [WI-1987] sign-out — deterministic scoped-cache removal
//
// queryClient.clear() only empties the in-memory cache. The scoped persister
// (query-persister.ts) mirrors it to AsyncStorage on a 2s throttle — so
// pre-fix, disk removal depended on that throttled write actually firing.
// A crash/force-quit inside the ~2s window left the full pre-sign-out cache
// (including session transcripts) on disk permanently. The fix removes the
// scoped AsyncStorage key directly and deterministically, independent of the
// persister's throttle timer.
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native'; // gc1-allow: external boundary — Sentry SDK
import type { QueryClient } from '@tanstack/react-query';
import {
  CLERK_SIGNOUT_TIMEOUT_MS,
  ClerkSignOutTimeoutError,
  signOutWithCleanup,
} from './sign-out';

import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';
import { setActiveProfileId, resetAuthExpiredGuard } from './api-client';
import { buildPersisterKey } from './query-persister';

// Mock dependencies that signOutWithCleanup touches so the test is
// self-contained and order-of-calls is verifiable via invocationCallOrder.
//
// Kept as mocks (with gc1-allow):
//   - @sentry/react-native: external SDK (also globally stubbed in test-setup.ts;
//     the per-file override installs controllable getCurrentScope/setUser fns).
//   - ./sign-out-cleanup: clearProfileSecureStorageOnSignOut calls SecureStore +
//     AsyncStorage (native boundaries globally mocked in test-setup.ts). A jest.fn()
//     wrapper is required so invocationCallOrder is tracked for ordering assertions.
//   - ./api-client: setActiveProfileId / setProxyMode are asserted via
//     invocationCallOrder; jest.requireActual + targeted fn wrappers retain real
//     exports while giving the spies needed for ordering checks.
//
// Removed mocks (real modules used instead):
//   - ./auth-transition: clearTransitionState() is pure JS (no native deps,
//     no assertion on it). Real implementation runs safely.
//   - ./pending-auth-redirect: clearPendingAuthRedirect() is pure JS; sessionStorage
//     is absent in Jest so writeSessionRecord() is a no-op. No assertion on it.

jest.mock(
  '@sentry/react-native',
  /* gc1-allow: external-boundary — Sentry SDK (also globally stubbed in test-setup.ts; per-file override installs controllable getCurrentScope/setUser) */ () => ({
    getCurrentScope: jest.fn(),
    setUser: jest.fn(),
    addBreadcrumb: jest.fn(),
    captureMessage: jest.fn(),
  }),
);

jest.mock(
  './sign-out-cleanup',
  /* gc1-allow: native-boundary — wraps SecureStore + AsyncStorage; spy needed for invocationCallOrder */ () => ({
    ...jest.requireActual('./sign-out-cleanup'),
    clearProfileSecureStorageOnSignOut: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock(
  './api-client',
  /* gc1-allow: native-boundary — module imports expo-constants/Hono/Clerk; spy on identity setters for invocationCallOrder */ () => ({
    ...jest.requireActual('./api-client'),
    setActiveProfileId: jest.fn(),
    setProxyMode: jest.fn(),
    resetAuthExpiredGuard: jest.fn(),
  }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScopeMock() {
  return { clear: jest.fn() };
}

function makeQueryClient(): QueryClient {
  return { clear: jest.fn() } as unknown as QueryClient;
}

function makeClerkSignOut(): jest.Mock {
  return jest.fn().mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Sentry scope clear assertions [SEC-SENTRY-SCOPE]
// ---------------------------------------------------------------------------

describe('signOutWithCleanup — Sentry scope wipe [SEC-SENTRY-SCOPE]', () => {
  it('calls Sentry.getCurrentScope().clear() exactly once', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);

    await signOutWithCleanup({
      clerkSignOut: makeClerkSignOut(),
      queryClient: makeQueryClient(),
      profileIds: [],
    });

    expect(Sentry.getCurrentScope).toHaveBeenCalled();
    expect(scope.clear).toHaveBeenCalledTimes(1);
  });

  it('calls Sentry.setUser(null) exactly once', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);

    await signOutWithCleanup({
      clerkSignOut: makeClerkSignOut(),
      queryClient: makeQueryClient(),
      profileIds: [],
    });

    expect(Sentry.setUser).toHaveBeenCalledTimes(1);
    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });

  // Break test: pre-fix the scope was never cleared at sign-out, so a crash
  // between sign-out and next sign-in would carry the previous user's
  // breadcrumbs/tags/user identity.
  it('[break-test] would fail if Sentry scope clear were removed — scope.clear not called', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);

    // Simulate the pre-fix state: if we DON'T call signOutWithCleanup, the
    // scope is never cleared. This confirms the assertion is non-trivial.
    // (We call the real function, so this test passes only while the fix
    // remains in place — removing the Sentry calls from sign-out.ts would
    // make scope.clear not be called and this expect would fail.)
    await signOutWithCleanup({
      clerkSignOut: makeClerkSignOut(),
      queryClient: makeQueryClient(),
      profileIds: [],
    });

    // Must have been called — if it wasn't the previous test would have caught
    // it, but this documents the explicit negative expectation.
    expect(scope.clear).not.toHaveBeenCalledTimes(0);
  });
});

// ---------------------------------------------------------------------------
// Ordering: api-client reset → queryClient.clear → Sentry clear → secure-storage → clerkSignOut
// ---------------------------------------------------------------------------

describe('signOutWithCleanup — cleanup ordering', () => {
  it('resets api-client identity before queryClient.clear', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const queryClient = makeQueryClient();

    await signOutWithCleanup({
      clerkSignOut: makeClerkSignOut(),
      queryClient,
      profileIds: [],
    });

    const setActiveOrder = (setActiveProfileId as jest.Mock).mock
      .invocationCallOrder[0]!;
    const queryClearOrder = (queryClient.clear as jest.Mock).mock
      .invocationCallOrder[0]!;

    expect(setActiveOrder).toBeLessThan(queryClearOrder);
  });

  it('clears queryClient before Sentry scope', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const queryClient = makeQueryClient();

    await signOutWithCleanup({
      clerkSignOut: makeClerkSignOut(),
      queryClient,
      profileIds: [],
    });

    const queryClearOrder = (queryClient.clear as jest.Mock).mock
      .invocationCallOrder[0]!;
    const sentryScopeOrder = (Sentry.getCurrentScope as jest.Mock).mock
      .invocationCallOrder[0]!;

    expect(queryClearOrder).toBeLessThan(sentryScopeOrder);
  });

  it('clears Sentry scope before secure-storage cleanup', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);

    await signOutWithCleanup({
      clerkSignOut: makeClerkSignOut(),
      queryClient: makeQueryClient(),
      profileIds: ['p1'],
    });

    const sentryScopeOrder = (Sentry.getCurrentScope as jest.Mock).mock
      .invocationCallOrder[0]!;
    const secureStoreOrder = (clearProfileSecureStorageOnSignOut as jest.Mock)
      .mock.invocationCallOrder[0]!;

    expect(sentryScopeOrder).toBeLessThan(secureStoreOrder);
  });

  it('runs secure-storage cleanup before clerkSignOut', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const clerkSignOut = makeClerkSignOut();

    await signOutWithCleanup({
      clerkSignOut,
      queryClient: makeQueryClient(),
      profileIds: ['p1'],
    });

    const secureStoreOrder = (clearProfileSecureStorageOnSignOut as jest.Mock)
      .mock.invocationCallOrder[0]!;
    const clerkOrder = clerkSignOut.mock.invocationCallOrder[0]!;

    expect(secureStoreOrder).toBeLessThan(clerkOrder);
  });

  it('covers full order: api-client reset → queryClient.clear → Sentry clear → secure-storage → clerkSignOut', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const queryClient = makeQueryClient();
    const clerkSignOut = makeClerkSignOut();

    await signOutWithCleanup({
      clerkSignOut,
      queryClient,
      profileIds: ['p1'],
    });

    const apiResetOrder = (setActiveProfileId as jest.Mock).mock
      .invocationCallOrder[0]!;
    const queryClearOrder = (queryClient.clear as jest.Mock).mock
      .invocationCallOrder[0]!;
    const sentryScopeOrder = (Sentry.getCurrentScope as jest.Mock).mock
      .invocationCallOrder[0]!;
    const secureStoreOrder = (clearProfileSecureStorageOnSignOut as jest.Mock)
      .mock.invocationCallOrder[0]!;
    const clerkOrder = clerkSignOut.mock.invocationCallOrder[0]!;

    expect(apiResetOrder).toBeLessThan(queryClearOrder);
    expect(queryClearOrder).toBeLessThan(sentryScopeOrder);
    expect(sentryScopeOrder).toBeLessThan(secureStoreOrder);
    expect(secureStoreOrder).toBeLessThan(clerkOrder);
  });
});

// ---------------------------------------------------------------------------
// Existing behaviour: clerkSignOut errors propagate; cleanup itself does not throw
// ---------------------------------------------------------------------------

describe('signOutWithCleanup — error propagation', () => {
  it('propagates clerkSignOut errors', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);

    const boom = new Error('clerk error');
    await expect(
      signOutWithCleanup({
        clerkSignOut: jest.fn().mockRejectedValue(boom),
        queryClient: makeQueryClient(),
        profileIds: [],
      }),
    ).rejects.toThrow('clerk error');
  });

  it('still calls Sentry scope clear even when clerkSignOut will throw', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);

    await signOutWithCleanup({
      clerkSignOut: jest.fn().mockRejectedValue(new Error('clerk error')),
      queryClient: makeQueryClient(),
      profileIds: [],
    }).catch(() => {
      /* expected */
    });

    // Sentry scope was cleared before clerkSignOut was reached
    expect(scope.clear).toHaveBeenCalledTimes(1);
    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Auth-expired guard reset [BUG-560]
// ---------------------------------------------------------------------------

describe('signOutWithCleanup — auth-expired guard reset [BUG-560]', () => {
  it('[break-test] calls resetAuthExpiredGuard after clerkSignOut succeeds', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const clerkSignOut = makeClerkSignOut();

    await signOutWithCleanup({
      clerkSignOut,
      queryClient: makeQueryClient(),
      profileIds: [],
    });

    // Must be called exactly once — if resetAuthExpiredGuard were removed from
    // sign-out.ts this assertion would fail, leaving _authExpiredFiring=true
    // permanently and silently swallowing all subsequent 401s for the next user.
    expect(resetAuthExpiredGuard).toHaveBeenCalledTimes(1);
  });

  it('[break-test] calls resetAuthExpiredGuard even when clerkSignOut throws', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);

    await signOutWithCleanup({
      clerkSignOut: jest.fn().mockRejectedValue(new Error('clerk error')),
      queryClient: makeQueryClient(),
      profileIds: [],
    }).catch(() => {
      /* expected */
    });

    // The finally block must fire even on rejection so the guard is always reset.
    expect(resetAuthExpiredGuard).toHaveBeenCalledTimes(1);
  });

  it('calls resetAuthExpiredGuard after clerkSignOut (ordering)', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const clerkSignOut = makeClerkSignOut();

    await signOutWithCleanup({
      clerkSignOut,
      queryClient: makeQueryClient(),
      profileIds: [],
    });

    const clerkOrder = clerkSignOut.mock.invocationCallOrder[0]!;
    const guardResetOrder = (resetAuthExpiredGuard as jest.Mock).mock
      .invocationCallOrder[0]!;

    // resetAuthExpiredGuard fires in the finally block, after clerkSignOut resolves.
    expect(clerkOrder).toBeLessThan(guardResetOrder);
  });
});

// ---------------------------------------------------------------------------
// Deterministic scoped-cache removal [WI-1987]
// ---------------------------------------------------------------------------

describe('signOutWithCleanup — deterministic scoped-cache removal [WI-1987]', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('removes the scoped persister AsyncStorage key for the signing-out user', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const userId = 'user-123';
    const key = buildPersisterKey(userId);
    // Simulate a snapshot the persister wrote to disk during normal app use,
    // shaped like a real persisted cache containing a transcript query.
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        clientState: {
          queries: [
            {
              queryKey: ['session-transcript', 'study', 's1', 'p1'],
              state: {
                data: { exchanges: [{ text: 'my real chat message' }] },
              },
            },
          ],
        },
      }),
    );

    await signOutWithCleanup({
      clerkSignOut: makeClerkSignOut(),
      queryClient: makeQueryClient(),
      profileIds: [],
      clerkUserId: userId,
    });

    expect(await AsyncStorage.getItem(key)).toBeNull();
  });

  // [break-test / crash-window] Pre-fix, disk removal depended entirely on
  // queryClient.clear() triggering the persister's throttled (2s) AsyncStorage
  // subscription. This test's queryClient is a bare mock with no real
  // persister wired to it (see makeQueryClient()) — no throttled write can
  // EVER happen here — and fake timers are never advanced, so zero time
  // elapses. If signOutWithCleanup still depended on the persister's
  // subscription firing, the pre-seeded blob would remain on disk forever.
  // It does not, because the fix removes the key directly and synchronously
  // within signOutWithCleanup's own awaited execution.
  it('[crash-window break-test] removes the key without any throttle interval elapsing', async () => {
    jest.useFakeTimers();
    try {
      const scope = makeScopeMock();
      (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
      const userId = 'user-456';
      const key = buildPersisterKey(userId);
      await AsyncStorage.setItem(key, 'pre-sign-out-snapshot-with-transcript');

      await signOutWithCleanup({
        clerkSignOut: makeClerkSignOut(),
        queryClient: makeQueryClient(),
        profileIds: [],
        clerkUserId: userId,
      });

      // No fake time was ever advanced — well inside the persister's 2s
      // throttle window a crash could occur in — yet the key is already gone.
      expect(await AsyncStorage.getItem(key)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not remove a DIFFERENT user's scoped cache key", async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const otherUserKey = buildPersisterKey('other-user');
    await AsyncStorage.setItem(otherUserKey, 'other-user-data');

    await signOutWithCleanup({
      clerkSignOut: makeClerkSignOut(),
      queryClient: makeQueryClient(),
      profileIds: [],
      clerkUserId: 'signing-out-user',
    });

    expect(await AsyncStorage.getItem(otherUserKey)).toBe('other-user-data');
  });

  it('does not throw when clerkUserId is omitted (no scoped key to target)', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);

    await expect(
      signOutWithCleanup({
        clerkSignOut: makeClerkSignOut(),
        queryClient: makeQueryClient(),
        profileIds: [],
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Welcome-intro flag is NOT touched on sign-out
//
// The welcome intro moved pre-auth (docs/plans/2026-05-27-pre-auth-welcome-flow.md)
// and is device-scoped; its flag intentionally survives sign-out so a user
// who signs out and back in on the same device does not re-see the cards.
// signOutWithCleanup no longer imports or calls anything from intro-state.
// Ratchet test: this guard fails if the import comes back.
// ---------------------------------------------------------------------------

describe('signOutWithCleanup — pre-auth intro flag not cleared', () => {
  it('does not import from ./intro-state (pre-auth flag survives sign-out)', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, 'sign-out.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]\.\/intro-state['"]/);
  });
});

// ---------------------------------------------------------------------------
// Clerk signOut timeout [BUG-771]
// ---------------------------------------------------------------------------

describe('signOutWithCleanup — clerkSignOut hard timeout [BUG-771]', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('[break-test] rejects with ClerkSignOutTimeoutError when clerkSignOut never resolves', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    // Hanging Clerk call — simulates the production symptom (sign-out button
    // hangs >45s and never returns to the sign-in screen).
    const hangingClerkSignOut = jest.fn(
      () => new Promise<void>(() => undefined),
    );

    const promise = signOutWithCleanup({
      clerkSignOut: hangingClerkSignOut,
      queryClient: makeQueryClient(),
      profileIds: [],
    });
    // Attach the rejection handler synchronously so Jest doesn't see an
    // unhandled promise rejection between advancing fake timers and the
    // awaited expect below.
    const settled = promise.catch((e) => e);
    // Cleanup runs in microtasks first; flush microtasks before tripping the
    // timer race so clerkSignOut has actually been invoked.
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(CLERK_SIGNOUT_TIMEOUT_MS + 50);
    const err = await settled;
    expect(err).toBeInstanceOf(ClerkSignOutTimeoutError);
    // Break test: removing the timeout race in sign-out.ts would make this
    // promise never settle — Jest would hit the per-test timeout instead.
  });

  it('emits a Sentry breadcrumb + captureMessage when the timeout fires', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const hangingClerkSignOut = jest.fn(
      () => new Promise<void>(() => undefined),
    );

    const settled = signOutWithCleanup({
      clerkSignOut: hangingClerkSignOut,
      queryClient: makeQueryClient(),
      profileIds: [],
    }).catch(() => undefined);

    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(CLERK_SIGNOUT_TIMEOUT_MS + 50);
    await settled;

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'auth',
        level: 'warning',
        message: expect.stringContaining('clerkSignOut timed out'),
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('clerkSignOut timed out'),
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ feature: 'auth' }),
      }),
    );
  });

  it('still calls resetAuthExpiredGuard after the timeout fires', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    const hangingClerkSignOut = jest.fn(
      () => new Promise<void>(() => undefined),
    );

    const settled = signOutWithCleanup({
      clerkSignOut: hangingClerkSignOut,
      queryClient: makeQueryClient(),
      profileIds: [],
    }).catch(() => undefined);

    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(CLERK_SIGNOUT_TIMEOUT_MS + 50);
    await settled;

    // The finally block must still run so the next user's 401s are not
    // silently swallowed by a stuck _authExpiredFiring flag.
    expect(resetAuthExpiredGuard).toHaveBeenCalledTimes(1);
  });

  it('does not time out when clerkSignOut resolves quickly', async () => {
    const scope = makeScopeMock();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue(scope);
    // Resolves on the next microtask — well below the timeout.
    const quickClerkSignOut = jest.fn(() => Promise.resolve());

    const settled = signOutWithCleanup({
      clerkSignOut: quickClerkSignOut,
      queryClient: makeQueryClient(),
      profileIds: [],
    });

    // Flush microtasks; do NOT advance fake timers — clerkSignOut should
    // resolve before the timeout would have fired.
    await settled;

    expect(quickClerkSignOut).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
