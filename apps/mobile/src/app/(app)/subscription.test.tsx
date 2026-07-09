import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from '@testing-library/react-native';
import React from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
} from '../../test-utils/mock-api-routes';
import { ProfileContext, type ProfileContextValue } from '../../lib/profile';
import { createTestProfile } from '../../test-utils/app-hook-test-utils';
import { queryKeys } from '../../lib/query-keys';
import type { Profile, Subscription } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

// Captures the useFocusEffect callback so tests can simulate screen focus.
// Must be declared before jest.mock factory so the factory closure captures it.
let capturedFocusEffect: (() => void) | null = null;

// Resolves t('common.ok') → 'OK' (from en.json) so existing assertions on the
// rendered button label keep matching after the alert sweep.
jest.mock(
  'react-i18next', // gc1-allow: external-boundary — i18n library
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  'expo-router', // gc1-allow: native-boundary — Expo Router requires native navigation runtime
  () => ({
    useRouter: () => ({
      back: mockBack,
      push: mockPush,
      replace: mockReplace,
      canGoBack: jest.fn(() => true),
    }),
    useFocusEffect: (cb: () => void) => {
      capturedFocusEffect = cb;
    },
  }),
);

jest.mock(
  'react-native-safe-area-context', // gc1-allow: native-boundary — requires native insets unavailable in Jest
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

jest.mock(
  '../../lib/theme' /* gc1-allow: native-boundary — theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      primary: '#6366f1',
      textInverse: '#ffffff',
      muted: '#9ca3af',
    }),
  }),
);

// ---------------------------------------------------------------------------
// Fetch-boundary mock (replaces hook-level mocks for use-subscription,
// use-settings, use-streaks)
// ---------------------------------------------------------------------------

const mockFetch = createRoutedMockFetch();

// Route the Hono RPC client through our mock fetch so real hooks run.
// The `mockApiClientFactory` helper indirection can cause a Jest module-cache
// mismatch (Hono client built inside the helper uses a different `hono/client`
// instance and never reaches our mockFetch). Inline the factory body so
// `require('hono/client')` resolves from the test file's own module context.
jest.mock(
  '../../lib/api-client', // gc1-allow: transport-boundary — routed mock fetch wires real hooks to canned API responses
  () => {
    const { hc } = require('hono/client');
    return {
      useApiClient: () => hc('http://localhost', { fetch: mockFetch }),
      setActiveProfileId: jest.fn(),
      setProxyMode: jest.fn(),
      setOnAuthExpired: jest.fn(),
      clearOnAuthExpired: jest.fn(),
      resetAuthExpiredGuard: jest.fn(),
      getProxyMode: jest.fn().mockReturnValue(false),
      withIdempotencyKey: jest.fn((h: Record<string, string>) => h),
      isIdempotencyReplay: jest.fn().mockReturnValue(false),
      NetworkError: class NetworkError extends Error {},
      BadRequestError: class BadRequestError extends Error {},
      ConflictError: class ConflictError extends Error {},
      ForbiddenError: class ForbiddenError extends Error {},
      NotFoundError: class NotFoundError extends Error {},
      QuotaExceededError: class QuotaExceededError extends Error {},
      RateLimitedError: class RateLimitedError extends Error {},
      ResourceGoneError: class ResourceGoneError extends Error {},
      UpstreamError: class UpstreamError extends Error {},
    };
  },
);

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

jest.mock(
  '../../hooks/use-revenuecat', // gc1-allow: external-boundary — wraps RevenueCat SDK (react-native-purchases); must be hook-level to control per-test loading/error state
  () => ({
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
  }),
);

// Extends the global react-native-purchases mock (test-setup.ts) with enum
// constants that subscription.tsx imports directly.
jest.mock(
  'react-native-purchases', // gc1-allow: external-boundary — native RevenueCat SDK; extends global mock with PURCHASES_ERROR_CODE + PACKAGE_TYPE enums used by subscription.tsx
  () => ({
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
  }),
);

// useNavigationContract — V1-on tests override the gates to drive the
// `canUseOwnerBillingGates` / `canRemoveFamilyMember` branches in
// subscription.tsx (lines 694-699, 1553, 1648). Default is permissive so
// the existing V0 tests (MODE_NAV_V1_ENABLED=false) are unaffected — the
// V0 short-circuit reads `isOwnerProfile` directly and never consults the
// mock value.
const mockNavigationContractGates = {
  showBilling: true,
  showRemoveFamilyMember: true,
};
jest.mock(
  '../../hooks/use-navigation-contract', // gc1-allow: unit test boundary — hook depends on full app provider tree; stub pins gates for deterministic V1 path coverage
  () => ({
    useNavigationContract: () => ({
      gates: mockNavigationContractGates,
    }),
  }),
);

// ---------------------------------------------------------------------------
// Default mock data shapes (real API shapes from @eduagent/schemas)
// ---------------------------------------------------------------------------

const DEFAULT_SUBSCRIPTION: Subscription = {
  tier: 'free',
  effectiveAccessTier: 'free',
  billingAccess: 'current',
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

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  const tier = overrides.tier ?? DEFAULT_SUBSCRIPTION.tier;
  return {
    ...DEFAULT_SUBSCRIPTION,
    ...overrides,
    effectiveAccessTier: overrides.effectiveAccessTier ?? tier,
  };
}

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

// Full Profile shape so the real useProfile() / useActiveProfileRole() hooks
// work correctly when consumed through ProfileContext.Provider below.
let mockActiveProfile: Profile = createTestProfile({
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createWrapper(opts?: {
  seedCache?: boolean;
  subscription?: Subscription;
  usage?: typeof DEFAULT_USAGE;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (opts?.seedCache) {
    queryClient.setQueryData(
      queryKeys.subscription(mockActiveProfile.id),
      opts.subscription ?? makeSubscription(),
    );
    queryClient.setQueryData(
      queryKeys.usage(mockActiveProfile.id),
      opts.usage ?? DEFAULT_USAGE,
    );
  }

  // Provide the real ProfileContext so useProfile() and the real
  // useActiveProfileRole() / useParentProxy() hooks resolve correctly without
  // internal mocks.
  const profileContextValue: ProfileContextValue = {
    profiles: [mockActiveProfile],
    activeProfile: mockActiveProfile,
    isExplicitProxyMode: false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        ProfileContext.Provider,
        { value: profileContextValue },
        children,
      ),
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
              p.packageType === 'MONTHLY',
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
          (p: ReturnType<typeof makeMockPackage>) =>
            p.packageType === 'MONTHLY',
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
    capturedFocusEffect = null;
    // Reset RevenueCat hook state
    mockOfferings = null;
    mockOfferingsLoading = false;
    mockOfferingsError = false;
    mockRefetchOfferings.mockClear();
    mockCustomerInfo = null;
    mockCustomerInfoLoading = false;
    mockPurchaseIsPending = false;
    mockRestoreIsPending = false;
    // Reset active profile — full Profile shape so real useActiveProfileRole
    // / useParentProxy hooks resolve to 'owner' via ProfileContext.Provider.
    mockActiveProfile = createTestProfile({
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
    });
    // Reset navigation contract gates to permissive default (V0 path ignores
    // these; V1-on tests override per case).
    mockNavigationContractGates.showBilling = true;
    mockNavigationContractGates.showRemoveFamilyMember = true;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    // Default fetch routes (most-specific first to avoid prefix collisions)
    mockFetch.setRoute(
      '/subscription/family/remove',
      () =>
        new Response(
          JSON.stringify({
            message: 'Profile removed from family subscription',
            removedProfileId: '00000000-0000-7000-a000-000000000102',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/subscription/family',
      () =>
        new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 }),
    );
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(JSON.stringify({ subscription: makeSubscription() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/usage',
      () =>
        new Response(JSON.stringify({ usage: DEFAULT_USAGE }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/xp',
      () =>
        new Response(JSON.stringify({ xp: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    mockFetch.setRoute(
      '/byok-waitlist',
      () =>
        new Response(
          JSON.stringify({
            message: 'Added to BYOK waitlist',
            email: 'user@example.com',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/settings/notify-parent-subscribe',
      () =>
        new Response(JSON.stringify({ sent: true, rateLimited: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
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

  it('redirects child role away from subscription detail', () => {
    // Set isOwner: false so the real SubscriptionContent child gate fires:
    // isChild=true + active subscription (no paywall) triggers router.replace('/').
    mockActiveProfile = createTestProfile({
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: false,
    });

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByTestId('subscription-screen')).toBeNull();
  });

  it('renders subscription content for owner role', () => {
    render(<SubscriptionScreen />, {
      wrapper: createWrapper({ seedCache: true }),
    });

    screen.getByTestId('subscription-screen');
  });

  it('shows loading indicator while offerings load', () => {
    mockOfferingsLoading = true;

    render(<SubscriptionScreen />, {
      wrapper: createWrapper({ seedCache: true }),
    });

    screen.getByTestId('subscription-loading');
  });

  it('shows loading indicator while customer info loads', () => {
    mockCustomerInfoLoading = true;

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    screen.getByTestId('subscription-loading');
  });

  it('shows the error state when subscription loading fails', async () => {
    // ParentOnly gates the screen to owners; use an owner profile so the
    // screen renders. The error-vs-child-paywall distinction is validated by
    // the ChildPaywall describe block for the non-owner path.
    mockActiveProfile = createTestProfile({
      id: 'owner-1',
      displayName: 'Alex',
      isOwner: true,
    });
    // Return a 500 to trigger assertOk → query enters error state
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(JSON.stringify({ message: 'Server error' }), {
          status: 500,
        }),
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
      screen.queryByText(/Subscription plans will be available soon/),
    ).toBeNull();
    screen.getByText(/store purchasing isn.t available on this device yet/i);
    // BUG-899: only Free and Plus are approved per pricing_dual_cap.md.
    // Family and Pro static cards must not be shown to non-Family users —
    // their store SKUs are not approved for public listing.
    // (Default subscription tier is 'free'.)
    screen.getByTestId('static-tier-free');
    screen.getByTestId('static-tier-plus');
    within(screen.getByTestId('static-tier-free')).getByText(
      /Try it for you and one child/i,
    );
    within(screen.getByTestId('static-tier-plus')).getByText(
      /Child uses Free-tier limits \(100\/mo, 10\/day\)/i,
    );
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
            subscription: makeSubscription({
              tier: 'family',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
                {
                  profileId: '00000000-0000-7000-a000-000000000101',
                  displayName: 'Alex',
                  isOwner: true,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockOfferings = null; // force the no-offerings static fallback path

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('no-offerings');
    });
    screen.getByTestId('static-tier-free');
    screen.getByTestId('static-tier-plus');
    // The fix:
    const familyCard = screen.getByTestId('static-tier-family');
    within(familyCard).getByText(
      /1,500 shared questions\/month across all profiles/i,
    );
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
            subscription: makeSubscription({
              tier: 'plus',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
            subscription: makeSubscription({
              tier: 'pro',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockOfferings = null; // force the no-offerings static fallback path

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('no-offerings');
    });
    screen.getByTestId('static-tier-free');
    screen.getByTestId('static-tier-plus');
    // The fix:
    const proCard = screen.getByTestId('static-tier-pro');
    within(proCard).getByText(/3,000 shared questions\/month/i);
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
            subscription: makeSubscription({
              tier: 'plus',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
            subscription: makeSubscription({
              tier: 'plus',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
            subscription: makeSubscription({
              tier: 'family',
              status: 'active',
              currentPeriodEnd: '2026-05-18T00:00:00Z',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
            subscription: makeSubscription({
              tier: 'plus',
              status: 'trial',
              trialEndsAt: '2026-05-10T00:00:00.000Z',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
            subscription: makeSubscription({
              tier: 'plus',
              status: 'trial',
              trialEndsAt: null,
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
            subscription: makeSubscription({
              tier: 'plus',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
            subscription: makeSubscription({
              tier: 'plus',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
            subscription: makeSubscription({ tier: 'plus' }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
          fetchCallsMatching(mockFetch, '/subscription').length,
        ).toBeGreaterThanOrEqual(1);
        expect(
          fetchCallsMatching(mockFetch, '/usage').length,
        ).toBeGreaterThanOrEqual(1);
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          'Your subscription is now active!',
          undefined,
          undefined,
        );
      },
      { timeout: 5000 },
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
        'Please check your internet connection and try again.',
        undefined,
        undefined,
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

    // platformAlert delegates to Alert.alert on non-web platforms; assert on
    // Alert.alert directly since the real platformAlert is used (no mock).
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Already purchased',
        expect.stringContaining('already own this subscription'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Restore purchases' }),
          expect.objectContaining({ text: 'Cancel' }),
        ]),
        undefined,
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
        'Something unexpected happened with your purchase. Please try again.',
        undefined,
        undefined,
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
            subscription: makeSubscription({ tier: 'plus' }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
        'Your subscription has been restored.',
        undefined,
        undefined,
      );
    });
    expect(
      fetchCallsMatching(mockFetch, '/usage').length,
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
            subscription: makeSubscription({ tier: 'free' }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
        expect.any(Array),
        undefined,
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
      'Could not restore purchases. Please try again.',
      undefined,
      undefined,
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

  it('shows manage billing info on web for active trial users', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web' });
    try {
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: makeSubscription({
                tier: 'free',
                status: 'trial',
                trialEndsAt: '2026-05-21T00:00:00.000Z',
              }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );
      mockOfferings = null;
      mockCustomerInfo = null;

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('manage-billing-web-info');
      });
      screen.getByText('Manage billing');
      expect(screen.queryByTestId('manage-billing-button')).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => originalPlatform });
    }
  });

  it('does not render native manage billing for server-side trial users', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    try {
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: makeSubscription({
                tier: 'free',
                status: 'trial',
                trialEndsAt: '2026-05-21T00:00:00.000Z',
              }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );
      mockOfferings = makeMockOfferings([makeMockPackage()]);
      mockCustomerInfo = null;

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('offerings-section');
      });
      expect(screen.queryByTestId('manage-billing-button')).toBeNull();
      expect(screen.queryByTestId('manage-billing-web-info')).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => originalPlatform });
    }
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
        'https://apps.apple.com/account/subscriptions',
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
        'https://play.google.com/store/account/subscriptions',
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
      screen.getByText('Subscription is managed on your mobile device'),
    ).toBeTruthy();
    // No interactive Pressable on web — no misleading Google Play copy.
    expect(screen.queryByTestId('manage-billing-button')).toBeNull();
    expect(screen.queryByText('Opens Google Play subscriptions')).toBeNull();

    Object.defineProperty(Platform, 'OS', { get: () => originalPlatform });
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('returns to More on back button press', () => {
    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByText('Back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
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
            subscription: makeSubscription({
              tier: 'family',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
                {
                  profileId: '00000000-0000-7000-a000-000000000101',
                  displayName: 'Parent',
                  isOwner: true,
                },
                {
                  profileId: '00000000-0000-7000-a000-000000000102',
                  displayName: 'Alex',
                  isOwner: false,
                },
                {
                  profileId: '00000000-0000-7000-a000-000000000103',
                  displayName: 'Mia',
                  isOwner: false,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('family-pool-section');
    });
    screen.getByText('3 of 4 profiles connected');
    screen.getByText(/1200 shared questions left/i);
    screen.getByText('Parent (owner)');
    screen.getByText('Alex');
    screen.getByText('Mia');
    screen.getByTestId(
      'remove-family-member-00000000-0000-7000-a000-000000000102',
    );
    screen.getByTestId(
      'remove-family-member-00000000-0000-7000-a000-000000000103',
    );
  });

  it('shows live family pool details for pro subscriptions', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: makeSubscription({
              tier: 'pro',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    mockFetch.setRoute(
      '/subscription/family',
      () =>
        new Response(
          JSON.stringify({
            family: {
              tier: 'pro',
              monthlyLimit: 1500,
              usedThisMonth: 300,
              remainingQuestions: 1200,
              profileCount: 3,
              maxProfiles: 4,
              members: [
                {
                  profileId: '00000000-0000-7000-a000-000000000101',
                  displayName: 'Parent',
                  isOwner: true,
                },
                {
                  profileId: '00000000-0000-7000-a000-000000000102',
                  displayName: 'Alex',
                  isOwner: false,
                },
                {
                  profileId: '00000000-0000-7000-a000-000000000103',
                  displayName: 'Mia',
                  isOwner: false,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('family-pool-section');
    });
    screen.getByText('3 of 4 profiles connected');
    screen.getByText(/1200 shared questions left/i);
    screen.getByText('Parent (owner)');
    screen.getByText('Alex');
    screen.getByText('Mia');
  });

  it('removes a non-owner profile from the family pool after confirmation', async () => {
    mockFetch.setRoute(
      '/subscription',
      () =>
        new Response(
          JSON.stringify({
            subscription: makeSubscription({
              tier: 'family',
              status: 'active',
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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
              profileCount: 2,
              maxProfiles: 4,
              members: [
                {
                  profileId: '00000000-0000-7000-a000-000000000101',
                  displayName: 'Parent',
                  isOwner: true,
                },
                {
                  profileId: '00000000-0000-7000-a000-000000000102',
                  displayName: 'Alex',
                  isOwner: false,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    render(<SubscriptionScreen />, {
      wrapper: createWrapper({
        seedCache: true,
        subscription: makeSubscription({
          tier: 'family',
          status: 'active',
        }),
      }),
    });

    await waitFor(() => {
      screen.getByTestId(
        'remove-family-member-00000000-0000-7000-a000-000000000102',
      );
    });
    fireEvent.press(
      screen.getByTestId(
        'remove-family-member-00000000-0000-7000-a000-000000000102',
      ),
    );

    const confirmButtons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as
      | Array<{ text: string; onPress?: () => void }>
      | undefined;
    const removeButton = confirmButtons?.find(
      (button) => button.text === 'Remove',
    );
    expect(removeButton).toBeDefined();

    await act(async () => {
      removeButton?.onPress?.();
    });

    await waitFor(() => {
      expect(
        fetchCallsMatching(mockFetch, '/subscription/family/remove').length,
      ).toBeGreaterThanOrEqual(1);
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Family updated',
      'Alex was removed from your family plan.',
      undefined,
      undefined,
    );
  });

  it('joins the BYOK waitlist using account email on success', async () => {
    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('join-byok-waitlist-button');
    });
    fireEvent.press(screen.getByTestId('join-byok-waitlist-button'));

    await waitFor(() => {
      expect(
        fetchCallsMatching(mockFetch, '/byok-waitlist').length,
      ).toBeGreaterThanOrEqual(1);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Waitlist',
      'You have been added to the BYOK waitlist.',
      undefined,
      undefined,
    );
  });

  it('shows an error alert when joining the BYOK waitlist fails', async () => {
    mockFetch.setRoute(
      '/byok-waitlist',
      () =>
        new Response(JSON.stringify({ message: 'Server error' }), {
          status: 500,
        }),
    );

    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByTestId('join-byok-waitlist-button');
    });
    fireEvent.press(screen.getByTestId('join-byok-waitlist-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Could not join waitlist. Try again.',
        undefined,
        undefined,
      );
    });
  });

  describe('ChildPaywall', () => {
    beforeEach(() => {
      mockActiveProfile = createTestProfile({
        id: 'child-1',
        displayName: 'Alex',
        isOwner: false,
      });
      // Child paywall renders when isChild=true AND trialOrExpired=true.
      // trialOrExpired requires subscription.status='expired'|'cancelled' OR !subscription&&!subLoading.
      // Use 'expired' status so the condition triggers after the query resolves.
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: makeSubscription({ status: 'expired' }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
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
          }),
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('child-paywall');
      });
      expect(
        screen.getByText("You've been exploring and learning — great start!"),
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
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('child-paywall');
      });
      expect(
        screen.getByText(
          'You learned 5 topics and earned 250 XP — great work!',
        ),
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
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('child-paywall');
      });
      expect(
        screen.getByText('You learned 1 topic and earned 50 XP — great work!'),
      ).toBeTruthy();
    });

    it('[PR3] uses quota-specific copy and notification endpoint when a child has exhausted quota', async () => {
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: makeSubscription({ status: 'active' }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );
      mockFetch.setRoute(
        '/usage',
        () =>
          new Response(
            JSON.stringify({
              usage: {
                ...DEFAULT_USAGE,
                warningLevel: 'exceeded',
                dailyRemainingQuestions: 0,
                resetsAt: '2026-06-01T00:00:00.000Z',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );
      mockFetch.setRoute(
        '/notifications/child-cap/notify-parent',
        () =>
          new Response(JSON.stringify({ sent: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('child-paywall');
      });
      screen.getByText(/try again after/i);
      expect(screen.queryByText(/upgrade/i)).toBeNull();

      fireEvent.press(screen.getByTestId('notify-parent-button'));

      await waitFor(() => {
        expect(
          fetchCallsMatching(
            mockFetch,
            '/notifications/child-cap/notify-parent',
          ).length,
        ).toBe(1);
      });
      expect(
        fetchCallsMatching(mockFetch, '/settings/notify-parent-subscribe')
          .length,
      ).toBe(0);
    });

    it('[B-607] paywall strings flow through i18n (childPaywall + restore + byokWaitlist namespaces)', () => {
      // Locale-key presence regression guard for B-607. If any of these key
      // paths get deleted or renamed, this test fails immediately rather than
      // letting non-EN locales silently fall back to key strings or English.
      // The rendered-string assertions above (e.g. "You've been exploring..."
      // at line ~1776) already validate runtime i18n; this guard makes the
      // locale dependency explicit so a future contributor sees the contract.
      const enJson = jest.requireActual('../../i18n/locales/en.json');
      expect(enJson.subscription.childPaywall.greatStart).toBe(
        "You've been exploring and learning — great start!",
      );
      expect(enJson.subscription.childPaywall.notifyButton).toBe(
        'Notify My Parent',
      );
      expect(enJson.subscription.restore.button).toBe('Restore Purchases');
      expect(enJson.subscription.byokWaitlist).toBeDefined();
      // All 7 locales must define the namespaces.
      for (const loc of ['de', 'es', 'ja', 'nb', 'pl', 'pt']) {
        const j = jest.requireActual(`../../i18n/locales/${loc}.json`);
        expect(j.subscription.childPaywall).toBeDefined();
        expect(j.subscription.restore).toBeDefined();
        expect(j.subscription.byokWaitlist).toBeDefined();
      }
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
              subscription: makeSubscription({
                tier: 'plus',
                status: 'active',
              }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
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

    it('does not render consumable top-up packages as subscription plans', async () => {
      setupPaidTierWithTopUp();

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('offerings-section');
      });

      expect(screen.getAllByTestId('package-option-$rc_monthly')).toHaveLength(
        1,
      );
    });

    it('shows graceful error when no topup package is in offerings', async () => {
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: makeSubscription({
                tier: 'plus',
                status: 'active',
              }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
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
          ]),
          undefined,
        );
      });
    });

    it('shows connection error with retry when offerings failed to load', async () => {
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: makeSubscription({
                tier: 'plus',
                status: 'active',
              }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
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
          'Network error',
          'Please check your internet connection and try again.',
          expect.arrayContaining([expect.objectContaining({ text: 'Retry' })]),
          undefined,
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

    it('[WI-78 DS-197] ignores rapid duplicate top-up presses before disabled state renders', async () => {
      setupPaidTierWithTopUp();
      mockMutateAsyncPurchase.mockImplementation(
        () =>
          new Promise(() => {
            /* keep purchase in flight */
          }),
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        screen.getByTestId('top-up-button');
      });

      fireEvent.press(screen.getByTestId('top-up-button'));
      fireEvent.press(screen.getByTestId('top-up-button'));

      expect(mockMutateAsyncPurchase).toHaveBeenCalledTimes(1);
    });
    it('enters polling after top-up purchase and confirms only when credits increase', async () => {
      jest.useFakeTimers();
      try {
        setupPaidTierWithTopUp();
        let purchaseResolved = false;
        let postPurchaseUsageFetches = 0;
        mockMutateAsyncPurchase.mockImplementation(async () => {
          purchaseResolved = true;
          return undefined;
        });
        mockFetch.setRoute('/usage', () => {
          const topUpCreditsRemaining = !purchaseResolved
            ? 25
            : postPurchaseUsageFetches++ === 0
              ? 25
              : 525;
          return new Response(
            JSON.stringify({
              usage: {
                ...DEFAULT_USAGE,
                topUpCreditsRemaining,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        });

        render(<SubscriptionScreen />, { wrapper: createWrapper() });

        await waitFor(() => {
          screen.getByTestId('top-up-button');
        });
        fireEvent.press(screen.getByTestId('top-up-button'));

        await waitFor(() => {
          screen.getByTestId('top-up-polling-cancel');
        });
        expect(Alert.alert).not.toHaveBeenCalled();

        await act(async () => {
          jest.advanceTimersByTime(2000);
          await Promise.resolve();
        });
        expect(postPurchaseUsageFetches).toBe(1);
        expect(Alert.alert).not.toHaveBeenCalled();
        screen.getByTestId('top-up-polling-cancel');

        await act(async () => {
          jest.advanceTimersByTime(2000);
          await Promise.resolve();
        });

        await waitFor(() => {
          expect(Alert.alert).toHaveBeenCalledWith(
            'Top-up',
            '500 additional credits have been added!',
            undefined,
            undefined,
          );
        });
        expect(postPurchaseUsageFetches).toBe(2);
        expect(screen.queryByTestId('top-up-polling-cancel')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
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
          'Please check your internet connection and try again.',
          undefined,
          undefined,
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
          'Something unexpected happened with your purchase. Please try again.',
          undefined,
          undefined,
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // V1 navigation contract gates (MODE_NAV_V1_ENABLED=true)
  //
  // The V0 path (default in tests) reads `isOwnerProfile` directly. Under V1
  // the screen consults `navigationContract.gates.showBilling` and
  // `.showRemoveFamilyMember` instead — so a non-owner of those surfaces can
  // be hidden even when the profile carries isOwner=true (e.g. proxy mode).
  // These tests drive the V1 branch and prove the gates control the UI
  // independently of the raw owner fact. The flag patch follows the canonical
  // pattern from LearnerScreen.test.tsx:518-551.
  // -------------------------------------------------------------------------

  describe('V1 navigation contract gates', () => {
    const v1OwnerProfileId = '550e8400-e29b-41d4-a716-446655440001';
    const v1ChildProfileId = '550e8400-e29b-41d4-a716-446655440002';

    function withV1Flag(fn: () => Promise<void> | void) {
      const flags = require('../../lib/feature-flags') as {
        FEATURE_FLAGS: { MODE_NAV_V1_ENABLED: boolean };
      };
      const original = flags.FEATURE_FLAGS.MODE_NAV_V1_ENABLED;
      (
        flags.FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }
      ).MODE_NAV_V1_ENABLED = true;
      const restore = () => {
        (
          flags.FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }
        ).MODE_NAV_V1_ENABLED = original;
      };
      try {
        const result = fn();
        if (result instanceof Promise) {
          return result.finally(restore);
        }
        restore();
        return result;
      } catch (err) {
        restore();
        throw err;
      }
    }

    function setupFamilyTier(opts?: {
      byProfile?: Array<{
        profile_id: string;
        name: string;
        used: number;
        usedToday: number;
        is_self: boolean;
      }>;
      members?: Array<{
        profileId: string;
        displayName: string;
        isOwner: boolean;
      }>;
    }) {
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: makeSubscription({
                tier: 'family',
                status: 'active',
              }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );
      mockFetch.setRoute(
        '/usage',
        () =>
          new Response(
            JSON.stringify({
              usage: {
                ...DEFAULT_USAGE,
                byProfile: opts?.byProfile,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
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
                profileCount: opts?.members?.length ?? 2,
                maxProfiles: 4,
                members: opts?.members ?? [
                  {
                    profileId: v1OwnerProfileId,
                    displayName: 'Alex',
                    isOwner: true,
                  },
                  {
                    profileId: v1ChildProfileId,
                    displayName: 'Kid',
                    isOwner: false,
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );
    }

    it('renders "Your share" label on owner usage row when showBilling=true', async () => {
      await withV1Flag(async () => {
        mockNavigationContractGates.showBilling = true;
        setupFamilyTier({
          byProfile: [
            {
              profile_id: v1OwnerProfileId,
              name: 'Alex',
              used: 42,
              usedToday: 3,
              is_self: true,
            },
            {
              profile_id: v1ChildProfileId,
              name: 'Kid',
              used: 17,
              usedToday: 1,
              is_self: false,
            },
          ],
        });

        render(<SubscriptionScreen />, { wrapper: createWrapper() });

        await waitFor(() => {
          screen.getByTestId(`usage-profile-${v1OwnerProfileId}`);
        });
        screen.getByText('Your share');
        expect(screen.queryByText('Your usage')).toBeNull();
      });
    });

    it('renders "Your usage" label when showBilling=false even for isOwner=true profile', async () => {
      // Break test: V1 gate must override the raw owner fact. With
      // showBilling=false the owner-facing "Your share" copy must NOT render
      // even though activeProfile.isOwner is true — proves the screen reads
      // canUseOwnerBillingGates (V1) rather than isOwnerProfile (V0).
      await withV1Flag(async () => {
        mockNavigationContractGates.showBilling = false;
        setupFamilyTier({
          byProfile: [
            {
              profile_id: v1OwnerProfileId,
              name: 'Alex',
              used: 42,
              usedToday: 3,
              is_self: true,
            },
          ],
        });

        render(<SubscriptionScreen />, { wrapper: createWrapper() });

        await waitFor(() => {
          screen.getByTestId(`usage-profile-${v1OwnerProfileId}`);
        });
        screen.getByText('Your usage');
        expect(screen.queryByText('Your share')).toBeNull();
      });
    });

    it('renders remove-family-member button when showRemoveFamilyMember=true', async () => {
      await withV1Flag(async () => {
        mockNavigationContractGates.showRemoveFamilyMember = true;
        setupFamilyTier();

        render(<SubscriptionScreen />, { wrapper: createWrapper() });

        await waitFor(() => {
          screen.getByTestId(`remove-family-member-${v1ChildProfileId}`);
        });
      });
    });

    it('hides remove-family-member button when showRemoveFamilyMember=false even for isOwner=true profile', async () => {
      // Break test: V1 gate must override the raw owner fact. Membership row
      // still renders, but the destructive remove action is gated — proves
      // the screen reads canRemoveFamilyMember (V1) not isOwnerProfile (V0).
      await withV1Flag(async () => {
        mockNavigationContractGates.showRemoveFamilyMember = false;
        setupFamilyTier();

        render(<SubscriptionScreen />, { wrapper: createWrapper() });

        await waitFor(() => {
          screen.getByTestId(`family-member-${v1ChildProfileId}`);
        });
        expect(
          screen.queryByTestId(`remove-family-member-${v1ChildProfileId}`),
        ).toBeNull();
      });
    });
  });

  // -------------------------------------------------------------------------
  // WI-1065: purchase-cancellation ref reset on screen focus
  //
  // Scenario: user taps "Check later" during restore polling → sets
  // restoreCancelledRef.current=true. The poll loop is still running.
  // When the screen regains focus, useFocusEffect resets the ref to false.
  // When the poll loop subsequently completes it checks the ref and fires the
  // success alert (instead of silently suppressing it).
  //
  // Red path (without fix): capturedFocusEffect is null, the ref stays true,
  // the poll completes but the alert is suppressed.
  // Green path (with fix): capturedFocusEffect resets the ref, alert fires.
  // -------------------------------------------------------------------------

  describe('WI-1065: purchase-cancellation ref resets on screen focus', () => {
    it('resets restoreCancelledRef on focus so the still-running poll fires the success alert', async () => {
      jest.useFakeTimers();
      mockOfferings = makeMockOfferings([makeMockPackage()]);
      mockMutateAsyncRestore.mockResolvedValue(undefined);
      // Poll will confirm on first probe (tier = plus).
      mockFetch.setRoute(
        '/subscription',
        () =>
          new Response(
            JSON.stringify({
              subscription: makeSubscription({ tier: 'plus' }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      );

      render(<SubscriptionScreen />, { wrapper: createWrapper() });

      // Wait for initial render to settle.
      await act(async () => {
        await Promise.resolve();
      });

      // Start restore — mutateAsync resolves, poll loop begins.
      fireEvent.press(screen.getByTestId('restore-purchases-button'));

      // Let mutateAsync resolution propagate.
      await act(async () => {
        await Promise.resolve();
      });

      // Poll spinner visible; press "Check later" BEFORE advancing timers so the
      // poll loop is still blocked in its first sleep interval.
      // This sets restoreCancelledRef.current = true.
      await waitFor(() => {
        screen.getByTestId('restore-polling-cancel');
      });
      fireEvent.press(screen.getByTestId('restore-polling-cancel'));

      // Clear the "Check later" alert to count only the subsequent restore alert.
      jest.spyOn(Alert, 'alert').mockClear();

      // Simulate screen regaining focus — fires useFocusEffect, resets ref.
      act(() => {
        capturedFocusEffect?.();
      });

      // Advance past the poll interval — the still-running loop resolves.
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // With fix: ref was reset on focus → success alert fires.
      // Without fix: ref is still true → alert suppressed → test fails here.
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Restored',
          'Your subscription has been restored.',
          undefined,
          undefined,
        );
      });

      jest.useRealTimers();
    });
  });
});
