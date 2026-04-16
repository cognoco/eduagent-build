import { and, eq } from 'drizzle-orm';
import { quizMissedItems, quizRounds, type Database } from '@eduagent/database';
import type {
  CapitalsQuestion,
  CompleteRoundResponse,
  QuestionResult,
} from '@eduagent/schemas';
import { QUIZ_CONFIG } from './config';

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

export async function completeQuizRound(
  db: Database,
  profileId: string,
  roundId: string,
  results: QuestionResult[]
): Promise<CompleteRoundResponse> {
  const round = await db.query.quizRounds.findFirst({
    where: and(eq(quizRounds.id, roundId), eq(quizRounds.profileId, profileId)),
  });

  if (!round) {
    throw new Error('Round not found');
  }

  if (round.status !== 'active') {
    throw new Error('Round is not active');
  }

  const questions = round.questions as CapitalsQuestion[];
  const total = round.total;
  const score = calculateScore(results);
  const xpEarned = calculateXp(results, total);
  const celebrationTier = getCelebrationTier(score, total);

  const missedDiscoveryItems = results
    .filter((result) => !result.correct)
    .map((result) => {
      const question = questions[result.questionIndex];
      if (!question || question.isLibraryItem) return null;

      return {
        profileId,
        activityType: round.activityType,
        questionText: `What is the capital of ${question.country}?`,
        correctAnswer: question.correctAnswer,
        sourceRoundId: roundId,
      };
    })
    .filter(
      (
        item
      ): item is {
        profileId: string;
        activityType: (typeof quizRounds.$inferSelect)['activityType'];
        questionText: string;
        correctAnswer: string;
        sourceRoundId: string;
      } => item !== null
    );

  await db.transaction(async (tx) => {
    await tx
      .update(quizRounds)
      .set({
        results,
        score,
        xpEarned,
        status: 'completed',
        completedAt: new Date(),
      })
      .where(
        and(eq(quizRounds.id, roundId), eq(quizRounds.profileId, profileId))
      );

    if (missedDiscoveryItems.length > 0) {
      await tx.insert(quizMissedItems).values(missedDiscoveryItems);
    }
  });

  return {
    score,
    total,
    xpEarned,
    celebrationTier,
  };
}
