import {
  buildGuessWhoPrompt,
  type GuessWhoPromptParams,
} from '../../src/services/quiz/guess-who-provider';
import type { Interest } from '../../src/services/quiz/config';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Quiz: Guess Who
//
// Wraps the production buildGuessWhoPrompt so the eval harness can snapshot
// and diff it across the fixture profiles. Personalization fields (interests,
// libraryTopics, ageYears) are wired in per audit P0.1 / P1.2.
// ---------------------------------------------------------------------------

function ageYearsToBracket(ageYears: number): 'child' | 'adolescent' | 'adult' {
  if (ageYears <= 9) return 'child';
  if (ageYears <= 13) return 'adolescent';
  return 'adult';
}

function toInterests(labels: string[]): Interest[] {
  return labels.map((label) => ({ label, context: 'free_time' as const }));
}

export const guessWhoFlow: FlowDefinition<GuessWhoPromptParams> = {
  id: 'quiz-guess-who',
  name: 'Quiz — Guess Who',
  sourceFile:
    'apps/api/src/services/quiz/guess-who-provider.ts:buildGuessWhoPrompt',

  buildPromptInput(profile: EvalProfile): GuessWhoPromptParams {
    return {
      discoveryCount: 4,
      ageBracket: ageYearsToBracket(profile.ageYears),
      recentAnswers: profile.recentQuizAnswers.guessWho,
      topicTitles: profile.libraryTopics,
      themePreference: undefined,
      interests: toInterests(profile.interests.map((e) => e.label)),
      libraryTopics: profile.libraryTopics,
      ageYears: profile.ageYears,
    };
  },

  buildPrompt(input: GuessWhoPromptParams): PromptMessages {
    const system = buildGuessWhoPrompt(input);
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
        `Topic titles passed: ${
          (input.topicTitles ?? []).join('; ') || 'none'
        }.`,
      ],
    };
  },

  async runLive(
    _input: GuessWhoPromptParams,
    messages: PromptMessages,
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? 'Generate the quiz round.' },
      ],
      { flow: 'quiz-guess-who', rung: 1 },
    );
  },
};
