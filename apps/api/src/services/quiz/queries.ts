import { and, eq, inArray, lt } from 'drizzle-orm';
import {
  createScopedRepository,
  quizRounds,
  subjects,
  vocabulary,
  vocabularyRetentionCards,
  type Database,
} from '@eduagent/database';
import { languageCodeSchema, type QuizActivityType } from '@eduagent/schemas';
import { NotFoundError, VocabularyContextError } from '../../errors';
import { QUIZ_CONFIG } from './config';
import type { LibraryItem } from './content-resolver';
import {
  getCefrCeilingForDiscovery,
  type VocabularyPromptParams,
} from './vocabulary-provider';
import { createLogger } from '../logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Quiz read queries
//
// Routes call these helpers instead of touching the ORM directly. All reads
// go through `createScopedRepository` so the `profile_id = $1` predicate is
// applied at the repository layer — services add the extra id predicate,
// but never redefine the profile scope.
// ---------------------------------------------------------------------------

interface StoredQuestion {
  correctAnswer?: string;
}

export interface VocabularyRoundContext {
  languageCode: string;
  cefrCeiling: VocabularyPromptParams['cefrCeiling'];
  allVocabulary: Array<{
    term: string;
    translation: string;
  }>;
  libraryItems: LibraryItem[];
}

/**
 * Pull the answers for the profile's recent rounds of this activity, so the
 * LLM can avoid repeating them. Sized so we always cover the configured
 * "recently seen" buffer even if the round size changes later.
 */
export async function getRecentAnswers(
  db: Database,
  profileId: string,
  activityType: QuizActivityType
): Promise<string[]> {
  const repo = createScopedRepository(db, profileId);
  const perActivity =
    QUIZ_CONFIG.perActivity[
      activityType as keyof typeof QUIZ_CONFIG.perActivity
    ];
  const roundSize = perActivity?.roundSize ?? QUIZ_CONFIG.defaults.roundSize;
  const bufferSize = QUIZ_CONFIG.defaults.recentlySeenBufferSize;
  // One extra round to avoid off-by-one at the round boundary.
  const limit = Math.ceil(bufferSize / Math.max(roundSize, 1)) + 1;

  const recentRounds = await repo.quizRounds.findRecentByActivity(
    activityType,
    limit
  );

  return recentRounds
    .flatMap((round) => {
      const questions = (round.questions as StoredQuestion[]) ?? [];
      return questions
        .map((question) => question.correctAnswer)
        .filter((answer): answer is string => Boolean(answer));
    })
    .slice(0, bufferSize);
}

/**
 * Fetch a round owned by the caller by id. Returns undefined when the round
 * doesn't exist OR belongs to a different profile — these cases are
 * intentionally indistinguishable (IDOR hardening).
 */
export async function getRoundById(
  db: Database,
  profileId: string,
  roundId: string
) {
  const repo = createScopedRepository(db, profileId);
  return repo.quizRounds.findById(roundId);
}

/**
 * Same as getRoundById but throws NotFoundError if the round is not owned by
 * the caller. Returning 404 (not 403) is intentional — we don't reveal
 * whether the id exists for another profile.
 */
export async function getRoundByIdOrThrow(
  db: Database,
  profileId: string,
  roundId: string
) {
  const round = await getRoundById(db, profileId, roundId);
  if (!round) throw new NotFoundError('Round');
  return round;
}

/** Recent completed rounds for the profile (for the quiz home list). */
export async function listRecentCompletedRounds(
  db: Database,
  profileId: string,
  limit = 10
) {
  const repo = createScopedRepository(db, profileId);
  return repo.quizRounds.findCompletedRecent(limit);
}

/**
 * [Q-10] Aggregate stats per activity via a SQL GROUP BY so the response is
 * constant-time in the number of rounds. Rows are shaped exactly like the
 * client-facing `quizStatsSchema`; the previous in-memory aggregation (which
 * had an unreachable `bestTotal ?? 1` divide-by-null fallback) is gone.
 */
