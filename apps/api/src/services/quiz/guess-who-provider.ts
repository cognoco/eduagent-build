import type { GuessWhoLlmOutput, GuessWhoQuestion } from '@eduagent/schemas';
import { describeAgeBracket, type AgeBracket } from './config';

export interface GuessWhoPromptParams {
  discoveryCount: number;
  ageBracket: AgeBracket;
  recentAnswers: string[];
  topicTitles?: string[];
  themePreference?: string;
}

export interface ValidatedGuessWhoQuestion {
  canonicalName: string;
  acceptedAliases: string[];
  clues: string[];
  mcFallbackOptions: string[];
  funFact: string;
}

export interface ValidatedGuessWhoRound {
  theme: string;
  questions: ValidatedGuessWhoQuestion[];
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(trimmed);
  }

  return deduped;
}

function normalizeForNameScan(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clueMentionsGuessWhoName(
  clue: string,
  names: string[]
): boolean {
  const normalizedClue = normalizeForNameScan(clue);
  if (!normalizedClue) return false;

  return names.some((name) => {
    const normalizedName = normalizeForNameScan(name);
    if (!normalizedName) return false;
    return normalizedClue.includes(normalizedName);
  });
}

function ensureCanonicalInFallbackOptions(
  canonicalName: string,
  mcFallbackOptions: string[]
): string[] {
  const canonicalLower = canonicalName.trim().toLowerCase();
  const distractors = dedupeCaseInsensitive(mcFallbackOptions).filter(
    (option) => option.toLowerCase() !== canonicalLower
  );

  if (distractors.length < 3) return [];

  const options = distractors.slice(0, 3);
  // Insert canonical at a fixed position — the client shuffles options before
  // displaying, so server-side randomisation is redundant and hurts testability.
  options.splice(0, 0, canonicalName);
  return options;
}

export function buildGuessWhoPrompt(params: GuessWhoPromptParams): string {
  const {
    discoveryCount,
    ageBracket,
    recentAnswers,
    topicTitles = [],
    themePreference,
  } = params;
  const ageLabel = describeAgeBracket(ageBracket);
  const recentExclusions =
    recentAnswers.length > 0
      ? `Do NOT repeat these recently seen people: ${recentAnswers.join(', ')}`
      : 'No recent-person exclusions.';
  const topicHintText =
    topicTitles.length > 0
      ? `Topic hints from the learner's active curriculum: ${topicTitles
          .slice(0, 30)
          .join('; ')}. At least ${Math.min(
          2,
          discoveryCount
        )} of the ${discoveryCount} people MUST relate clearly to one or more of those topics.`
      : 'No topic hints are available. Choose an age-appropriate mix of widely recognizable people.';
  const themeInstruction = themePreference
    ? `Theme: "${themePreference}"`
    : 'Choose an age-appropriate theme (for example "Famous Scientists" or "Important World Leaders").';

  return `You are generating a clue-by-clue Guess Who quiz for a ${ageLabel} learner.

Activity: Guess Who
${themeInstruction}
Questions needed: exactly ${discoveryCount}

${recentExclusions}
${topicHintText}

Rules:
- Generate exactly ${discoveryCount} questions.
- Each question must be a real famous person who is broadly appropriate for a young learner.
- acceptedAliases must include common learner-typed variants such as surnames, titles, or short forms.
- clues must contain exactly 5 clues and get progressively easier from clue 1 to clue 5.
- clue 1 should be broad, clue 5 should be close to a giveaway.
- NEVER mention the person's canonical name or any accepted alias inside any clue.
- mcFallbackOptions must contain exactly 4 names total: the correct answer plus 3 plausible distractors from a related domain, era, or category.
- funFact should be a single short sentence under 200 characters.

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "questions": [
    {
      "canonicalName": "Isaac Newton",
      "acceptedAliases": ["Newton", "Sir Isaac Newton"],
      "clues": ["Clue 1", "Clue 2", "Clue 3", "Clue 4", "Clue 5"],
      "mcFallbackOptions": ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Nikola Tesla"],
      "funFact": "One short fact."
    }
  ]
}`;
}

export function validateGuessWhoRound(
  llmOutput: GuessWhoLlmOutput
): ValidatedGuessWhoRound {
  const questions = llmOutput.questions.flatMap((question) => {
    const canonicalName = question.canonicalName.trim();
    if (!canonicalName) return [];

    const acceptedAliasesRaw = dedupeCaseInsensitive(question.acceptedAliases);
    const acceptedAliases =
      acceptedAliasesRaw.length > 0 ? acceptedAliasesRaw : [canonicalName];
    const clues = question.clues.map((clue) => clue.trim());
    const funFact = question.funFact.trim();

    if (clues.length !== 5 || clues.some((clue) => !clue)) return [];

    const namesToBlock = [canonicalName, ...acceptedAliases];
    if (clues.some((clue) => clueMentionsGuessWhoName(clue, namesToBlock))) {
      return [];
    }

    const mcFallbackOptions = ensureCanonicalInFallbackOptions(
      canonicalName,
      question.mcFallbackOptions
    );
    if (mcFallbackOptions.length !== 4) return [];

    return [
      {
        canonicalName,
        acceptedAliases,
        clues,
        mcFallbackOptions,
        funFact,
      } satisfies ValidatedGuessWhoQuestion,
    ];
  });

  return {
    theme: llmOutput.theme.trim() || 'Guess Who',
    questions,
  };
}

export function buildGuessWhoDiscoveryQuestions(validated: {
  questions: ValidatedGuessWhoQuestion[];
}): GuessWhoQuestion[] {
  return validated.questions.map((question) => ({
    type: 'guess_who',
    canonicalName: question.canonicalName,
    correctAnswer: question.canonicalName,
    acceptedAliases: question.acceptedAliases,
    clues: question.clues,
    mcFallbackOptions: question.mcFallbackOptions,
    funFact: question.funFact,
    isLibraryItem: false,
  }));
}
