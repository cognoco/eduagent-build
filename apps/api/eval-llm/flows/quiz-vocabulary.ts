import {
  buildVocabularyPrompt,
  type VocabularyPromptParams,
} from '../../src/services/quiz/vocabulary-provider';
import type { CefrLevel } from '@eduagent/schemas';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Quiz: Vocabulary
//
// Only applies to profiles with a targetLanguage (non-null). Returns null
// from buildPromptInput otherwise, which the runner records as "skipped".
// ---------------------------------------------------------------------------

function ageYearsToBracket(ageYears: number): 'child' | 'adolescent' | 'adult' {
  if (ageYears <= 9) return 'child';
  if (ageYears <= 13) return 'adolescent';
  return 'adult';
}

function toCefrLevel(raw: string | undefined): CefrLevel | null {
  if (!raw) return null;
  if (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(raw))
    return raw as CefrLevel;
  return null;
}

export const vocabularyFlow: FlowDefinition<VocabularyPromptParams> = {
  id: 'quiz-vocabulary',
  name: 'Quiz — Vocabulary',
  sourceFile:
    'apps/api/src/services/quiz/vocabulary-provider.ts:buildVocabularyPrompt',

  buildPromptInput(profile: EvalProfile): VocabularyPromptParams | null {
    if (!profile.targetLanguage) return null;
    const cefr = toCefrLevel(profile.cefrLevel) ?? 'A1';
    return {
      discoveryCount: 6,
      ageBracket: ageYearsToBracket(profile.ageYears),
      recentAnswers: profile.recentQuizAnswers.vocabulary,
      bankEntries: [], // no bank state in fixtures yet — simulating a fresh learner
      languageCode: profile.targetLanguage,
      cefrCeiling: cefr,
      themePreference: undefined,
    };
  },

  buildPrompt(input: VocabularyPromptParams): PromptMessages {
    const system = buildVocabularyPrompt(input);
    return {
      system,
      user: 'Generate the quiz round.',
      notes: [
        `Uses languageCode=${input.languageCode} and cefrCeiling=${input.cefrCeiling}.`,
        `Interests NOT passed (gap flagged in audit P0) — theme picked blindly.`,
        `Native language NOT passed — distractors won't be L1-aware.`,
        `Struggles + missed-items NOT passed (gap flagged in audit P1).`,
      ],
    };
  },
};
