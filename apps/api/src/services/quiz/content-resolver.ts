import type { QuizActivityType } from '@eduagent/schemas';
import { QUIZ_CONFIG } from './config';
import { shuffle } from './shuffle';

export interface LibraryItem {
  id: string;
  question: string;
  answer: string;
  topicId?: string;
  vocabularyId?: string;
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

  const roundSize = perActivity[activityType].roundSize ?? defaults.roundSize;
  const recentSet = new Set(
    recentAnswers.map((answer) => answer.toLowerCase())
  );
  const eligibleLibrary = libraryItems.filter(
    (item) => !recentSet.has(item.answer.toLowerCase())
  );

  let masteryCount = 0;

  if (eligibleLibrary.length >= defaults.libraryRatioMinItems) {
    const ratio =
      eligibleLibrary.length > defaults.libraryRatioScaleUpThreshold
        ? defaults.libraryRatioScaleUpValue
        : defaults.libraryRatio;
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
