// ---------------------------------------------------------------------------
// revenuecat-shared — pure product-ID → tier / top-up-credit mapping
//
// [WI-1239 / 779-strip] Converted from routes/revenuecat-webhook.test.ts's
// "product ID mapping" block, which asserted this mapping indirectly through
// a legacy-handler-forcing route mock. These are pure, store-agnostic
// functions (no DB) shared by both the legacy and v2 handlers — testing them
// directly here is more precise than testing them through a webhook route.
// ---------------------------------------------------------------------------

import {
  extractTierFromProductId,
  getTopUpCreditsForProduct,
} from './revenuecat-shared';

describe('extractTierFromProductId', () => {
  it.each([
    ['com.eduagent.plus.monthly', 'plus'],
    ['com.eduagent.plus.yearly', 'plus'],
    ['com.eduagent.family.monthly', 'family'],
    ['com.eduagent.family.yearly', 'family'],
    ['com.eduagent.pro.monthly', 'pro'],
    ['com.eduagent.pro.yearly', 'pro'],
    ['com.eduagent.plus.monthly.android', 'plus'],
    ['com.eduagent.family.yearly.android', 'family'],
    ['com.eduagent.pro.monthly.android', 'pro'],
  ])('maps %s to tier %s', (productId, expectedTier) => {
    expect(extractTierFromProductId(productId)).toBe(expectedTier);
  });

  // [BUG-444] No regex fallback — an unmapped product must return null, not
  // guess a tier from a `com.eduagent.<tier>.*` prefix match.
  it('[BUG-444] returns null for an unmapped product id (no regex fallback)', () => {
    expect(extractTierFromProductId('com.eduagent.trial.monthly')).toBeNull();
  });

  it('returns null when productId is undefined', () => {
    expect(extractTierFromProductId(undefined)).toBeNull();
  });
});

describe('getTopUpCreditsForProduct', () => {
  it('returns the credit amount for a known consumable product', () => {
    expect(getTopUpCreditsForProduct('com.eduagent.topup.500')).toBe(500);
    expect(getTopUpCreditsForProduct('com.eduagent.topup.500.android')).toBe(
      500,
    );
  });

  it('returns null for a non-top-up product id', () => {
    expect(getTopUpCreditsForProduct('com.eduagent.plus.monthly')).toBeNull();
  });

  it('returns null when productId is undefined', () => {
    expect(getTopUpCreditsForProduct(undefined)).toBeNull();
  });
});
