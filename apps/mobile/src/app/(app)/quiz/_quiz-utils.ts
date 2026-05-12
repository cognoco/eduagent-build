import type { RewardBurstVariant } from '../../../components/common/RewardBurst';

export function rewardVariantForActivity(
  activityType: 'capitals' | 'guess_who' | 'vocabulary' | null,
): RewardBurstVariant {
  if (activityType === 'guess_who') return 'guess_who';
  if (activityType === 'vocabulary') return 'vocabulary';
  return 'capitals';
}
