import {
  makeChatStreamResult,
  type ChatMessage,
  type ChatResult,
  type ChatStreamResult,
  type LLMProvider,
  type ModelConfig,
} from '../types';
import type { StopReason } from '../stop-reason';

// ---------------------------------------------------------------------------
// Mock provider for testing — returns canned responses
// ---------------------------------------------------------------------------

// The mock emits envelope-shaped JSON so the exchange and interview flows
// (which now parse the envelope) see a realistic payload. Router-level tests
// still assert on the reply substring, which appears inside the envelope.
function envelopeFrom(reply: string): string {
  return JSON.stringify({ reply, signals: {} });
}

function lastMessageText(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return 'empty';
  if (typeof last.content === 'string') return last.content.slice(0, 50);
  const text = last.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
  return text.slice(0, 50) || 'empty';
}

export interface MockProviderOptions {
  /** Override the stop reason returned by chat/chatStream. Defaults to 'stop'. */
  stopReason?: StopReason;
}

export function createMockProvider(
  id: string,
  opts: MockProviderOptions = {}
): LLMProvider {
  const stopReason: StopReason = opts.stopReason ?? 'stop';

  return {
    id,

    async chat(
      messages: ChatMessage[],
      _config: ModelConfig
    ): Promise<ChatResult> {
      const reply = `Mock response to: ${lastMessageText(messages)}`;
      return { content: envelopeFrom(reply), stopReason };
    },

    chatStream(
      messages: ChatMessage[],
      _config: ModelConfig
    ): ChatStreamResult {
      const envelope = envelopeFrom(
        `Mock streamed response to: ${lastMessageText(messages)}`
      );
      let resolveStop!: (r: StopReason) => void;
      const stopReasonPromise = new Promise<StopReason>((resolve) => {
        resolveStop = resolve;
      });

      async function* generate(): AsyncIterable<string> {
        try {
          // Chunk size chosen to exercise multi-chunk reply extraction across
          // the key/value/escape boundaries in streamEnvelopeReply.
          for (let i = 0; i < envelope.length; i += 12) {
            yield envelope.slice(i, i + 12);
          }
        } finally {
          resolveStop(stopReason);
        }
      }

      return makeChatStreamResult(generate(), stopReasonPromise);
    },
  };
}

/** Convenience singleton for common 'mock' id. */
export const mockProvider: LLMProvider = createMockProvider('mock');
