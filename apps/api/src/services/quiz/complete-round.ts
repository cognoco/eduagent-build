import { createScopedRepository, type Database } from '@eduagent/database';
import type {
  CompleteRoundResponse,
  QuestionResult,
  QuizQuestion,
  ValidatedQuestionResult,
} from '@eduagent/schemas';
import { isGuessWhoFuzzyMatch } from '@eduagent/schemas';
import { BadRequestError, ConflictError, NotFoundError } from '../../errors';
import { createLogger } from '../logger';
import { recordPracticeActivityEvent } from '../practice-activity-events';
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
  answerGiven: string,
): boolean {
  const normalized = answerGiven.trim().toLowerCase();
  if (!normalized) return false;
  if (question.correctAnswer.trim().toLowerCase() === normalized) return true;
  if (question.type === 'capitals') {
    return question.acceptedAliases.some(
      (alias) => alias.trim().toLowerCase() === normalized,
    );
  }
  if (question.type === 'vocabulary') {
    return question.acceptedAnswers.some(
      (answer) => answer.trim().toLowerCase() === normalized,
    );
  }
  if (question.type === 'guess_who') {
    return isGuessWhoFuzzyMatch(
      answerGiven,
      question.canonicalName,
      question.acceptedAliases,
    );
  }
  return false;
}

/**
 * [BUG-STALE-OPTIONS] Defense-in-depth: when answerMode is 'multiple_choice'
 * and the question type uses a fixed options list (capitals, vocabulary),
 * verify the submitted answer is actually one of the options. This catches
 * the one-frame race condition where the client held stale shuffledOptions
 * and submitted an answer from the previous question.
 *
 * guard is exported for direct unit testing.
 */
export function assertAnswerInOptions(
  question: QuizQuestion,
  answerGiven: string,
  answerMode: 'free_text' | 'multiple_choice' | undefined,
): void {
  if (
    answerMode !== 'multiple_choice' ||
    (question.type !== 'capitals' && question.type !== 'vocabulary')
  ) {
    return;
  }
  const options: string[] =
    question.type === 'capitals'
      ? question.distractors.concat(question.correctAnswer)
      : question.type === 'vocabulary'
        ? question.distractors.concat(question.correctAnswer)
        : [];
  const normalizedGiven = answerGiven.trim().toLowerCase();
  const inOptions = options.some(
    (o) => o.trim().toLowerCase() === normalizedGiven,
  );
  if (!inOptions) {
    throw new BadRequestError(
      'Answer is not one of the available options for this question',
    );
  }
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
  answerGiven: string,
  answerMode?: 'free_text' | 'multiple_choice',
): Promise<boolean> {
  const repo = createScopedRepository(db, profileId);
  const round = await repo.quizRounds.findById(roundId);
  if (!round) throw new NotFoundError('Round');
  if (round.status !== 'active')
    throw new ConflictError('Round already completed');
  const questions = round.questions as QuizQuestion[];
  const question = questions[questionIndex];
  if (!question) throw new NotFoundError('Question');
  assertAnswerInOptions(question, answerGiven, answerMode);
  return isAnswerCorrect(question, answerGiven);
}

/**
 * [F-Q-02/F-Q-07] Extended check that also returns `correctAnswer` when the
 * submission is wrong. The answer is safe to reveal once the user has already
 * submitted — this is post-submission feedback, not a hint during play.
 */
export async function checkQuizAnswerWithCorrect(
  db: Database,
  profileId: string,
  roundId: string,
  questionIndex: number,
  answerGiven: string,
  answerMode?: 'free_text' | 'multiple_choice',
): Promise<{ correct: boolean; correctAnswer: string }> {
  const repo = createScopedRepository(db, profileId);
  const round = await repo.quizRounds.findById(roundId);
  if (!round) throw new NotFoundError('Round');
  if (round.status !== 'active')
    throw new ConflictError('Round already completed');
  const questions = round.questions as QuizQuestion[];
  const question = questions[questionIndex];
  if (!question) throw new NotFoundError('Question');
  assertAnswerInOptions(question, answerGiven, answerMode);
  const correct = isAnswerCorrect(question, answerGiven);
  return { correct, correctAnswer: question.correctAnswer };
}

/**
 * [ASSUMP-F5] Re-derive correctness for every client-reported result.
 * If the client references a `questionIndex` out of bounds, that entry is
 * dropped (rather than trusted) — it can't match any real question.
 *
 * [BUG-STALE-OPTIONS] Defense-in-depth: if the client reports answerMode
 * 'multiple_choice' for a capitals/vocabulary question and answerGiven is
 * not in question.options (server-held distractors + correct), the result
 * is dropped — it arose from the stale-options race and would corrupt the
 * score. The dropped count is reflected in `droppedResults` in the response.
 */
