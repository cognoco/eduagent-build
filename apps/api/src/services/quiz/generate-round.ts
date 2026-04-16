import {
  capitalsLlmOutputSchema,
  computeAgeBracket,
  type CapitalsQuestion,
  type QuizActivityType,
} from '@eduagent/schemas';
import { quizRounds, type Database } from '@eduagent/database';
import type { ChatMessage } from '../llm';
import { routeAndCall } from '../llm';
import { CAPITALS_BY_COUNTRY, CAPITALS_DATA } from './capitals-data';
import { resolveRoundContent, type LibraryItem } from './content-resolver';
import { validateCapitalsRound } from './capitals-validation';

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
  return CAPITALS_DATA.filter(
    (entry) => entry.capital.toLowerCase() !== correctAnswer.toLowerCase()
  )
    .sort(() => Math.random() - 0.5)
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

function extractJsonObject(response: string): string {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Quiz LLM returned no JSON');
  }
  return jsonMatch[0];
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
    throw new Error(`Unsupported quiz activity type: ${activityType}`);
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

  let llmOutput;
  try {
    llmOutput = capitalsLlmOutputSchema.parse(
      JSON.parse(extractJsonObject(llmResult.response))
    );
  } catch {
    throw new Error('Quiz LLM returned invalid structured output');
  }

  const validated = validateCapitalsRound(llmOutput);
  if (validated.questions.length === 0) {
    throw new Error('No valid questions after validation');
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

  const [inserted] = await db
    .insert(quizRounds)
    .values({
      profileId,
      activityType,
      theme: round.theme,
      questions: round.questions,
      total: round.total,
      libraryQuestionIndices: round.libraryQuestionIndices,
      status: 'active',
    })
    .returning({ id: quizRounds.id });

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
