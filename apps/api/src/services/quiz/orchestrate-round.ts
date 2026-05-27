import { eq } from 'drizzle-orm';
import {
  SubjectNotFoundError,
  type CefrLevel,
  type ConversationLanguage,
  type GenerateRoundInput,
  type QuizActivityType,
  type QuizQuestion,
} from '@eduagent/schemas';
import {
  createScopedRepository,
  subjects,
  type Database,
} from '@eduagent/database';
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
  } else if (input.subjectId) {
    // [SECURITY] Non-vocabulary activities (`capitals`, `guess_who`) accept an
    // optional client-supplied subjectId that gets persisted on the quiz round
    // and later attached to `practice_activity_events`. Vocabulary validates
    // ownership inside `getVocabularyRoundContext`; the other branches did
    // not — so an attacker could tag rounds/events under another profile's
    // subject (write-side IDOR). Verify ownership via the scoped repo before
    // the round is created.
    const ownershipRepo = createScopedRepository(db, profileId);
    const subject = await ownershipRepo.subjects.findFirst(
      eq(subjects.id, input.subjectId),
    );
    if (!subject) {
      throw new SubjectNotFoundError();
    }
  }

  if (input.activityType === 'guess_who') {
    const context = await getGuessWhoRoundContext(db, profileId);
    topicTitles = context.topicTitles;
    libraryItems = await getDueMasteryItems(db, profileId, 'guess_who');
  } else if (input.activityType === 'capitals') {
    libraryItems = await getDueMasteryItems(db, profileId, 'capitals');
  }

  // [CR-2026-05-19-H10] Status filter is in SQL — see
  // getRecentCompletedByActivity. We must NOT re-filter or check status here;
  // doing so against a `findRecentByActivity` (any-status) result would let
  // abandoned/prefetched rounds occupy the 3-row window and silently
  // suppress the bump.
  const recentForBump = await getRecentCompletedByActivity(
    db,
    profileId,
    input.activityType,
    3,
  );
  const completedForBump = recentForBump.map((r) => ({
    score: r.score,
    total: r.total,
    completedAt: r.completedAt,
  }));
  const difficultyBump = shouldApplyDifficultyBump(completedForBump);

  const round = await generateQuizRound({
    db,
    profileId,
    subjectId: input.subjectId ?? null,
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
    // i18n Phase 1 — quiz prose follows the learner's UI locale.
    conversationLanguage:
      (profileMeta.conversationLanguage as
        | ConversationLanguage
        | null
        | undefined) ?? undefined,
  });
  return { ...round, activityType: input.activityType };
}
