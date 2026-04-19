import {
  buildGuessWhoPrompt,
  type GuessWhoPromptParams,
} from '../../src/services/quiz/guess-who-provider';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Quiz: Guess Who
//
// This is the flow that already uses library topics (via topicTitles) —
// "at least 2 of N people MUST relate to these topics". Good reference for
// how partial library-topic integration looks in practice. Still missing
// interests, cultural context, struggles.
// ---------------------------------------------------------------------------

function ageYearsToBracket(ageYears: number): 'child' | 'adolescent' | 'adult' {
  // Product targets 11+, so 'child' (6-9) never fires in production.
  if (ageYears <= 9) return 'child';
  if (ageYears <= 13) return 'adolescent';
  return 'adult';
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
    };
  },

  buildPrompt(input: GuessWhoPromptParams): PromptMessages {
    const system = buildGuessWhoPrompt(input);
    return {
      system,
      user: 'Generate the quiz round.',
      notes: [
        `Uses topicTitles — the one existing library-topic integration.`,
        `Interests NOT passed — wouldn't know a football fan should see more athletes.`,
        `Cultural context (location, nativeLanguage, conversationLanguage) NOT passed — can't weight locally-recognizable figures.`,
        `Struggles NOT passed — can't reinforce previously-missed historical figures.`,
      ],
    };
  },
};
