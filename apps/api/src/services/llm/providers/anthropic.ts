import {
  getTextContent,
  makeChatStreamResult,
  type LLMProvider,
  type ChatMessage,
  type ChatResult,
  type ChatStreamResult,
  type LlmUsage,
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

// Prompt-caching system block (WI-1779). Anthropic accepts `system` as either a
// plain string or an array of text blocks; a `cache_control` marker on a block
// caches the prefix up to and including it.
type AnthropicSystemBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string | AnthropicSystemBlock[];
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

// ---------------------------------------------------------------------------
// Usage / prompt-cache metadata (WI-1827)
// ---------------------------------------------------------------------------

/** Anthropic's `usage` wire shape (native Messages API), all fields optional. */
interface AnthropicUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Map Anthropic's snake_case `usage` block to the normalized {@link LlmUsage}.
 * Copies only numeric fields (so `null`/absent become undefined) and preserves
 * `0` verbatim — `cache_read_input_tokens: 0` is the prompt-prefix regression
 * signal. Returns undefined when nothing numeric is present, so an empty usage
 * block reads as "absent" rather than an empty object.
 */
export function toAnthropicLlmUsage(
  raw: AnthropicUsage | undefined | null,
): LlmUsage | undefined {
  if (!raw) return undefined;
  const usage: LlmUsage = {};
  if (typeof raw.input_tokens === 'number')
    usage.inputTokens = raw.input_tokens;
  if (typeof raw.output_tokens === 'number') {
    usage.outputTokens = raw.output_tokens;
  }
  if (typeof raw.cache_creation_input_tokens === 'number') {
    usage.cacheCreationInputTokens = raw.cache_creation_input_tokens;
  }
  if (typeof raw.cache_read_input_tokens === 'number') {
    usage.cacheReadInputTokens = raw.cache_read_input_tokens;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

/**
 * Convert internal ChatMessage[] to Anthropic format.
 * Anthropic uses a separate `system` parameter instead of a system message
 * in the messages array.
 */
export function toAnthropicFormat(
  messages: ChatMessage[],
  responseFormat?: 'json',
): {
  system: string | AnthropicSystemBlock[] | undefined;
  messages: AnthropicMessage[];
} {
  let systemText: string | undefined;
  // WI-1779: char offset within systemText where the cache-stable prefix ends.
  let cacheBoundary: number | undefined;
  const converted: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Anthropic takes system as a top-level param, not in messages
      const text = getTextContent(msg.content);
      if (systemText === undefined) {
        systemText = text;
        // Only a single, string-content system message carries a usable caching
        // boundary. Any additional system message shifts the offsets, so drop
        // the split in that case (correctness over caching).
        if (typeof msg.content === 'string' && msg.cachePrefixLength != null) {
          cacheBoundary = msg.cachePrefixLength;
        }
      } else {
        systemText = `${systemText}\n\n${text}`;
        cacheBoundary = undefined;
      }
    } else {
      converted.push({
        role: msg.role as 'user' | 'assistant',
        content: toAnthropicContent(msg.content),
      });
    }
  }

  // Append JSON directive when caller requests structured JSON output.
  // Anthropic has no native response_format flag; this is the only reliable
  // mechanism to steer the model toward a parseable response. It is stable text
  // appended AFTER the cache boundary, so it lands in the uncached remainder
  // and never perturbs the cached prefix.
  if (responseFormat === 'json') {
    systemText = systemText
      ? `${systemText}\n\n${JSON_ONLY_DIRECTIVE}`
      : JSON_ONLY_DIRECTIVE;
  }

  // WI-1779: when a caller marked a cache-stable prefix, emit `system` as two
  // text blocks with a `cache_control` breakpoint on the stable one. Anthropic
  // silently skips caching if the prefix is under the model minimum (~1024–4096
  // tokens), which is harmless. Otherwise `system` stays a plain string.
  let system: string | AnthropicSystemBlock[] | undefined;
  if (systemText === undefined) {
    system = undefined;
  } else if (
    cacheBoundary != null &&
    cacheBoundary > 0 &&
    cacheBoundary < systemText.length
  ) {
    system = [
      {
        type: 'text',
        text: systemText.slice(0, cacheBoundary),
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: systemText.slice(cacheBoundary) },
    ];
  } else {
    system = systemText;
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
      signal?: AbortSignal,
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
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS)])
          : AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
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
        usage: toAnthropicLlmUsage(data.usage),
      };
    },

    chatStream(messages: ChatMessage[], config: ModelConfig): ChatStreamResult {
      let resolveStop!: (r: StopReason) => void;
      const stopReasonPromise = new Promise<StopReason>((resolve) => {
        resolveStop = resolve;
      });
      // WI-1827: usage-carrying promise mirroring stopReasonPromise. Resolves
      // in the same finally so awaiting callers never hang, even on error.
      let resolveUsage!: (u: LlmUsage | undefined) => void;
      const usagePromise = new Promise<LlmUsage | undefined>((resolve) => {
        resolveUsage = resolve;
      });

      async function* generate(): AsyncIterable<string> {
        let rawStopReason: string | undefined;
        // Anthropic emits usage across two SSE events: message_start carries
        // input + cache_creation/cache_read tokens; the terminal message_delta
        // carries the final output_tokens. Accumulate both into one LlmUsage.
        let usageAcc: LlmUsage | undefined;
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
                    // message_start carries the initial usage (input +
                    // cache_creation/cache_read tokens) under message.usage.
                    message?: { usage?: AnthropicUsage };
                    // message_delta carries the final output_tokens under a
                    // top-level usage sibling of `delta`.
                    usage?: AnthropicUsage;
                  };

                  // Anthropic streams content_block_delta events with text,
                  // and a terminal message_delta event whose delta carries
                  // stop_reason. Capture both, plus usage from message_start
                  // and message_delta (WI-1827).
                  if (
                    event.type === 'content_block_delta' &&
                    event.delta?.type === 'text_delta' &&
                    event.delta.text
                  ) {
                    yield event.delta.text;
                  } else if (event.type === 'message_start') {
                    const startUsage = toAnthropicLlmUsage(
                      event.message?.usage,
                    );
                    if (startUsage) usageAcc = { ...usageAcc, ...startUsage };
                  } else if (event.type === 'message_delta') {
                    if (event.delta?.stop_reason) {
                      rawStopReason = event.delta.stop_reason;
                    }
                    const deltaUsage = toAnthropicLlmUsage(event.usage);
                    if (deltaUsage) usageAcc = { ...usageAcc, ...deltaUsage };
                  }
                } catch {
                  // Log malformed chunks so SSE format changes are detectable
                  logger.warn('[anthropic] Malformed SSE chunk', {
                    chunkLength: jsonStr.length,
                    errorKind: 'json_parse',
                  });
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        } finally {
          // Resolve usage before the stop reason so a router that logs on
          // stopReasonPromise finds usage already settled (WI-1827).
          resolveUsage(usageAcc);
          resolveStop(normalizeStopReason('anthropic', rawStopReason));
        }
      }

      return makeChatStreamResult(generate(), stopReasonPromise, usagePromise);
    },
  };
}
