import {
  buildGeneratePrompt,
  type GenerateContext,
} from '../../src/services/dictation/generate';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Dictation: Generate
//
// This is the strongest age-calibrated flow in the codebase (fine-grained
// ageYears with 4 buckets) and the best reference for what other flows
// should look like once tuned. Snapshots should show age-scaled literary
// themes obvious at a glance.
// ---------------------------------------------------------------------------

export const dictationGenerateFlow: FlowDefinition<GenerateContext> = {
  id: 'dictation-generate',
  name: 'Dictation — Generate',
  sourceFile: 'apps/api/src/services/dictation/generate.ts:buildGeneratePrompt',

  buildPromptInput(profile: EvalProfile): GenerateContext {
    return {
      nativeLanguage: profile.nativeLanguage,
      ageYears: profile.ageYears,
    };
  },

  buildPrompt(input: GenerateContext): PromptMessages {
    const system = buildGeneratePrompt(input);
    return {
      system,
      user: 'Generate a dictation for me.',
      notes: [
        `Uses fine-grained ageYears=${input.ageYears} — 4-bucket literary scaling (strongest age handling in the codebase).`,
        `Native language drives punctuation-name mapping.`,
        `Interests NOT used (gap flagged in audit P0) — dinosaur kid gets same Dahl theme as horse kid.`,
        `Library topics NOT used (gap flagged in audit P0) — WWII learner could get period-appropriate narrative passages.`,
      ],
    };
  },
};
