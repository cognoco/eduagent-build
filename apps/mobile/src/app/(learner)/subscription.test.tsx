import {
  render,
  screen,
  fireEvent,
  waitFor,
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
  useRouter: () => ({ back: mockBack, push: mockPush }),
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
let mockCustomerInfo: ReturnType<typeof makeMockCustomerInfo> | null = null;
let mockCustomerInfoLoading = false;
let mockPurchaseIsPending = false;
let mockRestoreIsPending = false;

jest.mock('../../hooks/use-revenuecat', () => ({
  useOfferings: () => ({
    data: mockOfferings,
    isLoading: mockOfferingsLoading,
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
  usePurchaseTopUp: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
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

jest.mock('../../hooks/use-streaks', () => ({
  useXpSummary: () => ({ data: undefined }),
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
      description: '500 questions per month',
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
    mockCustomerInfo = null;
    mockCustomerInfoLoading = false;
    mockPurchaseIsPending = false;
    mockRestoreIsPending = false;
    mockSubscription = { tier: 'free', status: 'trial' };
    mockSubLoading = false;
    mockSubError = false;
    mockRefetchSub.mockReset();
    mockSubRefetching = false;
    mockUsage = undefined;
    mockUsageLoading = false;
    mockUsageError = false;
    mockRefetchUsage.mockReset();
    mockUsageRefetching = false;
    mockMutateAsyncByokWaitlist.mockReset();
    mockByokWaitlistIsPending = false;
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
    };
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

  it('restores purchases and shows success when entitlements found', async () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    const restoredInfo = makeMockCustomerInfo({
      activeEntitlements: { pro: { isActive: true, identifier: 'pro' } },
    });
    mockMutateAsyncRestore.mockResolvedValue(restoredInfo);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('restore-purchases-button'));

    await waitFor(() => {
      expect(mockMutateAsyncRestore).toHaveBeenCalled();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Restored',
      'Your subscription has been restored.'
    );
  });

  it('shows no subscriptions alert when restore finds nothing', async () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    const emptyInfo = makeMockCustomerInfo(); // no active entitlements
    mockMutateAsyncRestore.mockResolvedValue(emptyInfo);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('restore-purchases-button'));

    await waitFor(() => {
      expect(mockMutateAsyncRestore).toHaveBeenCalled();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'No subscriptions found',
      'We could not find any previous purchases to restore.'
    );
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

  it('joins the BYOK waitlist and clears the email field on success', async () => {
    mockMutateAsyncByokWaitlist.mockResolvedValue({
      message: 'Added to BYOK waitlist',
      email: 'user@example.com',
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.changeText(
      screen.getByTestId('byok-waitlist-email-input'),
      'user@example.com'
    );
    fireEvent.press(screen.getByTestId('join-byok-waitlist-button'));

    await waitFor(() => {
      expect(mockMutateAsyncByokWaitlist).toHaveBeenCalledWith({
        email: 'user@example.com',
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Waitlist',
      'You have been added to the BYOK waitlist.'
    );
    expect(
      screen.getByTestId('byok-waitlist-email-input').props.value
    ).toBe('');
  });

  it('shows an error alert when joining the BYOK waitlist fails', async () => {
    mockMutateAsyncByokWaitlist.mockRejectedValue(new Error('nope'));

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.changeText(
      screen.getByTestId('byok-waitlist-email-input'),
      'user@example.com'
    );
    fireEvent.press(screen.getByTestId('join-byok-waitlist-button'));

    await waitFor(() => {
      expect(mockMutateAsyncByokWaitlist).toHaveBeenCalled();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Could not join waitlist. Try again.'
    );
  });
});
