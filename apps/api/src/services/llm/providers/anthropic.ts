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
import { createProviderApiError, createProviderHttpError } from './errors';
import { anthropicResponseSchema } from '@eduagent/schemas';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Anthropic Provider — premium tier (Sonnet)
// Uses raw fetch() for Cloudflare Workers compatibility (no Node.js SDK)
// ---------------------------------------------------------------------------

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// 25s timeout — CF Workers have a 30s subrequest wall; this gives 5s buffer.
const ANTHROPIC_TIMEOUT_MS = 25_000;

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  stream?: boolean;
}

export function toAnthropicContent(
  content: string | MessagePart[],
): string | AnthropicContentBlock[] {
  if (typeof content === 'string') return content;
  const hasImages = content.some((p) => p.type === 'inline_data');
  if (!hasImages) return getTextContent(content);
  return content.map((part): AnthropicContentBlock => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.mimeType,
        data: part.data,
      },
    };
  });
}

// CR-2026-05-21-080: Anthropic has no native JSON response-format flag.
// When responseFormat='json' is requested, we append a JSON-only directive to
// the system prompt so callers that depend on structured JSON output don't get
// free-text and a downstream parse failure.
const JSON_ONLY_DIRECTIVE =
  'Respond with a single JSON object only. No prose, no markdown, no code fences.';

/**
 * Convert internal ChatMessage[] to Anthropic format.
 * Anthropic uses a separate `system` parameter instead of a system message
 * in the messages array.
 */
export function toAnthropicFormat(
  messages: ChatMessage[],
  responseFormat?: 'json',
): {
  system: string | undefined;
  messages: AnthropicMessage[];
} {
  let system: string | undefined;
  const converted: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Anthropic takes system as a top-level param, not in messages
      system = system
        ? `${system}\n\n${getTextContent(msg.content)}`
        : getTextContent(msg.content);
    } else {
      converted.push({
        role: msg.role as 'user' | 'assistant',
        content: toAnthropicContent(msg.content),
      });
    }
  }

  // Append JSON directive when caller requests structured JSON output.
  // Anthropic has no native response_format flag; this is the only reliable
  // mechanism to steer the model toward a parseable response.
  if (responseFormat === 'json') {
    system = system
      ? `${system}\n\n${JSON_ONLY_DIRECTIVE}`
      : JSON_ONLY_DIRECTIVE;
  }

  return { system, messages: converted };
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createAnthropicProvider(apiKey: string): LLMProvider {
  return {
    id: 'anthropic',

    async chat(
      messages: ChatMessage[],
      config: ModelConfig,
    ): Promise<ChatResult> {
      const { system, messages: anthropicMessages } = toAnthropicFormat(
        messages,
        config.responseFormat,
      );

      const body: AnthropicRequest = {
        model: config.model,
        max_tokens: config.maxTokens,
        system: system ?? '',
        messages: anthropicMessages,
      };

      const res = await fetch(ANTHROPIC_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw createProviderHttpError(
          'Anthropic API request',
          res.status,
          errorBody,
        );
      }

      // [WI-481] Validate the raw provider body at the trust boundary instead
      // of casting — a null/malformed/wrong-shape 2xx body now fails closed as
      // a typed provider error rather than a TypeError on a later field access.
      const parsed = anthropicResponseSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw createProviderApiError('Anthropic API', {
          type: 'invalid_response_shape',
        });
      }
      const data = parsed.data;

      if (data.error) {
        // [FCR-2026-05-23-L11.F11] Keep only the structured type/code tokens for
        // Sentry grouping (rate-limit, auth, content-filter); the vendor message
        // can echo learner input, so it never enters the error.
        throw createProviderApiError('Anthropic API', data.error);
      }

      const text = data.content?.find((b) => b.type === 'text')?.text;
      if (!text) {
        throw new Error('Anthropic returned empty response');
      }
      return {
        content: text,
        stopReason: normalizeStopReason('anthropic', data.stop_reason),
      };
    },

    chatStream(messages: ChatMessage[], config: ModelConfig): ChatStreamResult {
      let resolveStop!: (r: StopReason) => void;
      const stopReasonPromise = new Promise<StopReason>((resolve) => {
        resolveStop = resolve;
      });

      async function* generate(): AsyncIterable<string> {
        let rawStopReason: string | undefined;
        const { system, messages: anthropicMessages } = toAnthropicFormat(
          messages,
          config.responseFormat,
        );

        const body: AnthropicRequest = {
          model: config.model,
          max_tokens: config.maxTokens,
          system: system ?? '',
          messages: anthropicMessages,
          stream: true,
        };

        try {
          const res = await fetch(ANTHROPIC_BASE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
          });

          if (!res.ok) {
            const errorBody = await res.text();
            throw createProviderHttpError(
              'Anthropic API stream',
              res.status,
              errorBody,
            );
          }

          if (!res.body) {
            throw new Error(
              'Anthropic API returned no response body for stream',
            );
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

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
                  const event = JSON.parse(jsonStr) as {
                    type: string;
                    delta?: {
                      type: string;
                      text?: string;
                      stop_reason?: string;
                    };
                  };

                  // Anthropic streams content_block_delta events with text,
                  // and a terminal message_delta event whose delta carries
                  // stop_reason. Capture both.
                  if (
                    event.type === 'content_block_delta' &&
                    event.delta?.type === 'text_delta' &&
                    event.delta.text
                  ) {
                    yield event.delta.text;
                  } else if (
                    event.type === 'message_delta' &&
                    event.delta?.stop_reason
                  ) {
                    rawStopReason = event.delta.stop_reason;
                  }
                } catch {
                  // Log malformed chunks so SSE format changes are detectable
                  logger.warn('[anthropic] Malformed SSE chunk', {
                    chunk: jsonStr.slice(0, 120),
                  });
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        } finally {
          resolveStop(normalizeStopReason('anthropic', rawStopReason));
        }
      }

      return makeChatStreamResult(generate(), stopReasonPromise);
    },
  };
}
