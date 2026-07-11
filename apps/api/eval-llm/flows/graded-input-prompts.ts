import { buildGradedInputGenerationPrompt } from '../../src/services/graded-input-prompts';
import type { GradedInputGenerationPromptInput } from '../../src/services/graded-input-prompts';
import { getTextContent } from '../../src/services/llm/types';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Graded-input generation prompt (WI-1547).
//
// Snapshots `buildGradedInputGenerationPrompt` across profiles with and
// without a target language / known vocabulary, so the anti-drift
// instruction ("use ONLY vocabulary from the lists above... do not introduce
// other content words") and the complete-beginner branch are both provably
// present in the rendered prompt. This is separate from the `language-prompts`
// flow, which snapshots the CONSUMING four-strands tutor prompt (the
// instruction to reuse the passage) rather than the GENERATING prompt that
// produces the passage in the first place.
// ---------------------------------------------------------------------------

function buildInputForProfile(
  profile: EvalProfile,
): GradedInputGenerationPromptInput {
  return {
    languageCode: profile.targetLanguage,
    cefrLevel:
      (profile.cefrLevel as GradedInputGenerationPromptInput['cefrLevel']) ??
      null,
    knownWords: profile.recentQuizAnswers.vocabulary,
    // EvalProfile has no dedicated "currently learning" vocabulary field;
    // targetWords is left empty here (matches the fidelity of the sibling
    // `language-prompts` flow, which also only maps fields the fixture
    // profiles actually carry).
    targetWords: [],
    modality: 'reading',
    interests: profile.interests.map((i) => i.label),
  };
}

export const gradedInputPromptsFlow: FlowDefinition<GradedInputGenerationPromptInput> =
  {
    id: 'graded-input-prompts',
    name: 'Language — Graded Input generation prompt',
    sourceFile:
      'apps/api/src/services/graded-input-prompts.ts:buildGradedInputGenerationPrompt',

    buildPromptInput(
      profile: EvalProfile,
    ): GradedInputGenerationPromptInput | null {
      return buildInputForProfile(profile);
    },

    buildPrompt(input: GradedInputGenerationPromptInput): PromptMessages {
      const messages = buildGradedInputGenerationPrompt(input);
      const systemMessage = messages.find((m) => m.role === 'system');
      const userMessage = messages.find((m) => m.role === 'user');
      const system = systemMessage ? getTextContent(systemMessage.content) : '';
      const user = userMessage
        ? getTextContent(userMessage.content)
        : undefined;
      return {
        system,
        user,
        notes: [
          input.knownWords.length === 0
            ? 'Empty known vocabulary — exercises the complete-beginner branch.'
            : `${input.knownWords.length} known vocabulary item(s).`,
          input.languageCode
            ? `Target language: ${input.languageCode}.`
            : 'No target language set — falls back to "the target language".',
          'Anti-drift instruction: use ONLY provided vocabulary + basic function words.',
        ],
      };
    },

    async runLive(
      input: GradedInputGenerationPromptInput,
      messages: PromptMessages,
    ): Promise<string> {
      return callLlm(
        [
          { role: 'system', content: messages.system },
          {
            role: 'user',
            content: messages.user ?? 'Generate the passage.',
          },
        ],
        { flow: 'graded-input-prompts', rung: 2 },
      );
    },
  };
