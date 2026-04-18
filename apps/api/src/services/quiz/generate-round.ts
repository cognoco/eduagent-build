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
import type { ChatMessage } from '../llm';
import { routeAndCall } from '../llm';
import { captureException } from '../sentry';
import { UpstreamLlmError } from '../../errors';
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
  buildGuessWhoDiscoveryQuestions,
  buildGuessWhoMasteryCluePrompt,
  buildGuessWhoPrompt,
  guessWhoMasteryClueSchema,
  validateGuessWhoRound,
} from './guess-who-provider';
import { describeAgeBracket, type AgeBracket } from './config';

interface CapitalsPromptParams {
  discoveryCount: number;
  ageBracket: AgeBracket;
  recentAnswers: string[];
  themePreference?: string;
}

export function buildCapitalsPrompt(params: CapitalsPromptParams): string {
  const { discoveryCount, ageBracket, recentAnswers, themePreference } = params;
  const ageLabel = describeAgeBracket(ageBracket);
  const exclusions =
    recentAnswers.length > 0
      ? `Do NOT include questions about these recently seen capitals: ${recentAnswers.join(
          ', '
        )}`
      : 'No exclusions.';
  const themeInstruction = themePreference
    ? `Theme: "${themePreference}"`
    : 'Choose an age-appropriate theme (e.g. "Central European Capitals").';

  return `You are generating a multiple-choice capitals quiz for a ${ageLabel} learner.

Activity: Capitals quiz
${themeInstruction}
Questions needed: exactly ${discoveryCount}

${exclusions}

Rules:
- Generate exactly ${discoveryCount} questions
- Each question must have exactly 3 distractors
- Distractors must be plausible city names
- Fun facts should be surprising, age-appropriate, and one sentence maximum
- Keep the theme coherent across the full round

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "questions": [
    {
      "country": "Country Name",
      "correctAnswer": "Capital City",
      "distractors": ["City A", "City B", "City C"],
      "funFact": "One surprising fact about this capital."
    }
  ]
}`;
}

function buildMasteryDistractors(correctAnswer: string): string[] {
  const pool = CAPITALS_DATA.filter(
    (entry) => entry.capital.toLowerCase() !== correctAnswer.toLowerCase()
  );
  return shuffle(pool)
    .slice(0, 3)
    .map((entry) => entry.capital);
}

export function injectMasteryQuestions(
  discoveryQuestions: CapitalsQuestion[],
  masteryItems: LibraryItem[],
  activityType: QuizActivityType
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
  questions: QuizQuestion[]
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
 * Extract the first balanced JSON object from an LLM response. Handles
 * triple-backtick fences (```json ... ```) AND stray prose preamble by
 * walking brace depth until the first complete object closes. Avoids the
 * greedy `/\{[\s\S]*\}/` regex which mis-matches when the response contains
 * multiple objects or has trailing prose.
 */
export function extractJsonObject(response: string): string {
  // Strip markdown code-fence wrappers if present.
  const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenceMatch?.[1] ?? response).trim();

  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return body.slice(start, i + 1);
      }
    }
  }

  throw new UpstreamLlmError('Quiz LLM returned no JSON object');
}

interface GenerateParams {
  db: Database;
  profileId: string;
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
  } = params;

  const plan = resolveRoundContent({
    activityType,
    profileId,
    recentAnswers,
    libraryItems,
  });
  const ageBracket = birthYear == null ? 'adult' : computeAgeBracket(birthYear);
  let theme = '';
  let questions: QuizQuestion[] = [];

  if (activityType === 'capitals') {
    let prompt = buildCapitalsPrompt({
      discoveryCount: plan.discoveryCount,
      ageBracket,
      recentAnswers,
      themePreference,
    });
    if (difficultyBump) {
      prompt +=
        '\n\nDIFFICULTY BUMP: The learner is on a streak. Choose lesser-known countries. Distractors should be from the same region as the correct answer.';
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the quiz round.' },
    ];

    const llmResult = await routeAndCall(messages, 1, {
      ageBracket,
    });

    const raw = llmResult.response.slice(0, 64 * 1024);

    let llmOutput;
    try {
      llmOutput = capitalsLlmOutputSchema.parse(
        JSON.parse(extractJsonObject(raw))
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
        }
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
      activityType
    );
    theme = validated.theme;
  } else if (activityType === 'vocabulary') {
    if (!languageCode || !cefrCeiling) {
      throw new Error(
        'languageCode and cefrCeiling are required for vocabulary rounds'
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
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the quiz round.' },
    ];

    const llmResult = await routeAndCall(messages, 1, {
      ageBracket,
    });

    const raw = llmResult.response.slice(0, 64 * 1024);

    let llmOutput;
    try {
      llmOutput = vocabularyLlmOutputSchema.parse(
        JSON.parse(extractJsonObject(raw))
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
        }
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
        item.cefrLevel ?? effectiveCefrCeiling
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
    });
    if (difficultyBump) {
      prompt +=
        '\n\nDIFFICULTY BUMP: The learner is on a streak. Choose less famous historical figures. Make clue 1 and 2 significantly harder.';
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the quiz round.' },
    ];

    const llmResult = await routeAndCall(messages, 1, {
      ageBracket,
    });

    const raw = llmResult.response.slice(0, 64 * 1024);

    let llmOutput;
    try {
      llmOutput = guessWhoLlmOutputSchema.parse(
        JSON.parse(extractJsonObject(raw))
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
        }
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
          ageBracket
        );
        const clueMessages: ChatMessage[] = [
          { role: 'system', content: cluePrompt },
          { role: 'user', content: 'Generate clues for this person.' },
        ];

        try {
          const clueResult = await routeAndCall(clueMessages, 1, {
            ageBracket,
          });
          const clueRaw = clueResult.response.slice(0, 16 * 1024);
          const parsed = guessWhoMasteryClueSchema.parse(
            JSON.parse(extractJsonObject(clueRaw))
          );
          if (
            parsed.clues.length === 5 &&
            parsed.mcFallbackOptions.length === 4
          ) {
            masteryQuestions.push({
              type: 'guess_who',
              canonicalName: item.answer,
              correctAnswer: item.answer,
              acceptedAliases: parsed.acceptedAliases,
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
    activityType,
    theme: round.theme,
    questions: round.questions,
    total: round.total,
    libraryQuestionIndices: round.libraryQuestionIndices,
    status: 'active',
  });

  if (!inserted) {
    throw new Error('Failed to persist quiz round');
  }

  return {
    id: inserted.id,
    theme: round.theme,
    questions: round.questions,
    total: round.total,
    difficultyBump,
  };
}
