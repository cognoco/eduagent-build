import type { EscalationRung } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// LLM orchestrator types (ARCH-8, ARCH-9)
// ---------------------------------------------------------------------------

export type { EscalationRung };

/** Model selection based on rung */
export interface ModelConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'mock';
  model: string;
  maxTokens: number;
}

/** Multimodal message parts for vision/image input */
export interface TextPart {
  type: 'text';
  text: string;
}

export interface InlineDataPart {
  type: 'inline_data';
  mimeType: string;
  data: string; // base64-encoded
}

export type MessagePart = TextPart | InlineDataPart;

/** Chat message format — content is text or multimodal parts */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MessagePart[];
}

/** Extract text-only content from a ChatMessage's content field. */
export function getTextContent(content: string | MessagePart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
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

/**
 * Stream result.
 *
 * `provider` and `model` reflect the initially selected provider. If the
 * stream wrapper transparently falls back (pre-first-byte failure),
 * `fallbackUsed` is set to `true` after the stream is consumed — callers
 * should check this field for accurate cost attribution / observability.
 */
export interface StreamResult {
  stream: AsyncIterable<string>;
  provider: string;
  model: string;
  fallbackUsed?: boolean;
}
