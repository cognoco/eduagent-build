import type { EscalationRung } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// LLM orchestrator types (ARCH-8, ARCH-9)
// ---------------------------------------------------------------------------

export type { EscalationRung };

/** Model selection based on rung */
export interface ModelConfig {
  provider: 'gemini' | 'openai' | 'mock';
  model: string;
  maxTokens: number;
}

/** Chat message format */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Provider interface — all LLM providers implement this */
export interface LLMProvider {
  id: string;
  chat(messages: ChatMessage[], config: ModelConfig): Promise<string>;
  chatStream(
    messages: ChatMessage[],
    config: ModelConfig
  ): AsyncIterable<string>;
}

/** Route result */
export interface RouteResult {
  response: string;
  provider: string;
  model: string;
  tokenCount?: number;
  latencyMs: number;
}

/** Stream result */
export interface StreamResult {
  stream: AsyncIterable<string>;
  provider: string;
  model: string;
}
