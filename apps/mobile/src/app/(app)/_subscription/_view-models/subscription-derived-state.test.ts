import {
  deriveTierState,
  deriveOfferingsState,
  deriveChildPaywallGate,
} from './subscription-derived-state';

// Extends the global react-native-purchases mock (test-setup.ts) with the
// PACKAGE_TYPE enum that constants.ts evaluates at module load. Matches the
// pattern in apps/mobile/src/app/(app)/subscription.test.tsx.
// jest.mock calls hoist above imports automatically.
jest.mock(
  'react-native-purchases', // gc1-allow: external-boundary — native RevenueCat SDK; extends global mock with PACKAGE_TYPE enum used by _subscription/constants.ts
  () => ({
    __esModule: true,
    default: {},
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

describe('deriveTierState', () => {
  const base = {
    tier: undefined,
    status: undefined,
    cancelAtPeriodEnd: undefined,
    hasActiveSubscription: false,
    platformOS: 'ios' as const,
  };

  it('defaults missing tier/status to free/active and computes canManageBilling=false', () => {
    const result = deriveTierState(base);
    expect(result).toEqual({
      tier: 'free',
      status: 'active',
      isPaidTier: false,
      canManageBilling: false,
      cancelAtPeriodEnd: false,
    });
  });

  it('web + trial → canManageBilling=true', () => {
    const result = deriveTierState({
      ...base,
      tier: 'free',
      status: 'trial',
      platformOS: 'web',
    });
    expect(result.canManageBilling).toBe(true);
  });

  it('native + trial → canManageBilling=false (BUG-916)', () => {
    const result = deriveTierState({
      ...base,
      tier: 'free',
      status: 'trial',
      platformOS: 'ios',
    });
    expect(result.canManageBilling).toBe(false);
  });

  it('native + hasActiveSubscription=true → canManageBilling=true', () => {
    const result = deriveTierState({
      ...base,
      hasActiveSubscription: true,
      platformOS: 'ios',
    });
    expect(result.canManageBilling).toBe(true);
  });

  it('paid tier → canManageBilling=true regardless of platform', () => {
    const result = deriveTierState({
      ...base,
      tier: 'plus',
      platformOS: 'android',
    });
    expect(result).toMatchObject({
      isPaidTier: true,
      canManageBilling: true,
    });
  });

  it('preserves cancelAtPeriodEnd when provided', () => {
    const result = deriveTierState({
      ...base,
      tier: 'plus',
      cancelAtPeriodEnd: true,
    });
    expect(result.cancelAtPeriodEnd).toBe(true);
  });
});

describe('deriveOfferingsState', () => {
  it('web with empty subscriptionPackages and offeringsLoading=false → storePurchaseUnavailable=true', () => {
    const result = deriveOfferingsState({
      currentOffering: null,
      offeringsLoading: false,
      platformOS: 'web',
    });
    expect(result.storePurchaseUnavailable).toBe(true);
  });

  it('native with same → storePurchaseUnavailable=false', () => {
    const result = deriveOfferingsState({
      currentOffering: null,
      offeringsLoading: false,
      platformOS: 'ios',
    });
    expect(result.storePurchaseUnavailable).toBe(false);
  });

  it('web with offerings still loading → storePurchaseUnavailable=false', () => {
    const result = deriveOfferingsState({
      currentOffering: null,
      offeringsLoading: true,
      platformOS: 'web',
    });
    expect(result.storePurchaseUnavailable).toBe(false);
  });
});

describe('deriveChildPaywallGate', () => {
  const base = {
    isOwnerProfile: true,
    hasActiveProfile: true,
    subscriptionStatus: 'active' as string | undefined,
    subscriptionIsLoading: false,
    usageWarningLevel: undefined as string | undefined,
    subscriptionLoadError: false,
    usageLoadError: false,
    hasSubscriptionData: true,
    hasUsageData: true,
  };

  it('owner profile → isChild=false', () => {
    const result = deriveChildPaywallGate(base);
    expect(result.isChild).toBe(false);
    expect(result.showPaywall).toBe(false);
  });

  it('no active profile → isChild=false even when isOwnerProfile=false', () => {
    const result = deriveChildPaywallGate({
      ...base,
      hasActiveProfile: false,
      isOwnerProfile: false,
    });
    expect(result.isChild).toBe(false);
  });

  it('non-owner + warningLevel=exceeded → showPaywall=true', () => {
    const result = deriveChildPaywallGate({
      ...base,
      isOwnerProfile: false,
      usageWarningLevel: 'exceeded',
    });
    expect(result).toMatchObject({
      isChild: true,
      quotaExhausted: true,
      showPaywall: true,
    });
  });

  it('non-owner + subscriptionStatus=expired → showPaywall=true', () => {
    const result = deriveChildPaywallGate({
      ...base,
      isOwnerProfile: false,
      subscriptionStatus: 'expired',
    });
    expect(result).toMatchObject({
      isChild: true,
      trialOrExpired: true,
      showPaywall: true,
    });
  });

  it('non-owner + subscriptionStatus=cancelled → showPaywall=true', () => {
    const result = deriveChildPaywallGate({
      ...base,
      isOwnerProfile: false,
      subscriptionStatus: 'cancelled',
    });
    expect(result).toMatchObject({
      isChild: true,
      trialOrExpired: true,
      showPaywall: true,
    });
  });

  it('non-owner + no subscription data + not loading → showPaywall=true (trialOrExpired)', () => {
    const result = deriveChildPaywallGate({
      ...base,
      isOwnerProfile: false,
      subscriptionStatus: undefined,
      hasSubscriptionData: false,
      subscriptionIsLoading: false,
    });
    expect(result.trialOrExpired).toBe(true);
    expect(result.showPaywall).toBe(true);
  });

  it('non-owner + subscription still loading → showPaywall=false', () => {
    const result = deriveChildPaywallGate({
      ...base,
      isOwnerProfile: false,
      subscriptionStatus: undefined,
      hasSubscriptionData: false,
      subscriptionIsLoading: true,
    });
    expect(result.trialOrExpired).toBe(false);
    expect(result.showPaywall).toBe(false);
  });

  it('subscription load error + no cached data → hasLoadError=true, trialOrExpired=false', () => {
    const result = deriveChildPaywallGate({
      ...base,
      isOwnerProfile: false,
      subscriptionLoadError: true,
      hasSubscriptionData: false,
      subscriptionStatus: undefined,
    });
    expect(result.hasLoadError).toBe(true);
    expect(result.trialOrExpired).toBe(false);
    expect(result.showPaywall).toBe(false);
  });

  it('non-owner + quota exceeded still shows paywall when subscription details are owner-only', () => {
    const result = deriveChildPaywallGate({
      ...base,
      isOwnerProfile: false,
      subscriptionLoadError: true,
      hasSubscriptionData: false,
      subscriptionStatus: undefined,
      usageWarningLevel: 'exceeded',
    });
    expect(result.hasLoadError).toBe(false);
    expect(result.quotaExhausted).toBe(true);
    expect(result.showPaywall).toBe(true);
  });

  it('usage load error + no cached usage data → hasLoadError=true, quotaExhausted=false', () => {
    const result = deriveChildPaywallGate({
      ...base,
      isOwnerProfile: false,
      usageLoadError: true,
      hasUsageData: false,
      usageWarningLevel: 'exceeded',
    });
    expect(result.hasLoadError).toBe(true);
    expect(result.quotaExhausted).toBe(false);
    expect(result.showPaywall).toBe(false);
  });
});
