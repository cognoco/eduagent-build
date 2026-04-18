import { createScopedRepository, type Database } from '@eduagent/database';
import type {
  CompleteRoundResponse,
  QuestionResult,
  QuizQuestion,
  ValidatedQuestionResult,
} from '@eduagent/schemas';
import { isGuessWhoFuzzyMatch } from '@eduagent/schemas';
import { ConflictError, NotFoundError } from '../../errors';
import { createLogger } from '../logger';
import { reviewVocabulary } from '../vocabulary';
import { QUIZ_CONFIG } from './config';
import { applyQuizSm2 } from './mastery-provider';
import { computeCapitalsItemKey, computeGuessWhoItemKey } from './mastery-keys';

const logger = createLogger();

/**
 * [ASSUMP-F5] Server-side truth for `correct`. The client's `result.correct`
 * is NOT trusted — an attacker could send `correct: true` on every answer to
 * farm perfect scores and XP. We recompute correctness from `answerGiven`
 * against the canonical `correctAnswer` + `acceptedAliases` stored on the
 * round row.
 */
export function isAnswerCorrect(
  question: QuizQuestion,
  answerGiven: string
): boolean {
  const normalized = answerGiven.trim().toLowerCase();
  if (!normalized) return false;
  if (question.correctAnswer.trim().toLowerCase() === normalized) return true;
  if (question.type === 'capitals') {
    return question.acceptedAliases.some(
      (alias) => alias.trim().toLowerCase() === normalized
    );
  }
  if (question.type === 'vocabulary') {
    return question.acceptedAnswers.some(
      (answer) => answer.trim().toLowerCase() === normalized
    );
  }
  if (question.type === 'guess_who') {
    return isGuessWhoFuzzyMatch(
      answerGiven,
      question.canonicalName,
      question.acceptedAliases
    );
  }
  return false;
}

/**
 * Lightweight answer check for a single question within an active round.
 * Used by POST /quiz/rounds/:id/check to provide per-question feedback
 * without exposing the correct answer to the client.
 */
export async function checkQuizAnswer(
  db: Database,
  profileId: string,
  roundId: string,
  questionIndex: number,
  answerGiven: string
): Promise<boolean> {
  const repo = createScopedRepository(db, profileId);
  const round = await repo.quizRounds.findById(roundId);
  if (!round) throw new NotFoundError('Round');
  if (round.status !== 'active')
    throw new ConflictError('Round already completed');
  const questions = round.questions as QuizQuestion[];
  const question = questions[questionIndex];
  if (!question) throw new NotFoundError('Question');
  return isAnswerCorrect(question, answerGiven);
}

/**
 * [ASSUMP-F5] Re-derive correctness for every client-reported result.
 * If the client references a `questionIndex` out of bounds, that entry is
 * dropped (rather than trusted) — it can't match any real question.
 */
export function validateResults(
  questions: QuizQuestion[],
  clientResults: QuestionResult[]
): QuestionResult[] {
  const validated: QuestionResult[] = [];
  for (const result of clientResults) {
    const question = questions[result.questionIndex];
    if (!question) continue;
    validated.push({
      ...result,
      correct: isAnswerCorrect(question, result.answerGiven),
    });
  }
  return validated;
}

export function buildMissedItemText(question: QuizQuestion): string {
  if (question.type === 'capitals') {
    return `What is the capital of ${question.country}?`;
  }
  if (question.type === 'vocabulary') {
    return `Translate: ${question.term}`;
  }
  if (question.type === 'guess_who') {
    const easiestClue = question.clues[question.clues.length - 1];
    return `Who is this person? ${easiestClue}`;
  }
  return '';
}

export function getVocabSm2Quality(correct: boolean): number {
  return correct ? 4 : 2;
}

export function getCapitalsSm2Quality(correct: boolean): number {
  return correct ? 4 : 1;
}

export function calculateScore(results: QuestionResult[]): number {
  return results.filter((result) => result.correct).length;
}

export function calculateXp(
  results: QuestionResult[],
  total: number,
  activityType?: string
): number {
  const correctResults = results.filter((result) => result.correct);
  const baseXp = correctResults.length * QUIZ_CONFIG.xp.perCorrect;
  const timerBonus =
    correctResults.filter(
      (result) => result.timeMs < QUIZ_CONFIG.defaults.timerBonusThresholdMs
    ).length * QUIZ_CONFIG.xp.timerBonus;
  const perfectBonus =
    correctResults.length === total ? QUIZ_CONFIG.xp.perfectBonus : 0;

  let guessWhoClueBonus = 0;
  if (activityType === 'guess_who') {
    guessWhoClueBonus = correctResults
      .filter((r) => r.answerMode === 'free_text' && r.cluesUsed != null)
      .reduce((sum, r) => {
        // Defense-in-depth: clamp to [0,5] so bonus is always non-negative
        // even if the schema validation is loosened in the future.
        const clamped = Math.max(0, Math.min(5, r.cluesUsed!));
        return sum + (5 - clamped) * QUIZ_CONFIG.xp.guessWhoClueBonus;
      }, 0);
  }

  let freeTextBonus = 0;
  if (activityType === 'capitals' || activityType === 'vocabulary') {
    freeTextBonus =
      correctResults.filter((r) => r.answerMode === 'free_text').length *
      QUIZ_CONFIG.xp.freeTextBonus;
  }

  return baseXp + timerBonus + perfectBonus + guessWhoClueBonus + freeTextBonus;
}

