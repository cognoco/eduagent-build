import type { ConversationLanguage, EscalationRung } from '@eduagent/schemas';
import type { StopReason } from './stop-reason';

// ---------------------------------------------------------------------------
// LLM orchestrator types (MMT-ADR-0017, MMT-ADR-0014)
// ---------------------------------------------------------------------------

export type { EscalationRung };
export type { StopReason };

/** Model selection based on rung */
export interface ModelConfig {
  provider:
    | 'gemini'
    | 'openai'
    | 'anthropic'
    | 'cerebras'
    | 'mistral'
    | 'openrouter'
    | 'mock';
  model: string;
  maxTokens: number;
  /** Ask providers with native support to constrain output to JSON. */
  responseFormat?: 'json';
  /**
   * Reasoning-effort dial for reasoning-capable models. Currently consumed
   * only by the eval-only OpenRouter adapter (candidate-model gate);
   * production rung configs never set it. Measured 2026-06-06 on
   * gpt-5-mini: medium = 16–23s (at the 25s wall), low = 10–13s,
   * minimal = 4–7s with 0 reasoning tokens — see model-selection memo §6.
   */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  /**
   * Learner's tutor-prose language, threaded from the router so a provider
   * that must synthesize a fallback reply (e.g. the Cerebras adapter
   * rewriting a bare model refusal into a safe envelope — see
   * providers/refusal-envelope.ts) can localize it. Optional: providers that
   * never synthesize text ignore it, and the refusal helper falls back to
   * English when unset.
   */
  conversationLanguage?: ConversationLanguage;
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
  /**
   * Prompt-caching boundary (WI-1779). On a `role: 'system'` message with
   * string content, the character offset where the cache-stable prefix ends:
   * `content.slice(0, cachePrefixLength)` is byte-identical across turns of a
   * session and is what providers cache. The Anthropic adapter places an
   * explicit `cache_control` breakpoint here; OpenAI/Cerebras ignore the field
   * and cache the identical prefix automatically. Unset ⇒ no explicit
   * breakpoint (existing behavior for grader/judge and non-exchange flows).
   */
  cachePrefixLength?: number;
}

/** Extract text-only content from a ChatMessage's content field. */
export function getTextContent(content: string | MessagePart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/** Result of a non-streaming provider call. */
export interface ChatResult {
  content: string;
  stopReason: StopReason;
}

/**
 * Result of a streaming provider call.
 *
 * Dual-shape: the result exposes `stream` and `stopReasonPromise` explicitly,
 * AND is itself an `AsyncIterable<string>` (iterates `stream`). This keeps
 * `for await (const x of provider.chatStream(...))` working for existing
 * callers while giving new callers access to the stop-reason signal.
 *
 * `stopReasonPromise` resolves once the stream finishes (either by normal
 * drain or by error). On error before any stop reason is observed, it
 * resolves to `'unknown'` rather than rejecting — callers who need the stop
 * reason always get a value, and we never hang onComplete on a rejected
 * promise the caller might forget to catch.
 */
export interface ChatStreamResult extends AsyncIterable<string> {
  stream: AsyncIterable<string>;
  stopReasonPromise: Promise<StopReason>;
}

/**
 * Build a `ChatStreamResult` that iterates `stream` when used in `for await`.
 * Provider implementations call this to produce the return value of
 * `chatStream()` — callers get ergonomic iteration and access to the
 * `stopReasonPromise` signal without needing to know whether they are
 * holding the stream or the wrapper.
 */
export function makeChatStreamResult(
  stream: AsyncIterable<string>,
  stopReasonPromise: Promise<StopReason>,
): ChatStreamResult {
  return {
    stream,
    stopReasonPromise,
    [Symbol.asyncIterator]() {
      return stream[Symbol.asyncIterator]();
    },
  };
}

/** Provider interface — all LLM providers implement this */
export interface LLMProvider {
  id: string;
  chat(messages: ChatMessage[], config: ModelConfig): Promise<ChatResult>;
  chatStream(messages: ChatMessage[], config: ModelConfig): ChatStreamResult;
}

/** Route result */
export interface RouteResult {
  response: string;
  provider: string;
  model: string;
  tokenCount?: number;
  latencyMs: number;
  stopReason: StopReason;
}

/**
 * Stream result.
 *
 * `provider` and `model` reflect the initially selected provider. If the
 * stream wrapper transparently falls back (pre-first-byte failure),
 * `fallbackUsed` is set to `true` after the stream is consumed — callers
 * should check this field for accurate cost attribution / observability.
 *
 * `stopReasonPromise` resolves to the normalized stop reason of whichever
 * provider ultimately drove the stream (primary or fallback).
 */
export interface StreamResult {
  stream: AsyncIterable<string>;
  provider: string;
  model: string;
  fallbackUsed?: boolean;
  stopReasonPromise: Promise<StopReason>;
}
