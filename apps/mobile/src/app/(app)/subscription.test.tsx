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
import {
  createRoutedMockFetch,
  fetchCallsMatching,
} from '../../test-utils/mock-api-routes';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
const mockPush = jest.fn();

// [F-029] Mock platformAlert to spy on it via Alert.alert, so existing
// test assertions continue working after the Alert → platformAlert migration.
const mockPlatformAlert = jest.fn((...args: Parameters<typeof Alert.alert>) =>
  Alert.alert(...args)
);
jest.mock('../../lib/platform-alert', () => ({
  platformAlert: (...args: unknown[]) =>
    mockPlatformAlert(...(args as Parameters<typeof Alert.alert>)),
}));

// Resolves t('common.ok') → 'OK' (from en.json) so existing assertions on the
// rendered button label keep matching after the alert sweep.
jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock
);

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

// ---------------------------------------------------------------------------
// Fetch-boundary mock (replaces hook-level mocks for use-subscription,
// use-settings, use-streaks)
// ---------------------------------------------------------------------------

const mockFetch = createRoutedMockFetch();

jest.mock('../../lib/api-client', () =>
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch)
);

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: mockActiveProfile,
  }),
}));

jest.mock('../../components/common', () => ({
  UsageMeter: () => null,
}));

// RevenueCat hooks mocks — these hooks use the RevenueCat SDK directly,
// NOT useApiClient, so they stay as hook-level mocks.
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

// Mock react-native-purchases for enum/constant access
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {},
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    PRODUCT_ALREADY_PURCHASED_ERROR: '6',
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
// Default mock data shapes (real API shapes from @eduagent/schemas)
// ---------------------------------------------------------------------------

const DEFAULT_SUBSCRIPTION = {
  tier: 'free',
  status: 'active',
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  monthlyLimit: 100,
  usedThisMonth: 0,
  remainingQuestions: 100,
  dailyLimit: 10,
  usedToday: 0,
  dailyRemainingQuestions: 10,
};

const DEFAULT_USAGE = {
  monthlyLimit: 100,
  usedThisMonth: 0,
  remainingQuestions: 100,
  topUpCreditsRemaining: 0,
  warningLevel: 'none',
  cycleResetAt: '2026-06-01T00:00:00Z',
  dailyLimit: 10,
  usedToday: 0,
  dailyRemainingQuestions: 10,
};

// ---------------------------------------------------------------------------
// Active profile state (mutable for tests that need different profiles)
// ---------------------------------------------------------------------------

