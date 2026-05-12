import type {
  CefrLevel,
  GenerateRoundInput,
  QuizActivityType,
  QuizQuestion,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { ProfileMeta } from '../../middleware/profile-scope';
import { VocabularyContextError } from '../../errors';
import { shouldApplyDifficultyBump } from './difficulty-bump';
import { generateQuizRound } from './generate-round';
import {
  getDueMasteryItems,
  getGuessWhoRoundContext,
  getRecentAnswers,
  getRecentCompletedByActivity,
  getVocabularyRoundContext,
} from './queries';

export async function buildAndGenerateRound(
  db: Database,
  profileId: string,
  profileMeta: ProfileMeta,
  input: GenerateRoundInput,
): Promise<{
  id: string;
  activityType: QuizActivityType;
  theme: string;
  questions: QuizQuestion[];
  total: number;
  difficultyBump: boolean;
}> {
  const recentAnswers = await getRecentAnswers(
    db,
    profileId,
    input.activityType,
  );
  let languageCode: string | undefined;
  let cefrCeiling: CefrLevel | undefined;
  let allVocabulary: Array<{ term: string; translation: string }> | undefined;
  let libraryItems: Array<{
    id: string;
    question: string;
    answer: string;
    topicId?: string;
    vocabularyId?: string;
    cefrLevel?: string | null;
  }> = [];
  let topicTitles: string[] | undefined;

  if (input.activityType === 'vocabulary') {
    if (!input.subjectId) {
      throw new VocabularyContextError(
        'subjectId is required for vocabulary rounds',
      );
    }

    const context = await getVocabularyRoundContext(
      db,
      profileId,
      input.subjectId,
    );
    languageCode = context.languageCode;
    cefrCeiling = context.cefrCeiling;
    allVocabulary = context.allVocabulary;
    libraryItems = context.libraryItems;
  } else if (input.activityType === 'guess_who') {
    const context = await getGuessWhoRoundContext(db, profileId);
    topicTitles = context.topicTitles;
    libraryItems = await getDueMasteryItems(db, profileId, 'guess_who');
  } else if (input.activityType === 'capitals') {
    libraryItems = await getDueMasteryItems(db, profileId, 'capitals');
  }

  const recentForBump = await getRecentCompletedByActivity(
    db,
    profileId,
    input.activityType,
    3,
  );
  const completedForBump = recentForBump
    .filter((r) => r.status === 'completed')
    .map((r) => ({
      score: r.score,
      total: r.total,
      completedAt: r.completedAt,
    }));
  const difficultyBump = shouldApplyDifficultyBump(completedForBump);

  const round = await generateQuizRound({
    db,
    profileId,
    activityType: input.activityType,
    birthYear: profileMeta.birthYear,
    themePreference: input.themePreference,
    libraryItems,
    recentAnswers,
    languageCode,
    cefrCeiling,
    allVocabulary,
    topicTitles,
    difficultyBump,
  });
  return { ...round, activityType: input.activityType };
}
