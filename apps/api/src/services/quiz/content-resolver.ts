import type { QuizActivityType } from '@eduagent/schemas';
import { QUIZ_CONFIG } from './config';
import { shuffle } from './shuffle';

export interface LibraryItem {
  id: string;
  question: string;
  answer: string;
  topicId?: string;
  vocabularyId?: string;
  cefrLevel?: string | null;
}

export interface ResolveParams {
  activityType: QuizActivityType;
  profileId: string;
  recentAnswers: string[];
  libraryItems: LibraryItem[];
}

export interface RoundContentPlan {
  discoveryCount: number;
  masteryItems: LibraryItem[];
  totalQuestions: number;
  recentAnswers: string[];
}

export function resolveRoundContent(params: ResolveParams): RoundContentPlan {
  const { activityType, recentAnswers, libraryItems } = params;
  const { defaults, perActivity } = QUIZ_CONFIG;
  const activityConfig = (perActivity[
    activityType as keyof typeof QUIZ_CONFIG.perActivity
  ] ?? {}) as Partial<typeof defaults> & { roundSize?: number };

  const roundSize = activityConfig?.roundSize ?? defaults.roundSize;
  const libraryRatio = activityConfig?.libraryRatio ?? defaults.libraryRatio;
  const libraryRatioMinItems =
    activityConfig?.libraryRatioMinItems ?? defaults.libraryRatioMinItems;
  const libraryRatioScaleUpThreshold =
    activityConfig?.libraryRatioScaleUpThreshold ??
    defaults.libraryRatioScaleUpThreshold;
  const libraryRatioScaleUpValue =
    activityConfig?.libraryRatioScaleUpValue ??
    defaults.libraryRatioScaleUpValue;
  const recentSet = new Set(
    recentAnswers.map((answer) => answer.toLowerCase())
  );
  const eligibleLibrary = libraryItems.filter(
    (item) => !recentSet.has(item.answer.toLowerCase())
  );

  let masteryCount = 0;

  if (eligibleLibrary.length >= libraryRatioMinItems) {
    const ratio =
      eligibleLibrary.length > libraryRatioScaleUpThreshold
        ? libraryRatioScaleUpValue
        : libraryRatio;
    masteryCount = Math.min(
      Math.floor(ratio * roundSize),
      eligibleLibrary.length
    );
  }

  const masteryItems = shuffle(eligibleLibrary).slice(0, masteryCount);

  return {
    discoveryCount: roundSize - masteryItems.length,
    masteryItems,
    totalQuestions: roundSize,
    recentAnswers,
  };
}
