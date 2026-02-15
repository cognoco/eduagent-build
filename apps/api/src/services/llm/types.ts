// ---------------------------------------------------------------------------
// LLM orchestrator types (ARCH-8, ARCH-9)
// ---------------------------------------------------------------------------

/** Escalation rung determines which model to use */
export type EscalationRung = 1 | 2 | 3 | 4 | 5;

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
