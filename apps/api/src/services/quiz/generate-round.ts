import {
  capitalsLlmOutputSchema,
  computeAgeBracket,
  type CapitalsQuestion,
  type QuizActivityType,
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

interface CapitalsPromptParams {
  discoveryCount: number;
  ageBracket: 'child' | 'adolescent' | 'adult';
  recentAnswers: string[];
  themePreference?: string;
}

function describeAgeBracket(
  ageBracket: CapitalsPromptParams['ageBracket']
): string {
  switch (ageBracket) {
    case 'child':
      return '6-9';
    case 'adolescent':
      return '10-13';
    default:
      return '14+';
  }
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

  const combined = [...discoveryQuestions];

  for (const item of masteryItems) {
    const reference = CAPITALS_BY_COUNTRY.get(item.question.toLowerCase());
    const masteryQuestion: CapitalsQuestion = {
      type: 'capitals',
      country: reference?.country ?? item.question,
      correctAnswer: reference?.capital ?? item.answer,
      acceptedAliases: reference?.acceptedAliases ?? [item.answer],
      distractors: buildMasteryDistractors(reference?.capital ?? item.answer),
      funFact: reference?.funFact ?? '',
      isLibraryItem: true,
      topicId: item.topicId ?? undefined,
    };

    const insertIndex = Math.floor(Math.random() * (combined.length + 1));
    combined.splice(insertIndex, 0, masteryQuestion);
  }

  return combined;
}

export interface AssembledRound {
  theme: string;
  questions: CapitalsQuestion[];
  total: number;
  libraryQuestionIndices: number[];
}

export function assembleRound(
  theme: string,
  questions: CapitalsQuestion[]
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
}

export async function generateQuizRound(params: GenerateParams): Promise<{
  id: string;
  theme: string;
  questions: CapitalsQuestion[];
  total: number;
}> {
  const {
    db,
    profileId,
    activityType,
    birthYear,
    themePreference,
    libraryItems,
    recentAnswers,
  } = params;

  if (activityType !== 'capitals') {
    throw new UpstreamLlmError(
      `Unsupported quiz activity type: ${activityType}`
    );
  }

  const plan = resolveRoundContent({
    activityType,
    profileId,
    recentAnswers,
    libraryItems,
  });

  const prompt = buildCapitalsPrompt({
    discoveryCount: plan.discoveryCount,
    ageBracket: birthYear == null ? 'adult' : computeAgeBracket(birthYear),
    recentAnswers,
    themePreference,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Generate the quiz round.' },
  ];

  const llmResult = await routeAndCall(messages, 1, {
    ageBracket: birthYear == null ? 'adult' : computeAgeBracket(birthYear),
  });

  // Clamp the raw response before parsing — defends against pathological
  // provider output sizes even if maxOutputTokens is mis-configured.
  const raw = llmResult.response.slice(0, 64 * 1024);

  let llmOutput;
  try {
    llmOutput = capitalsLlmOutputSchema.parse(
      JSON.parse(extractJsonObject(raw))
    );
  } catch (parseErr) {
    // Capture the raw failure for LLM drift monitoring instead of silently
    // swallowing it with a bare `catch {}`.
    captureException(
      parseErr instanceof Error ? parseErr : new Error('Quiz LLM parse failed'),
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

  const questions = injectMasteryQuestions(
    discoveryQuestions,
    plan.masteryItems,
    activityType
  );
  const round = assembleRound(validated.theme, questions);

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
  };
}
