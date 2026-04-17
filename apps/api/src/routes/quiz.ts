import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  completeRoundInputSchema,
  generateRoundInputSchema,
  type GenerateRoundInput,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId } from '../middleware/profile-scope';
import { validationError } from '../errors';
import {
  completeQuizRound,
  computeRoundStats,
  generateQuizRound,
  getRecentAnswers,
  getRoundByIdOrThrow,
  listRecentCompletedRounds,
} from '../services/quiz';

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

/**
 * Route-layer orchestration only. Every read goes through
 * `services/quiz/queries.ts`, every mutation through `generate-round.ts` or
 * `complete-round.ts`. This file must not import `drizzle-orm`,
 * `@eduagent/database` schema tables, or `createScopedRepository` directly.
 */
async function buildAndGenerateRound(
  db: Database,
  profileId: string,
  profileMeta: ProfileMeta,
  input: GenerateRoundInput
) {
  const recentAnswers = await getRecentAnswers(
    db,
    profileId,
    input.activityType
  );

  return generateQuizRound({
    db,
    profileId,
    activityType: input.activityType,
    birthYear: profileMeta.birthYear,
    themePreference: input.themePreference,
    // Phase 2: wired when vocabulary retention lands. Until then, all
    // capitals questions are discovery — the mastery path is unit-tested in
    // isolation via content-resolver.test.ts.
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

    const rounds = await listRecentCompletedRounds(db, profileId, 10);

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

    // Throws NotFoundError if the round doesn't exist OR belongs to a
    // different profile — handled centrally by `app.onError` → 404.
    const round = await getRoundByIdOrThrow(db, profileId, roundId);

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

    const stats = await computeRoundStats(db, profileId);
    return c.json(stats, 200);
  });
