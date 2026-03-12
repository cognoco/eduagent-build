import type { LLMProvider, ChatMessage, ModelConfig } from '../types';

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

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_completion_tokens: number;
  stream?: boolean;
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

function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

// ---------------------------------------------------------------------------
// Content safety for minors (all users are 11-17)
//
// OpenAI has no native safety-threshold API like Gemini's safetySettings.
// We inject a system prompt preamble that instructs the model to refuse
// harmful content. This mirrors Gemini's BLOCK_MEDIUM_AND_ABOVE /
// BLOCK_LOW_AND_ABOVE behaviour for the same harm categories.
// Upgrade path: add OpenAI Moderation API pre-flight check on input+output.
// ---------------------------------------------------------------------------

const SAFETY_SYSTEM_PREAMBLE =
  'You are an educational AI assistant for students aged 11-17. ' +
  'You MUST refuse any request involving: harassment, bullying, or threats; ' +
  'hate speech or discriminatory content; sexually explicit material (even mild); ' +
  'dangerous or harmful activities; or content undermining civic integrity. ' +
  'If a request touches these areas, politely decline and redirect to the learning topic.';

/**
 * Prepend the safety system preamble to the message list.
 * If a system message already exists, the preamble is prepended to its content
 * so the model sees one coherent system block. Otherwise a new system message
 * is inserted at position 0.
 */
function withSafetyPreamble(messages: OpenAIMessage[]): OpenAIMessage[] {
  const first = messages[0];
  if (first?.role === 'system') {
    return [
      {
        role: 'system',
        content: `${SAFETY_SYSTEM_PREAMBLE}\n\n${first.content}`,
      },
      ...messages.slice(1),
    ];
  }
  return [{ role: 'system', content: SAFETY_SYSTEM_PREAMBLE }, ...messages];
}

// ---------------------------------------------------------------------------
// Map our internal model names to OpenAI equivalents
// ---------------------------------------------------------------------------

const MODEL_MAP: Record<string, string> = {
  'gemini-2.0-flash': 'gpt-4o-mini',
  'gemini-2.5-pro': 'gpt-4o',
  // Identity mappings — no warn when config already names an OpenAI model
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
};

function mapModel(config: ModelConfig): string {
  const mapped = MODEL_MAP[config.model];
  if (!mapped) {
    console.warn(
      `[llm:openai] No model mapping for "${config.model}", defaulting to gpt-4o-mini`
    );
  }
  return mapped ?? 'gpt-4o-mini';
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    id: 'openai',

    async chat(messages: ChatMessage[], config: ModelConfig): Promise<string> {
      const body: OpenAIRequest = {
        model: mapModel(config),
        messages: withSafetyPreamble(toOpenAIMessages(messages)),
        max_completion_tokens: config.maxTokens,
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
        throw new Error(
          `OpenAI API request failed (${res.status}): ${errorBody}`
        );
      }

      const data = (await res.json()) as OpenAIResponse;

      if (data.error) {
        throw new Error(`OpenAI API error: ${data.error.message}`);
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('OpenAI returned empty response');
      }
      return text;
    },

    async *chatStream(
      messages: ChatMessage[],
      config: ModelConfig
    ): AsyncIterable<string> {
      const body: OpenAIRequest = {
        model: mapModel(config),
        messages: withSafetyPreamble(toOpenAIMessages(messages)),
        max_completion_tokens: config.maxTokens,
        stream: true,
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
        throw new Error(
          `OpenAI API stream failed (${res.status}): ${errorBody}`
        );
      }

      if (!res.body) {
        throw new Error('OpenAI API returned no response body for stream');
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
              const chunk = JSON.parse(jsonStr) as OpenAIResponse;
              const text = chunk.choices?.[0]?.delta?.content;
              if (text) {
                yield text;
              }
            } catch {
              // Skip malformed JSON chunks
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
                const text = chunk.choices?.[0]?.delta?.content;
                if (text) {
                  yield text;
                }
              } catch {
                // Skip malformed
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
