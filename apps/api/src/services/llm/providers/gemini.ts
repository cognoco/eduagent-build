import type { LLMProvider, ChatMessage, ModelConfig } from '../types';

// ---------------------------------------------------------------------------
// Gemini Provider — ARCH-8, ARCH-9
// Uses raw fetch() for Cloudflare Workers compatibility (no Node.js SDK)
// ---------------------------------------------------------------------------

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

/** Gemini API request body shape */
interface GeminiRequest {
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig: { maxOutputTokens: number };
}

/** Gemini API response shape */
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message: string; code: number };
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

function toGeminiRequest(
  messages: ChatMessage[],
  config: ModelConfig
): GeminiRequest {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const contents = chatMessages.map((m) => ({
    role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
    parts: [{ text: m.content }],
  }));

  const request: GeminiRequest = {
    contents,
    generationConfig: { maxOutputTokens: config.maxTokens },
  };

  if (systemMessages.length > 0) {
    request.systemInstruction = {
      parts: [{ text: systemMessages.map((m) => m.content).join('\n\n') }],
    };
  }

  return request;
}

function extractResponseText(data: GeminiResponse): string {
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }
    throw new Error('Gemini returned empty response');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createGeminiProvider(apiKey: string): LLMProvider {
  return {
    id: 'gemini',

    async chat(messages: ChatMessage[], config: ModelConfig): Promise<string> {
      const body = toGeminiRequest(messages, config);
      const url = `${GEMINI_BASE_URL}/${config.model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(
          `Gemini API request failed (${res.status}): ${errorBody}`
        );
      }

      const data = (await res.json()) as GeminiResponse;
      return extractResponseText(data);
    },

    async *chatStream(
      messages: ChatMessage[],
      config: ModelConfig
    ): AsyncIterable<string> {
      const body = toGeminiRequest(messages, config);
      const url = `${GEMINI_BASE_URL}/${config.model}:streamGenerateContent?alt=sse&key=${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(
          `Gemini API stream failed (${res.status}): ${errorBody}`
        );
      }

      if (!res.body) {
        throw new Error('Gemini API returned no response body for stream');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function* parseSseLines(lines: string[]): Generator<string> {
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr) as GeminiResponse;
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yield text;
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? '';

          yield* parseSseLines(lines);
        }

        // Flush any remaining data in the buffer
        if (buffer.trim()) {
          yield* parseSseLines([buffer]);
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
