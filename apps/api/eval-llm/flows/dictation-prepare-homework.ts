import { SYSTEM_PROMPT } from '../../src/services/dictation/prepare-homework';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Dictation: Prepare Homework
//
// Pure utility — splits a parent-provided homework text into sentences with
// spoken-punctuation variants. The system prompt is static for all users;
// the only per-profile variability here is the sample raw input we show
// alongside it. Included in the harness for completeness (every LLM surface
// gets a snapshot) but expect zero tuning opportunities.
// ---------------------------------------------------------------------------

interface PrepareHomeworkInput {
  /** Sample homework text the learner's parent might paste in. */
  rawText: string;
}

/**
 * Synthesize a realistic homework text for the profile. Uses the learner's
 * conversation language so we exercise the multi-language code path.
 */
function sampleHomeworkFor(profile: EvalProfile): string {
  switch (profile.conversationLanguage) {
    case 'cs':
      return 'V lese žil starý medvěd. Každé ráno se probouzel a hledal med. Jednoho dne však med nemohl najít. Co se stalo?';
    case 'fr':
      return "L'étranger regardait la mer. Il ne pensait à rien. La chaleur écrasait la plage, comme un poids silencieux.";
    case 'es':
      return 'El caballo galopaba por el prado. El sol brillaba y las flores se movían con el viento. La niña sonreía.';
    default:
      return 'The dinosaur roared loudly. It was bigger than a bus. Nearby, a small lizard watched from behind a rock, very still.';
  }
}

export const prepareHomeworkFlow: FlowDefinition<PrepareHomeworkInput> = {
  id: 'dictation-prepare-homework',
  name: 'Dictation — Prepare Homework',
  sourceFile:
    'apps/api/src/services/dictation/prepare-homework.ts:SYSTEM_PROMPT',

  buildPromptInput(profile: EvalProfile): PrepareHomeworkInput {
    return { rawText: sampleHomeworkFor(profile) };
  },

  buildPrompt(input: PrepareHomeworkInput): PromptMessages {
    return {
      system: SYSTEM_PROMPT,
      user: input.rawText,
      notes: [
        `System prompt is fully static — identical across every profile.`,
        `Language is auto-detected by the LLM, not passed as a parameter.`,
        `No personalization surface at all. Appropriate for a pure utility.`,
      ],
    };
  },
};
