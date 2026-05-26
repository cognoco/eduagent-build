import { PACKAGE_TYPE } from 'react-native-purchases';
import type { SubscriptionTier } from '../../../hooks/use-subscription';
import type { TranslateKey } from '../../../i18n';

/**
 * Static tier features for display when RevenueCat offerings are unavailable.
 *
 * BUG-899: Only Free and Plus are surfaced to end-users. Family/Pro tiers
 * exist server-side but their store SKUs are not approved for public listing
 * (see `pricing_dual_cap.md`). Showing them as upgrade options creates
 * marketing/legal exposure and contradicts approved pricing.
 *
 * BUG-917: Family/Pro entries are appended via `FAMILY_TIER_ENTRY` /
 * `PRO_TIER_ENTRY` only when the current tier already matches, so existing
 * Family/Pro customers can still see their entitlements. The append happens
 * in `getTiersToCompare` in `./tier-helpers.ts`. Do not widen this array.
 */
// Feature key indices per tier — resolved via t() in component using subscriptionScreen.tierFeatures.*
export const TIER_FEATURE_INDICES: Array<{
  tier: SubscriptionTier;
  count: number;
}> = [
  { tier: 'free', count: 4 },
  { tier: 'plus', count: 4 },
];

/**
 * [BUG-917] When the user is already on the Family tier, append a Family
 * card to the comparison so they can see their entitlements next to lower
 * tiers. The card is read-only (no purchase action) since Family is sold
 * through a separate channel — this preserves BUG-899 (no upsell to public
 * users) while fixing the visibility gap for Family customers.
 */
export const FAMILY_TIER_ENTRY: { tier: SubscriptionTier; count: number } = {
  tier: 'family',
  count: 4,
};

/**
 * [BUG-917] Same fix for Pro tier: when the user is already on Pro, append a
 * Pro card so they can see their entitlements alongside Free/Plus. Pro is not
 * sold through the public store, so the card is read-only (same reasoning as
 * FAMILY_TIER_ENTRY above).
 */
export const PRO_TIER_ENTRY: { tier: SubscriptionTier; count: number } = {
  tier: 'pro',
  count: 4,
};

export const TIER_LABEL_KEYS: Record<SubscriptionTier, TranslateKey> = {
  free: 'subscriptionScreen.tierLabels.free',
  plus: 'subscriptionScreen.tierLabels.plus',
  family: 'subscriptionScreen.tierLabels.family',
  pro: 'subscriptionScreen.tierLabels.pro',
};

export const TIER_LIMIT_KEYS: Record<SubscriptionTier, TranslateKey> = {
  free: 'subscriptionScreen.tierLimits.free',
  plus: 'subscriptionScreen.tierLimits.plus',
  family: 'subscriptionScreen.tierLimits.family',
  pro: 'subscriptionScreen.tierLimits.pro',
};

/** Map RevenueCat PACKAGE_TYPE to i18n key suffixes for subscriptionScreen.packagePeriod.* */
export const PACKAGE_PERIOD_KEY: Partial<Record<PACKAGE_TYPE, TranslateKey>> = {
  [PACKAGE_TYPE.MONTHLY]: 'subscriptionScreen.packagePeriod.monthly',
  [PACKAGE_TYPE.ANNUAL]: 'subscriptionScreen.packagePeriod.annual',
  [PACKAGE_TYPE.SIX_MONTH]: 'subscriptionScreen.packagePeriod.sixMonth',
  [PACKAGE_TYPE.THREE_MONTH]: 'subscriptionScreen.packagePeriod.threeMonth',
  [PACKAGE_TYPE.TWO_MONTH]: 'subscriptionScreen.packagePeriod.twoMonth',
  [PACKAGE_TYPE.WEEKLY]: 'subscriptionScreen.packagePeriod.weekly',
  [PACKAGE_TYPE.LIFETIME]: 'subscriptionScreen.packagePeriod.lifetime',
};

export const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// BUG-399: Account-scoped key — BYOK waitlist is per-account email, not per-profile.
export const BYOK_JOINED_KEY = 'byok-waitlist-joined';
