import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import {
  createScopedRepository,
  curricula,
  curriculumTopics,
  quizMissedItems,
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
  activityType: QuizActivityType,
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
    limit,
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
  roundId: string,
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
  roundId: string,
) {
  const round = await getRoundById(db, profileId, roundId);
  if (!round) throw new NotFoundError('Round');
  return round;
}

/** Recent completed rounds for the profile (for the quiz home list). */
export async function listRecentCompletedRounds(
  db: Database,
  profileId: string,
  limit = 10,
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
  const baseStats = await repo.quizRounds.aggregateCompletedStats();

  // Compute bestConsecutive per (activityType, languageCode) by scanning
  // results arrays. [BUG-926] Key on the composite to keep per-language
  // vocabulary streaks separate from each other.
  // [CCR-PR120-M1] Cap at 1000 most-recent rounds to bound memory usage.
  const allCompleted = await repo.quizRounds.findCompletedForStreaks(1000);

  // Composite key: "activityType|languageCode" (languageCode may be null).
  const consecutiveByKey = new Map<string, number>();
  for (const round of allCompleted) {
    const results = (round.results ?? []) as Array<{ correct: boolean }>;
    let maxStreak = 0;
    let current = 0;
    for (const r of results) {
      current = r.correct ? current + 1 : 0;
      if (current > maxStreak) maxStreak = current;
    }
    const key = `${round.activityType}|${round.languageCode ?? ''}`;
    const prev = consecutiveByKey.get(key) ?? 0;
    if (maxStreak > prev) consecutiveByKey.set(key, maxStreak);
  }

  return baseStats.map((stat) => ({
    ...stat,
    bestConsecutive:
      consecutiveByKey.get(`${stat.activityType}|${stat.languageCode ?? ''}`) ??
      null,
  }));
}

export async function getVocabularyRoundContext(
  db: Database,
  profileId: string,
  subjectId: string,
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
    eq(vocabulary.subjectId, subjectId),
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
          inArray(vocabularyRetentionCards.vocabularyId, vocabularyIds),
        );
  const cardByVocabularyId = new Map(
    cardRows.map((card) => [card.vocabularyId, card] as const),
  );
  const now = new Date();
  const allVocabulary = allVocabularyRows.map((row) => ({
    term: row.term,
    translation: row.translation,
  }));
  const distinctTranslationCount = new Set(
    allVocabulary.map((entry) => entry.translation.trim().toLowerCase()),
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
              }) satisfies LibraryItem,
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
      })),
    ),
    allVocabulary,
    libraryItems,
  };
}

export interface GuessWhoRoundContext {
  topicTitles: string[];
}

/**
 * Fetch the learner's studied topic titles for Guess Who person selection.
 * Returns up to 30 recent non-skipped topics across all subjects.
 */
export async function getGuessWhoRoundContext(
  db: Database,
  profileId: string,
): Promise<GuessWhoRoundContext> {
  const topics = await db
    .select({ title: curriculumTopics.title })
    .from(curriculumTopics)
    .innerJoin(curricula, eq(curriculumTopics.curriculumId, curricula.id))
    .innerJoin(subjects, eq(curricula.subjectId, subjects.id))
    .where(
      and(
        eq(subjects.profileId, profileId),
        eq(curriculumTopics.skipped, false),
      ),
    )
    .orderBy(desc(curriculumTopics.createdAt))
    .limit(30);

  return { topicTitles: topics.map((t) => t.title) };
}

/**
 * Fetch the most recent rounds for a given activity type, used for the
 * difficulty bump check. Returns all statuses (caller filters to 'completed').
 */
export async function getRecentCompletedByActivity(
  db: Database,
  profileId: string,
  activityType: QuizActivityType,
  limit: number,
) {
  const repo = createScopedRepository(db, profileId);
  return repo.quizRounds.findRecentByActivity(activityType, limit);
}

/**
 * Mark all unsurfaced missed items for the given profile + activity type as
 * surfaced. Called when the learner taps or dismisses the quiz discovery card
 * so the card doesn't re-appear for already-addressed items.
 *
 * Returns the number of rows updated.
 */
export async function markMissedItemsSurfaced(
  db: Database,
  profileId: string,
  activityType: QuizActivityType,
): Promise<number> {
  const repo = createScopedRepository(db, profileId);
  return repo.quizMissedItems.markSurfaced(activityType);
}

/**
 * Fetch recent unsurfaced missed items for a profile + activity type so the
 * round-generation prompt can re-surface them. Best-effort: returns an empty
 * array on any DB error so the quiz call still succeeds. [P1 — quiz_missed_items wiring]
 */
export async function getRecentMissedItems(
  db: Database,
  profileId: string,
  activityType: QuizActivityType,
  limit = 8,
): Promise<Array<{ questionText: string; correctAnswer: string }>> {
  try {
    const repo = createScopedRepository(db, profileId);
    const rows = await repo.quizMissedItems.findMany(
      and(
        eq(quizMissedItems.activityType, activityType),
        eq(quizMissedItems.surfaced, false),
        eq(quizMissedItems.convertedToTopic, false),
      ),
    );
    return rows.slice(0, limit).map((r) => ({
      questionText: r.questionText,
      correctAnswer: r.correctAnswer,
    }));
  } catch (error) {
    logger.warn('quiz.missed_items.fetch_failed', {
      activityType,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Fetch due mastery items for capitals or guess_who. Returns items whose
 * nextReviewAt <= now, ordered oldest-first, limited to 20 per call.
 */
export async function getDueMasteryItems(
  db: Database,
  profileId: string,
  activityType: 'capitals' | 'guess_who',
): Promise<LibraryItem[]> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.quizMasteryItems.findDueByActivity(activityType, 20);

  return rows.map((row) => ({
    id: row.itemKey,
    question: row.itemKey,
    answer: row.itemAnswer,
    mcSuccessCount: row.mcSuccessCount,
  }));
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
  cutoff: Date,
): Promise<number> {
  const result = await db
    .update(quizRounds)
    .set({ status: 'abandoned' })
    .where(
      and(eq(quizRounds.status, 'active'), lt(quizRounds.createdAt, cutoff)),
    )
    .returning({ id: quizRounds.id });
  return result.length;
}
