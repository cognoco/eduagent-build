import { renderHook, waitFor, act } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import Purchases from 'react-native-purchases';
import {
  useRevenueCatIdentity,
  useOfferings,
  useCustomerInfo,
  usePurchase,
  useRestorePurchases,
  resetRevenueCatIdentitySyncForTests,
} from './use-revenuecat';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    logIn: jest.fn().mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
      created: false,
    }),
    logOut: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
    getOfferings: jest.fn().mockResolvedValue({
      current: {
        identifier: 'default',
        serverDescription: 'Default offering',
        metadata: {},
        availablePackages: [],
        lifetime: null,
        annual: null,
        sixMonth: null,
        threeMonth: null,
        twoMonth: null,
        monthly: null,
        weekly: null,
        webCheckoutUrl: null,
      },
      all: {},
    }),
    getCustomerInfo: jest.fn().mockResolvedValue({
      entitlements: {
        active: {},
        all: {},
      },
      activeSubscriptions: [],
      allPurchasedProductIdentifiers: [],
    }),
    purchasePackage: jest.fn().mockResolvedValue({
      productIdentifier: 'com.eduagent.plus.monthly',
      customerInfo: { entitlements: { active: { pro: { isActive: true } } } },
      transaction: { transactionIdentifier: 'txn_123' },
    }),
    restorePurchases: jest.fn().mockResolvedValue({
      entitlements: {
        active: { pro: { isActive: true } },
        all: {},
      },
      activeSubscriptions: ['com.eduagent.plus.monthly'],
    }),
    configure: jest.fn(),
    setLogLevel: jest.fn(),
  },
  LOG_LEVEL: {
    VERBOSE: 'VERBOSE',
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  },
}));

