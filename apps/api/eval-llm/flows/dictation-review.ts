import {
  buildReviewSystemPrompt,
  type BuildReviewSystemPromptParams,
} from '../../src/services/dictation/review';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Dictation: Review
//
// The review flow is multimodal (image + text) in production. The eval harness
// operates on the system prompt only — the user message and image are not
// snapshotted since images are not fixture-friendly. This lets us track how
// the system prompt changes as ageYears and preferredExplanations are wired in.
// ---------------------------------------------------------------------------

export const dictationReviewFlow: FlowDefinition<BuildReviewSystemPromptParams> =
  {
    id: 'dictation-review',
    name: 'Dictation — Review',
    sourceFile:
      'apps/api/src/services/dictation/review.ts:buildReviewSystemPrompt',

    buildPromptInput(profile: EvalProfile): BuildReviewSystemPromptParams {
      return {
        ageYears: profile.ageYears,
        preferredExplanations: profile.preferredExplanations,
      };
    },

    buildPrompt(input: BuildReviewSystemPromptParams): PromptMessages {
      const system = buildReviewSystemPrompt(input);
      return {
        system,
        user: '(multimodal — image + original sentences supplied at runtime)',
        notes: [
          `ageYears=${
            input.ageYears ?? 'unset'
          } — explanation register calibrated to age.`,
          `preferredExplanations=${JSON.stringify(
            input.preferredExplanations ?? []
          )} — tone shaped by style preferences.`,
          `Struggle history NOT used (gap flagged in audit P2) — recurring patterns not surfaced to reviewer.`,
        ],
      };
    },
  };