export function validateResults(
  questions: QuizQuestion[],
  clientResults: QuestionResult[],
): QuestionResult[] {
  const validated: QuestionResult[] = [];
  for (const result of clientResults) {
    const question = questions[result.questionIndex];
    if (!question) continue;
    // Drop MC answers for fixed-option question types when the submitted
    // value is not one of the server-known options.
    if (
      result.answerMode === 'multiple_choice' &&
      (question.type === 'capitals' || question.type === 'vocabulary')
    ) {
      const options: string[] =
        question.type === 'capitals'
          ? question.distractors.concat(question.correctAnswer)
          : question.distractors.concat(question.correctAnswer);
      const normalizedGiven = result.answerGiven.trim().toLowerCase();
      const inOptions = options.some(
        (o) => o.trim().toLowerCase() === normalizedGiven,
      );
      if (!inOptions) continue;
    }
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
  activityType?: string,
): number {
  const correctResults = results.filter((result) => result.correct);
  const baseXp = correctResults.length * QUIZ_CONFIG.xp.perCorrect;
  const timerBonus =
    correctResults.filter(
      (result) => result.timeMs < QUIZ_CONFIG.defaults.timerBonusThresholdMs,
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
        const clamped = Math.max(0, Math.min(5, r.cluesUsed ?? 0));
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
  answerMode: 'free_text' | 'multiple_choice',
): number {
  if (!correct) return 1;
  if (answerMode === 'multiple_choice') return 2;
  if (cluesUsed <= 2) return 5;
  if (cluesUsed <= 4) return 3;
  return 2;
}

export function getCelebrationTier(
  score: number,
  total: number,
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
  results: QuestionResult[],
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
    const completedAt = new Date();

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
      completedAt,
    });

    if (!updated) {
      throw new ConflictError('Round already completed');
    }

    await recordPracticeActivityEvent(tx as unknown as Database, {
      profileId,
      subjectId: round.subjectId ?? null,
      activityType: 'quiz',
      activitySubtype: round.activityType,
      completedAt,
      pointsEarned: xpEarned,
      score,
      total,
      sourceType: 'quiz_round',
      sourceId: roundId,
      metadata: {
        celebrationTier,
        droppedResults,
        questionCount: total,
      },
    });

    if (round.activityType === 'vocabulary') {
      const libraryIndices = Array.isArray(round.libraryQuestionIndices)
        ? (round.libraryQuestionIndices as number[])
        : [];

      for (const index of libraryIndices) {
        const question = questions[index];
        if (question?.type !== 'vocabulary' || !question.vocabularyId) continue;

        const result = validatedResults.find(
          (entry) => entry.questionIndex === index,
        );
        if (!result) continue;

        await reviewVocabulary(
          tx as unknown as Database,
          profileId,
          question.vocabularyId,
          { quality: getVocabSm2Quality(result.correct) },
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
          (entry) => entry.questionIndex === index,
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
            result.answerMode ?? 'multiple_choice',
          );
          itemKey = computeGuessWhoItemKey(
            question.canonicalName,
            question.era,
          );
        } else {
          continue;
        }

        const existing = await txRepo.quizMasteryItems.findByKey(
          round.activityType as 'capitals' | 'guess_who',
          itemKey,
        );
        if (existing) {
          const sm2Result = applyQuizSm2(
            {
              easeFactor: existing.easeFactor,
              interval: existing.interval,
              repetitions: existing.repetitions,
              lastReviewedAt: existing.updatedAt,
              nextReviewAt: existing.nextReviewAt,
            },
            quality,
          );
          await txRepo.quizMasteryItems.updateSm2(
            itemKey,
            round.activityType as 'capitals' | 'guess_who',
            sm2Result,
          );
          await recordPracticeActivityEvent(tx as unknown as Database, {
            profileId,
            activityType: 'review',
            activitySubtype: round.activityType,
            completedAt,
            score: quality,
            total: 5,
            sourceType: 'quiz_mastery_item',
            sourceId: existing.id,
            occurrenceKey: `round:${roundId}:question:${index}`,
            metadata: {
              itemKey,
              questionIndex: index,
              answerMode: result.answerMode ?? null,
              correct: result.correct,
            },
          });
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
            question.era,
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
            question.era,
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
            round.activityType as 'capitals' | 'guess_who',
          );
        } else if (!result.correct && result.answerMode === 'free_text') {
          // Free-text wrong → reset to 2 (one MC success away from re-unlock)
          await txRepo.quizMasteryItems.resetMcSuccessCount(
            itemKey,
            round.activityType as 'capitals' | 'guess_who',
            2,
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
        const entry: ValidatedQuestionResult = {
          questionIndex: result.questionIndex,
          correct: result.correct,
          correctAnswer: question?.correctAnswer ?? '',
          // [F-040] Copy the user's submitted answer into the response so the
          // results screen can show "You said: X" on missed-question cards.
          answerGiven: result.answerGiven,
        };
        // [BUG-469] Persist dispute flag so disputed answers can be reviewed
        // in analytics. Only set when true to keep JSONB lean.
        if (result.disputed) {
          entry.disputed = true;
        }
        if (result.cluesUsed != null) {
          entry.cluesUsed = result.cluesUsed;
        }
        return entry;
      },
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
