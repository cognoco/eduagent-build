import { buildCapitalsPrompt } from '../../src/services/quiz/generate-round';
import type { Interest } from '../../src/services/quiz/config';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Quiz: Capitals
//
// Wraps the production buildCapitalsPrompt so the eval harness sees the
// same output the live code path would produce. Inputs are derived from the
// EvalProfile, including personalization fields added in audit P0.1 / P1.2.
// ---------------------------------------------------------------------------

type CapitalsBuilderInput = Parameters<typeof buildCapitalsPrompt>[0];

// Local mirror of quiz AgeBracket — avoids importing from a non-barrel file.
// Product is 11+ only, so the historical 'child' branch was removed in
// BUG-642 [P-2]. Eval profiles never include ages below 11.
function ageYearsToBracket(ageYears: number): 'adolescent' | 'adult' {
  if (ageYears <= 13) return 'adolescent';
  return 'adult';
}

function toInterests(interests: EvalProfile['interests']): Interest[] {
  return interests.map((interest) => ({
    label: interest.label,
    context: interest.context,
  }));
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

  async runLive(
    _input: CapitalsBuilderInput,
    messages: PromptMessages
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? 'Generate the quiz round.' },
      ],
      { flow: 'quiz-capitals', rung: 1 }
    );
  },
};
