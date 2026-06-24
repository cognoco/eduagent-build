import {
  makeChatStreamResult,
  type LLMProvider,
  type ChatMessage,
  type ChatResult,
  type ChatStreamResult,
  type ModelConfig,
} from '../types';
import type { ConversationLanguage } from '@eduagent/schemas';
import { normalizeStopReason, type StopReason } from '../stop-reason';
import { createLogger } from '../../logger';
import { SafetyFilterError } from '../../../errors';
import { createProviderApiError, createProviderHttpError } from './errors';
import { toOpenAIContent } from './openai';
import { normalizeModelRefusal } from './refusal-envelope';
import {
  cerebrasResponseSchema,
  type CerebrasResponseParsed,
} from '@eduagent/schemas';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Cerebras Provider — direct vendor adapter (MMT-ADR-0016 §1.5).
//
// Cerebras is the UNIVERSAL DEFAULT for interactive text routing (all tiers,
// teaching rungs 1–3) once LLM_ROUTING_V2_ENABLED flips on — it serves
// gpt-oss-120b at sub-second p50. Uses raw fetch() for Cloudflare Workers
// compatibility (no Node SDK), and is registered in production middleware
// (unlike the eval-only OpenRouter broker) from a Doppler-sourced key.
//
// Wire format: OpenAI-compatible chat completions. Differences from the
// OpenAI adapter:
//   - reasoning_effort is sent TOP-LEVEL, OpenAI-style (NOT OpenRouter's
//     nested `reasoning: { effort }`).
//   - the model id is passed through VERBATIM (no MODEL_MAP) — the router
//     names the exact Cerebras model (`gpt-oss-120b`).
//   - chat() normalizes a bare model refusal ({"type":"refusal"} / a
//     top-level `refusal` string) into a valid safe envelope via
//     normalizeModelRefusal (~1% of refusals on gpt-oss). chatStream() does the
//     same WITHOUT defeating streaming for normal replies: it holds back only
//     the opening bytes until the first top-level JSON key is known (BUG-895).
//     A valid envelope opens `{"reply": …` → the sniffer releases immediately
//     and the rest streams token-by-token. A bare refusal opens `{"type": …` /
//     `{"refusal": …` → the sniffer buffers to stream end and emits the
//     localized safe envelope (by config.conversationLanguage) instead of
//     leaking {"type":"refusal"} to the downstream parse fallback (which would
//     surface the English DEFAULT_FALLBACK_TEXT).
// ---------------------------------------------------------------------------

const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1/chat/completions';

// 25s timeout — CF Workers have a 30s subrequest wall; 5s buffer gives the
// circuit breaker timely failure signals on hangs. Matches the other providers.
const CEREBRAS_TIMEOUT_MS = 25_000;

type CerebrasContent = ReturnType<typeof toOpenAIContent>;

interface CerebrasMessage {
  role: 'system' | 'user' | 'assistant';
  content: CerebrasContent;
}

interface CerebrasRequest {
  model: string;
  messages: CerebrasMessage[];
  max_completion_tokens: number;
  stream?: boolean;
  response_format?: { type: 'json_object' };
  // Top-level, OpenAI-style — only sent when the caller sets reasoningEffort.
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
}

function toCerebrasMessages(messages: ChatMessage[]): CerebrasMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: toOpenAIContent(m.content),
  }));
}

function buildBody(
  messages: ChatMessage[],
  config: ModelConfig,
  stream: boolean,
): CerebrasRequest {
  return {
    // Verbatim passthrough — the router names the exact model.
    model: config.model,
    messages: toCerebrasMessages(messages),
    max_completion_tokens: config.maxTokens,
    ...(config.responseFormat === 'json'
      ? { response_format: { type: 'json_object' as const } }
      : {}),
    ...(config.reasoningEffort
      ? { reasoning_effort: config.reasoningEffort }
      : {}),
    ...(stream ? { stream: true } : {}),
  };
}

function isContentFilterFinishReason(reason: string | undefined): boolean {
  return reason === 'content_filter';
}

// Bytes needed to read the first top-level key + delimiter, e.g. `{"reply":`,
// `{"type":`, `{"refusal":`. 16 covers the longest with whitespace slack; a
// non-refusal stream is released after at most this many buffered chars, so
// normal replies stream with negligible head-of-line delay.
const REFUSAL_SNIFF_MAX_CHARS = 24;

