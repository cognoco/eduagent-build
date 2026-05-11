// ---------------------------------------------------------------------------
// [SEC-SENTRY-SCOPE] sign-out — break tests for Sentry scope wipe
//
// Between sign-out and the next sign-in, any crash would carry the previous
// user's breadcrumbs, tags, contexts, and user identity. Sentry.setUser(null)
// is only called by evaluateSentryForProfile() AFTER the next profile loads —
// too late. The fix calls Sentry.getCurrentScope().clear() + Sentry.setUser(null)
// immediately after queryClient.clear() in signOutWithCleanup.
// ---------------------------------------------------------------------------

import * as Sentry from '@sentry/react-native'; // gc1-allow: external boundary — Sentry SDK
import type { QueryClient } from '@tanstack/react-query';
import { signOutWithCleanup } from './sign-out';

import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';
import { setActiveProfileId } from './api-client';

// Mock all dependencies that signOutWithCleanup touches so the test is
// self-contained and order-of-calls is verifiable via invocationCallOrder.
jest.mock('@sentry/react-native', () => ({
  // gc1-allow: external boundary — Sentry SDK
  getCurrentScope: jest.fn(),
  setUser: jest.fn(),
}));

// prettier-ignore
jest.mock('./sign-out-cleanup', () => ({ // gc1-allow: SecureStore I/O boundary
  clearProfileSecureStorageOnSignOut: jest.fn().mockResolvedValue(undefined),
}));

// prettier-ignore
jest.mock('./auth-transition', () => ({ // gc1-allow: nav-state helper
  clearTransitionState: jest.fn(),
}));

// prettier-ignore
jest.mock('./pending-auth-redirect', () => ({ // gc1-allow: nav-state helper
  clearPendingAuthRedirect: jest.fn(),
}));

// prettier-ignore
jest.mock('./api-client', () => ({ // gc1-allow: identity setters for ordering
  setActiveProfileId: jest.fn(),
  setProxyMode: jest.fn(),
}));

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