/**
 * SM-2 quality mapping for Guess Who mastery questions.
 * Dormant in Phase 3 (no mastery items). Written now so Phase 4+
 * can enable mastery without touching the scoring layer.
 */
export function getGuessWhoSm2Quality(
  correct: boolean,
  cluesUsed: number,
  answerMode: 'free_text' | 'multiple_choice'
): number {
  if (!correct) return 1;
  if (answerMode === 'multiple_choice') return 2;
  if (cluesUsed <= 2) return 5;
  if (cluesUsed <= 4) return 3;
  return 2;
}

export function getCelebrationTier(
  score: number,
  total: number
): 'perfect' | 'great' | 'nice' {
  const ratio = total > 0 ? score / total : 0;

  if (ratio >= QUIZ_CONFIG.celebrationThresholds.perfect) return 'perfect';
  if (ratio >= QUIZ_CONFIG.celebrationThresholds.great) return 'great';
  return 'nice';
}

/**
 * Complete an active quiz round atomically.
 *
 * IDOR hardening: the round lookup goes through the scoped repository
 * (`profile_id = $1` at the DB layer). Cross-profile callers see
 * NotFoundError, not ForbiddenError — we don't reveal whether the id
 * belongs to a different profile.
 *
 * Race hardening: select + validate + update run inside one transaction,
 * and the UPDATE is gated on `status = 'active'`. If a concurrent call has
 * already flipped the row to completed, the second UPDATE affects 0 rows
 * and we throw ConflictError. Without this guard, two simultaneous
 * complete calls would each award XP and double-insert missed items.
 */
