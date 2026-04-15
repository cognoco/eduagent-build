import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import React from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#6366f1',
    textInverse: '#ffffff',
    muted: '#9ca3af',
  }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: mockActiveProfile,
  }),
}));

jest.mock('../../components/common', () => ({
  UsageMeter: () => null,
}));

// RevenueCat hooks mocks
const mockMutateAsyncPurchase = jest.fn();
const mockMutateAsyncRestore = jest.fn();
let mockOfferings: ReturnType<typeof makeMockOfferings> | null = null;
let mockOfferingsLoading = false;
let mockOfferingsError = false;
const mockRefetchOfferings = jest.fn();
let mockCustomerInfo: ReturnType<typeof makeMockCustomerInfo> | null = null;
let mockCustomerInfoLoading = false;
let mockPurchaseIsPending = false;
let mockRestoreIsPending = false;

jest.mock('../../hooks/use-revenuecat', () => ({
  useOfferings: () => ({
    data: mockOfferings,
    isLoading: mockOfferingsLoading,
    isError: mockOfferingsError,
    refetch: mockRefetchOfferings,
  }),
  useCustomerInfo: () => ({
    data: mockCustomerInfo,
    isLoading: mockCustomerInfoLoading,
  }),
  usePurchase: () => ({
    mutateAsync: mockMutateAsyncPurchase,
    isPending: mockPurchaseIsPending,
  }),
  useRestorePurchases: () => ({
    mutateAsync: mockMutateAsyncRestore,
    isPending: mockRestoreIsPending,
  }),
}));

// Subscription hooks mocks
let mockSubscription: Record<string, unknown> | undefined;
let mockSubLoading = false;
let mockSubError = false;
const mockRefetchSub = jest.fn();
let mockSubRefetching = false;
let mockUsage: Record<string, unknown> | undefined;
let mockUsageLoading = false;
let mockUsageError = false;
const mockRefetchUsage = jest.fn();
let mockUsageRefetching = false;
let mockFamilySubscription: Record<string, unknown> | null = null;
const mockMutateAsyncByokWaitlist = jest.fn();
let mockByokWaitlistIsPending = false;
let mockActiveProfile = {
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
};

jest.mock('../../hooks/use-subscription', () => ({
  useSubscription: () => ({
    data: mockSubscription,
    isLoading: mockSubLoading,
    isError: mockSubError,
    refetch: mockRefetchSub,
    isRefetching: mockSubRefetching,
  }),
  useUsage: () => ({
    data: mockUsage,
    isLoading: mockUsageLoading,
    isError: mockUsageError,
    refetch: mockRefetchUsage,
    isRefetching: mockUsageRefetching,
  }),
  useFamilySubscription: () => ({
    data: mockFamilySubscription,
  }),
  // BUG-401: usePurchaseTopUp mock removed — it was dead code:
  // (a) usePurchaseTopUp lives in use-subscription-stripe, not use-subscription
  // (b) subscription.tsx never imports usePurchaseTopUp (uses usePurchase from RevenueCat)
  useJoinByokWaitlist: () => ({
    mutateAsync: mockMutateAsyncByokWaitlist,
    isPending: mockByokWaitlistIsPending,
  }),
}));

