import {
  getTextContent,
  makeChatStreamResult,
  type LLMProvider,
  type ChatMessage,
  type ChatResult,
  type ChatStreamResult,
  type ModelConfig,
  type MessagePart,
} from '../types';
import { normalizeStopReason, type StopReason } from '../stop-reason';
import { createLogger } from '../../logger';
import { SafetyFilterError } from '../../../errors';
import { createProviderHttpError } from './errors';

const logger = createLogger();

// ---------------------------------------------------------------------------
// OpenAI Provider — fallback for Gemini (ARCH-8, ARCH-9)
// Uses raw fetch() for Cloudflare Workers compatibility (no Node.js SDK)
// ---------------------------------------------------------------------------

const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';

// 25s timeout — CF Workers have a 30s subrequest wall; this gives 5s buffer
// and ensures the circuit breaker gets timely failure signals on hangs.
const OPENAI_TIMEOUT_MS = 25_000;

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

type OpenAIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentBlock[];
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_completion_tokens: number;
  stream?: boolean;
  response_format?: { type: 'json_object' };
}

interface OpenAIChoice {
  message?: { content?: string };
  delta?: { content?: string };
  finish_reason?: string;
}

interface OpenAIResponse {
  choices?: OpenAIChoice[];
  error?: { message: string; type: string; code?: string };
}

export function toOpenAIContent(
  content: string | MessagePart[],
): string | OpenAIContentBlock[] {
  if (typeof content === 'string') return content;
  const hasImages = content.some((p) => p.type === 'inline_data');
  if (!hasImages) return getTextContent(content);
  return content.map((part): OpenAIContentBlock => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    return {
      type: 'image_url',
      image_url: { url: `data:${part.mimeType};base64,${part.data}` },
    };
  });
}

function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: toOpenAIContent(m.content),
  }));
}

// ---------------------------------------------------------------------------
// Map our internal model names to OpenAI equivalents
// ---------------------------------------------------------------------------

const MODEL_MAP: Record<string, string> = {
  'gemini-2.5-flash': 'gpt-4o-mini',
  'gemini-2.5-pro': 'gpt-4o',
  // Identity mappings — no warn when config already names an OpenAI model
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-5.5': 'gpt-5.5',
  'gpt-5.4': 'gpt-5.4',
};

function mapModel(config: ModelConfig): string {
  const mapped = MODEL_MAP[config.model];
  if (!mapped) {
    logger.warn('[llm:openai] No model mapping, defaulting to gpt-4o-mini', {
      model: config.model,
    });
  }
  return mapped ?? 'gpt-4o-mini';
}

function isContentFilterFinishReason(reason: string | undefined): boolean {
  return reason === 'content_filter';
}

function createOpenAIContentFilterError(): SafetyFilterError {
  return new SafetyFilterError(
    'The response was blocked by content safety filters. Please try rephrasing your question.',
  );
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    id: 'openai',

    async chat(
      messages: ChatMessage[],
      config: ModelConfig,
    ): Promise<ChatResult> {
      const body: OpenAIRequest = {
        model: mapModel(config),
        messages: toOpenAIMessages(messages),
        max_completion_tokens: config.maxTokens,
        ...(config.responseFormat === 'json'
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      };

      const res = await fetch(OPENAI_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw createProviderHttpError(
          `OpenAI API request failed (${res.status}): ${errorBody}`,
          res.status,
          errorBody,
        );
      }

      const data = (await res.json()) as OpenAIResponse;

      if (data.error) {
        // [FCR-2026-05-23-L11.F11] Preserve structured error as cause so Sentry
        // captures type/code fields for grouping (rate-limit, auth, content-filter).
        throw new Error(`OpenAI API error: ${data.error.message}`, {
          cause: data.error,
        });
      }

      const choice = data.choices?.[0];
      if (isContentFilterFinishReason(choice?.finish_reason)) {
        throw createOpenAIContentFilterError();
      }

      const text = choice?.message?.content;
      if (!text) {
        throw new Error('OpenAI returned empty response');
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
        const body: OpenAIRequest = {
          model: mapModel(config),
          messages: toOpenAIMessages(messages),
          max_completion_tokens: config.maxTokens,
          ...(config.responseFormat === 'json'
            ? { response_format: { type: 'json_object' as const } }
            : {}),
          stream: true,
        };

        try {
          const res = await fetch(OPENAI_BASE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
          });

          if (!res.ok) {
            const errorBody = await res.text();
            throw createProviderHttpError(
              `OpenAI API stream failed (${res.status}): ${errorBody}`,
              res.status,
              errorBody,
            );
          }

          if (!res.body) {
            throw new Error('OpenAI API returned no response body for stream');
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          function processChunk(chunk: OpenAIResponse): string | undefined {
            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) rawFinishReason = finish;
            if (isContentFilterFinishReason(finish)) {
              throw createOpenAIContentFilterError();
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
                  const chunk = JSON.parse(jsonStr) as OpenAIResponse;
                  const text = processChunk(chunk);
                  if (text) yield text;
                } catch (err) {
                  if (err instanceof SafetyFilterError) {
                    throw err;
                  }
                  // [BUG-695] Previously an empty catch silently discarded
                  // malformed SSE chunks, leaving corrupt LLM responses
                  // invisible. Log structurally so we can query
                  // "openai.sse.malformed count over 24h" — discard still
                  // happens (one bad chunk should not kill the stream) but
                  // it is now observable. Truncate the chunk to avoid
                  // bloating logs with multi-KB payloads.
                  logger.warn('[llm:openai] malformed SSE chunk discarded', {
                    event: 'openai.sse.malformed',
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
                    const chunk = JSON.parse(jsonStr) as OpenAIResponse;
                    const text = processChunk(chunk);
                    if (text) yield text;
                  } catch (err) {
                    if (err instanceof SafetyFilterError) {
                      throw err;
                    }
                    // [BUG-695] Same as above — flush-buffer path.
                    logger.warn('[llm:openai] malformed SSE chunk discarded', {
                      event: 'openai.sse.malformed',
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
