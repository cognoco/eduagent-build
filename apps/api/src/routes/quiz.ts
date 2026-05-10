import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  completeRoundInputSchema,
  completeRoundResponseSchema,
  generateRoundInputSchema,
  markSurfacedInputSchema,
  markSurfacedResponseSchema,
  prefetchRoundResponseSchema,
  questionCheckInputSchema,
  questionCheckResponseSchema,
  quizRoundResponseSchema,
  quizStatsListResponseSchema,
  recentRoundListItemSchema,
  activeRoundDetailResponseSchema,
  completedRoundDetailResponseSchema,
  type ClientQuizQuestion,
  type CefrLevel,
  type GenerateRoundInput,
  type QuizQuestion,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { validationError, VocabularyContextError } from '../errors';
import {
  checkQuizAnswerWithCorrect,
  completeQuizRound,
  formatActivityLabel,
  getCelebrationTier,
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
import { inngest } from '../inngest/client';

type QuizRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
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
    const tmp = result[i];
    const swapVal = result[j];
    if (tmp !== undefined && swapVal !== undefined) {
      result[i] = swapVal;
      result[j] = tmp;
    }
  }
  return result;
}

function toClientSafeQuestions(
  questions: QuizQuestion[],
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
  input: GenerateRoundInput,
) {
  const recentAnswers = await getRecentAnswers(
    db,
    profileId,
    input.activityType,
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
        'subjectId is required for vocabulary rounds',
      );
    }

    const context = await getVocabularyRoundContext(
      db,
      profileId,
      input.subjectId,
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
    3,
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
 * Shared round generation used by both /quiz/rounds and /quiz/rounds/prefetch.
 * Schema validation now lives in the per-route zValidator middleware (BUG-833),
 * so this helper only handles the post-parse generation step plus the
 * VocabularyContextError → 400 translation that depends on runtime context
 * fetched mid-generation.
 */
async function generateRoundFromInput(
  c: import('hono').Context<QuizRouteEnv>,
  input: GenerateRoundInput,
) {
  const profileId = requireProfileId(c.get('profileId'));
  const db = c.get('db');
  const profileMeta = c.get('profileMeta');
  if (!profileMeta) {
    throw new Error('profileMeta not set — profile middleware must run first');
  }

  try {
    const round = await buildAndGenerateRound(
      db,
      profileId,
      profileMeta,
      input,
    );
    return { round, input };
  } catch (error) {
    if (error instanceof VocabularyContextError) {
      return { error: validationError(c, error.message) };
    }
    throw error;
  }
}

export const quizRoutes = new Hono<QuizRouteEnv>()
  // [BUG-833] zValidator middleware replaces manual c.req.json() + safeParse.
  .post(
    '/quiz/rounds',
    zValidator('json', generateRoundInputSchema, (result, c) => {
      if (result.success) return;
      return validationError(
        c,
        `Invalid input: ${result.error.issues[0]?.message ?? 'unknown'}`,
      );
    }),
    async (c) => {
      assertNotProxyMode(c);
      const input = c.req.valid('json');
      const result = await generateRoundFromInput(c, input);
      if ('error' in result) return result.error;

      return c.json(
        quizRoundResponseSchema.parse({
          id: result.round.id,
          activityType: result.input.activityType,
          theme: result.round.theme,
          questions: toClientSafeQuestions(
            result.round.questions as QuizQuestion[],
          ),
          total: result.round.total,
          difficultyBump: result.round.difficultyBump,
        }),
        200,
      );
    },
  )
  // [BUG-833] zValidator middleware replaces manual c.req.json() + safeParse.
  .post(
    '/quiz/rounds/prefetch',
    zValidator('json', generateRoundInputSchema, (result, c) => {
      if (result.success) return;
      return validationError(
        c,
        `Invalid input: ${result.error.issues[0]?.message ?? 'unknown'}`,
      );
    }),
    async (c) => {
      assertNotProxyMode(c);
      const input = c.req.valid('json');
      const result = await generateRoundFromInput(c, input);
      if ('error' in result) return result.error;

      return c.json(
        prefetchRoundResponseSchema.parse({ id: result.round.id }),
        200,
      );
    },
  )
  .get('/quiz/rounds/recent', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const rounds = await listRecentCompletedRounds(db, profileId, 10);

    return c.json(
      rounds.map((round) =>
        recentRoundListItemSchema.parse({
          id: round.id,
          activityType: round.activityType,
          activityLabel: formatActivityLabel(round.activityType),
          theme: round.theme,
          score: round.score ?? 0,
          total: round.total,
          xpEarned: round.xpEarned ?? 0,
          completedAt:
            round.completedAt?.toISOString() ?? round.createdAt.toISOString(),
        }),
      ),
      200,
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
      // [F-032] Completed rounds surface the grading context the client
      // needs to render a history detail screen: correctAnswer and
      // acceptedAliases per question (safe to expose — grading is final),
      // plus a celebrationTier and human-readable activityLabel. Distractors
      // remain stripped — the round is over, there's no reason to leak them.
      return c.json(
        completedRoundDetailResponseSchema.parse({
          id: round.id,
          activityType: round.activityType,
          activityLabel: formatActivityLabel(round.activityType),
          theme: round.theme,
          status: round.status,
          score: round.score,
          total: round.total,
          xpEarned: round.xpEarned,
          celebrationTier: getCelebrationTier(round.score ?? 0, round.total),
          completedAt: round.completedAt?.toISOString(),
          questions: questions.map((q) => {
            const base = toClientSafeQuestions([q])[0];
            if (base == null)
              throw new Error(
                'toClientSafeQuestions returned empty array for a single question',
              );
            return {
              ...base,
              correctAnswer: q.correctAnswer,
              acceptedAliases:
                q.type === 'vocabulary'
                  ? q.acceptedAnswers
                  : 'acceptedAliases' in q
                    ? q.acceptedAliases
                    : undefined,
            };
          }),
          results: round.results,
        }),
        200,
      );
    }

    return c.json(
      activeRoundDetailResponseSchema.parse({
        id: round.id,
        activityType: round.activityType,
        activityLabel: formatActivityLabel(round.activityType),
        theme: round.theme,
        questions: toClientSafeQuestions(questions),
        total: round.total,
      }),
      200,
    );
  })
  .post(
    '/quiz/rounds/:id/check',
    zValidator('json', questionCheckInputSchema),
    async (c) => {
      assertNotProxyMode(c);
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const roundId = c.req.param('id');
      const { questionIndex, answerGiven, answerMode } = c.req.valid('json');

      const result = await checkQuizAnswerWithCorrect(
        db,
        profileId,
        roundId,
        questionIndex,
        answerGiven,
        answerMode,
      );
      // [F-Q-02/F-Q-07] Reveal correctAnswer only on wrong submissions so the
      // client can highlight the right option and show the person's name.
      return c.json(
        questionCheckResponseSchema.parse({
          correct: result.correct,
          ...(result.correct ? {} : { correctAnswer: result.correctAnswer }),
        }),
        200,
      );
    },
  )
  .post(
    '/quiz/rounds/:id/complete',
    zValidator('json', completeRoundInputSchema),
    async (c) => {
      assertNotProxyMode(c);
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const roundId = c.req.param('id');
      const { results } = c.req.valid('json');

      const result = await completeQuizRound(db, profileId, roundId, results);

      const today = new Date().toISOString().slice(0, 10);
      await inngest.send({
        name: 'app/streak.record',
        data: { profileId, date: today },
      });

      return c.json(completeRoundResponseSchema.parse(result), 200);
    },
  )
  // [BUG-833] zValidator middleware replaces manual c.req.json() + safeParse.
  .post(
    '/quiz/missed-items/mark-surfaced',
    zValidator('json', markSurfacedInputSchema, (result, c) => {
      if (result.success) return;
      return validationError(
        c,
        `Invalid input: ${result.error.issues[0]?.message ?? 'unknown'}`,
      );
    }),
    async (c) => {
      assertNotProxyMode(c);
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const { activityType } = c.req.valid('json');

      const markedCount = await markMissedItemsSurfaced(
        db,
        profileId,
        activityType,
      );

      return c.json(markSurfacedResponseSchema.parse({ markedCount }), 200);
    },
  )
  .get('/quiz/stats', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const stats = await computeRoundStats(db, profileId);
    return c.json(quizStatsListResponseSchema.parse(stats), 200);
  });