export async function computeRoundStats(db: Database, profileId: string) {
  const repo = createScopedRepository(db, profileId);
  return repo.quizRounds.aggregateCompletedStats();
}

export async function getVocabularyRoundContext(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<VocabularyRoundContext> {
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));

  if (!subject) {
    throw new NotFoundError('Subject');
  }
  if (subject.status !== 'active') {
    throw new VocabularyContextError('Subject is not active');
  }
  if (!subject.languageCode) {
    throw new VocabularyContextError('Subject is not a language subject');
  }

  const parsedLanguageCode = languageCodeSchema.safeParse(subject.languageCode);
  if (!parsedLanguageCode.success) {
    throw new VocabularyContextError('Subject has invalid languageCode');
  }

  const allVocabularyRows = await repo.vocabulary.findMany(
    eq(vocabulary.subjectId, subjectId)
  );
  const vocabularyIds = allVocabularyRows.map((row) => row.id);
  // [IMP-4] Safe cross-table inArray: vocabularyIds were fetched from
  // repo.vocabulary.findMany which is profile-scoped, so these IDs already
  // belong to the current profile. The inArray cannot leak cards from
  // other profiles because the scoped repo adds AND profile_id = $profileId.
  const cardRows =
    vocabularyIds.length === 0
      ? []
      : await repo.vocabularyRetentionCards.findMany(
          inArray(vocabularyRetentionCards.vocabularyId, vocabularyIds)
        );
  const cardByVocabularyId = new Map(
    cardRows.map((card) => [card.vocabularyId, card] as const)
  );
  const now = new Date();
  const allVocabulary = allVocabularyRows.map((row) => ({
    term: row.term,
    translation: row.translation,
  }));
  const distinctTranslationCount = new Set(
    allVocabulary.map((entry) => entry.translation.trim().toLowerCase())
  ).size;
  const libraryItems =
    distinctTranslationCount < 4
      ? []
      : allVocabularyRows
          .filter((row) => {
            const card = cardByVocabularyId.get(row.id);
            return card?.nextReviewAt != null && card.nextReviewAt <= now;
          })
          .map(
            (row) =>
              ({
                id: row.id,
                question: row.term,
                answer: row.translation,
                vocabularyId: row.id,
                cefrLevel: row.cefrLevel,
              } satisfies LibraryItem)
          );

  if (distinctTranslationCount < 4 && allVocabularyRows.length > 0) {
    logger.warn('quiz.vocabulary.mastery_pool_too_small', {
      profileId,
      subjectId,
      poolSize: distinctTranslationCount,
    });
  }

  return {
    languageCode: parsedLanguageCode.data,
    cefrCeiling: getCefrCeilingForDiscovery(
      allVocabularyRows.map((row) => ({
        cefrLevel: row.cefrLevel,
        repetitions: cardByVocabularyId.get(row.id)?.repetitions ?? null,
      }))
    ),
    allVocabulary,
    libraryItems,
  };
}

// ---------------------------------------------------------------------------
// Cross-profile batch operations (cron/cleanup)
// ---------------------------------------------------------------------------

/**
 * [CRIT-2] Mark stale active quiz rounds as abandoned. Prefetched rounds that
 * the user never completed stay `active` forever and consume one quota unit
 * each. This batch operation cleans them up so the quiz_rounds table doesn't
 * become a graveyard of orphaned prefetch artifacts.
 *
 * Intentional cross-profile query: the stale-cleanup cron scans all active
 * rounds globally, so scoped-repo access does not apply here.
 */
export async function abandonStaleQuizRounds(
  db: Database,
  cutoff: Date
): Promise<number> {
  const result = await db
    .update(quizRounds)
    .set({ status: 'abandoned' })
    .where(
      and(eq(quizRounds.status, 'active'), lt(quizRounds.createdAt, cutoff))
    )
    .returning({ id: quizRounds.id });
  return result.length;
}
