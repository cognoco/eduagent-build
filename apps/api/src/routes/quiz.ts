import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  completeRoundInputSchema,
  generateRoundInputSchema,
  markSurfacedInputSchema,
  questionCheckInputSchema,
  type ClientQuizQuestion,
  type CefrLevel,
  type GenerateRoundInput,
  type QuizQuestion,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId } from '../middleware/profile-scope';
import { validationError, VocabularyContextError } from '../errors';
import {
  checkQuizAnswer,
  completeQuizRound,
  getVocabularyRoundContext,
  getGuessWhoRoundContext,
  computeRoundStats,
  generateQuizRound,
  getRecentAnswers,
  getRecentCompletedByActivity,
  getRoundByIdOrThrow,
  listRecentCompletedRounds,
  markMissedItemsSurfaced,
  getDueMasteryItems,
  shouldApplyDifficultyBump,
} from '../services/quiz';
import { recordSessionActivity } from '../services/streaks';

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

// ─── Answer-stripping projection ─────────────────────────────────────────
// [CR-1] Prevent answer leaking: correctAnswer, acceptedAliases,
// acceptedAnswers, canonicalName are stripped. MC types get a pre-shuffled
// `options` array; guess_who keeps mcFallbackOptions as-is.

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function toClientSafeQuestions(
  questions: QuizQuestion[]
): ClientQuizQuestion[] {
  return questions.map((q): ClientQuizQuestion => {
    if (q.type === 'capitals') {
      return {
        type: 'capitals',
        country: q.country,
        options: shuffle([q.correctAnswer, ...q.distractors]),
        funFact: q.funFact,
        isLibraryItem: q.isLibraryItem,
        topicId: q.topicId,
        freeTextEligible: q.freeTextEligible,
      };
    }
    if (q.type === 'vocabulary') {
      return {
        type: 'vocabulary',
        term: q.term,
        options: shuffle([q.correctAnswer, ...q.distractors]),
        funFact: q.funFact,
        cefrLevel: q.cefrLevel,
        isLibraryItem: q.isLibraryItem,
        vocabularyId: q.vocabularyId,
        freeTextEligible: q.freeTextEligible,
      };
    }
    return {
      type: 'guess_who',
      clues: q.clues,
      mcFallbackOptions: q.mcFallbackOptions,
      funFact: q.funFact,
      isLibraryItem: q.isLibraryItem,
      topicId: q.topicId,
    };
  });
}

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
        'subjectId is required for vocabulary rounds'
      );
    }

    const context = await getVocabularyRoundContext(
      db,
      profileId,
      input.subjectId
    );
    languageCode = context.languageCode;
    cefrCeiling = context.cefrCeiling;
    allVocabulary = context.allVocabulary;
    libraryItems = context.libraryItems;
  } else if (input.activityType === 'guess_who') {
    const context = await getGuessWhoRoundContext(db, profileId);
    topicTitles = context.topicTitles;
    libraryItems = await getDueMasteryItems(db, profileId, 'guess_who');
  } else if (input.activityType === 'capitals') {
    libraryItems = await getDueMasteryItems(db, profileId, 'capitals');
  }

  const recentForBump = await getRecentCompletedByActivity(
    db,
    profileId,
    input.activityType,
    3
  );
  const completedForBump = recentForBump
    .filter((r) => r.status === 'completed')
    .map((r) => ({
      score: r.score,
      total: r.total,
      completedAt: r.completedAt,
    }));
  const difficultyBump = shouldApplyDifficultyBump(completedForBump);

  return generateQuizRound({
    db,
    profileId,
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
  });
}

/**
 * Shared parsing + round generation used by both /quiz/rounds and
 * /quiz/rounds/prefetch. Returns the parsed input and generated round, or
 * an early validation-error Response if the request is malformed.
 */
async function parseAndGenerate(c: import('hono').Context<QuizRouteEnv>) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: validationError(c, 'Request body must be valid JSON') };
  }

  const parsed = generateRoundInputSchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: validationError(
        c,
        `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`
      ),
    };
  }

  const profileId = requireProfileId(c.get('profileId'));
  const db = c.get('db');
  const profileMeta = c.get('profileMeta');

  try {
    const round = await buildAndGenerateRound(
      db,
      profileId,
      profileMeta,
      parsed.data
    );
    return { round, input: parsed.data };
  } catch (error) {
    if (error instanceof VocabularyContextError) {
      return { error: validationError(c, error.message) };
    }
    throw error;
  }
}

export const quizRoutes = new Hono<QuizRouteEnv>()
  .post('/quiz/rounds', async (c) => {
    const result = await parseAndGenerate(c);
    if ('error' in result) return result.error;

    return c.json(
      {
        id: result.round.id,
        activityType: result.input.activityType,
        theme: result.round.theme,
        questions: toClientSafeQuestions(
          result.round.questions as QuizQuestion[]
        ),
        total: result.round.total,
        difficultyBump: result.round.difficultyBump,
      },
      200
    );
  })
  .post('/quiz/rounds/prefetch', async (c) => {
    const result = await parseAndGenerate(c);
    if ('error' in result) return result.error;

    return c.json({ id: result.round.id }, 200);
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
    const questions = round.questions as QuizQuestion[];

    if (round.status === 'completed') {
      return c.json(
        {
          id: round.id,
          activityType: round.activityType,
          theme: round.theme,
          status: round.status,
          score: round.score,
          total: round.total,
          xpEarned: round.xpEarned,
          completedAt: round.completedAt?.toISOString(),
          questions: questions.map((q) => ({
            ...toClientSafeQuestions([q])[0],
            correctAnswer: q.correctAnswer,
          })),
          results: round.results,
        },
        200
      );
    }

    return c.json(
      {
        id: round.id,
        activityType: round.activityType,
        theme: round.theme,
        questions: toClientSafeQuestions(questions),
        total: round.total,
      },
      200
    );
  })
  .post(
    '/quiz/rounds/:id/check',
    zValidator('json', questionCheckInputSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const roundId = c.req.param('id');
      const { questionIndex, answerGiven } = c.req.valid('json');

      const correct = await checkQuizAnswer(
        db,
        profileId,
        roundId,
        questionIndex,
        answerGiven
      );
      return c.json({ correct }, 200);
    }
  )
  .post(
    '/quiz/rounds/:id/complete',
    zValidator('json', completeRoundInputSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const roundId = c.req.param('id');
      const { results } = c.req.valid('json');

      const result = await completeQuizRound(db, profileId, roundId, results);

      // Record streak activity — quiz round counts as daily learning activity.
      // Fire-and-forget: streak failure must not block the completion response.
      const today = new Date().toISOString().slice(0, 10);
      recordSessionActivity(db, profileId, today).catch((err) =>
        console.error('[quiz] recordSessionActivity failed:', err)
      );

      return c.json(result, 200);
    }
  )
  .post('/quiz/missed-items/mark-surfaced', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = markSurfacedInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        c,
        `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`
      );
    }

    const markedCount = await markMissedItemsSurfaced(
      db,
      profileId,
      parsed.data.activityType
    );

    return c.json({ markedCount }, 200);
  })
  .get('/quiz/stats', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const stats = await computeRoundStats(db, profileId);
    return c.json(stats, 200);
  });
