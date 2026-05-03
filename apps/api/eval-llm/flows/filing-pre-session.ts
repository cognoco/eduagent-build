import { buildPreSessionPrompt } from '../../src/services/filing';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Filing (pre-session variant)
//
// Called when a learner starts a new subject or topic. Takes raw free-text
// input + the current library and decides where the new topic belongs:
// which shelf (subject), book (area), chapter, and what topic title to
// create. Zero personalization today — no age-calibrated titling, no
// interest-aware reuse decisions.
//
// A companion flow for the POST-session variant (sessionTranscript-driven)
// would be a trivial copy of this adapter swapping buildPostSessionPrompt.
// Deferred for now.
// ---------------------------------------------------------------------------

interface FilingPreSessionInput {
  rawInput: string;
  selectedSuggestion: string | null;
  libraryText: string;
  isSparse: boolean;
}

/** A fake but realistic library index string for the profile. */
function fakeLibraryIndexFor(profile: EvalProfile): string {
  const topics = profile.libraryTopics.slice(0, 4);
  if (topics.length === 0) return '(empty library)';
  return topics
    .map((t, i) => `Shelf ${i + 1}: ${t}\n  └─ topic: ${t}`)
    .join('\n');
}

export const filingPreSessionFlow: FlowDefinition<FilingPreSessionInput> = {
  id: 'filing-pre-session',
  name: 'Filing — Pre-session (raw input)',
  sourceFile: 'apps/api/src/services/filing.ts:buildPreSessionPrompt',

  buildPromptInput(profile: EvalProfile): FilingPreSessionInput {
    // Simulate the learner typing a new topic request at session start,
    // themed by their top free-time interest so the snapshot shows a
    // realistic "new subject request" scenario.
    const primaryInterest =
      profile.interests.find((i) => i.context !== 'school')?.label ??
      profile.interests[0]?.label ??
      'a new topic';

    return {
      rawInput: `I want to learn more about ${primaryInterest}.`,
      selectedSuggestion: null,
      libraryText: fakeLibraryIndexFor(profile),
      isSparse: profile.libraryTopics.length < 5,
    };
  },

  buildPrompt(input: FilingPreSessionInput): PromptMessages {
    const system = buildPreSessionPrompt(
      input.rawInput,
      input.selectedSuggestion,
      input.libraryText,
      input.isSparse
    );
    return {
      system,
      user: 'File this request.',
      notes: [
        `Receives: rawInput, libraryText, isSparse flag.`,
        `MISSING: age — new topic titles aren't age-calibrated ("Photosynthesis" vs "How plants eat sunlight").`,
        `MISSING: interests — categorization can't prefer reuse when semantically close to existing library area.`,
        `MISSING: learning_style — topic descriptions aren't pace/style-aware.`,
        `Sparse-library seed taxonomy is included when libraryTopics < 5.`,
      ],
    };
  },

  async runLive(
    _input: FilingPreSessionInput,
    messages: PromptMessages
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? 'File this request.' },
      ],
      { flow: 'filing-pre-session', rung: 2 }
    );
  },
};
