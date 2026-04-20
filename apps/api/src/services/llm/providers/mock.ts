import type { LLMProvider, ChatMessage, ModelConfig } from '../types';

// ---------------------------------------------------------------------------
// Mock provider for testing — returns canned responses
// ---------------------------------------------------------------------------

// The mock emits envelope-shaped JSON so the exchange and interview flows
// (which now parse the envelope) see a realistic payload. Router-level tests
// still assert on the reply substring, which appears inside the envelope.
function envelopeFrom(reply: string): string {
  return JSON.stringify({ reply, signals: {} });
}

export const mockProvider: LLMProvider = {
  id: 'mock',

  async chat(messages: ChatMessage[], _config: ModelConfig): Promise<string> {
    const lastMessage = messages[messages.length - 1];
    const reply = `Mock response to: ${
      lastMessage?.content?.slice(0, 50) ?? 'empty'
    }`;
    return envelopeFrom(reply);
  },

  async *chatStream(
    messages: ChatMessage[],
    _config: ModelConfig
  ): AsyncIterable<string> {
    const lastContent =
      messages[messages.length - 1]?.content?.slice(0, 50) ?? 'empty';
    const reply = `Mock streamed response to: ${lastContent}`;
    const envelope = envelopeFrom(reply);
    // Chunk size chosen to exercise multi-chunk reply extraction across the
    // key/value/escape boundaries in streamEnvelopeReply.
    for (let i = 0; i < envelope.length; i += 12) {
      yield envelope.slice(i, i + 12);
    }
  },
};

/** Create a mock provider registered under a custom id (e.g. 'gemini') */
export function createMockProvider(id: string): LLMProvider {
  return { ...mockProvider, id };
}
