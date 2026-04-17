import { eq } from 'drizzle-orm';
import {
  createScopedRepository,
  quizRounds,
  type Database,
} from '@eduagent/database';
import type { QuizActivityType } from '@eduagent/schemas';
import { NotFoundError } from '../../errors';
import { QUIZ_CONFIG } from './config';

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
  return repo.quizRounds.findFirst(eq(quizRounds.id, roundId));
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
