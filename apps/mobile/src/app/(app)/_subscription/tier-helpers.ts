import type { SubscriptionTier } from '../../../hooks/use-subscription';
import type { Translate, TranslateKey } from '../../../i18n';
import {
  TIER_FEATURE_INDICES,
  FAMILY_TIER_ENTRY,
  PRO_TIER_ENTRY,
  TIER_LABEL_KEYS,
  TIER_LIMIT_KEYS,
} from './constants';

export function getTiersToCompare(
  currentTier: SubscriptionTier,
): Array<{ tier: SubscriptionTier; count: number }> {
  if (currentTier === 'family') {
    return [...TIER_FEATURE_INDICES, FAMILY_TIER_ENTRY];
  }
  if (currentTier === 'pro') {
    return [...TIER_FEATURE_INDICES, PRO_TIER_ENTRY];
  }
  return TIER_FEATURE_INDICES;
}

export function getTierLabel(tier: SubscriptionTier, t: Translate): string {
  return t(TIER_LABEL_KEYS[tier]);
}

export function getTierLimit(tier: SubscriptionTier, t: Translate): string {
  return t(TIER_LIMIT_KEYS[tier]);
}

export function getTierFeatureLabel(
  tier: SubscriptionTier,
  index: number,
  t: Translate,
): string {
  // tier + index are both runtime-selected; the resulting
  // {prefix:'subscriptionScreen.tierFeatures.'} marker keeps the whole subtree.
  return t(`subscriptionScreen.tierFeatures.${tier}.${index}` as TranslateKey); // i18n-allow-multi-var: runtime tier+index
}

export function childCountBucket(count: number): '0' | '1' | '2-3' | '4+' {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 3) return '2-3';
  return '4+';
}
