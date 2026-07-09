import { toAnthropicFormat } from '../../src/services/llm/providers/anthropic';
import type { ChatMessage } from '../../src/services/llm/types';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

interface AnthropicResponseFormatInput {
  messages: ChatMessage[];
  responseFormat: 'json';
}

const SNAPSHOT_PROFILE_ID = '12yo-dinosaurs';

function renderAnthropicSystem(
  system: ReturnType<typeof toAnthropicFormat>['system'],
): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return system.map((block) => block.text).join('\n\n');
}

export const anthropicResponseFormatFlow: FlowDefinition<AnthropicResponseFormatInput> =
  {
    id: 'anthropic-response-format',
    name: 'Anthropic Response Format',
    sourceFile:
      'apps/api/src/services/llm/providers/anthropic.ts:toAnthropicFormat',

    buildPromptInput(
      profile: EvalProfile,
    ): AnthropicResponseFormatInput | null {
      if (profile.id !== SNAPSHOT_PROFILE_ID) return null;

      return {
        responseFormat: 'json',
        messages: [
          {
            role: 'system',
            content:
              'You classify learner intent. Return exactly the requested JSON shape.',
          },
          {
            role: 'user',
            content:
              'Classify this request: "Can you make me a quick quiz about volcanoes?"',
          },
        ],
      };
    },

    buildPrompt(input: AnthropicResponseFormatInput): PromptMessages {
      const converted = toAnthropicFormat(input.messages, input.responseFormat);

      return {
        system: renderAnthropicSystem(converted.system),
        user: JSON.stringify(converted.messages, null, 2),
        notes: [
          'Transport snapshot for Anthropic responseFormat=json conversion.',
        ],
      };
    },
  };
