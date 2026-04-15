import {
  getTextContent,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from '../types';
import { createLogger } from '../../logger';

const logger = createLogger({ level: 'info', environment: 'production' });

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

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  stream?: boolean;
}

interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  error?: { type: string; message: string };
}

/**
 * Convert internal ChatMessage[] to Anthropic format.
 * Anthropic uses a separate `system` parameter instead of a system message
 * in the messages array.
 */
function toAnthropicFormat(messages: ChatMessage[]): {
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
        content: getTextContent(msg.content),
      });
    }
  }

  return { system, messages: converted };
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createAnthropicProvider(apiKey: string): LLMProvider {
  return {
    id: 'anthropic',

    async chat(messages: ChatMessage[], config: ModelConfig): Promise<string> {
      const { system, messages: anthropicMessages } =
        toAnthropicFormat(messages);

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
        throw new Error(
          `Anthropic API request failed (${res.status}): ${errorBody}`
        );
      }

      const data = (await res.json()) as AnthropicResponse;

      if (data.error) {
        throw new Error(`Anthropic API error: ${data.error.message}`);
      }

      const text = data.content?.find((b) => b.type === 'text')?.text;
      if (!text) {
        throw new Error('Anthropic returned empty response');
      }
      return text;
    },

    async *chatStream(
      messages: ChatMessage[],
      config: ModelConfig
    ): AsyncIterable<string> {
      const { system, messages: anthropicMessages } =
        toAnthropicFormat(messages);

      const body: AnthropicRequest = {
        model: config.model,
        max_tokens: config.maxTokens,
        system: system ?? '',
        messages: anthropicMessages,
        stream: true,
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
        throw new Error(
          `Anthropic API stream failed (${res.status}): ${errorBody}`
        );
      }

      if (!res.body) {
        throw new Error('Anthropic API returned no response body for stream');
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
                delta?: { type: string; text?: string };
              };

              // Anthropic streams content_block_delta events with text
              if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                event.delta.text
              ) {
                yield event.delta.text;
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
    },
  };
}
