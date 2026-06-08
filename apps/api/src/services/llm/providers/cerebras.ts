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
import { normalizeModelRefusal } from './refusal-envelope';

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
//     normalizeModelRefusal (~1% of refusals on gpt-oss). The streaming path
//     does NOT — like every other streaming provider, a mid-stream refusal
//     surfaces to the downstream envelope-parse fallback (buffering the whole
//     stream to rewrite it would defeat streaming).
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

interface CerebrasChoice {
  message?: { content?: string };
  delta?: { content?: string };
  finish_reason?: string;
}

interface CerebrasResponse {
  choices?: CerebrasChoice[];
  error?: { message: string; type: string; code?: string };
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

      const data = (await res.json()) as CerebrasResponse;

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

          function processChunk(chunk: CerebrasResponse): string | undefined {
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
                  const chunk = JSON.parse(jsonStr) as CerebrasResponse;
                  const text = processChunk(chunk);
                  if (text) yield text;
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
                    const chunk = JSON.parse(jsonStr) as CerebrasResponse;
                    const text = processChunk(chunk);
                    if (text) yield text;
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
