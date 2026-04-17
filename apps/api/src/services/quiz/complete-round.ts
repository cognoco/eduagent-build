import { createScopedRepository, type Database } from '@eduagent/database';
import type {
  CompleteRoundResponse,
  QuestionResult,
  QuizQuestion,
} from '@eduagent/schemas';
import { ConflictError, NotFoundError } from '../../errors';
import { reviewVocabulary } from '../vocabulary';
import { QUIZ_CONFIG } from './config';

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
  return false;
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
  return '';
}

export function getVocabSm2Quality(correct: boolean): number {
  return correct ? 4 : 2;
}

export function calculateScore(results: QuestionResult[]): number {
  return results.filter((result) => result.correct).length;
}

export function calculateXp(results: QuestionResult[], total: number): number {
  const correctResults = results.filter((result) => result.correct);
  const baseXp = correctResults.length * QUIZ_CONFIG.xp.perCorrect;
  const timerBonus =
    correctResults.filter(
      (result) => result.timeMs < QUIZ_CONFIG.defaults.timerBonusThresholdMs
    ).length * QUIZ_CONFIG.xp.timerBonus;
  const perfectBonus =
    correctResults.length === total ? QUIZ_CONFIG.xp.perfectBonus : 0;

  return baseXp + timerBonus + perfectBonus;
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
    const xpEarned = calculateXp(validatedResults, total);
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

    if (missedMap.size > 0) {
      await txRepo.quizMissedItems.insertMany(Array.from(missedMap.values()));
    }

    return {
      score,
      total,
      xpEarned,
      celebrationTier,
      droppedResults,
    };
  });
}