/**
 * Streaming refusal sniffer (BUG-895). Holds back leading content only until
 * the first top-level JSON key is unambiguous:
 *   - looks like a bare refusal (`{"type"…` / `{"refusal"…` with no usable
 *     `reply`) → keep buffering to stream end; `finish()` rewrites the whole
 *     buffer via normalizeModelRefusal.
 *   - anything else (valid `{"reply"…` envelope, prose, etc.) → release the
 *     buffer and pass every subsequent chunk straight through.
 */
function createRefusalSniffer(language: ConversationLanguage) {
  let decided = false;
  let buffering = true; // hold back until we decide
  let buffer = '';

  function looksLikeRefusalOpener(text: string): boolean {
    // Match the opening of {"type":"refusal" or {"refusal": with optional
    // whitespace, before the full object has arrived. A valid envelope opens
    // with a "reply" key and never matches.
    return /^\s*\{\s*"(type|refusal)"\s*:/.test(text);
  }

  function hasReplyOpener(text: string): boolean {
    return /^\s*\{\s*"reply"\s*:/.test(text);
  }

  return {
    /** Feed a chunk; returns text to yield now (possibly empty). */
    push(chunk: string): string {
      if (!buffering) return chunk;
      buffer += chunk;
      if (!decided) {
        // Only JSON objects can be a refusal/envelope. As soon as the first
        // non-whitespace char is known and is NOT `{`, this is plain content
        // (the refusal shapes are objects) — release with no granularity loss.
        const firstNonWs = buffer.trimStart();
        if (firstNonWs.length > 0 && !firstNonWs.startsWith('{')) {
          decided = true;
          buffering = false;
          const out = buffer;
          buffer = '';
          return out;
        }
        // A valid envelope opens `{"reply": …` — release immediately and stream
        // the rest token-by-token.
        if (hasReplyOpener(buffer)) {
          decided = true;
          buffering = false;
          const out = buffer;
          buffer = '';
          return out;
        }
        // A bare refusal opens `{"type": …` / `{"refusal": …` — keep buffering
        // to the end so finish() can rewrite the whole object.
        if (looksLikeRefusalOpener(buffer)) {
          decided = true;
          return '';
        }
        if (buffer.length < REFUSAL_SNIFF_MAX_CHARS) {
          return ''; // first key not yet unambiguous — wait for more
        }
        // Enough bytes, still ambiguous (e.g. `{` then unexpected key) → treat
        // as normal content rather than risk holding back a real reply.
        decided = true;
        buffering = false;
        const out = buffer;
        buffer = '';
        return out;
      }
      // Decided to be a refusal: keep accumulating, emit nothing yet.
      return '';
    },
    /** Drain at stream end; returns the final text to yield (possibly empty). */
    finish(): string {
      if (!buffering) return '';
      buffering = false;
      const pending = buffer;
      buffer = '';
      if (pending.length === 0) return '';
      const normalized = normalizeModelRefusal(pending, language);
      return normalized ?? pending;
    },
  };
}

function createCerebrasContentFilterError(): SafetyFilterError {
  return new SafetyFilterError(
    'The response was blocked by content safety filters. Please try rephrasing your question.',
  );
}

export function createCerebrasProvider(apiKey: string): LLMProvider {
  return {
    id: 'cerebras',

    async chat(
      messages: ChatMessage[],
      config: ModelConfig,
    ): Promise<ChatResult> {
      const res = await fetch(CEREBRAS_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody(messages, config, false)),
        signal: AbortSignal.timeout(CEREBRAS_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw createProviderHttpError(
          'Cerebras API request',
          res.status,
          errorBody,
        );
      }

      const raw = await res.json();
      const parsed = cerebrasResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw createProviderApiError('Cerebras API', {
          type: 'invalid_response_shape',
        });
      }
      const data = parsed.data;

      if (data.error) {
        // Keep only the structured type/code tokens — the vendor message can
        // echo learner input, so it never enters the error (mirrors openai.ts).
        throw createProviderApiError('Cerebras API', data.error);
      }

      const choice = data.choices?.[0];
      if (isContentFilterFinishReason(choice?.finish_reason)) {
        throw createCerebrasContentFilterError();
      }

      const text = choice?.message?.content;
      if (!text) {
        throw new Error('Cerebras returned empty response');
      }

      // Rewrite a bare model refusal into a valid localized safe envelope; a
      // null result means the content is already an envelope or is not a
      // recognized refusal — pass it through unchanged.
      const normalized = normalizeModelRefusal(
        text,
        config.conversationLanguage ?? 'en',
      );

      return {
        content: normalized ?? text,
        stopReason: normalizeStopReason('openai', choice?.finish_reason),
      };
    },

    chatStream(messages: ChatMessage[], config: ModelConfig): ChatStreamResult {
      let resolveStop!: (r: StopReason) => void;
      const stopReasonPromise = new Promise<StopReason>((resolve) => {
        resolveStop = resolve;
      });

      async function* generate(): AsyncIterable<string> {
        let rawFinishReason: string | undefined;
        // BUG-895 — holds back leading bytes only until a bare refusal can be
        // distinguished from a normal envelope, then rewrites a refusal into a
        // localized safe envelope. Normal replies pass straight through.
        const sniffer = createRefusalSniffer(
          config.conversationLanguage ?? 'en',
        );
        try {
          const res = await fetch(CEREBRAS_BASE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(buildBody(messages, config, true)),
            signal: AbortSignal.timeout(CEREBRAS_TIMEOUT_MS),
          });

          if (!res.ok) {
            const errorBody = await res.text();
            throw createProviderHttpError(
              'Cerebras API stream',
              res.status,
              errorBody,
            );
          }

          if (!res.body) {
            throw new Error(
              'Cerebras API returned no response body for stream',
            );
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          function processChunk(
            chunk: CerebrasResponseParsed,
          ): string | undefined {
            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) rawFinishReason = finish;
            if (isContentFilterFinishReason(finish)) {
              throw createCerebrasContentFilterError();
            }
            return chunk.choices?.[0]?.delta?.content;
          }

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;

                const jsonStr = trimmed.slice(6);
                if (!jsonStr || jsonStr === '[DONE]') continue;

                try {
                  const rawChunk = JSON.parse(jsonStr);
                  const chunkParsed =
                    cerebrasResponseSchema.safeParse(rawChunk);
                  if (!chunkParsed.success) {
                    logger.warn(
                      '[llm:cerebras] malformed SSE chunk discarded',
                      {
                        event: 'cerebras.sse.malformed',
                        site: 'stream_loop',
                        chunk: jsonStr.slice(0, 200),
                        error: chunkParsed.error.message,
                      },
                    );
                    continue;
                  }
                  const text = processChunk(chunkParsed.data);
                  if (text) {
                    const out = sniffer.push(text);
                    if (out) yield out;
                  }
                } catch (err) {
                  if (err instanceof SafetyFilterError) {
                    throw err;
                  }
                  // One bad chunk should not kill the stream, but the discard
                  // must be observable (mirrors openai.ts BUG-695).
                  logger.warn('[llm:cerebras] malformed SSE chunk discarded', {
                    event: 'cerebras.sse.malformed',
                    site: 'stream_loop',
                    chunk: jsonStr.slice(0, 200),
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }
            }

            // Flush remaining buffer
            if (buffer.trim()) {
              const trimmed = buffer.trim();
              if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.slice(6);
                if (jsonStr && jsonStr !== '[DONE]') {
                  try {
                    const rawChunk = JSON.parse(jsonStr);
                    const chunkParsed =
                      cerebrasResponseSchema.safeParse(rawChunk);
                    if (!chunkParsed.success) {
                      logger.warn(
                        '[llm:cerebras] malformed SSE chunk discarded',
                        {
                          event: 'cerebras.sse.malformed',
                          site: 'flush_buffer',
                          chunk: jsonStr.slice(0, 200),
                          error: chunkParsed.error.message,
                        },
                      );
                    } else {
                      const text = processChunk(chunkParsed.data);
                      if (text) {
                        const out = sniffer.push(text);
                        if (out) yield out;
                      }
                    }
                  } catch (err) {
                    if (err instanceof SafetyFilterError) {
                      throw err;
                    }
                    logger.warn(
                      '[llm:cerebras] malformed SSE chunk discarded',
                      {
                        event: 'cerebras.sse.malformed',
                        site: 'flush_buffer',
                        chunk: jsonStr.slice(0, 200),
                        error: err instanceof Error ? err.message : String(err),
                      },
                    );
                  }
                }
              }
            }

            // Drain the sniffer: if the whole stream was a bare refusal it was
            // held back and is rewritten here into the localized safe envelope;
            // otherwise this is a no-op (content already streamed through).
            const tail = sniffer.finish();
            if (tail) yield tail;
          } finally {
            reader.releaseLock();
          }
        } finally {
          resolveStop(normalizeStopReason('openai', rawFinishReason));
        }
      }

      return makeChatStreamResult(generate(), stopReasonPromise);
    },
  };
}
