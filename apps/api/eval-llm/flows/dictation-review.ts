import { SYSTEM_PROMPT } from '../../src/services/dictation/review';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Dictation: Review
//
// Multimodal flow — the production code sends a system prompt, a base64
// handwriting image, and a text user-part with the original sentences and
// the explanation language. In the eval harness we can't render the image,
// but we CAN snapshot: (1) the static system prompt and (2) the text-part
// of the user message, which is the only place any personalization lives
// ("Please generate all explanations in {language}").
//
// Audit finding: the only personalization is language — no age, no learning
// style, no struggle history. Snapshots will show that every profile gets
// the same mistake-feedback register regardless of whether they're 11 or 17.
// ---------------------------------------------------------------------------

interface DictationReviewInput {
  /** The language explanations will be written in. */
  language: string;
  /** Sample original sentences (what the child was supposed to write). */
  originalSentences: string[];
}

function sampleSentencesFor(profile: EvalProfile): string[] {
  switch (profile.conversationLanguage) {
    case 'cs':
      return ['Kočka běžela zahradou.', 'Za chvíli začalo pršet.'];
    case 'fr':
      return ['Le soleil se couche tôt.', 'Elle marchait sans parler.'];
    case 'es':
      return ['El caballo come hierba.', 'La niña juega en el jardín.'];
    default:
      return [
        'The cat ran through the garden.',
        'After a while it began to rain.',
      ];
  }
}

export const dictationReviewFlow: FlowDefinition<DictationReviewInput> = {
  id: 'dictation-review',
  name: 'Dictation — Review (multimodal)',
  sourceFile: 'apps/api/src/services/dictation/review.ts:SYSTEM_PROMPT',

  buildPromptInput(profile: EvalProfile): DictationReviewInput {
    return {
      language: profile.conversationLanguage,
      originalSentences: sampleSentencesFor(profile),
    };
  },

  buildPrompt(input: DictationReviewInput): PromptMessages {
    const originalText = input.originalSentences
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n');

    // Reproduce the text user-part the production code builds.
    // The real production call also attaches an inline_data image part
    // which we cannot synthesize meaningfully in tier 1.
    const userText = `Original sentences:\n${originalText}\n\nPlease generate all explanations in ${input.language}.`;

    return {
      system: SYSTEM_PROMPT,
      user: `[image part omitted]\n\n${userText}`,
      notes: [
        `System prompt is static — zero personalization.`,
        `The ONLY personalized parameter is the explanation language.`,
        `Missing: age (explanation complexity calibration), learning style (humor/step-by-step register), struggle history (recurring-pattern-aware feedback).`,
        `Tier 2 (--live) requires a real handwriting image; not synthesized by this harness.`,
      ],
    };
  },
};
