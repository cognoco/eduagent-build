import {
  makeChatStreamResult,
  type LLMProvider,
  type ChatMessage,
  type ChatResult,
  type ChatStreamResult,
  type ModelConfig,
} from '../types';
import { normalizeStopReason, type StopReason } from '../stop-reason';
import { createLogger } from '../../logger';
import { SafetyFilterError } from '../../../errors';
import { createProviderApiError, createProviderHttpError } from './errors';
import { toOpenAIContent } from './openai';
import {
  mistralResponseSchema,
  type MistralResponseParsed,
} from '@eduagent/schemas';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Mistral Provider — direct vendor adapter (MMT-ADR-0016 §1.5).
//
// EU-hosted secondary: the free-tier secondary/vision model and the
// EU-residency branch target. Serves mistral-small-2603. Uses raw fetch() for
// Cloudflare Workers compatibility (no Node SDK); registered in production
// middleware from a Doppler-sourced key.
//
// Wire format: OpenAI-compatible chat completions. Differences from the OpenAI
// adapter:
//   - the token budget field is `max_tokens` (Mistral's API name), NOT
//     OpenAI's `max_completion_tokens`.
//   - no reasoning-effort param (Mistral Small is not a reasoning model).
//   - the model id is passed through VERBATIM (no MODEL_MAP).
//   - vision: image parts serialize to the OpenAI `image_url` shape via
//     toOpenAIContent, which Mistral's multimodal endpoint accepts.
// ---------------------------------------------------------------------------

const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1/chat/completions';

// 25s timeout — CF Workers 30s subrequest wall minus 5s buffer; matches the
// other providers so the circuit breaker sees timely failures.
const MISTRAL_TIMEOUT_MS = 25_000;

type MistralContent = ReturnType<typeof toOpenAIContent>;

interface MistralMessage {
  role: 'system' | 'user' | 'assistant';
  content: MistralContent;
}

interface MistralRequest {
  model: string;
  messages: MistralMessage[];
  // Mistral uses `max_tokens` (not OpenAI's `max_completion_tokens`).
  max_tokens: number;
  stream?: boolean;
  response_format?: { type: 'json_object' };
}

function toMistralMessages(messages: ChatMessage[]): MistralMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: toOpenAIContent(m.content),
  }));
}

function buildBody(
  messages: ChatMessage[],
  config: ModelConfig,
  stream: boolean,
): MistralRequest {
  return {
    // Verbatim passthrough — the router names the exact model.
    model: config.model,
    messages: toMistralMessages(messages),
    max_tokens: config.maxTokens,
    ...(config.responseFormat === 'json'
      ? { response_format: { type: 'json_object' as const } }
      : {}),
    ...(stream ? { stream: true } : {}),
  };
}

function isContentFilterFinishReason(reason: string | undefined): boolean {
  return reason === 'content_filter';
}

function createMistralContentFilterError(): SafetyFilterError {
  return new SafetyFilterError(
    'The response was blocked by content safety filters. Please try rephrasing your question.',
  );
}

export function createMistralProvider(apiKey: string): LLMProvider {
  return {
    id: 'mistral',

    async chat(
      messages: ChatMessage[],
      config: ModelConfig,
      signal?: AbortSignal,
    ): Promise<ChatResult> {
      const res = await fetch(MISTRAL_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody(messages, config, false)),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(MISTRAL_TIMEOUT_MS)])
          : AbortSignal.timeout(MISTRAL_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw createProviderHttpError(
          'Mistral API request',
          res.status,
          errorBody,
        );
      }

      const raw = await res.json();
      const parsed = mistralResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw createProviderApiError('Mistral API', {
          type: 'invalid_response_shape',
        });
      }
      const data = parsed.data;

      if (data.error) {
        // Keep only the structured type/code tokens (mirrors openai.ts) — the
        // vendor message can echo learner input, so it never enters the error.
        throw createProviderApiError('Mistral API', data.error);
      }

      const choice = data.choices?.[0];
      if (isContentFilterFinishReason(choice?.finish_reason)) {
        throw createMistralContentFilterError();
      }

      const text = choice?.message?.content;
      if (!text) {
        throw new Error('Mistral returned empty response');
      }
      return {
        content: text,
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
        try {
          const res = await fetch(MISTRAL_BASE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(buildBody(messages, config, true)),
            signal: AbortSignal.timeout(MISTRAL_TIMEOUT_MS),
          });

          if (!res.ok) {
            const errorBody = await res.text();
            throw createProviderHttpError(
              'Mistral API stream',
              res.status,
              errorBody,
            );
          }

          if (!res.body) {
            throw new Error('Mistral API returned no response body for stream');
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          function processChunk(
            chunk: MistralResponseParsed,
          ): string | undefined {
            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) rawFinishReason = finish;
            if (isContentFilterFinishReason(finish)) {
              throw createMistralContentFilterError();
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
                  const chunkParsed = mistralResponseSchema.safeParse(rawChunk);
                  if (!chunkParsed.success) {
                    logger.warn('[llm:mistral] malformed SSE chunk discarded', {
                      event: 'mistral.sse.malformed',
                      site: 'stream_loop',
                      chunk: jsonStr.slice(0, 200),
                      error: chunkParsed.error.message,
                    });
                    continue;
                  }
                  const text = processChunk(chunkParsed.data);
                  if (text) yield text;
                } catch (err) {
                  if (err instanceof SafetyFilterError) {
                    throw err;
                  }
                  logger.warn('[llm:mistral] malformed SSE chunk discarded', {
                    event: 'mistral.sse.malformed',
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
                      mistralResponseSchema.safeParse(rawChunk);
                    if (!chunkParsed.success) {
                      logger.warn(
                        '[llm:mistral] malformed SSE chunk discarded',
                        {
                          event: 'mistral.sse.malformed',
                          site: 'flush_buffer',
                          chunk: jsonStr.slice(0, 200),
                          error: chunkParsed.error.message,
                        },
                      );
                    } else {
                      const text = processChunk(chunkParsed.data);
                      if (text) yield text;
                    }
                  } catch (err) {
                    if (err instanceof SafetyFilterError) {
                      throw err;
                    }
                    logger.warn('[llm:mistral] malformed SSE chunk discarded', {
                      event: 'mistral.sse.malformed',
                      site: 'flush_buffer',
                      chunk: jsonStr.slice(0, 200),
                      error: err instanceof Error ? err.message : String(err),
                    });
                  }
                }
              }
            }
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
