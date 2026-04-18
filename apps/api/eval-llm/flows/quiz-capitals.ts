import { buildCapitalsPrompt } from '../../src/services/quiz/generate-round';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Quiz: Capitals
//
// Wraps the production buildCapitalsPrompt so the eval harness sees the
// same output the live code path would produce. Inputs are derived from the
// EvalProfile via simple mappings — NO personalization extension here.
// The whole point of the harness is to show what the current prompt builder
// does and does not use; gaps become visible when we diff snapshots after
// making the builder richer.
// ---------------------------------------------------------------------------

type CapitalsBuilderInput = Parameters<typeof buildCapitalsPrompt>[0];

// Local mirror of AgeBracket — avoids importing from a non-barrel file.
function ageYearsToBracket(ageYears: number): 'child' | 'adolescent' | 'adult' {
  if (ageYears <= 9) return 'child';
  if (ageYears <= 13) return 'adolescent';
  return 'adult';
}

export const capitalsFlow: FlowDefinition<CapitalsBuilderInput> = {
  id: 'quiz-capitals',
  name: 'Quiz — Capitals',
  sourceFile:
    'apps/api/src/services/quiz/generate-round.ts:buildCapitalsPrompt',

  buildPromptInput(profile: EvalProfile): CapitalsBuilderInput {
    return {
      discoveryCount: 6,
      ageBracket: ageYearsToBracket(profile.ageYears),
      recentAnswers: profile.recentQuizAnswers.capitals,
      themePreference: undefined,
    };
  },

  buildPrompt(input: CapitalsBuilderInput): PromptMessages {
    const system = buildCapitalsPrompt(input);
    return {
      system,
      user: 'Generate the quiz round.',
      notes: [
        `Coarse age bracket in use: ${input.ageBracket}. Interests NOT passed (gap flagged in audit P0).`,
        `Library topics NOT passed (gap flagged in audit P1).`,
        `Struggles NOT passed (gap flagged in audit P0).`,
      ],
    };
  },
};
