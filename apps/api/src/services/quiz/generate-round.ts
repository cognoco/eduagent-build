import {
  capitalsLlmOutputSchema,
  type CefrLevel,
  computeAgeBracket,
  type CapitalsQuestion,
  guessWhoLlmOutputSchema,
  type QuizQuestion,
  type GuessWhoQuestion,
  type QuizActivityType,
  vocabularyLlmOutputSchema,
  type VocabularyQuestion,
} from '@eduagent/schemas';
import { createScopedRepository, type Database } from '@eduagent/database';
import { getRecentMissedItems, markMissedItemsSurfaced } from './queries';
import type { ChatMessage } from '../llm';
import { routeAndCall, CircuitOpenError } from '../llm';
import { captureException } from '../sentry';
import { UpstreamLlmError, VocabularyContextError } from '../../errors';
import { getLearningProfile } from '../learner-profile';
import { CAPITALS_BY_COUNTRY, CAPITALS_DATA } from './capitals-data';
import { resolveRoundContent, type LibraryItem } from './content-resolver';
import { validateCapitalsRound } from './capitals-validation';
import { shuffle } from './shuffle';
import {
  buildVocabularyMasteryQuestion,
  buildVocabularyPrompt,
  nextCefrLevel,
  validateVocabularyRound,
} from './vocabulary-provider';
import {
  appendSurnameAlias,
  buildGuessWhoDiscoveryQuestions,
  buildGuessWhoMasteryCluePrompt,
  buildGuessWhoPrompt,
  guessWhoMasteryClueSchema,
  validateGuessWhoRound,
} from './guess-who-provider';
import { type AgeBracket, type Interest } from './config';
import { createLogger } from '../logger';
import { extractFirstJsonObject } from '../llm/extract-json';
import { buildCapitalsPrompt as _buildCapitalsPrompt } from './quiz-prompts';

// Re-export prompt builders for backward compatibility
// (eval harness imports buildCapitalsPrompt from this module)
export { buildCapitalsPrompt } from './quiz-prompts';

const logger = createLogger();

/**
 * [BUG-990] Wrap routeAndCall for quiz generation so that AbortError (from
 * Cloudflare Worker request timeout) and CircuitOpenError (LLM provider
 * circuit open) are converted into UpstreamLlmError instead of propagating
 * as unhandled errors. UpstreamLlmError is caught by the global onError
 * handler in index.ts and returned as 502 UPSTREAM_ERROR — a proper JSON
 * error response instead of a hard Worker crash with 502 Bad Gateway.
 */
async function routeAndCallForQuiz(
  messages: ChatMessage[],
  rung: Parameters<typeof routeAndCall>[1],
  options?: Parameters<typeof routeAndCall>[2],
): ReturnType<typeof routeAndCall> {
  try {
    return await routeAndCall(messages, rung, options);
  } catch (err) {
    // AbortError: Cloudflare Worker request timeout fires and aborts in-flight
    // fetch calls. DOMException with name 'AbortError' is the W3C standard form;
    // plain Error with name 'AbortError' is Node.js / undici form.
    const isAbortError =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof DOMException !== 'undefined' &&
        err instanceof DOMException &&
        err.name === 'AbortError');
    if (isAbortError || err instanceof CircuitOpenError) {
      throw new UpstreamLlmError(
        err instanceof Error
          ? err.message
          : 'Quiz LLM request timed out or circuit is open',
      );
    }
    throw err;
  }
}

function buildMasteryDistractors(correctAnswer: string): string[] {
  const pool = CAPITALS_DATA.filter(
    (entry) => entry.capital.toLowerCase() !== correctAnswer.toLowerCase(),
  );
  return shuffle(pool)
    .slice(0, 3)
    .map((entry) => entry.capital);
}

