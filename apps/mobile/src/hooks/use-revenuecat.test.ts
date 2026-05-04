import { renderHook, waitFor, act } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import Purchases from 'react-native-purchases';
import {
  useRevenueCatIdentity,
  useOfferings,
  useCustomerInfo,
  usePurchase,
  useRestorePurchases,
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
jest.mock('../lib/revenuecat', () => ({
  getRevenueCatApiKey: jest.fn().mockImplementation(() => {
    const { Platform: P } = require('react-native');
    if (P.OS === 'ios' || P.OS === 'android') return 'test_api_key';
    return '';
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

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

    renderHook(() => useRevenueCatIdentity());

    await waitFor(() => {
      expect(Purchases.logIn).toHaveBeenCalledWith('clerk_user_123');
    });
  });

  it('calls Purchases.logOut when user signs out', async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    const { rerender } = renderHook(() => useRevenueCatIdentity());

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

    renderHook(() => useRevenueCatIdentity());

    // Give time for any async effect to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(Purchases.logIn).not.toHaveBeenCalled();
  });

  it('does not call logIn twice for the same user', async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    const { rerender } = renderHook(() => useRevenueCatIdentity());

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
      new Error('Network error')
    );
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'clerk_user_123',
    });

    // Should not throw
    renderHook(() => useRevenueCatIdentity());

    await new Promise((r) => setTimeout(r, 50));

    expect(Purchases.logIn).toHaveBeenCalled();
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
      new Error('Network error')
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

  it('fetches customer info from RevenueCat', async () => {
    const { result } = renderHook(() => useCustomerInfo(), {
      wrapper: createWrapper(),
    });

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
      'com.eduagent.plus.monthly'
    );
  });

  it('handles purchase error (user cancellation)', async () => {
    (Purchases.purchasePackage as jest.Mock).mockRejectedValueOnce(
      new Error('User cancelled')
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
      new Error('Restore failed')
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
