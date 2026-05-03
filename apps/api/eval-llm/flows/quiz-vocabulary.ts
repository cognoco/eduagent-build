import {
  buildVocabularyPrompt,
  type VocabularyPromptParams,
} from '../../src/services/quiz/vocabulary-provider';
import type { Interest } from '../../src/services/quiz/config';
import type { CefrLevel } from '@eduagent/schemas';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Quiz: Vocabulary
//
// Only applies to profiles with a targetLanguage (non-null). Returns null
// from buildPromptInput otherwise, which the runner records as "skipped".
// Personalization fields (interests, libraryTopics, ageYears, nativeLanguage)
// are now wired in per audit P0.1 / P1.2.
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

function toInterests(labels: string[]): Interest[] {
  return labels.map((label) => ({ label, context: 'free_time' as const }));
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
      interests: toInterests(profile.interests),
      libraryTopics: profile.libraryTopics,
      ageYears: profile.ageYears,
      learnerNativeLanguage: profile.nativeLanguage,
    };
  },

  buildPrompt(input: VocabularyPromptParams): PromptMessages {
    const system = buildVocabularyPrompt(input);
    return {
      system,
      user: 'Generate the quiz round.',
      notes: [
        `Uses languageCode=${input.languageCode} and cefrCeiling=${input.cefrCeiling}.`,
        `Fine-grained age: ${
          input.ageYears ?? input.ageBracket
        }. Interests passed: ${
          (input.interests ?? []).map((i) => i.label).join(', ') || 'none'
        }.`,
        `Native language passed: ${
          input.learnerNativeLanguage ?? 'none'
        } — L1-aware distractors active for supported pairs.`,
        `Library topics passed: ${
          (input.libraryTopics ?? []).join('; ') || 'none'
        }.`,
      ],
    };
  },

  async runLive(
    _input: VocabularyPromptParams,
    messages: PromptMessages
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? 'Generate the quiz round.' },
      ],
      { flow: 'quiz-vocabulary', rung: 1 }
    );
  },
};
