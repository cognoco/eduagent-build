import { z } from 'zod';
import type { GuessWhoLlmOutput, GuessWhoQuestion } from '@eduagent/schemas';
import { describeAgeBracket, type AgeBracket, type Interest } from './config';

export interface GuessWhoPromptParams {
  discoveryCount: number;
  ageBracket: AgeBracket;
  recentAnswers: string[];
  topicTitles?: string[];
  themePreference?: string;
  interests?: Interest[];
  libraryTopics?: string[];
  ageYears?: number;
  /**
   * Subject-scoped struggle topics from the learner's profile. When provided,
   * the prompt nudges the LLM to prefer people/themes that reinforce these
   * weaker areas, without forcing topical alignment when it would be awkward.
   * [P1-4]
   */
  recentStruggles?: string[];
  /**
   * Recently missed people (surfaced=false) — quiz_missed_items entries for
   * prior guess-who rounds. The prompt asks the LLM to re-surface them when
   * the chosen theme fits naturally. [P1 — quiz_missed_items wiring]
   */
  recentlyMissedItems?: string[];
}

export interface ValidatedGuessWhoQuestion {
  canonicalName: string;
  acceptedAliases: string[];
  era?: string;
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
    interests = [],
    libraryTopics = [],
    ageYears,
    recentStruggles = [],
    recentlyMissedItems = [],
  } = params;
  const ageLabel =
    ageYears !== undefined
      ? `${ageYears}-year-old`
      : describeAgeBracket(ageBracket);
  const recentExclusions =
    recentAnswers.length > 0
      ? `Do NOT repeat these recently seen people: ${recentAnswers.join(', ')}`
      : 'No recent-person exclusions.';

  // Merge topicTitles + libraryTopics (dedup, library topics appended)
  const allTopics = Array.from(new Set([...topicTitles, ...libraryTopics]));
  const topicHintText =
    allTopics.length > 0
      ? `Topic hints from the learner's active curriculum: ${allTopics
          .slice(0, 30)
          .join('; ')}. At least ${Math.min(
          2,
          discoveryCount
        )} of the ${discoveryCount} people MUST relate clearly to one or more of those topics.`
      : 'No topic hints are available. Choose an age-appropriate mix of widely recognizable people.';

  let themeInstruction: string;
  if (themePreference) {
    themeInstruction = `Theme: "${themePreference}"`;
  } else if (interests.length > 0) {
    const interestLabels = interests
      .filter((i) => i.context === 'free_time' || i.context === 'both')
      .map((i) => i.label);
    const allLabels =
      interestLabels.length > 0
        ? interestLabels
        : interests.map((i) => i.label);
    themeInstruction = `Choose a theme of famous people connected to the learner's interests: ${allLabels
      .slice(0, 5)
      .join(', ')}.`;
  } else {
    themeInstruction =
      'Choose an age-appropriate theme (for example "Famous Scientists" or "Important World Leaders").';
  }

  const struggleHint =
    recentStruggles.length > 0
      ? `\nRecent weaker areas for this learner: ${recentStruggles
          .slice(0, 10)
          .join(
            '; '
          )}. Where a naturally fitting figure exists, prefer people who help revisit these topics — but do not force a weak connection if none exists.`
      : '';

  const missedHint =
    recentlyMissedItems.length > 0
      ? `\nRecently missed people (re-surface where the theme fits): ${recentlyMissedItems
          .slice(0, 8)
          .join(
            ', '
          )}. Include at least one of these as a question when the chosen theme naturally accommodates them.`
      : '';

  return `You are generating a clue-by-clue Guess Who quiz for a ${ageLabel} learner.

Activity: Guess Who
${themeInstruction}
Questions needed: exactly ${discoveryCount}

${recentExclusions}
${topicHintText}${struggleHint}${missedHint}

Rules:
- Generate exactly ${discoveryCount} questions.
- Each question must be a real famous person who is broadly appropriate for a young learner.
- acceptedAliases must include common learner-typed variants such as surnames, titles, or short forms.
- clues must contain exactly 5 clues and get progressively easier from clue 1 to clue 5.
- clue 1 should be broad, clue 5 should be close to a giveaway.
- NEVER mention the person's canonical name or any accepted alias inside any clue.
- mcFallbackOptions must contain exactly 4 names total: the correct answer plus 3 plausible distractors from a related domain, era, or category.
- funFact should be a single short sentence under 200 characters.
- Include the person's era or century (e.g. "17th century", "19th century", "5th century BCE").

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "questions": [
    {
      "canonicalName": "Isaac Newton",
      "era": "17th century",
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
        era: question.era?.trim() || undefined,
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
    era: question.era,
    clues: question.clues,
    mcFallbackOptions: question.mcFallbackOptions,
    funFact: question.funFact,
    isLibraryItem: false,
  }));
}

// ─── Mastery clue generation ────────────────────────────────────────────

export const guessWhoMasteryClueSchema = z.object({
  clues: z.array(z.string().max(200)).length(5),
  acceptedAliases: z.array(z.string()).min(1),
  mcFallbackOptions: z.array(z.string()).length(4),
});

export function buildGuessWhoMasteryCluePrompt(
  canonicalName: string,
  ageBracket: AgeBracket
): string {
  const ageLabel = describeAgeBracket(ageBracket);
  return `Generate 5 progressive clues for a Guess Who quiz about "${canonicalName}" for a ${ageLabel} learner.

Rules:
- Clue 1 = hardest (broad context), clue 5 = near-giveaway
- NEVER mention "${canonicalName}" or any common variant in any clue
- Also provide accepted aliases (common names/titles the learner might type)
- Provide exactly 4 mcFallbackOptions: "${canonicalName}" plus 3 plausible distractors from a related domain/era

Respond with ONLY valid JSON:
{
  "clues": ["Clue 1", "Clue 2", "Clue 3", "Clue 4", "Clue 5"],
  "acceptedAliases": ["${canonicalName}", "Alias1"],
  "mcFallbackOptions": ["${canonicalName}", "Distractor1", "Distractor2", "Distractor3"]
}`;
}
