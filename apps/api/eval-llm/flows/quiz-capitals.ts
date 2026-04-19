import { buildCapitalsPrompt } from '../../src/services/quiz/generate-round';
import type { Interest } from '../../src/services/quiz/config';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Quiz: Capitals
//
// Wraps the production buildCapitalsPrompt so the eval harness sees the
// same output the live code path would produce. Inputs are derived from the
// EvalProfile, including personalization fields added in audit P0.1 / P1.2.
// ---------------------------------------------------------------------------

type CapitalsBuilderInput = Parameters<typeof buildCapitalsPrompt>[0];

// Local mirror of AgeBracket — avoids importing from a non-barrel file.
function ageYearsToBracket(ageYears: number): 'child' | 'adolescent' | 'adult' {
  if (ageYears <= 9) return 'child';
  if (ageYears <= 13) return 'adolescent';
  return 'adult';
}

function toInterests(labels: string[]): Interest[] {
  return labels.map((label) => ({ label, context: 'free_time' as const }));
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
      interests: toInterests(profile.interests),
      libraryTopics: profile.libraryTopics,
      ageYears: profile.ageYears,
    };
  },

  buildPrompt(input: CapitalsBuilderInput): PromptMessages {
    const system = buildCapitalsPrompt(input);
    return {
      system,
      user: 'Generate the quiz round.',
      notes: [
        `Fine-grained age: ${
          input.ageYears ?? input.ageBracket
        }. Interests passed: ${
          (input.interests ?? []).map((i) => i.label).join(', ') || 'none'
        }.`,
        `Library topics passed: ${
          (input.libraryTopics ?? []).join('; ') || 'none'
        }.`,
      ],
    };
  },
};
