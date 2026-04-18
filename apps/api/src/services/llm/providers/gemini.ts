import {
  getTextContent,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
  type MessagePart,
} from '../types';

// ---------------------------------------------------------------------------
// Gemini Provider — ARCH-8, ARCH-9
// Uses raw fetch() for Cloudflare Workers compatibility (no Node.js SDK)
// ---------------------------------------------------------------------------

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

// BUG-32: Per-chunk read timeout — detects mid-stream stalls within 10s
// instead of waiting for the overall 20s fetch timeout or 30s XHR timeout.
const CHUNK_TIMEOUT_MS = 10_000;

function readWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error('Gemini stream stalled: no data received for 10s')),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Safety settings — all users are minors (11-17)
// ---------------------------------------------------------------------------

interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

const SAFETY_SETTINGS_FOR_MINORS: GeminiSafetySetting[] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_LOW_AND_ABOVE',
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },
  {
    category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },
];

/** Gemini API part — text or inline binary data (images, etc.) */
type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/** Gemini API request body shape */
interface GeminiRequest {
  contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig: { maxOutputTokens: number };
  safetySettings: GeminiSafetySetting[];
}

/** Gemini API response shape */
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message: string; code: number };
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

/** Convert ChatMessage content to Gemini API parts. */
export function toGeminiParts(content: string | MessagePart[]): GeminiPart[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  return content.map((part) => {
    if (part.type === 'text') return { text: part.text };
    return { inline_data: { mime_type: part.mimeType, data: part.data } };
  });
}

function toGeminiRequest(
  messages: ChatMessage[],
  config: ModelConfig
): GeminiRequest {
  // Gemini only supports systemInstruction as a top-level field, not inline
  // with chat turns. Use the first contiguous block of system messages as the
  // system instruction. Any later system messages (e.g., quick-chip hints
  // injected mid-conversation) are converted to user-role messages with a
  // wrapper so they retain their positional context in the conversation.
  let firstSystemBlockEnd = 0;
  while (firstSystemBlockEnd < messages.length) {
    const msg = messages[firstSystemBlockEnd];
    if (!msg || msg.role !== 'system') break;
    firstSystemBlockEnd++;
  }

  const initialSystemMessages = messages.slice(0, firstSystemBlockEnd);
  const remainingMessages = messages.slice(firstSystemBlockEnd);

  const contents = remainingMessages.map((m) => {
    if (m.role === 'system') {
      // Mid-conversation system prompt — inject as user message so Gemini
      // sees it at the correct position in the conversation.
      return {
        role: 'user' as const,
        parts: [{ text: `[Tutor instruction]: ${getTextContent(m.content)}` }],
      };
    }
    return {
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: toGeminiParts(m.content),
    };
  });

  const request: GeminiRequest = {
    contents,
    generationConfig: { maxOutputTokens: config.maxTokens },
    safetySettings: SAFETY_SETTINGS_FOR_MINORS,
  };

  if (initialSystemMessages.length > 0) {
    request.systemInstruction = {
      parts: [
        {
          text: initialSystemMessages
            .map((m) => getTextContent(m.content))
            .join('\n\n'),
        },
      ],
    };
  }

  return request;
}

function extractResponseText(data: GeminiResponse): string {
  // Prompt-level safety block — the entire input was rejected
  if (data.promptFeedback?.blockReason === 'SAFETY') {
    throw new Error(
      'Your message could not be processed due to content safety filters. Please rephrase and try again.'
    );
  }

  // Candidate-level safety block — the generated output was rejected
  if (data.candidates?.[0]?.finishReason === 'SAFETY') {
    throw new Error(
      'The response was blocked by content safety filters. Please try rephrasing your question.'
    );
  }

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
        signal: AbortSignal.timeout(20_000),
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
        signal: AbortSignal.timeout(20_000),
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

            // Safety block during streaming
            if (chunk.promptFeedback?.blockReason === 'SAFETY') {
              throw new Error(
                'Your message could not be processed due to content safety filters. Please rephrase and try again.'
              );
            }
            if (chunk.candidates?.[0]?.finishReason === 'SAFETY') {
              throw new Error(
                'The response was blocked by content safety filters. Please try rephrasing your question.'
              );
            }

            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yield text;
            }
          } catch (e) {
            // Re-throw safety errors; skip malformed JSON
            if (e instanceof Error && e.message.includes('safety filters')) {
              throw e;
            }
          }
        }
      }

      try {
        while (true) {
          // BUG-32: Per-chunk timeout — if Gemini stalls mid-stream (sends
          // first bytes then goes silent), detect within 10s instead of
          // waiting for the overall fetch AbortSignal or mobile XHR timeout.
          const { done, value } = await readWithTimeout(
            reader.read(),
            CHUNK_TIMEOUT_MS
          );
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