export function injectMasteryQuestions(
  discoveryQuestions: CapitalsQuestion[],
  masteryItems: LibraryItem[],
  activityType: QuizActivityType,
): CapitalsQuestion[] {
  if (activityType !== 'capitals' || masteryItems.length === 0) {
    return discoveryQuestions;
  }

  const FREE_TEXT_UNLOCK_THRESHOLD = 3;
  const masteryQuestions = masteryItems.map((item) => {
    const reference = CAPITALS_BY_COUNTRY.get(item.question.toLowerCase());
    const freeTextEligible =
      (item.mcSuccessCount ?? 0) >= FREE_TEXT_UNLOCK_THRESHOLD;
    return {
      type: 'capitals',
      country: reference?.country ?? item.question,
      correctAnswer: reference?.capital ?? item.answer,
      acceptedAliases: reference?.acceptedAliases ?? [item.answer],
      distractors: buildMasteryDistractors(reference?.capital ?? item.answer),
      funFact: reference?.funFact ?? '',
      isLibraryItem: true,
      topicId: item.topicId ?? undefined,
      freeTextEligible: freeTextEligible || undefined,
    } satisfies CapitalsQuestion;
  });

  return injectAtRandomPositions(discoveryQuestions, masteryQuestions);
}

export function injectAtRandomPositions<T>(base: T[], injected: T[]): T[] {
  if (injected.length === 0) return base;

  const combined = [...base];
  for (const item of injected) {
    const insertIndex = Math.floor(Math.random() * (combined.length + 1));
    combined.splice(insertIndex, 0, item);
  }

  return combined;
}

export function buildVocabularyDiscoveryQuestions(validated: {
  questions: Array<{
    term: string;
    correctAnswer: string;
    acceptedAnswers: string[];
    distractors: string[];
    funFact: string;
    cefrLevel: string;
  }>;
}): VocabularyQuestion[] {
  return validated.questions.map((question) => ({
    type: 'vocabulary',
    term: question.term,
    correctAnswer: question.correctAnswer,
    acceptedAnswers: question.acceptedAnswers,
    distractors: question.distractors,
    funFact: question.funFact,
    cefrLevel: question.cefrLevel,
    isLibraryItem: false,
  }));
}

export interface AssembledRound {
  theme: string;
  questions: QuizQuestion[];
  total: number;
  libraryQuestionIndices: number[];
}

export function assembleRound(
  theme: string,
  questions: QuizQuestion[],
): AssembledRound {
  const libraryQuestionIndices = questions
    .map((question, index) => (question.isLibraryItem ? index : -1))
    .filter((index) => index >= 0);

  return {
    theme,
    questions,
    total: questions.length,
    libraryQuestionIndices,
  };
}

/**
 * Extract the first balanced JSON object from an LLM response.
 *
 * Delegates to the shared `extractFirstJsonObject` utility (which handles
 * markdown fences, prose preamble, and nested braces) and throws on failure.
 */
export function extractJsonObject(response: string): string {
  const result = extractFirstJsonObject(response);
  if (result === null) {
    throw new UpstreamLlmError('Quiz LLM returned no JSON object');
  }
  return result;
}

interface GenerateParams {
  db: Database;
  profileId: string;
  subjectId?: string | null;
  activityType: QuizActivityType;
  birthYear?: number | null;
  themePreference?: string;
  libraryItems: LibraryItem[];
  recentAnswers: string[];
  languageCode?: string;
  cefrCeiling?: CefrLevel;
  allVocabulary?: Array<{ term: string; translation: string }>;
  topicTitles?: string[];
  difficultyBump?: boolean;
  // Caller may pre-supply these to avoid an extra DB round-trip; if absent
  // generateQuizRound will fetch them from the learning profile.
  interests?: Interest[];
  nativeLanguage?: string;
}

