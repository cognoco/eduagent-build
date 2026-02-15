import type { LLMProvider, ChatMessage, ModelConfig } from '../types';

// ---------------------------------------------------------------------------
// Mock provider for testing — returns canned responses
// ---------------------------------------------------------------------------

export const mockProvider: LLMProvider = {
  id: 'mock',

  async chat(messages: ChatMessage[], _config: ModelConfig): Promise<string> {
    const lastMessage = messages[messages.length - 1];
    return `Mock response to: ${lastMessage?.content?.slice(0, 50) ?? 'empty'}`;
  },

  async *chatStream(
    messages: ChatMessage[],
    _config: ModelConfig
  ): AsyncIterable<string> {
    const lastContent =
      messages[messages.length - 1]?.content?.slice(0, 50) ?? 'empty';
    const response = `Mock streamed response to: ${lastContent}`;
    const words = response.split(' ');
    for (const word of words) {
      yield word + ' ';
    }
  },
};

/** Create a mock provider registered under a custom id (e.g. 'gemini') */
export function createMockProvider(id: string): LLMProvider {
  return { ...mockProvider, id };
}