export async function completeQuizRound(
  db: Database,
  profileId: string,
  roundId: string,
  results: QuestionResult[]
): Promise<CompleteRoundResponse> {
  return db.transaction(async (tx) => {
    // Scoped repository bound to the transaction connection: read, update,
    // and missed-items insert all run in the same transactional snapshot.
    // Cast through `unknown` because Drizzle's PgTransaction type doesn't
    // directly extend Database — see feedback_drizzle_transaction_cast.md.
    const txRepo = createScopedRepository(tx as unknown as Database, profileId);

    const round = await txRepo.quizRounds.findById(roundId);

    if (!round) {
      throw new NotFoundError('Round');
    }
    if (round.status !== 'active') {
      throw new ConflictError('Round already completed');
    }

    const questions = round.questions as QuizQuestion[];
    const total = round.total;
    const validatedResults = validateResults(questions, results);
    const droppedResults = results.length - validatedResults.length;
    const score = calculateScore(validatedResults);
    const xpEarned = calculateXp(validatedResults, total, round.activityType);
    const celebrationTier = getCelebrationTier(score, total);

    // Build missed items from discovery (non-library) questions only.
    // Dedup by (activityType, questionText) within this batch so the same
    // missed question can't fire twice in one request.
    const missedMap = new Map<
      string,
      {
        activityType: typeof round.activityType;
        questionText: string;
        correctAnswer: string;
        sourceRoundId: string;
      }
    >();
    for (const result of validatedResults) {
      if (result.correct) continue;
      const question = questions[result.questionIndex];
      if (!question || question.isLibraryItem) continue;
      const questionText = buildMissedItemText(question);
      const key = `${round.activityType}:${questionText}`;
      if (missedMap.has(key)) continue;
      missedMap.set(key, {
        activityType: round.activityType,
        questionText,
        correctAnswer: question.correctAnswer,
        sourceRoundId: roundId,
      });
    }

    // Atomic state transition: only completes if status is still 'active'.
    // If another concurrent call already completed the round, this UPDATE
    // affects 0 rows → ConflictError.
    const updated = await txRepo.quizRounds.completeActive(roundId, {
      results: validatedResults,
      score,
      xpEarned,
      completedAt: new Date(),
    });

    if (!updated) {
      throw new ConflictError('Round already completed');
    }

    if (round.activityType === 'vocabulary') {
      const libraryIndices = Array.isArray(round.libraryQuestionIndices)
        ? (round.libraryQuestionIndices as number[])
        : [];

      for (const index of libraryIndices) {
        const question = questions[index];
        if (question?.type !== 'vocabulary' || !question.vocabularyId) continue;

        const result = validatedResults.find(
          (entry) => entry.questionIndex === index
        );
        if (!result) continue;

        await reviewVocabulary(
          tx as unknown as Database,
          profileId,
          question.vocabularyId,
          { quality: getVocabSm2Quality(result.correct) }
        );
      }
    }

    // --- Mastery: capitals + guess_who ---
    if (
      round.activityType === 'capitals' ||
      round.activityType === 'guess_who'
    ) {
      const libraryIndices = Array.isArray(round.libraryQuestionIndices)
        ? (round.libraryQuestionIndices as number[])
        : [];

      // 1. SM-2 update for mastery questions (isLibraryItem: true)
      for (const index of libraryIndices) {
        const question = questions[index];
        if (!question) continue;

        const result = validatedResults.find(
          (entry) => entry.questionIndex === index
        );
        if (!result) continue;

        let quality: number;
        let itemKey: string;

        if (question.type === 'capitals') {
          quality = getCapitalsSm2Quality(result.correct);
          itemKey = computeCapitalsItemKey(question.country);
        } else if (question.type === 'guess_who') {
          quality = getGuessWhoSm2Quality(
            result.correct,
            result.cluesUsed ?? 5,
            result.answerMode ?? 'multiple_choice'
          );
          itemKey = computeGuessWhoItemKey(
            question.canonicalName,
            question.era
          );
        } else {
          continue;
        }

        const existing = await txRepo.quizMasteryItems.findByKey(
          round.activityType as 'capitals' | 'guess_who',
          itemKey
        );
        if (existing) {
          const sm2Result = applyQuizSm2(
            {
              easeFactor: String(existing.easeFactor),
              interval: existing.interval,
              repetitions: existing.repetitions,
            },
            quality
          );
          await txRepo.quizMasteryItems.updateSm2(
            itemKey,
            round.activityType as 'capitals' | 'guess_who',
            sm2Result
          );
        }
      }

      // 2. Upsert new mastery items from correct discovery answers
      for (const result of validatedResults) {
        if (!result.correct) continue;
        const question = questions[result.questionIndex];
        if (!question || question.isLibraryItem) continue;

        let itemKey: string;
        let itemAnswer: string;

        if (question.type === 'capitals') {
          itemKey = computeCapitalsItemKey(question.country);
          itemAnswer = question.correctAnswer;
        } else if (question.type === 'guess_who') {
          itemKey = computeGuessWhoItemKey(
            question.canonicalName,
            question.era
          );
          itemAnswer = question.canonicalName;
        } else {
          continue;
        }

        try {
          const upserted =
            await txRepo.quizMasteryItems.upsertFromCorrectAnswer({
              activityType: round.activityType as 'capitals' | 'guess_who',
              itemKey,
              itemAnswer,
            });
          logger.info('quiz_mastery_item.upsert.success', {
            profileId,
            activityType: round.activityType,
            itemKey,
            wasInserted: upserted !== null,
          });
        } catch (err) {
          logger.error('quiz_mastery_item.upsert.failure', {
            profileId,
            roundId,
            itemKey,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

      // 3. Track MC success count for free-text unlock progression
      for (const result of validatedResults) {
        const question = questions[result.questionIndex];
        if (!question || !question.isLibraryItem) continue;

        let itemKey: string;
        if (question.type === 'capitals') {
          itemKey = computeCapitalsItemKey(question.country);
        } else if (question.type === 'guess_who') {
          itemKey = computeGuessWhoItemKey(
            question.canonicalName,
            question.era
          );
        } else {
          continue;
        }

        if (
          result.correct &&
          (result.answerMode === 'multiple_choice' || !result.answerMode)
        ) {
          await txRepo.quizMasteryItems.incrementMcSuccessCount(
            itemKey,
            round.activityType as 'capitals' | 'guess_who'
          );
        } else if (!result.correct && result.answerMode === 'free_text') {
          // Free-text wrong → reset to 2 (one MC success away from re-unlock)
          await txRepo.quizMasteryItems.resetMcSuccessCount(
            itemKey,
            round.activityType as 'capitals' | 'guess_who',
            2
          );
        }
      }
    }

    if (missedMap.size > 0) {
      await txRepo.quizMissedItems.insertMany(Array.from(missedMap.values()));
    }

    // Build per-question results with the correct answer revealed.
    // Safe to expose now — the round is completed (status = 'completed').
    const questionResults: ValidatedQuestionResult[] = validatedResults.map(
      (result) => {
        const question = questions[result.questionIndex];
        return {
          questionIndex: result.questionIndex,
          correct: result.correct,
          correctAnswer: question?.correctAnswer ?? '',
        };
      }
    );

    return {
      score,
      total,
      xpEarned,
      celebrationTier,
      droppedResults,
      questionResults,
    };
  });
}