const mockUseAuth = jest.fn().mockReturnValue({
  isSignedIn: true,
  userId: 'clerk_user_123',
  getToken: jest.fn().mockResolvedValue('mock-token'),
});

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock getRevenueCatApiKey to return a key for native, empty for web.
// The hooks use isRevenueCatAvailable() which checks Platform.OS AND getRevenueCatApiKey().
jest.mock(
  '../lib/revenuecat' /* gc1-allow: native-boundary; RevenueCat SDK is native-only and lib/revenuecat is a thin wrapper */,
  () => ({
    getRevenueCatApiKey: jest.fn().mockImplementation(() => {
      const { Platform: P } = require('react-native');
      if (P.OS === 'ios' || P.OS === 'android') return 'test_api_key';
      return '';
    }),
  }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

// [F-134] The identity-sync gate is module-level state — clear it between
// tests so no test depends on the sync state a previous test left behind.
beforeEach(() => {
  resetRevenueCatIdentitySyncForTests();
});

// ---------------------------------------------------------------------------
// useRevenueCatIdentity
// ---------------------------------------------------------------------------

describe('useRevenueCatIdentity', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset default mock return values after clearAllMocks
    (Purchases.logIn as jest.Mock).mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
      created: false,
    });
    (Purchases.logOut as jest.Mock).mockResolvedValue({
      entitlements: { active: {} },
    });
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS });
  });

  it('calls Purchases.logIn when user is signed in', async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    renderHook(() => useRevenueCatIdentity(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(Purchases.logIn).toHaveBeenCalledWith('clerk_user_123');
    });
  });

  it('calls Purchases.logOut when user signs out', async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    const { rerender } = renderHook(() => useRevenueCatIdentity(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(Purchases.logIn).toHaveBeenCalledWith('clerk_user_123');
    });

    // Simulate sign-out
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      userId: null,
    });

    rerender({});

    await waitFor(() => {
      expect(Purchases.logOut).toHaveBeenCalled();
    });
  });

  it('skips on web platform', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    renderHook(() => useRevenueCatIdentity(), { wrapper: createWrapper() });

    // Give time for any async effect to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(Purchases.logIn).not.toHaveBeenCalled();
  });

  it('does not call logIn twice for the same user', async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    const { rerender } = renderHook(() => useRevenueCatIdentity(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(Purchases.logIn).toHaveBeenCalledTimes(1);
    });

    // Rerender with same user — should not call logIn again
    rerender({});

    // Give time for any async effect
    await new Promise((r) => setTimeout(r, 50));

    expect(Purchases.logIn).toHaveBeenCalledTimes(1);
  });

  it('does not crash on logIn error', async () => {
    (Purchases.logIn as jest.Mock).mockRejectedValueOnce(
      new Error('Network error'),
    );
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    // Should not throw
    renderHook(() => useRevenueCatIdentity(), { wrapper: createWrapper() });

    await new Promise((r) => setTimeout(r, 50));

    expect(Purchases.logIn).toHaveBeenCalled();
  });

  // [error-observability H-2] When all retries are exhausted, RevenueCat stays
  // anonymous and billing receipts would be mis-attributed. The pre-fix code
  // only added a breadcrumb on exhaustion (invisible unless another exception
  // fires the same session). The fix escalates to captureException.
  it('captures to Sentry when identity sync retries are exhausted', async () => {
    jest.useFakeTimers();
    try {
      (Sentry.captureException as jest.Mock).mockClear();
      // Every attempt fails — initial + MAX_RETRIES(2) retries = 3 logIn calls.
      (Purchases.logIn as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );
      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        userId: 'clerk_user_123',
      });

      renderHook(() => useRevenueCatIdentity(), { wrapper: createWrapper() });

      // Drain the initial attempt + both 3s-delayed retries.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
        await jest.advanceTimersByTimeAsync(3000);
        await jest.advanceTimersByTimeAsync(3000);
      });

      expect(Purchases.logIn).toHaveBeenCalledTimes(3);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({
            surface: 'revenuecat_identity',
            reason: 'max_retries_exhausted',
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
      // The persistent rejection above survives jest.clearAllMocks()
      // (implementations are kept) — restore the default so later tests
      // that rely on a succeeding logIn are not polluted.
      (Purchases.logIn as jest.Mock).mockResolvedValue({
        customerInfo: { entitlements: { active: {} } },
        created: false,
      });
    }
  });

  it('escalates to Sentry and keeps customerInfo gated off when identity sync fails after all retries', async () => {
    // [F-134] Terminal sync failure now gates useCustomerInfo off for the
    // session — that must be queryable, not just a breadcrumb. The gate
    // HOLDING is the core security property: fail closed, never fetch under
    // an identity the SDK has not confirmed.
    jest.useFakeTimers();
    try {
      (Purchases.logIn as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );
      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        userId: 'clerk_user_123',
      });

      renderHook(
        () => {
          useRevenueCatIdentity();
          return useCustomerInfo();
        },
        { wrapper: createWrapper() },
      );

      // Initial attempt + 2 retries, 3s apart.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000);
      });

      expect(Purchases.logIn).toHaveBeenCalledTimes(3);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('identity sync failed after retries'),
        'warning',
      );
      // Fail-closed: identity never synced, so the customerInfo query must
      // never have run — the SDK could still answer for another account.
      expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      // The persistent rejection above survives jest.clearAllMocks()
      // (implementations are kept) — restore the default so later
      // describes that rely on a succeeding logIn are not polluted.
      (Purchases.logIn as jest.Mock).mockResolvedValue({
        customerInfo: { entitlements: { active: {} } },
        created: false,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// useOfferings
// ---------------------------------------------------------------------------

describe('useOfferings', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (Purchases.getOfferings as jest.Mock).mockResolvedValue({
      current: {
        identifier: 'default',
        serverDescription: 'Default offering',
        metadata: {},
        availablePackages: [],
        lifetime: null,
        annual: null,
        sixMonth: null,
        threeMonth: null,
        twoMonth: null,
        monthly: null,
        weekly: null,
        webCheckoutUrl: null,
      },
      all: {},
    });
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
  });

  afterEach(() => {
    queryClient.clear();
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS });
  });

  it('fetches offerings from RevenueCat', async () => {
    const { result } = renderHook(() => useOfferings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(Purchases.getOfferings).toHaveBeenCalled();
    expect(result.current.data?.current?.identifier).toBe('default');
  });

  it('returns null on web platform', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });

    const { result } = renderHook(() => useOfferings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
    expect(Purchases.getOfferings).not.toHaveBeenCalled();
  });

  it('handles getOfferings error', async () => {
    (Purchases.getOfferings as jest.Mock).mockRejectedValueOnce(
      new Error('Network error'),
    );

    const { result } = renderHook(() => useOfferings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useCustomerInfo
// ---------------------------------------------------------------------------

describe('useCustomerInfo', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
      entitlements: {
        active: { pro: { isActive: true, identifier: 'pro' } },
        all: {},
      },
      activeSubscriptions: ['com.eduagent.plus.monthly'],
    });
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
  });

  afterEach(() => {
    queryClient.clear();
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS });
  });

  it('fetches customer info from RevenueCat once identity sync completes', async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });
    // [F-134] customerInfo is gated on identity sync — mount the identity
    // hook alongside it, as the authenticated layout does in production.
    const { result } = renderHook(
      () => {
        useRevenueCatIdentity();
        return useCustomerInfo();
      },
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    expect(result.current.data?.entitlements.active).toHaveProperty('pro');
  });

  it('returns null when RevenueCat is not available (web)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });

    const { result } = renderHook(() => useCustomerInfo(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [F-134] Identity-sync gating — getCustomerInfo() answers for the SDK's
// CURRENT identity. If the customerInfo query runs while Purchases.logIn for
// the active Clerk user is still in flight, another account's entitlement
// snapshot gets cached under the active user's key (cross-account leak on
// shared devices). The query must stay disabled until sync completes.
// ---------------------------------------------------------------------------

describe('[F-134] identity-sync gating for customer info', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (Purchases.logIn as jest.Mock).mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
      created: false,
    });
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
      entitlements: { active: {}, all: {} },
      activeSubscriptions: [],
      allPurchasedProductIdentifiers: [],
    });
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
  });

  afterEach(() => {
    queryClient.clear();
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS });
  });

  it('does not fetch customer info while identity sync is still in flight', async () => {
    let resolveLogin!: (value: unknown) => void;
    (Purchases.logIn as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    const { result } = renderHook(
      () => {
        useRevenueCatIdentity();
        return useCustomerInfo();
      },
      { wrapper: createWrapper() },
    );

    // logIn is pending — the SDK may still be logged in as a previous
    // identity, so the query must not run yet.
    await new Promise((r) => setTimeout(r, 50));
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();

    await act(async () => {
      resolveLogin({
        customerInfo: { entitlements: { active: {} } },
        created: false,
      });
    });

    await waitFor(() => {
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('does not cache a snapshot under the new user key during an account switch', async () => {
    // Phase 1: account A fully synced and fetched.
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_A',
    });
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      () => {
        useRevenueCatIdentity();
        return useCustomerInfo();
      },
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Phase 2: switch to account B; logIn(B) hangs — the SDK still answers
    // as A, so nothing may be fetched/cached under B's key yet.
    let resolveLogin!: (value: unknown) => void;
    (Purchases.logIn as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );
    (Purchases.getCustomerInfo as jest.Mock).mockClear();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_B',
    });
    rerender({});

    await new Promise((r) => setTimeout(r, 50));
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(['revenuecat', 'customerInfo', 'clerk_user_B']),
    ).toBeUndefined();

    // Phase 3: logIn(B) completes — fetching under B's key may now proceed.
    await act(async () => {
      resolveLogin({
        customerInfo: { entitlements: { active: {} } },
        created: false,
      });
    });
    await waitFor(() => {
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    });
  });

  it('invalidates the user-scoped customerInfo query after logIn completes', async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });
    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useRevenueCatIdentity(), { wrapper });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['revenuecat', 'customerInfo', 'clerk_user_123'],
        }),
      );
    });
  });

  it('keeps customer info ungated on web where RevenueCat is unavailable', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    const { result } = renderHook(() => useCustomerInfo(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toBeNull();
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// usePurchase
// ---------------------------------------------------------------------------

describe('usePurchase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      productIdentifier: 'com.eduagent.plus.monthly',
      customerInfo: {
        entitlements: { active: { pro: { isActive: true } } },
      },
      transaction: { transactionIdentifier: 'txn_123' },
    });
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('purchases a package and invalidates customer info', async () => {
    const mockPackage = {
      identifier: '$rc_monthly',
      packageType: 'MONTHLY',
      product: { identifier: 'com.eduagent.plus.monthly' },
      offeringIdentifier: 'default',
      presentedOfferingContext: { offeringIdentifier: 'default' },
    } as never;

    const { result } = renderHook(() => usePurchase(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(mockPackage);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(Purchases.purchasePackage).toHaveBeenCalledWith(mockPackage);
    expect(result.current.data?.productIdentifier).toBe(
      'com.eduagent.plus.monthly',
    );
  });

  // [BUG-167] usePurchase must scope the customerInfo invalidation by
  // Clerk userId so a purchase by user A on a shared device cannot
  // invalidate user B's entitlement cache. The customerInfo query key
  // includes userId (see useCustomerInfo) — the invalidation key must
  // mirror that scope.
  it('invalidates customer info scoped to the current userId, not another user', async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_A',
    });

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const mockPackage = {
      identifier: '$rc_monthly',
      packageType: 'MONTHLY',
      product: { identifier: 'com.eduagent.plus.monthly' },
    } as never;

    const { result } = renderHook(() => usePurchase(), { wrapper });

    await act(async () => {
      result.current.mutate(mockPackage);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Active user's customerInfo key MUST be the invalidated key.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['revenuecat', 'customerInfo', 'clerk_user_A'],
      }),
    );
    // The pre-fix shape ['revenuecat', 'customerInfo'] would prefix-match
    // every user's entitlement cache via TanStack invalidation — that shape
    // MUST NOT be present.
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['revenuecat', 'customerInfo'],
      }),
    );
  });

  it('handles purchase error (user cancellation)', async () => {
    (Purchases.purchasePackage as jest.Mock).mockRejectedValueOnce(
      new Error('User cancelled'),
    );

    const mockPackage = {
      identifier: '$rc_monthly',
      packageType: 'MONTHLY',
      product: { identifier: 'com.eduagent.plus.monthly' },
    } as never;

    const { result } = renderHook(() => usePurchase(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(mockPackage);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useRestorePurchases
// ---------------------------------------------------------------------------

describe('useRestorePurchases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Purchases.restorePurchases as jest.Mock).mockResolvedValue({
      entitlements: {
        active: { pro: { isActive: true } },
        all: {},
      },
      activeSubscriptions: ['com.eduagent.plus.monthly'],
    });
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('restores purchases and returns customer info', async () => {
    const { result } = renderHook(() => useRestorePurchases(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(Purchases.restorePurchases).toHaveBeenCalled();
    expect(result.current.data?.entitlements.active).toHaveProperty('pro');
  });

  it('handles restore error', async () => {
    (Purchases.restorePurchases as jest.Mock).mockRejectedValueOnce(
      new Error('Restore failed'),
    );

    const { result } = renderHook(() => useRestorePurchases(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
