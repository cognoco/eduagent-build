import type { Href, Router } from 'expo-router';

import type { RewardBurstVariant } from '../../../components/common/RewardBurst';

export const QUIZ_INDEX_HREF = '/(app)/quiz' as const;

type QuizIndexRouter = Pick<Router, 'replace'> &
  Partial<Pick<Router, 'dismissTo'>>;

export function dismissToQuizIndex(router: QuizIndexRouter): void {
  if (router.dismissTo) {
    router.dismissTo(QUIZ_INDEX_HREF as Href);
    return;
  }

  router.replace(QUIZ_INDEX_HREF as Href);
}

export function rewardVariantForActivity(
  activityType: 'capitals' | 'guess_who' | 'vocabulary' | null,
): RewardBurstVariant {
  if (activityType === 'guess_who') return 'guess_who';
  if (activityType === 'vocabulary') return 'vocabulary';
  return 'capitals';
}
