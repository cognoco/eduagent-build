// ---------------------------------------------------------------------------
// Graded-input generation prompt builder (WI-1547).
//
// Builds the prompt that asks the model to write a short reading/listening
// passage in the learner's target language, using only their known + target
// vocabulary, at their CEFR level, optionally woven around a stated interest.
// This is a ONE-SHOT structured-generation call — not the conversational
// four-strands tutor turn. It replaces the deterministic seed-passage
// template (`buildSeedPassage` in language-session-engine.ts) as the primary
// path; that template remains as the fallback when this call fails.
//
// Data minimization: only known/target vocabulary, CEFR level, language code,
// and (optionally) one learner interest reach the model — no profile IDs,
// session history, or other learner data.
//
// [PROMPT-INJECT] known/target words and interests are learner-influenced
// free text (vocabulary rows are LLM-extracted from prior turns; interests
// are profile-entered). Every value is sanitized via `sanitizeXmlValue`
// before interpolation, matching `language-prompts.ts`.
// ---------------------------------------------------------------------------

import type { CefrLevel } from '@eduagent/schemas';
import type { ChatMessage } from './llm';
import { sanitizeXmlValue } from './llm/sanitize';
import { getLanguageByCode } from '../data/languages';

export interface GradedInputGenerationPromptInput {
  /** ISO-ish language code the passage must be written in (e.g. 'es', 'fr'). */
  languageCode?: string;
  /** Learner's current CEFR level; defaults to A1 framing when absent. */
  cefrLevel?: CefrLevel | null;
  /** Vocabulary the learner already knows (mastered). */
  knownWords: string[];
  /** Vocabulary the learner is currently learning (not yet mastered). */
  targetWords: string[];
  /** Whether this artifact is for reading or listening. */
  modality: 'reading' | 'listening';
  /** Optional learner interests to make the passage more engaging. */
  interests?: string[];
}

function describeLanguage(languageCode?: string): string {
  if (!languageCode) return 'the target language';
  const entry = getLanguageByCode(languageCode);
  const name = entry?.names[0];
  if (!name) return languageCode;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function formatVocabLine(label: string, words: string[]): string {
  if (words.length === 0) return `${label}: NONE`;
  const safe = words
    .slice(0, 12)
    .map((w) => sanitizeXmlValue(w, 60))
    .filter((w) => w.length > 0)
    .join(', ');
  return `${label}: ${safe}`;
}

function buildSystemPrompt(): string {
  return [
    'You are a language-learning content writer. Your only task is to write a',
    'short passage for a learner to read or hear, using ONLY the vocabulary you',
    'are given, plus one or two comprehension questions about that passage.',
    '',
    'Rules:',
    '1. Use ONLY vocabulary from the known-words and target-words lists provided,',
    '   plus basic function words (articles, pronouns, conjunctions, common verbs',
    '   like "to be"/"to have") that are unavoidable for grammar. Do NOT introduce',
    '   other content words, names, or topics not implied by the provided vocabulary',
    '   and interests.',
    '2. If the known-words list is empty, treat the learner as a complete beginner:',
    '   write the simplest possible passage using target words plus minimal',
    '   grammar glue, introducing each target word naturally.',
    '3. Keep the passage short: 2-5 sentences.',
    '4. Write EXACTLY ONE comprehension question in the SAME target language,',
    '   with a short answerHint (a phrase or sentence from the passage that',
    '   answers it).',
    '',
    'Return ONLY a single JSON object — no prose, no explanation, no code fence,',
    'nothing before or after it. The object must have EXACTLY this shape:',
    '{',
    '  "text": "<the passage, in the target language>",',
    '  "comprehensionQuestions": [',
    '    { "prompt": "<question, in the target language>", "answerHint": "<short answer hint>" }',
    '  ]',
    '}',
  ].join('\n');
}

function buildUserPrompt(input: GradedInputGenerationPromptInput): string {
  const languageName = describeLanguage(input.languageCode);
  const cefr = input.cefrLevel ?? 'A1';
  const interestsLine =
    input.interests && input.interests.length > 0
      ? `Learner interests (weave in loosely if it fits naturally, do not force it): ${input.interests
          .slice(0, 5)
          .map((i) => sanitizeXmlValue(i, 60))
          .filter((i) => i.length > 0)
          .join(', ')}`
      : 'Learner interests: none provided.';

  return [
    `Write the passage in ${languageName}.`,
    `CEFR level: ${cefr}.`,
    `Modality: ${input.modality} (${input.modality === 'listening' ? 'will be read aloud by the app' : 'will be read silently'}).`,
    formatVocabLine('Known vocabulary', input.knownWords),
    formatVocabLine(
      'Target vocabulary (must appear in the passage)',
      input.targetWords,
    ),
    interestsLine,
  ].join('\n');
}

/**
 * Build the graded-input generation prompt as a system+user ChatMessage pair,
 * ready to pass to the LLM router.
 */
export function buildGradedInputGenerationPrompt(
  input: GradedInputGenerationPromptInput,
): ChatMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(input) },
  ];
}
