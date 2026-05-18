import {
  getDirectInstructionPrompt,
  buildMethodPreferencePrompt,
  getTeachingMethodOptions,
} from '../../src/services/adaptive-teaching';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Adaptive teaching prompts.
//
// [BUG-125] Adds snapshot coverage for the two prompt builders in
// `adaptive-teaching.ts`:
//   • `getDirectInstructionPrompt(topicTitle, concept)` — fires when a
//     learner exhausts the 3-strike Socratic ladder and must switch to
//     direct instruction with a "Not yet" frame.
//   • `buildMethodPreferencePrompt(method)` — injects the learner's
//     selected teaching method (visual / step-by-step / examples / practice)
//     as a system-prompt addendum.
//
// Per-profile we render one direct-instruction snapshot using the profile's
// first struggle as the concept (or a generic placeholder for profiles with
// none), and one method-preference snapshot using the profile's pace as a
// reasonable proxy for which method they would pick. The intent is coverage
// of every templating branch in a small fixed set, not realism.
// ---------------------------------------------------------------------------

interface AdaptiveTeachingInput {
  topicTitle: string;
  concept: string;
  method: string;
  scenarioNote: string;
}

const VALID_METHODS = new Set(getTeachingMethodOptions());

function pickMethod(profile: EvalProfile): string {
  if (profile.preferredExplanations.includes('diagrams'))
    return 'visual_diagrams';
  if (profile.preferredExplanations.includes('step-by-step'))
    return 'step_by_step';
  if (profile.preferredExplanations.includes('examples'))
    return 'real_world_examples';
  return 'practice_problems';
}

export const adaptiveTeachingFlow: FlowDefinition<AdaptiveTeachingInput> = {
  id: 'adaptive-teaching',
  name: 'Adaptive teaching — direct instruction + method preference',
  sourceFile:
    'apps/api/src/services/adaptive-teaching.ts:getDirectInstructionPrompt+buildMethodPreferencePrompt',

  buildPromptInput(profile: EvalProfile): AdaptiveTeachingInput {
    const firstStruggle = profile.struggles[0];
    const topicTitle =
      firstStruggle?.topic ?? profile.libraryTopics[0] ?? 'a current topic';
    const concept = firstStruggle?.topic ?? 'the core idea';
    const method = pickMethod(profile);
    if (!VALID_METHODS.has(method)) {
      throw new Error(
        `[language-prompts flow] pickMethod produced invalid method "${method}"`,
      );
    }
    return {
      topicTitle,
      concept,
      method,
      scenarioNote: firstStruggle
        ? `Direct-instruction switch on the profile's first recorded struggle ("${firstStruggle.topic}"); method preference = ${method}.`
        : `Profile has no recorded struggles — using "${topicTitle}" + generic concept as placeholder; method preference = ${method}.`,
    };
  },

  buildPrompt(input: AdaptiveTeachingInput): PromptMessages {
    // Compose both addenda into a single system prompt so the snapshot
    // captures the realistic stack-up a session would actually see (the
    // direct-instruction frame + the per-method guidance both inject into
    // the same system block in production).
    const directInstruction = getDirectInstructionPrompt(
      input.topicTitle,
      input.concept,
    );
    const methodAddendum = buildMethodPreferencePrompt(input.method);
    const system = `${directInstruction}\n\n---\n\n${methodAddendum}`;

    return {
      system,
      user: 'Continue the exchange with the direct instruction frame above.',
      notes: [
        input.scenarioNote,
        'Receives (direct): topicTitle, concept — both sanitised via sanitizeXmlValue (200 chars).',
        'Receives (method): one of visual_diagrams / step_by_step / real_world_examples / practice_problems.',
        'Direct instruction fires after 3 strikes (DEFAULT_MAX_STRIKES).',
        'No personalization fields beyond struggle/method are read here — age/voice/interest tweaks would have to be added at the call site.',
      ],
    };
  },

  async runLive(
    _input: AdaptiveTeachingInput,
    messages: PromptMessages,
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        {
          role: 'user',
          content: messages.user ?? 'Continue the exchange.',
        },
      ],
      { flow: 'adaptive-teaching', rung: 2 },
    );
  },
};
