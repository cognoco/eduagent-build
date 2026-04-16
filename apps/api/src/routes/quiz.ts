import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import {
  completeRoundInputSchema,
  generateRoundInputSchema,
  type GenerateRoundInput,
} from '@eduagent/schemas';
import { quizRounds, type Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId } from '../middleware/profile-scope';
import { validationError } from '../errors';
import { QUIZ_CONFIG } from '../services/quiz/config';
import { completeQuizRound } from '../services/quiz/complete-round';
import { generateQuizRound } from '../services/quiz/generate-round';

type QuizRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta;
  };
};

async function buildAndGenerateRound(
  db: Database,
  profileId: string,
  profileMeta: ProfileMeta,
  input: GenerateRoundInput
) {
  const recentRounds = await db.query.quizRounds.findMany({
    where: and(
      eq(quizRounds.profileId, profileId),
      eq(quizRounds.activityType, input.activityType)
    ),
    orderBy: [desc(quizRounds.createdAt)],
    limit: 5,
  });

  const recentAnswers = recentRounds
    .flatMap((round) => {
      const questions =
        (round.questions as Array<{ correctAnswer?: string }>) ?? [];
      return questions
        .map((question) => question.correctAnswer)
        .filter((answer): answer is string => Boolean(answer));
    })
    .slice(0, QUIZ_CONFIG.defaults.recentlySeenBufferSize);

  return generateQuizRound({
    db,
    profileId,
    activityType: input.activityType,
    birthYear: profileMeta.birthYear,
    themePreference: input.themePreference,
    libraryItems: [],
    recentAnswers,
  });
}

export const quizRoutes = new Hono<QuizRouteEnv>()
  .post('/quiz/rounds', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const profileMeta = c.get('profileMeta');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = generateRoundInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        c,
        `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`
      );
    }

    const round = await buildAndGenerateRound(
      db,
      profileId,
      profileMeta,
      parsed.data
    );

    return c.json(
      {
        id: round.id,
        activityType: parsed.data.activityType,
        theme: round.theme,
        questions: round.questions,
        total: round.total,
      },
      200
    );
  })
  .post('/quiz/rounds/prefetch', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const profileMeta = c.get('profileMeta');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = generateRoundInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        c,
        `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`
      );
    }

    const round = await buildAndGenerateRound(
      db,
      profileId,
      profileMeta,
      parsed.data
    );

    return c.json({ id: round.id }, 200);
  })
  .get('/quiz/rounds/recent', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const rounds = await db.query.quizRounds.findMany({
      where: and(
        eq(quizRounds.profileId, profileId),
        eq(quizRounds.status, 'completed')
      ),
      orderBy: [desc(quizRounds.completedAt)],
      limit: 10,
    });

    return c.json(
      rounds.map((round) => ({
        id: round.id,
        activityType: round.activityType,
        theme: round.theme,
        score: round.score ?? 0,
        total: round.total,
        xpEarned: round.xpEarned ?? 0,
        completedAt:
          round.completedAt?.toISOString() ?? round.createdAt.toISOString(),
      })),
      200
    );
  })
  .get('/quiz/rounds/:id', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const roundId = c.req.param('id');

    const round = await db.query.quizRounds.findFirst({
      where: and(
        eq(quizRounds.id, roundId),
        eq(quizRounds.profileId, profileId)
      ),
    });

    if (!round) {
      return c.json({ error: 'Round not found' }, 404);
    }

    return c.json(
      {
        id: round.id,
        activityType: round.activityType,
        theme: round.theme,
        questions: round.questions,
        total: round.total,
      },
      200
    );
  })
  .post(
    '/quiz/rounds/:id/complete',
    zValidator('json', completeRoundInputSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const roundId = c.req.param('id');
      const { results } = c.req.valid('json');

      const result = await completeQuizRound(db, profileId, roundId, results);
      return c.json(result, 200);
    }
  )
  .get('/quiz/stats', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const rounds = await db.query.quizRounds.findMany({
      where: and(
        eq(quizRounds.profileId, profileId),
        eq(quizRounds.status, 'completed')
      ),
    });

    const statsByActivity = new Map<
      string,
      {
        roundsPlayed: number;
        bestScore: number | null;
        bestTotal: number | null;
        totalXp: number;
      }
    >();

    for (const round of rounds) {
      const current = statsByActivity.get(round.activityType) ?? {
        roundsPlayed: 0,
        bestScore: null,
        bestTotal: null,
        totalXp: 0,
      };

      current.roundsPlayed += 1;
      current.totalXp += round.xpEarned ?? 0;

      if (
        round.score != null &&
        (current.bestScore == null ||
          round.score / round.total >
            current.bestScore / (current.bestTotal ?? 1))
      ) {
        current.bestScore = round.score;
        current.bestTotal = round.total;
      }

      statsByActivity.set(round.activityType, current);
    }

    return c.json(
      Array.from(statsByActivity.entries()).map(([activityType, stats]) => ({
        activityType,
        ...stats,
      })),
      200
    );
  });