export async function generateQuizRound(params: GenerateParams): Promise<{
  id: string;
  theme: string;
  questions: QuizQuestion[];
  total: number;
  difficultyBump: boolean;
}> {
  const {
    db,
    profileId,
    subjectId,
    activityType,
    birthYear,
    themePreference,
    libraryItems,
    recentAnswers,
    languageCode,
    cefrCeiling,
    allVocabulary,
    topicTitles,
    difficultyBump = false,
    nativeLanguage,
  } = params;

  const plan = resolveRoundContent({
    activityType,
    profileId,
    recentAnswers,
    libraryItems,
  });
  const ageBracket: AgeBracket =
    birthYear == null ? 'adolescent' : computeAgeBracket(birthYear);

  // Compute fine-grained ageYears from birthYear when available.
  const currentYear = new Date().getFullYear();
  const ageYears = birthYear != null ? currentYear - birthYear : undefined;

  // Fetch the learner's profile to source personalization signals (P0.1 + P1.2).
  // Use caller-supplied interests when pre-fetched to avoid an extra round-trip.
  // nativeLanguage is NOT on learning_profiles — callers that have language
  // context (e.g. vocabulary rounds via getVocabularyRoundContext) may pass it
  // via the nativeLanguage param; otherwise it remains undefined.
  let resolvedInterests = params.interests;
  let resolvedStruggles: string[] = [];
  if (resolvedInterests === undefined) {
    // Learning-profile fetch is best-effort: if the DB or mock doesn't
    // expose it, fall back to an un-personalized prompt rather than failing
    // the whole quiz-generation request.
    try {
      const profile = await getLearningProfile(db, profileId);
      if (profile) {
        // DB stores interests as plain string[]. Map to {label, context} shape;
        // all DB interests are treated as 'free_time' unless the caller annotates them.
        const rawInterests = Array.isArray(profile.interests)
          ? (profile.interests as unknown[]).filter(
              (i): i is string => typeof i === 'string',
            )
          : [];
        resolvedInterests = rawInterests.map((label) => ({
          label,
          context: 'free_time' as const,
        }));

        // [P1-4] Extract struggle topics from the profile — medium/high
        // confidence only, capped to 10, for soft prompt-level reinforcement.
        if (Array.isArray(profile.struggles)) {
          resolvedStruggles = (profile.struggles as unknown[])
            .filter(
              (entry): entry is { topic: string; confidence?: string } =>
                typeof entry === 'object' &&
                entry !== null &&
                typeof (entry as { topic?: unknown }).topic === 'string',
            )
            .filter((entry) => entry.confidence !== 'low')
            .slice(0, 10)
            .map((entry) => entry.topic);
        }
      }
    } catch {
      // Graceful degradation — quiz proceeds without interest-driven theming.
      resolvedInterests = undefined;
      resolvedStruggles = [];
    }
  }
  const resolvedNativeLanguage = nativeLanguage;

  // [P1 — quiz_missed_items wiring] Fetch recent unsurfaced misses for this
  // activity so the LLM can re-surface them in the new round. Best-effort:
  // `getRecentMissedItems` returns [] on any DB error.
  const missedRows = await getRecentMissedItems(db, profileId, activityType);
  const recentlyMissedItems = missedRows.map((row) =>
    extractMissedItemLabel(row.questionText, row.correctAnswer, activityType),
  );

  let theme = '';
  let questions: QuizQuestion[] = [];

  if (activityType === 'capitals') {
    let prompt = _buildCapitalsPrompt({
      discoveryCount: plan.discoveryCount,
      ageBracket,
      recentAnswers,
      themePreference,
      interests: resolvedInterests,
      libraryTopics: topicTitles,
      ageYears,
      recentStruggles: resolvedStruggles,
      recentlyMissedItems,
    });
    if (difficultyBump) {
      prompt +=
        '\n\nDIFFICULTY BUMP: The learner is on a streak. Choose lesser-known countries. Distractors should be from the same region as the correct answer.';
      logger.info('quiz_round.difficulty_bump.applied', {
        profileId,
        activityType,
      });
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the quiz round.' },
    ];

    const llmResult = await routeAndCallForQuiz(messages, 1, {
      ageBracket,
    });

    const raw = llmResult.response.slice(0, 64 * 1024);

    let llmOutput;
    try {
      llmOutput = capitalsLlmOutputSchema.parse(
        JSON.parse(extractJsonObject(raw)),
      );
    } catch (parseErr) {
      captureException(
        parseErr instanceof Error
          ? parseErr
          : new Error('Quiz LLM parse failed'),
        {
          userId: undefined,
          profileId,
          requestPath: 'services/quiz/generate-round',
        },
      );
      throw new UpstreamLlmError('Quiz LLM returned invalid structured output');
    }

    const validated = validateCapitalsRound(llmOutput);
    if (validated.questions.length === 0) {
      throw new UpstreamLlmError('No valid questions after validation');
    }

    const discoveryQuestions: CapitalsQuestion[] = validated.questions
      .slice(0, plan.discoveryCount)
      .map((question) => ({
        type: 'capitals',
        country: question.country,
        correctAnswer: question.correctAnswer,
        acceptedAliases: question.acceptedAliases,
        distractors: question.distractors,
        funFact: question.funFact,
        isLibraryItem: false,
      }));

    questions = injectMasteryQuestions(
      discoveryQuestions,
      plan.masteryItems,
      activityType,
    );
    theme = validated.theme;
  } else if (activityType === 'vocabulary') {
    if (!languageCode || !cefrCeiling) {
      // [BUG-543] VocabularyContextError so the quiz route catches it as 400
      throw new VocabularyContextError(
        'languageCode and cefrCeiling are required for vocabulary rounds',
      );
    }

    const effectiveCefrCeiling = difficultyBump
      ? nextCefrLevel(cefrCeiling)
      : cefrCeiling;

    const prompt = buildVocabularyPrompt({
      discoveryCount: plan.discoveryCount,
      ageBracket,
      recentAnswers,
      bankEntries: allVocabulary ?? [],
      languageCode,
      cefrCeiling: effectiveCefrCeiling,
      themePreference,
      interests: resolvedInterests,
      libraryTopics: topicTitles,
      ageYears,
      learnerNativeLanguage: resolvedNativeLanguage,
      recentStruggles: resolvedStruggles,
      recentlyMissedItems,
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the quiz round.' },
    ];

    const llmResult = await routeAndCallForQuiz(messages, 1, {
      ageBracket,
    });

    const raw = llmResult.response.slice(0, 64 * 1024);

    let llmOutput;
    try {
      llmOutput = vocabularyLlmOutputSchema.parse(
        JSON.parse(extractJsonObject(raw)),
      );
    } catch (parseErr) {
      captureException(
        parseErr instanceof Error
          ? parseErr
          : new Error('Quiz LLM parse failed'),
        {
          userId: undefined,
          profileId,
          requestPath: 'services/quiz/generate-round',
          extra: { activityType },
        },
      );
      throw new UpstreamLlmError('Quiz LLM returned invalid structured output');
    }

    const validated = validateVocabularyRound(llmOutput, effectiveCefrCeiling);
    if (validated.questions.length === 0) {
      throw new UpstreamLlmError('No valid questions after validation');
    }

    const discoveryQuestions = buildVocabularyDiscoveryQuestions({
      questions: validated.questions.slice(0, plan.discoveryCount),
    });
    const masteryQuestions = plan.masteryItems.flatMap((item) => {
      const result = buildVocabularyMasteryQuestion(
        item,
        allVocabulary ?? [],
        item.cefrLevel ?? effectiveCefrCeiling,
      );
      return result.ok ? [result.question] : [];
    });

    questions = injectAtRandomPositions(discoveryQuestions, masteryQuestions);
    theme = validated.theme;
  } else if (activityType === 'guess_who') {
    let prompt = buildGuessWhoPrompt({
      discoveryCount: plan.discoveryCount,
      ageBracket,
      recentAnswers,
      topicTitles,
      themePreference,
      interests: resolvedInterests,
      libraryTopics: topicTitles,
      ageYears,
      recentStruggles: resolvedStruggles,
      recentlyMissedItems,
    });
    if (difficultyBump) {
      prompt +=
        '\n\nDIFFICULTY BUMP: The learner is on a streak. Choose less famous historical figures. Make clue 1 and 2 significantly harder.';
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the quiz round.' },
    ];

    const llmResult = await routeAndCallForQuiz(messages, 1, {
      ageBracket,
    });

    const raw = llmResult.response.slice(0, 64 * 1024);

    let llmOutput;
    try {
      llmOutput = guessWhoLlmOutputSchema.parse(
        JSON.parse(extractJsonObject(raw)),
      );
    } catch (parseErr) {
      captureException(
        parseErr instanceof Error
          ? parseErr
          : new Error('Quiz LLM parse failed'),
        {
          userId: undefined,
          profileId,
          requestPath: 'services/quiz/generate-round',
          extra: { activityType },
        },
      );
      throw new UpstreamLlmError('Quiz LLM returned invalid structured output');
    }

    const validated = validateGuessWhoRound(llmOutput);
    if (validated.questions.length === 0) {
      throw new UpstreamLlmError('No valid questions after validation');
    }

    const discoveryQuestions = buildGuessWhoDiscoveryQuestions({
      questions: validated.questions.slice(0, plan.discoveryCount),
    });

    // Inject mastery items with fresh LLM-generated clues
    if (plan.masteryItems.length > 0) {
      const masteryQuestions: GuessWhoQuestion[] = [];
      for (const item of plan.masteryItems) {
        const cluePrompt = buildGuessWhoMasteryCluePrompt(
          item.answer,
          ageBracket,
        );
        const clueMessages: ChatMessage[] = [
          { role: 'system', content: cluePrompt },
          { role: 'user', content: 'Generate clues for this person.' },
        ];

        try {
          const clueResult = await routeAndCallForQuiz(clueMessages, 1, {
            ageBracket,
          });
          const clueRaw = clueResult.response.slice(0, 16 * 1024);
          const parsed = guessWhoMasteryClueSchema.parse(
            JSON.parse(extractJsonObject(clueRaw)),
          );
          if (
            parsed.clues.length === 5 &&
            parsed.mcFallbackOptions.length === 4
          ) {
            masteryQuestions.push({
              type: 'guess_who',
              canonicalName: item.answer,
              correctAnswer: item.answer,
              acceptedAliases: appendSurnameAlias(
                item.answer,
                parsed.acceptedAliases,
              ),
              clues: parsed.clues,
              mcFallbackOptions: parsed.mcFallbackOptions,
              funFact: '',
              isLibraryItem: true,
            });
          }
        } catch {
          // If LLM fails for this mastery item, skip — don't block the round
          continue;
        }
      }
      questions = injectAtRandomPositions(discoveryQuestions, masteryQuestions);
    } else {
      questions = discoveryQuestions;
    }
    theme = validated.theme;
  } else {
    // Exhaustive check — TypeScript narrows to `never` here. If a new
    // activity type is added to the schema without a handler, this line
    // produces a compile error rather than a silent runtime 502.
    const _exhaustive: never = activityType;
    throw new Error(`Unsupported quiz activity type: ${_exhaustive}`);
  }

  const round = assembleRound(theme, questions);

  const repo = createScopedRepository(db, profileId);
  const inserted = await repo.quizRounds.insert({
    subjectId: subjectId ?? null,
    activityType,
    theme: round.theme,
    questions: round.questions,
    total: round.total,
    libraryQuestionIndices: round.libraryQuestionIndices,
    status: 'active',
    // [BUG-926] Persist the language being practised so aggregateCompletedStats
    // can group by (activityType, languageCode). NULL for non-vocabulary rounds.
    languageCode: activityType === 'vocabulary' ? (languageCode ?? null) : null,
  });

  if (!inserted) {
    throw new Error('Failed to persist quiz round');
  }

  // Mark the surfaced misses as seen so they don't get re-injected into the
  // next round. Best-effort: don't fail the quiz request if this errors.
  if (missedRows.length > 0) {
    try {
      await markMissedItemsSurfaced(db, profileId, activityType);
    } catch (error) {
      logger.warn('quiz.missed_items.mark_surfaced_failed', {
        activityType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    id: inserted.id,
    theme: round.theme,
    questions: round.questions,
    total: round.total,
    difficultyBump,
  };
}

/**
 * Extract a prompt-friendly label from a stored missed-item row. The prompts
 * just need a short noun (country / target-language term / person name), not
 * the full "What is the capital of …?" question text.
 */
function extractMissedItemLabel(
  questionText: string,
  correctAnswer: string,
  activityType: QuizActivityType,
): string {
  if (activityType === 'capitals') {
    const match = questionText.match(/^What is the capital of (.+?)\?$/);
    return match?.[1]?.trim() ?? correctAnswer;
  }
  if (activityType === 'vocabulary') {
    const match = questionText.match(/^Translate:\s*(.+)$/);
    return match?.[1]?.trim() ?? correctAnswer;
  }
  // guess_who — use the canonical name (correctAnswer) since the clue text
  // would leak the whole prompt. Never include the clue.
  return correctAnswer;
}