let mockActiveProfile: {
  id: string;
  displayName: string;
  isOwner: boolean;
} = {
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createWrapper(opts?: { seedCache?: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (opts?.seedCache) {
    queryClient.setQueryData(
      ['subscription', mockActiveProfile.id],
      DEFAULT_SUBSCRIPTION
    );
    queryClient.setQueryData(['usage', mockActiveProfile.id], DEFAULT_USAGE);
  }
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
    // Reset RevenueCat hook state
    mockOfferings = null;
    mockOfferingsLoading = false;
    mockOfferingsError = false;
    mockRefetchOfferings.mockClear();
    mockCustomerInfo = null;
    mockCustomerInfoLoading = false;
    mockPurchaseIsPending = false;
    mockRestoreIsPending = false;
    // Reset active profile
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
    };
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPlatformAlert.mockClear();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    // Default fetch routes (most-specific first to avoid prefix collisions)
    mockFetch.setRoute(
      '/subscription/family',
      () =>
        new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 })
    );
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(JSON.stringify({ subscription: DEFAULT_SUBSCRIPTION }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    mockFetch.setRoute(
      '/usage',
      () =>
        new Response(JSON.stringify({ usage: DEFAULT_USAGE }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    mockFetch.setRoute(
      '/xp',
      () =>
        new Response(JSON.stringify({ xp: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    mockFetch.setRoute(
      '/byok-waitlist',
      () =>
        new Response(
          JSON.stringify({
            message: 'Added to BYOK waitlist',
            email: 'user@example.com',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockFetch.setRoute(
      '/settings/notify-parent-subscribe',
      () =>
        new Response(JSON.stringify({ sent: true, rateLimited: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
  });

  // -------------------------------------------------------------------------
  // Loading states
  // -------------------------------------------------------------------------

  it('shows loading indicator while data is loading', () => {
    // Use offeringsLoading=true to assert that isLoading=true shows the spinner
    // without creating a never-resolving async fetch. A never-resolving fetch
    // leaves a dangling combinedSignal setTimeout in the event loop (open handle)
    // that can cause subsequent tests to time out in CI.
    // isLoading = subLoading || usageLoading || offeringsLoading || customerInfoLoading,
    // so any loading sub-state triggers the indicator — we don't need the
    // subscription fetch specifically to be slow here.
    mockOfferingsLoading = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    screen.getByTestId('subscription-loading');
  });

  it('shows loading indicator while offerings load', () => {
    mockOfferingsLoading = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    screen.getByTestId('subscription-loading');
  });

  it('shows loading indicator while customer info loads', () => {
    mockCustomerInfoLoading = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    screen.getByTestId('subscription-loading');
  });

  it('shows the error state instead of the child paywall when subscription loading fails', async () => {
    mockActiveProfile = {
      id: 'child-1',
      displayName: 'Alex',
      isOwner: false,
    };
    // Return a 500 to trigger assertOk → query enters error state
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(JSON.stringify({ message: 'Server error' }), {
          status: 500,
        })
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('subscription-error');
    });
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

    render(<SubscriptionScreen />, {
      wrapper: createWrapper({ seedCache: true }),
    });

    screen.getByTestId('offerings-section');
    screen.getByTestId('package-option-$rc_monthly');
    screen.getByTestId('package-option-$rc_annual');
    screen.getByText('MentoMate Plus Monthly');
    screen.getByText('MentoMate Plus Annual');
    screen.getByText('$9.99 / monthly');
    screen.getByText('$99.99 / annual');
  });

  it('shows no-offerings fallback with static tier comparison when no packages are available', async () => {
    mockOfferings = null;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    // Wait for subscription data to load (default: free tier)
    await waitFor(() => {
      screen.getByTestId('no-offerings');
    });
    // BUG-897: message must NOT say "plans available soon" while listing
    // plan cards — pick one direction. We keep the cards as informational
    // tier comparison and rephrase the disclaimer to not contradict.
    expect(
      screen.queryByText(/Subscription plans will be available soon/)
    ).toBeNull();
    screen.getByText(/store purchasing isn't available on this device yet/i);
    // BUG-899: only Free and Plus are approved per pricing_dual_cap.md.
    // Family and Pro static cards must not be shown to non-Family users —
    // their store SKUs are not approved for public listing.
    // (Default subscription tier is 'free'.)
    screen.getByTestId('static-tier-free');
    screen.getByTestId('static-tier-plus');
    expect(screen.queryByTestId('static-tier-family')).toBeNull();
    expect(screen.queryByTestId('static-tier-pro')).toBeNull();
  });

  // [BUG-917] When the user IS on Family, the static comparison must
  // include a Family card so they can see their own entitlements next
  // to lower tiers. Previous behavior collapsed Family users into the
  // BUG-899 hide-all-non-public-tiers rule, leaving them with no plan
  // comparison for the tier they actually pay for.
  it('shows Family static card in PLANS comparison when user is on Family [BUG-917]', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'family',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockFetch.setRoute(
      '/subscription/family',
      () =>
        new Response(
          JSON.stringify({
            family: {
              tier: 'family',
              monthlyLimit: 1500,
              usedThisMonth: 0,
              remainingQuestions: 1500,
              profileCount: 1,
              maxProfiles: 6,
              members: [
                { profileId: 'profile-1', displayName: 'Alex', isOwner: true },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = null; // force the no-offerings static fallback path

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('no-offerings');
    });
    screen.getByTestId('static-tier-free');
    screen.getByTestId('static-tier-plus');
    // The fix:
    screen.getByTestId('static-tier-family');
    screen.getByText(/1,500 questions per month \(shared/i);
    // Pro is still hidden — it's not the user's tier and not approved
    // for public listing.
    expect(screen.queryByTestId('static-tier-pro')).toBeNull();
  });

  // [BUG-917] Verify a non-Family user does not see Family card even if
  // RevenueCat returns no offerings — the BUG-899 rule still holds.
  it('hides Family static card for Plus users [BUG-917 + BUG-899 regression]', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'plus',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = null;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('static-tier-free');
    });
    screen.getByTestId('static-tier-plus');
    expect(screen.queryByTestId('static-tier-family')).toBeNull();
  });

  // [BUG-917] Pro-tier cascade: same issue as Family — a Pro user landing on
  // the subscription screen saw only Free/Plus in the static comparison, with
  // no card for their own Pro tier. Fix mirrors the Family fix exactly.
  it('shows Pro static card in PLANS comparison when user is on Pro [BUG-917]', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'pro',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = null; // force the no-offerings static fallback path

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('no-offerings');
    });
    screen.getByTestId('static-tier-free');
    screen.getByTestId('static-tier-plus');
    // The fix:
    screen.getByTestId('static-tier-pro');
    screen.getByText(/3,000 questions per month/i);
    // Family is still hidden — it's not this user's tier and not approved
    // for general public listing.
    expect(screen.queryByTestId('static-tier-family')).toBeNull();
  });

  // [BUG-917] Verify a Pro user does not contaminate Family visibility.
  it('hides Pro static card for Plus users [BUG-917 + BUG-899 regression]', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'plus',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = null;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('static-tier-free');
    });
    screen.getByTestId('static-tier-plus');
    expect(screen.queryByTestId('static-tier-pro')).toBeNull();
    expect(screen.queryByTestId('static-tier-family')).toBeNull();
  });

  // BUG-899 break test: Premium Mentor add-on advertises an unapproved
  // +$15/month price. It must not render even on a paid tier until pricing
  // is approved.
  it('does not show the Premium Mentor +$15/month add-on on paid tiers', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'plus',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockCustomerInfo = makeMockCustomerInfo({
      activeEntitlements: { plus: { isActive: true, identifier: 'plus' } },
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('offerings-section');
    });
    expect(screen.queryByTestId('ai-upgrade-section')).toBeNull();
    expect(screen.queryByText(/\+\$15\/month per profile/)).toBeNull();
  });

  // BUG-896 break test: Manage billing must appear whenever the API tier is
  // paid, even if RevenueCat hasn't synced an active entitlement. Otherwise
  // a paid parent has no in-app way to cancel.
  it('renders manage billing when API tier is paid even if RevenueCat shows no active entitlement', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'family',
              status: 'active',
              currentPeriodEnd: '2026-05-18T00:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = null;
    mockCustomerInfo = makeMockCustomerInfo(); // no active entitlements

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('manage-billing-button');
    });
  });

  // [BUG-966] When the server reports status='trial', the screen must surface
  // a "Trial active" banner with the trial end date and shift the status badge
  // away from "Active". Maestro flow billing/subscription-details.yaml asserts
  // visible text "Trial active" — this unit test locks the contract so it
  // cannot regress silently.
  it('[BUG-966] renders Trial active banner with end date when status=trial', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'plus',
              status: 'trial',
              trialEndsAt: '2026-05-10T00:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = makeMockOfferings([makeMockPackage()]);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('trial-banner');
    });
    screen.getByText('Trial active');
    // Status badge must read "Trial", not "Active", when trialing.
    screen.getByText('Trial');
    expect(screen.queryByText('Active')).toBeNull();
  });

  // [BUG-966] Defensive: if trialEndsAt is null, the banner still renders
  // its headline so the user knows they are on a trial. End-date copy is
  // suppressed rather than rendered as "Invalid Date".
  it('[BUG-966] renders Trial active banner without date when trialEndsAt is null', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'plus',
              status: 'trial',
              trialEndsAt: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = makeMockOfferings([makeMockPackage()]);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('trial-banner');
    });
    screen.getByText('Trial active');
    expect(screen.queryByText(/Trial ends/)).toBeNull();
  });

  // [BUG-966] Banner must not appear for non-trial statuses — guards against
  // accidentally surfacing "Trial active" for active paying users.
  it('[BUG-966] does not render Trial active banner when status=active', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'plus',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = makeMockOfferings([makeMockPackage()]);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('current-plan');
    });
    expect(screen.queryByTestId('trial-banner')).toBeNull();
    expect(screen.queryByText('Trial active')).toBeNull();
  });

  it('shows current plan info from subscription data', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'plus',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockOfferings = makeMockOfferings([makeMockPackage()]);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('current-plan');
    });
    screen.getByText('Plus');
  });

  // -------------------------------------------------------------------------
  // Current plan highlighting
  // -------------------------------------------------------------------------

  it('highlights the current plan based on active subscriptions', async () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);
    mockCustomerInfo = makeMockCustomerInfo({
      activeEntitlements: { pro: { isActive: true, identifier: 'pro' } },
      activeSubscriptions: ['mentomate_monthly'],
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      // "Current plan" appears in both the section header and the package badge
      const matches = screen.getAllByText('Current plan');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows Subscribe for packages that are not the current plan', async () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);
    mockCustomerInfo = makeMockCustomerInfo(); // no active entitlements

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByText('Subscribe');
    });
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
    // PR-FIX-07: handlePurchase polls the subscription endpoint until the
    // webhook promotes the tier away from 'free'. Return an upgraded tier
    // on the first poll so the loop breaks and the success alert fires.
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: { ...DEFAULT_SUBSCRIPTION, tier: 'plus' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('package-option-$rc_monthly');
    });
    fireEvent.press(screen.getByTestId('package-option-$rc_monthly'));

    await waitFor(
      () => {
        expect(mockMutateAsyncPurchase).toHaveBeenCalledWith(monthlyPkg);
        // With real hooks, refetch calls back to mockFetch for /subscription and /usage
        expect(
          fetchCallsMatching(mockFetch, '/subscription').length
        ).toBeGreaterThanOrEqual(1);
        expect(
          fetchCallsMatching(mockFetch, '/usage').length
        ).toBeGreaterThanOrEqual(1);
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          'Your subscription is now active!'
        );
      },
      { timeout: 5000 }
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

    await waitFor(() => {
      screen.getByTestId('package-option-$rc_monthly');
    });
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

    await waitFor(() => {
      screen.getByTestId('package-option-$rc_monthly');
    });
    fireEvent.press(screen.getByTestId('package-option-$rc_monthly'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Network error',
        'Please check your internet connection and try again.'
      );
    });
  });

  it('[UX-DE-M8] shows "Already purchased" alert with Restore action on PRODUCT_ALREADY_PURCHASED_ERROR', async () => {
    const monthlyPkg = makeMockPackage();
    mockOfferings = makeMockOfferings([monthlyPkg]);

    const alreadyPurchasedError = {
      code: '6', // PRODUCT_ALREADY_PURCHASED_ERROR
      message: 'Product already purchased',
      readableErrorCode: 'PRODUCT_ALREADY_PURCHASED_ERROR',
      userInfo: { readableErrorCode: 'PRODUCT_ALREADY_PURCHASED_ERROR' },
      underlyingErrorMessage: '',
      userCancelled: false,
    };
    mockMutateAsyncPurchase.mockRejectedValue(alreadyPurchasedError);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('package-option-$rc_monthly');
    });
    fireEvent.press(screen.getByTestId('package-option-$rc_monthly'));

    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Already purchased',
        expect.stringContaining('already own this subscription'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Restore purchases' }),
          expect.objectContaining({ text: 'Cancel' }),
        ])
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

    await waitFor(() => {
      screen.getByTestId('package-option-$rc_monthly');
    });
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

  it('renders restore purchases button', async () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('restore-purchases-button');
    });
    screen.getByText('Restore Purchases');
  });

  it('restores purchases and shows success when polling confirms paid tier', async () => {
    jest.useFakeTimers();
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockMutateAsyncRestore.mockResolvedValue(undefined);
    // BUG-397: Restore now polls API to confirm subscription tier
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: { ...DEFAULT_SUBSCRIPTION, tier: 'plus' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await act(async () => {
      await Promise.resolve();
    });

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
    expect(
      fetchCallsMatching(mockFetch, '/usage').length
    ).toBeGreaterThanOrEqual(1);
    jest.useRealTimers();
  });

  it('shows no subscriptions alert when polling never confirms paid tier', async () => {
    jest.useFakeTimers();
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockMutateAsyncRestore.mockResolvedValue(undefined);
    // BUG-397: Polling always returns free tier
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: { ...DEFAULT_SUBSCRIPTION, tier: 'free' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await act(async () => {
      await Promise.resolve();
    });

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

    await waitFor(() => {
      screen.getByTestId('restore-purchases-button');
    });
    fireEvent.press(screen.getByTestId('restore-purchases-button'));

    await waitFor(() => {
      expect(mockMutateAsyncRestore).toHaveBeenCalled();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Restore failed',
      'Could not restore purchases. Please try again.'
    );
  });

  it('shows loading state on restore button while restoring', async () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockRestoreIsPending = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    // Wait for subscription data to load so the offerings section renders
    await waitFor(() => {
      screen.getByTestId('restore-loading');
    });
  });

  // -------------------------------------------------------------------------
  // Manage billing deep link
  // -------------------------------------------------------------------------

  it('renders manage billing button when user has active subscription', async () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockCustomerInfo = makeMockCustomerInfo({
      activeEntitlements: { pro: { isActive: true, identifier: 'pro' } },
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('manage-billing-button');
    });
    screen.getByText('Manage billing');
  });

  it('does not render manage billing when no active subscription', async () => {
    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockCustomerInfo = null;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('offerings-section');
    });
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

    await waitFor(() => {
      screen.getByTestId('manage-billing-button');
    });
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

    await waitFor(() => {
      screen.getByTestId('manage-billing-button');
    });
    fireEvent.press(screen.getByTestId('manage-billing-button'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://play.google.com/store/account/subscriptions'
      );
    });

    Object.defineProperty(Platform, 'OS', { get: () => originalPlatform });
  });

  // [BUG-916] On web there is no native store deep link — IAP runs on
  // iOS/Android only and Stripe is dormant for web. The Manage row must show
  // a static "managed on your mobile device" info instead of the misleading
  // "Opens Google Play subscriptions" copy.
  it('shows static "managed on your mobile device" info on web (BUG-916)', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web' });

    mockOfferings = makeMockOfferings([makeMockPackage()]);
    mockCustomerInfo = makeMockCustomerInfo({
      activeEntitlements: { pro: { isActive: true, identifier: 'pro' } },
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('manage-billing-web-info');
    });
    expect(
      screen.getByText('Subscription is managed on your mobile device')
    ).toBeTruthy();
    // No interactive Pressable on web — no misleading Google Play copy.
    expect(screen.queryByTestId('manage-billing-button')).toBeNull();
    expect(screen.queryByText('Opens Google Play subscriptions')).toBeNull();

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

    screen.getByText('Subscription');
  });

  it('renders the BYOK waitlist section', async () => {
    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('byok-waitlist-section');
    });
    screen.getByText('Bring your own key');
  });

  it('shows live family pool details for family subscriptions', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: {
              ...DEFAULT_SUBSCRIPTION,
              tier: 'family',
              status: 'active',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    mockFetch.setRoute(
      '/subscription/family',
      () =>
        new Response(
          JSON.stringify({
            family: {
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
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('family-pool-section');
    });
    screen.getByText('3 of 4 profiles connected');
    screen.getByText(/1200 shared questions left/i);
    screen.getByText(/Parent \(owner\), Alex, Mia/);
  });

  it('joins the BYOK waitlist using account email on success', async () => {
    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('join-byok-waitlist-button');
    });
    fireEvent.press(screen.getByTestId('join-byok-waitlist-button'));

    await waitFor(() => {
      expect(
        fetchCallsMatching(mockFetch, '/byok-waitlist').length
      ).toBeGreaterThanOrEqual(1);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Waitlist',
      'You have been added to the BYOK waitlist.'
    );
  });

  it('shows an error alert when joining the BYOK waitlist fails', async () => {
    mockFetch.setRoute(
      '/byok-waitlist',
      () =>
        new Response(JSON.stringify({ message: 'Server error' }), {
          status: 500,
        })
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('join-byok-waitlist-button');
    });
    fireEvent.press(screen.getByTestId('join-byok-waitlist-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Could not join waitlist. Try again.'
      );
    });
  });

  describe('ChildPaywall', () => {
    beforeEach(() => {
      mockActiveProfile = {
        id: 'child-1',
        displayName: 'Alex',
        isOwner: false,
      };
      // Child paywall renders when isChild=true AND trialOrExpired=true.
      // trialOrExpired requires subscription.status='expired'|'cancelled' OR !subscription&&!subLoading.
      // Use 'expired' status so the condition triggers after the query resolves.
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: { ...DEFAULT_SUBSCRIPTION, status: 'expired' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      );
    });

    it('renders "See your progress" and "Go Home" buttons', async () => {
      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('child-paywall');
      });
      screen.getByTestId('see-progress-button');
      screen.getByTestId('go-home-button');
    });

    it('"Go Home" button navigates to /(app)/home', async () => {
      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('go-home-button');
      });
      fireEvent.press(screen.getByTestId('go-home-button'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/home');
    });

    it('"See your progress" button navigates to /(app)/progress', async () => {
      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('see-progress-button');
      });
      fireEvent.press(screen.getByTestId('see-progress-button'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/progress');
    });

    it('"Browse Library" button navigates to /(app)/library', async () => {
      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('browse-library-button');
      });
      fireEvent.press(screen.getByTestId('browse-library-button'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/library');
    });

    it('shows "great start" text when child has no XP data', async () => {
      mockFetch.setRoute(
        '/xp',
        () =>
          new Response(JSON.stringify({ xp: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('child-paywall');
      });
      expect(
        screen.getByText("You've been exploring and learning — great start!")
      ).toBeTruthy();
    });

    it('shows XP stats with "great work" when child has topics and XP', async () => {
      mockFetch.setRoute(
        '/xp',
        () =>
          new Response(
            JSON.stringify({
              xp: {
                totalXp: 250,
                verifiedXp: 200,
                pendingXp: 50,
                decayedXp: 0,
                topicsCompleted: 5,
                topicsVerified: 3,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('child-paywall');
      });
      expect(
        screen.getByText('You learned 5 topics and earned 250 XP — great work!')
      ).toBeTruthy();
    });

    it('shows singular "topic" when topicsCompleted is 1', async () => {
      mockFetch.setRoute(
        '/xp',
        () =>
          new Response(
            JSON.stringify({
              xp: {
                totalXp: 50,
                verifiedXp: 40,
                pendingXp: 10,
                decayedXp: 0,
                topicsCompleted: 1,
                topicsVerified: 1,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('child-paywall');
      });
      expect(
        screen.getByText('You learned 1 topic and earned 50 XP — great work!')
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
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: {
                ...DEFAULT_SUBSCRIPTION,
                tier: 'plus',
                status: 'active',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      );
      mockOfferings = makeMockOfferings([makeMockPackage(), topUpPkg]);
    }

    it('does not render top-up section for free tier users', async () => {
      // default subscription is free
      mockOfferings = makeMockOfferings([makeMockPackage()]);

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('offerings-section');
      });
      expect(screen.queryByTestId('top-up-section')).toBeNull();
    });

    it('renders top-up section with "Buy 500 credits" for paid tier', async () => {
      setupPaidTierWithTopUp();

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('top-up-section');
      });
      screen.getByText('Buy 500 credits');
    });

    it('shows graceful error when no topup package is in offerings', async () => {
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: {
                ...DEFAULT_SUBSCRIPTION,
                tier: 'plus',
                status: 'active',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      );
      mockOfferings = makeMockOfferings([makeMockPackage()]);

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('top-up-button');
      });
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
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: {
                ...DEFAULT_SUBSCRIPTION,
                tier: 'plus',
                status: 'active',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      );
      mockOfferings = null;
      mockOfferingsError = true;

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('top-up-button');
      });
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

      await waitFor(() => {
        screen.getByTestId('top-up-button');
      });
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

      await waitFor(() => {
        screen.getByTestId('top-up-button');
      });
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

      await waitFor(() => {
        screen.getByTestId('top-up-button');
      });
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