jest.mock('../../hooks/use-settings', () => ({
  useNotifyParentSubscribe: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

// BUG-397: Restore now polls the API to confirm subscription tier after RevenueCat restore
const mockSubscriptionGet = jest.fn();
jest.mock('../../lib/api-client', () => ({
  useApiClient: () => ({
    subscription: { $get: mockSubscriptionGet },
  }),
}));

jest.mock('../../lib/assert-ok', () => ({
  assertOk: jest.fn(),
}));

let mockXpSummary: { topicsCompleted?: number; totalXp?: number } | undefined =
  undefined;

jest.mock('../../hooks/use-streaks', () => ({
  useXpSummary: () => ({ data: mockXpSummary }),
}));

// Mock react-native-purchases for enum/constant access
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {},
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    NETWORK_ERROR: '10',
    OFFLINE_CONNECTION_ERROR: '35',
    UNKNOWN_ERROR: '0',
  },
  PACKAGE_TYPE: {
    MONTHLY: 'MONTHLY',
    ANNUAL: 'ANNUAL',
    SIX_MONTH: 'SIX_MONTH',
    THREE_MONTH: 'THREE_MONTH',
    TWO_MONTH: 'TWO_MONTH',
    WEEKLY: 'WEEKLY',
    LIFETIME: 'LIFETIME',
    UNKNOWN: 'UNKNOWN',
    CUSTOM: 'CUSTOM',
  },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

function makeMockPackage(overrides?: Record<string, unknown>) {
  const { productOverrides, ...pkgOverrides } = (overrides || {}) as Record<
    string,
    unknown
  >;
  return {
    identifier: '$rc_monthly',
    packageType: 'MONTHLY',
    product: {
      identifier: 'mentomate_monthly',
      title: 'MentoMate Plus Monthly',
      description: '700 questions per month',
      price: 9.99,
      priceString: '$9.99',
      currencyCode: 'USD',
      pricePerWeek: null,
      pricePerMonth: 9.99,
      pricePerYear: 119.88,
      pricePerWeekString: null,
      pricePerMonthString: '$9.99',
      pricePerYearString: '$119.88',
      introPrice: null,
      discounts: null,
      productCategory: null,
      productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
      subscriptionPeriod: 'P1M',
      defaultOption: null,
      subscriptionOptions: null,
      presentedOfferingIdentifier: null,
      presentedOfferingContext: null,
      ...((productOverrides as Record<string, unknown>) || {}),
    },
    offeringIdentifier: 'default',
    presentedOfferingContext: {
      offeringIdentifier: 'default',
      placementIdentifier: null,
      targetingContext: null,
    },
    webCheckoutUrl: null,
    ...pkgOverrides,
  };
}

function makeMockOfferings(packages: ReturnType<typeof makeMockPackage>[]) {
  return {
    all: {
      default: {
        identifier: 'default',
        serverDescription: 'Default offering',
        metadata: {},
        availablePackages: packages,
        lifetime: null,
        annual: null,
        sixMonth: null,
        threeMonth: null,
        twoMonth: null,
        monthly:
          packages.find(
            (p: ReturnType<typeof makeMockPackage>) =>
              p.packageType === 'MONTHLY'
          ) || null,
        weekly: null,
        webCheckoutUrl: null,
      },
    },
    current: {
      identifier: 'default',
      serverDescription: 'Default offering',
      metadata: {},
      availablePackages: packages,
      lifetime: null,
      annual: null,
      sixMonth: null,
      threeMonth: null,
      twoMonth: null,
      monthly:
        packages.find(
          (p: ReturnType<typeof makeMockPackage>) => p.packageType === 'MONTHLY'
        ) || null,
      weekly: null,
      webCheckoutUrl: null,
    },
  };
}

function makeMockCustomerInfo(overrides?: {
  activeEntitlements?: Record<string, unknown>;
  activeSubscriptions?: string[];
}) {
  const opts = overrides || {};
  return {
    entitlements: {
      all: {},
      active: opts.activeEntitlements || {},
      verification: 'NOT_REQUESTED',
    },
    activeSubscriptions: opts.activeSubscriptions || [],
    allPurchasedProductIdentifiers: [],
    latestExpirationDate: null,
    firstSeen: '2026-01-01T00:00:00Z',
    originalAppUserId: 'user-1',
    requestDate: '2026-03-01T00:00:00Z',
    allExpirationDates: {},
    allPurchaseDates: {},
    originalApplicationVersion: null,
    originalPurchaseDate: null,
    managementURL: null,
    nonSubscriptionTransactions: [],
    subscriptionsByProductIdentifier: {},
  };
}

const SubscriptionScreen = require('./subscription').default;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOfferings = null;
    mockOfferingsLoading = false;
    mockOfferingsError = false;
    mockRefetchOfferings.mockClear();
    mockCustomerInfo = null;
    mockCustomerInfoLoading = false;
    mockPurchaseIsPending = false;
    mockRestoreIsPending = false;
    mockSubscription = { tier: 'free', status: 'active' };
    mockSubLoading = false;
    mockSubError = false;
    mockRefetchSub.mockReset();
    mockSubRefetching = false;
    mockUsage = undefined;
    mockUsageLoading = false;
    mockUsageError = false;
    mockRefetchUsage.mockReset();
    mockUsageRefetching = false;
    mockFamilySubscription = null;
    mockMutateAsyncByokWaitlist.mockReset();
    mockByokWaitlistIsPending = false;
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
    };
    mockXpSummary = undefined;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  // -------------------------------------------------------------------------
  // Loading states
  // -------------------------------------------------------------------------

  it('shows loading indicator while data is loading', () => {
    mockSubLoading = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('subscription-loading')).toBeTruthy();
  });

  it('shows loading indicator while offerings load', () => {
    mockOfferingsLoading = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('subscription-loading')).toBeTruthy();
  });

  it('shows loading indicator while customer info loads', () => {
    mockCustomerInfoLoading = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('subscription-loading')).toBeTruthy();
  });

  it('shows the error state instead of the child paywall when subscription loading fails', () => {
    mockActiveProfile = {
      id: 'child-1',
      displayName: 'Alex',
      isOwner: false,
    };
    mockSubscription = undefined;
    mockSubLoading = false;
    mockSubError = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('subscription-error')).toBeTruthy();
    expect(screen.queryByTestId('child-paywall')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Rendering with offerings
  // -------------------------------------------------------------------------

  it('renders available packages from RevenueCat offerings', () => {
    const monthlyPkg = makeMockPackage();
    const annualPkg = makeMockPackage({
      identifier: '$rc_annual',
      packageType: 'ANNUAL',
      productOverrides: {
        identifier: 'mentomate_annual',
        title: 'MentoMate Plus Annual',
        price: 99.99,
        priceString: '$99.99',
      },
    });

    mockOfferings = makeMockOfferings([monthlyPkg, annualPkg]);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('offerings-section')).toBeTruthy();
    expect(screen.getByTestId('package-option-$rc_monthly')).toBeTruthy();
    expect(screen.getByTestId('package-option-$rc_annual')).toBeTruthy();
    expect(screen.getByText('MentoMate Plus Monthly')).toBeTruthy();
    expect(screen.getByText('MentoMate Plus Annual')).toBeTruthy();
    expect(screen.getByText('$9.99 / monthly')).toBeTruthy();
    expect(screen.getByText('$99.99 / annual')).toBeTruthy();
  });

  it('shows no-offerings fallback with static tier comparison when no packages are available', () => {
    mockOfferings = null;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('no-offerings')).toBeTruthy();
    // Shows helpful availability message instead of "not available on this device"
    expect(
      screen.getByText(/Subscription plans will be available soon/)
    ).toBeTruthy();
    // Shows static tier cards
    expect(screen.getByTestId('static-tier-free')).toBeTruthy();
    expect(screen.getByTestId('static-tier-plus')).toBeTruthy();
    expect(screen.getByTestId('static-tier-family')).toBeTruthy();
    expect(screen.getByTestId('static-tier-pro')).toBeTruthy();
  });

  it('shows current plan info from subscription data', () => {
    mockSubscription = { tier: 'plus', status: 'active' };
    mockOfferings = makeMockOfferings([makeMockPackage()]);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('current-plan')).toBeTruthy();
    expect(screen.getByText('Plus')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Current plan highlighting
  // -------------------------------------------------------------------------

  it('highlights the current plan based on active subscriptions', () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);
    mockCustomerInfo = makeMockCustomerInfo({
      activeEntitlements: { pro: { isActive: true, identifier: 'pro' } },
      activeSubscriptions: ['mentomate_monthly'],
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    // "Current plan" appears in both the section header and the package badge
    const matches = screen.getAllByText('Current plan');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('shows Subscribe for packages that are not the current plan', () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);
    mockCustomerInfo = makeMockCustomerInfo(); // no active entitlements

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Subscribe')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Purchase flow
  // -------------------------------------------------------------------------

  it('calls purchase.mutateAsync when a package is selected', async () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);
    mockMutateAsyncPurchase.mockResolvedValue({
      productIdentifier: 'mentomate_monthly',
      customerInfo: makeMockCustomerInfo(),
      transaction: {
        transactionIdentifier: 'txn-1',
        productIdentifier: 'mentomate_monthly',
        purchaseDate: '2026-03-01',
      },
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('package-option-$rc_monthly'));

    await waitFor(() => {
      expect(mockMutateAsyncPurchase).toHaveBeenCalledWith(monthlyPkg);
    });
    expect(mockRefetchSub).toHaveBeenCalled();
    expect(mockRefetchUsage).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Success',
      'Your subscription is now active!'
    );
  });

  it('silently dismisses when user cancels purchase', async () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);

    const cancelError = {
      code: '1', // PURCHASE_CANCELLED_ERROR
      message: 'User cancelled',
      readableErrorCode: 'PURCHASE_CANCELLED_ERROR',
      userInfo: { readableErrorCode: 'PURCHASE_CANCELLED_ERROR' },
      underlyingErrorMessage: '',
      userCancelled: true,
    };
    mockMutateAsyncPurchase.mockRejectedValue(cancelError);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('package-option-$rc_monthly'));

    await waitFor(() => {
      expect(mockMutateAsyncPurchase).toHaveBeenCalled();
    });
    // Should NOT show any error alert
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows network error alert on network failure', async () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);

    const networkError = {
      code: '10', // NETWORK_ERROR
      message: 'Network error',
      readableErrorCode: 'NETWORK_ERROR',
      userInfo: { readableErrorCode: 'NETWORK_ERROR' },
      underlyingErrorMessage: '',
      userCancelled: false,
    };
    mockMutateAsyncPurchase.mockRejectedValue(networkError);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('package-option-$rc_monthly'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Network error',
        'Please check your internet connection and try again.'
      );
    });
  });

  it('shows generic error alert on payment failure', async () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);

    const genericError = {
      code: '0', // UNKNOWN_ERROR
      message: 'Something went wrong',
      readableErrorCode: 'UNKNOWN_ERROR',
      userInfo: { readableErrorCode: 'UNKNOWN_ERROR' },
      underlyingErrorMessage: '',
      userCancelled: false,
    };
    mockMutateAsyncPurchase.mockRejectedValue(genericError);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('package-option-$rc_monthly'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Purchase failed',
        'Something unexpected happened with your purchase. Please try again.'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Restore purchases
  // -------------------------------------------------------------------------

  it('renders restore purchases button', () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('restore-purchases-button')).toBeTruthy();
    expect(screen.getByText('Restore Purchases')).toBeTruthy();
  });

  it('restores purchases and shows success when polling confirms paid tier', async () => {
    jest.useFakeTimers();
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockMutateAsyncRestore.mockResolvedValue(undefined);
    // BUG-397: Restore now polls API to confirm subscription tier
    mockSubscriptionGet.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ subscription: { tier: 'plus' } }),
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });
    fireEvent.press(screen.getByTestId('restore-purchases-button'));

    // Let restore.mutateAsync resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Advance past first polling delay (2 s)
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Restored',
        'Your subscription has been restored.'
      );
    });
    expect(mockRefetchUsage).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('shows no subscriptions alert when polling never confirms paid tier', async () => {
    jest.useFakeTimers();
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockMutateAsyncRestore.mockResolvedValue(undefined);
    // BUG-397: Polling always returns free tier
    mockSubscriptionGet.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ subscription: { tier: 'free' } }),
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });
    fireEvent.press(screen.getByTestId('restore-purchases-button'));

    // Let restore.mutateAsync resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Advance past all 15 polling attempts (15 × 2 s = 30 s)
    for (let i = 0; i < 15; i++) {
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
    }

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'No subscriptions found',
        'We could not find any previous purchases to restore.',
        expect.any(Array)
      );
    });
    jest.useRealTimers();
  });

  it('shows error alert when restore fails', async () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockMutateAsyncRestore.mockRejectedValue(new Error('Restore failed'));

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('restore-purchases-button'));

    await waitFor(() => {
      expect(mockMutateAsyncRestore).toHaveBeenCalled();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Restore failed',
      'Could not restore purchases. Please try again.'
    );
  });

  it('shows loading state on restore button while restoring', () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockRestoreIsPending = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('restore-loading')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Manage billing deep link
  // -------------------------------------------------------------------------

  it('renders manage billing button when user has active subscription', () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockCustomerInfo = makeMockCustomerInfo({
      activeEntitlements: { pro: { isActive: true, identifier: 'pro' } },
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('manage-billing-button')).toBeTruthy();
    expect(screen.getByText('Manage billing')).toBeTruthy();
  });

  it('does not render manage billing when no active subscription', () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockCustomerInfo = null;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('manage-billing-button')).toBeNull();
  });

  it('opens iOS App Store subscriptions on manage billing press (iOS)', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });

    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockCustomerInfo = makeMockCustomerInfo({
      activeEntitlements: { pro: { isActive: true, identifier: 'pro' } },
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('manage-billing-button'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://apps.apple.com/account/subscriptions'
      );
    });

    Object.defineProperty(Platform, 'OS', { get: () => originalPlatform });
  });

  it('opens Google Play subscriptions on manage billing press (Android)', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });

    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockCustomerInfo = makeMockCustomerInfo({
      activeEntitlements: { pro: { isActive: true, identifier: 'pro' } },
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('manage-billing-button'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://play.google.com/store/account/subscriptions'
      );
    });

    Object.defineProperty(Platform, 'OS', { get: () => originalPlatform });
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('navigates back on back button press', () => {
    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByText('Back'));

    expect(mockBack).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  it('renders the Subscription header', () => {
    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Subscription')).toBeTruthy();
  });

  it('renders the BYOK waitlist section', () => {
    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('byok-waitlist-section')).toBeTruthy();
    expect(screen.getByText('Bring your own key')).toBeTruthy();
  });

  it('shows live family pool details for family subscriptions', () => {
    mockSubscription = { tier: 'family', status: 'active' };
    mockFamilySubscription = {
      tier: 'family',
      monthlyLimit: 1500,
      usedThisMonth: 300,
      remainingQuestions: 1200,
      profileCount: 3,
      maxProfiles: 4,
      members: [
        { profileId: 'p1', displayName: 'Parent', isOwner: true },
        { profileId: 'p2', displayName: 'Alex', isOwner: false },
        { profileId: 'p3', displayName: 'Mia', isOwner: false },
      ],
    };

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('family-pool-section')).toBeTruthy();
    expect(screen.getByText('3 of 4 profiles connected')).toBeTruthy();
    expect(screen.getByText(/1200 shared questions left/i)).toBeTruthy();
    expect(screen.getByText(/Parent \(owner\), Alex, Mia/)).toBeTruthy();
  });

  it('joins the BYOK waitlist using account email on success', async () => {
    mockMutateAsyncByokWaitlist.mockResolvedValue({
      message: 'Added to BYOK waitlist',
      email: 'user@example.com',
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('join-byok-waitlist-button'));

    await waitFor(() => {
      // No email argument — the API uses the authenticated account email (CR-17)
      expect(mockMutateAsyncByokWaitlist).toHaveBeenCalledWith();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Waitlist',
      'You have been added to the BYOK waitlist.'
    );
  });

  it('shows an error alert when joining the BYOK waitlist fails', async () => {
    mockMutateAsyncByokWaitlist.mockRejectedValue(new Error('nope'));

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('join-byok-waitlist-button'));

    await waitFor(() => {
      expect(mockMutateAsyncByokWaitlist).toHaveBeenCalled();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Could not join waitlist. Try again.'
    );
  });

  describe('ChildPaywall', () => {
    beforeEach(() => {
      mockActiveProfile = {
        id: 'child-1',
        displayName: 'Alex',
        isOwner: false,
      };
      mockSubscription = undefined;
      mockSubLoading = false;
      mockSubError = false;
    });

    it('renders "See your progress" and "Go Home" buttons', () => {
      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      expect(screen.getByTestId('child-paywall')).toBeTruthy();
      expect(screen.getByTestId('see-progress-button')).toBeTruthy();
      expect(screen.getByTestId('go-home-button')).toBeTruthy();
    });

    it('"Go Home" button navigates to /(app)/home', () => {
      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('go-home-button'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/home');
    });

    it('"See your progress" button navigates to /(app)/progress', () => {
      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('see-progress-button'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/progress');
    });

    it('"Browse Library" button navigates to /(app)/library', () => {
      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('browse-library-button'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/library');
    });

    it('shows "great start" text when child has no XP data', () => {
      mockXpSummary = undefined;

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      expect(
        screen.getByText(
          "You've been exploring and learning \u2014 great start!"
        )
      ).toBeTruthy();
    });

    it('shows XP stats with "great work" when child has topics and XP', () => {
      mockXpSummary = { topicsCompleted: 5, totalXp: 250 };

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      expect(
        screen.getByText(
          'You learned 5 topics and earned 250 XP \u2014 great work!'
        )
      ).toBeTruthy();
    });

    it('shows singular "topic" when topicsCompleted is 1', () => {
      mockXpSummary = { topicsCompleted: 1, totalXp: 50 };

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      expect(
        screen.getByText(
          'You learned 1 topic and earned 50 XP \u2014 great work!'
        )
      ).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-401: Top-up flow tests
  // ---------------------------------------------------------------------------

  describe('top-up flow', () => {
    const topUpPkg = makeMockPackage({
      packageType: 'CUSTOM',
      productOverrides: { identifier: 'mentomate_topup_500' },
    });

    function setupPaidTierWithTopUp() {
      mockSubscription = { tier: 'plus', status: 'active' };
      mockOfferings = makeMockOfferings([makeMockPackage(), topUpPkg]);
    }

    it('does not render top-up section for free tier users', () => {
      mockSubscription = { tier: 'free', status: 'active' };
      mockOfferings = makeMockOfferings([makeMockPackage()]);

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      expect(screen.queryByTestId('top-up-section')).toBeNull();
    });

    it('renders top-up section with "Buy 500 credits" for paid tier', () => {
      setupPaidTierWithTopUp();

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      expect(screen.getByTestId('top-up-section')).toBeTruthy();
      expect(screen.getByText('Buy 500 credits')).toBeTruthy();
    });

    it('shows graceful error when no topup package is in offerings', async () => {
      mockSubscription = { tier: 'plus', status: 'active' };
      mockOfferings = makeMockOfferings([makeMockPackage()]);

      render(<SubscriptionScreen />, { wrapper: createWrapper() });
      fireEvent.press(screen.getByTestId('top-up-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Not available',
          "Top-up credits aren't available right now. Try again later or contact support.",
          expect.arrayContaining([
            expect.objectContaining({ text: 'Retry' }),
            expect.objectContaining({ text: 'OK' }),
          ])
        );
      });
    });

    it('shows connection error with retry when offerings failed to load', async () => {
      mockSubscription = { tier: 'plus', status: 'active' };
      mockOfferings = null;
      mockOfferingsError = true;

      render(<SubscriptionScreen />, { wrapper: createWrapper() });
      fireEvent.press(screen.getByTestId('top-up-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Connection error',
          "Couldn't load purchase options. Check your connection and try again.",
          expect.arrayContaining([expect.objectContaining({ text: 'Retry' })])
        );
      });
    });

    it('silently dismisses when user cancels top-up purchase', async () => {
      setupPaidTierWithTopUp();
      const cancelError = {
        code: '1',
        message: 'User cancelled',
        readableErrorCode: 'PURCHASE_CANCELLED_ERROR',
        userInfo: { readableErrorCode: 'PURCHASE_CANCELLED_ERROR' },
        underlyingErrorMessage: '',
        userCancelled: true,
      };
      mockMutateAsyncPurchase.mockRejectedValue(cancelError);

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('top-up-button'));

      await waitFor(() => {
        expect(mockMutateAsyncPurchase).toHaveBeenCalled();
      });
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('shows network error alert on top-up network failure', async () => {
      setupPaidTierWithTopUp();
      const networkError = {
        code: '10',
        message: 'Network error',
        readableErrorCode: 'NETWORK_ERROR',
        userInfo: { readableErrorCode: 'NETWORK_ERROR' },
        underlyingErrorMessage: '',
        userCancelled: false,
      };
      mockMutateAsyncPurchase.mockRejectedValue(networkError);

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('top-up-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Network error',
          'Please check your internet connection and try again.'
        );
      });
    });

    it('shows generic "Purchase failed" alert on unknown top-up error', async () => {
      setupPaidTierWithTopUp();
      const genericError = {
        code: '0',
        message: 'Something went wrong',
        readableErrorCode: 'UNKNOWN_ERROR',
        userInfo: { readableErrorCode: 'UNKNOWN_ERROR' },
        underlyingErrorMessage: '',
        userCancelled: false,
      };
      mockMutateAsyncPurchase.mockRejectedValue(genericError);

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      fireEvent.press(screen.getByTestId('top-up-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Purchase failed',
          'Something unexpected happened with your purchase. Please try again.'
        );
      });
    });
  });
});
