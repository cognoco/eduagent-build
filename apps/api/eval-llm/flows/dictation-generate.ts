import {
  buildGeneratePrompt,
  type GenerateContext,
} from '../../src/services/dictation/generate';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

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
      // Dictation theming always uses 'free_time' context — extract only the
      // label from each InterestEntry and override context for this flow,
      // since 'free_time' is the context that themes the literary passage.
      interests: profile.interests.map(({ label }) => ({
        label,
        context: 'free_time' as const,
      })),
      libraryTopics: profile.libraryTopics,
    };
  },

  buildPrompt(input: GenerateContext): PromptMessages {
    const system = buildGeneratePrompt(input);
    const interestLabels = (input.interests ?? []).map((i) => i.label);
    return {
      system,
      user: 'Generate a dictation for me.',
      notes: [
        `Uses fine-grained ageYears=${input.ageYears} — 2-bucket literary scaling (≤13 chapter-book, >13 literary).`,
        `Native language drives punctuation-name mapping.`,
        interestLabels.length > 0
          ? `Interests wired (audit P0.1): ${interestLabels.join(', ')}.`
          : `No interests — default literary theme used.`,
        (input.libraryTopics ?? []).length > 0
          ? `Library topics wired (audit P0.1): ${(
              input.libraryTopics ?? []
            ).join(', ')}.`
          : `No library topics — theme not constrained by curriculum.`,
      ],
    };
  },

  async runLive(
    _input: GenerateContext,
    messages: PromptMessages,
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        {
          role: 'user',
          content: messages.user ?? 'Generate a dictation for me.',
        },
      ],
      { flow: 'dictation-generate', rung: 1 },
    );
  },
};
