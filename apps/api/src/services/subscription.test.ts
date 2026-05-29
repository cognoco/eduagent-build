import {
  getTierConfig,
  isValidTransition,
  resolveEffectiveAccessTier,
} from './subscription';

// ---------------------------------------------------------------------------
// getTierConfig
// ---------------------------------------------------------------------------

describe('getTierConfig', () => {
  it('returns correct config for free tier', () => {
    const config = getTierConfig('free');

    expect(config.monthlyQuota).toBe(100);
    expect(config.dailyLimit).toBe(10);
    expect(config.maxProfiles).toBe(2);
    expect(config).toMatchObject({
      quotaModel: 'per-profile',
      ownerMonthlyQuota: 100,
      ownerDailyQuota: 10,
      childMonthlyQuota: 100,
      childDailyQuota: 10,
    });
    expect(config.llmTier).toBe('flash');
    expect(config.priceMonthly).toBe(0);
    expect(config.priceYearly).toBe(0);
    expect(config.topUpPrice).toBe(0);
    expect(config.topUpAmount).toBe(0);
  });

  it('returns correct config for plus tier', () => {
    const config = getTierConfig('plus');

    expect(config.monthlyQuota).toBe(700);
    expect(config.dailyLimit).toBeNull();
    expect(config.maxProfiles).toBe(2);
    expect(config).toMatchObject({
      quotaModel: 'per-profile',
      ownerMonthlyQuota: 700,
      ownerDailyQuota: null,
      childMonthlyQuota: 100,
      childDailyQuota: 10,
    });
    expect(config.llmTier).toBe('standard');
    expect(config.priceMonthly).toBe(18.99);
    expect(config.priceYearly).toBe(168);
    expect(config.topUpPrice).toBe(10);
    expect(config.topUpAmount).toBe(500);
  });

  it('returns correct config for family tier', () => {
    const config = getTierConfig('family');

    expect(config.monthlyQuota).toBe(1500);
    expect(config.maxProfiles).toBe(4);
    expect(config).toMatchObject({
      quotaModel: 'shared-pool',
      ownerMonthlyQuota: null,
      ownerDailyQuota: null,
      childMonthlyQuota: null,
      childDailyQuota: null,
    });
    expect(config.llmTier).toBe('standard');
    expect(config.priceMonthly).toBe(28.99);
    expect(config.priceYearly).toBe(252);
    expect(config.topUpPrice).toBe(5);
    expect(config.topUpAmount).toBe(500);
  });

  it('returns correct config for pro tier', () => {
    const config = getTierConfig('pro');

    expect(config.monthlyQuota).toBe(3000);
    expect(config.maxProfiles).toBe(6);
    expect(config).toMatchObject({
      quotaModel: 'shared-pool',
      ownerMonthlyQuota: null,
      ownerDailyQuota: null,
      childMonthlyQuota: null,
      childDailyQuota: null,
    });
    expect(config.llmTier).toBe('standard');
    expect(config.priceMonthly).toBe(48.99);
    expect(config.priceYearly).toBe(432);
    expect(config.topUpPrice).toBe(5);
    expect(config.topUpAmount).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveAccessTier
// ---------------------------------------------------------------------------

describe('resolveEffectiveAccessTier', () => {
  const baseSubscription = {
    tier: 'plus' as const,
    status: 'active' as const,
    trialEndsAt: null,
    currentPeriodEnd: null,
  };
  const now = new Date('2026-05-26T12:00:00.000Z');

  it('keeps active paid subscriptions on their paid tier', () => {
    expect(resolveEffectiveAccessTier(baseSubscription, now)).toEqual({
      effectiveAccessTier: 'plus',
      billingAccess: 'current',
    });
  });

  it('keeps free tier on free/current regardless of status', () => {
    expect(
      resolveEffectiveAccessTier(
        { ...baseSubscription, tier: 'free', status: 'expired' },
        now,
      ),
    ).toEqual({
      effectiveAccessTier: 'free',
      billingAccess: 'current',
    });
  });

  it('keeps paid trial subscriptions on their paid tier', () => {
    expect(
      resolveEffectiveAccessTier({ ...baseSubscription, status: 'trial' }, now),
    ).toEqual({
      effectiveAccessTier: 'plus',
      billingAccess: 'current',
    });
  });

  it('falls past-due paid subscriptions back to effective Free when no grace remains', () => {
    expect(
      resolveEffectiveAccessTier(
        { ...baseSubscription, status: 'past_due' },
        now,
      ),
    ).toEqual({
      effectiveAccessTier: 'free',
      billingAccess: 'free_fallback',
    });
  });

  // [BUG-792] App-store grace period. When Apple/Google grant a billing grace
  // window, the RevenueCat BILLING_ISSUE handler marks the sub past_due AND
  // writes the grace expiry into currentPeriodEnd. A FUTURE grace expiry must
  // preserve paid access — downgrading mid-grace strands a paying customer.
  it('[BUG-792] keeps past_due paid subscriptions entitled during a FUTURE app-store grace window', () => {
    expect(
      resolveEffectiveAccessTier(
        {
          ...baseSubscription,
          status: 'past_due',
          currentPeriodEnd: '2026-05-27T00:00:00.000Z', // after `now`
        },
        now,
      ),
    ).toEqual({
      effectiveAccessTier: 'plus',
      billingAccess: 'current',
    });
  });

  // [BUG-792] An ALREADY-EXPIRED grace window provides no protection — the
  // platform has stopped extending access, so fall back to Free.
  it('[BUG-792] falls past_due back to Free once the app-store grace window has expired', () => {
    expect(
      resolveEffectiveAccessTier(
        {
          ...baseSubscription,
          status: 'past_due',
          currentPeriodEnd: '2026-05-25T00:00:00.000Z', // before `now`
        },
        now,
      ),
    ).toEqual({
      effectiveAccessTier: 'free',
      billingAccess: 'free_fallback',
    });
  });

  it('keeps cancelled subscriptions entitled until currentPeriodEnd passes', () => {
    expect(
      resolveEffectiveAccessTier(
        {
          ...baseSubscription,
          status: 'cancelled',
          currentPeriodEnd: '2026-05-27T00:00:00.000Z',
        },
        now,
      ),
    ).toEqual({
      effectiveAccessTier: 'plus',
      billingAccess: 'current',
    });
  });

  it('falls cancelled subscriptions back to Free after the access window', () => {
    expect(
      resolveEffectiveAccessTier(
        {
          ...baseSubscription,
          status: 'cancelled',
          currentPeriodEnd: '2026-05-25T00:00:00.000Z',
        },
        now,
      ),
    ).toEqual({
      effectiveAccessTier: 'free',
      billingAccess: 'free_fallback',
    });
  });
});

// ---------------------------------------------------------------------------
// isValidTransition
// ---------------------------------------------------------------------------

describe('isValidTransition', () => {
  it('allows trial -> active', () => {
    expect(isValidTransition('trial', 'active')).toBe(true);
  });

  it('allows trial -> expired', () => {
    expect(isValidTransition('trial', 'expired')).toBe(true);
  });

  // [BUG-442] BREAK TEST: handleBillingIssue and handlePaymentFailed both set
  // status='past_due'. If trial->past_due is missing from VALID_TRANSITIONS,
  // isValidTransition('trial','past_due') returns false, the update function
  // throws (post BUG-447 fix), and the user remains in 'trial' despite a failed
  // payment — the billing issue is silently lost. The transition must be valid.
  it('[BUG-442] allows trial -> past_due (payment failed before trial converts)', () => {
    expect(isValidTransition('trial', 'past_due')).toBe(true);
  });

  it('allows active -> past_due', () => {
    expect(isValidTransition('active', 'past_due')).toBe(true);
  });

  it('allows active -> cancelled', () => {
    expect(isValidTransition('active', 'cancelled')).toBe(true);
  });

  it('allows past_due -> active (payment recovered)', () => {
    expect(isValidTransition('past_due', 'active')).toBe(true);
  });

  it('allows past_due -> cancelled', () => {
    expect(isValidTransition('past_due', 'cancelled')).toBe(true);
  });

  it('allows cancelled -> expired', () => {
    expect(isValidTransition('cancelled', 'expired')).toBe(true);
  });

  // [BUG-443] BREAK TEST: Stripe portal uncancel (cancel_at_period_end=false)
  // reverses a cancellation, emitting customer.subscription.updated with
  // status='active'. payment_succeeded on a cancelled sub also re-activates.
  // Pre-fix, 'cancelled->active' was missing from VALID_TRANSITIONS so
  // updateSubscriptionFromWebhook would throw, leaving the user paying but
  // stuck in cancelled with lastStripeEventTimestamp NOT updated — the next
  // event re-processes indefinitely. Post-fix the transition is valid.
  it('[BUG-443] allows cancelled -> active (Stripe portal uncancel / payment_succeeded)', () => {
    expect(isValidTransition('cancelled', 'active')).toBe(true);
  });

  // [#4 MEDIUM — expired->active reactivation] A RevenueCat RENEWAL /
  // PRODUCT_CHANGE for an already-expired account is a real, successful
  // re-charge that must revive the subscription. Pre-fix, expired was treated
  // as terminal so applySubscriptionUpdateFromRevenuecat threw, the webhook
  // 500'd, RevenueCat retried for ~3 days, and the customer stayed downgraded
  // despite paying. Post-fix expired->active / expired->past_due are valid.
  it('[#4] allows expired -> active (RevenueCat RENEWAL reactivation after re-charge)', () => {
    expect(isValidTransition('expired', 'active')).toBe(true);
  });

  it('[#4] allows expired -> past_due (reactivation landing in grace period)', () => {
    expect(isValidTransition('expired', 'past_due')).toBe(true);
  });

  it('still rejects expired -> trial / cancelled (not legitimate reactivations)', () => {
    expect(isValidTransition('expired', 'trial')).toBe(false);
    expect(isValidTransition('expired', 'cancelled')).toBe(false);
  });

  it('rejects trial -> cancelled (must go through active first)', () => {
    expect(isValidTransition('trial', 'cancelled')).toBe(false);
  });
});
