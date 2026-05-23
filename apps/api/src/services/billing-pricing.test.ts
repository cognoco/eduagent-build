// ---------------------------------------------------------------------------
// billing-pricing — price↔tier mapping + tier verification [WI-85 / WI-175]
// ---------------------------------------------------------------------------

import {
  resolvePriceId,
  resolveTierFromPriceId,
  isStripePricingConfigured,
  verifySubscriptionTier,
} from './billing-pricing';

const PRICE_PLUS_M = 'price_plus_monthly';
const PRICE_PRO_Y = 'price_pro_yearly';

const ENV = {
  STRIPE_PRICE_PLUS_MONTHLY: PRICE_PLUS_M,
  STRIPE_PRICE_PRO_YEARLY: PRICE_PRO_Y,
};

describe('resolvePriceId / resolveTierFromPriceId', () => {
  it('maps tier+interval → price and back', () => {
    expect(resolvePriceId(ENV, 'plus', 'monthly')).toBe(PRICE_PLUS_M);
    expect(resolveTierFromPriceId(ENV, PRICE_PLUS_M)).toBe('plus');
    expect(resolveTierFromPriceId(ENV, PRICE_PRO_Y)).toBe('pro');
  });

  it('returns null for unknown / empty price ids', () => {
    expect(resolveTierFromPriceId(ENV, 'price_unknown')).toBeNull();
    expect(resolveTierFromPriceId(ENV, undefined)).toBeNull();
    expect(resolveTierFromPriceId(ENV, '')).toBeNull();
  });
});

describe('isStripePricingConfigured', () => {
  it('is true when any STRIPE_PRICE_* is set, false otherwise', () => {
    expect(isStripePricingConfigured(ENV)).toBe(true);
    expect(isStripePricingConfigured({})).toBe(false);
  });
});

describe('verifySubscriptionTier', () => {
  it('uses the price-authoritative tier and flags a metadata mismatch', () => {
    const v = verifySubscriptionTier(ENV, 'pro', [PRICE_PLUS_M]);
    expect(v.effectiveTier).toBe('plus');
    expect(v.status).toBe('mismatch');
    expect(v.priceTier).toBe('plus');
    expect(v.priceId).toBe(PRICE_PLUS_M);
  });

  it('is ok when the metadata tier matches the purchased price', () => {
    const v = verifySubscriptionTier(ENV, 'plus', [PRICE_PLUS_M]);
    expect(v.effectiveTier).toBe('plus');
    expect(v.status).toBe('ok');
  });

  it('scans past an unmapped (add-on) line item to the plan price', () => {
    const v = verifySubscriptionTier(ENV, 'plus', [
      'price_addon',
      PRICE_PLUS_M,
    ]);
    expect(v.effectiveTier).toBe('plus');
    expect(v.status).toBe('ok');
    expect(v.priceId).toBe(PRICE_PLUS_M); // diagnostic = matched price, not [0]
  });

  it('is unverifiable when pricing is configured but no item maps', () => {
    const v = verifySubscriptionTier(ENV, 'pro', ['price_unmapped']);
    expect(v.effectiveTier).toBe('pro'); // keeps metadata tier
    expect(v.status).toBe('unverifiable');
    expect(v.priceId).toBe('price_unmapped');
  });

  it('is unconfigured (dormant) when no pricing env is set', () => {
    const v = verifySubscriptionTier({}, 'pro', ['price_anything']);
    expect(v.effectiveTier).toBe('pro');
    expect(v.status).toBe('unconfigured');
  });

  it('is ok with no tier signal at all (empty items, no metadata)', () => {
    const v = verifySubscriptionTier(ENV, null, []);
    expect(v.effectiveTier).toBeNull();
    expect(v.status).toBe('ok');
    expect(v.priceId).toBeUndefined();
  });
});
