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
import { SafetyFilterError } from '../../../errors';
import { createProviderApiError, createProviderHttpError } from './errors';
import {
  geminiResponseSchema,
  type GeminiResponseParsed,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Gemini Provider — MMT-ADR-0017, MMT-ADR-0014
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
      ms,
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
  generationConfig: {
    maxOutputTokens: number;
    responseMimeType?: 'application/json';
  };
  safetySettings: GeminiSafetySetting[];
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
  config: ModelConfig,
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
    generationConfig: {
      maxOutputTokens: config.maxTokens,
      ...(config.responseFormat === 'json'
        ? { responseMimeType: 'application/json' as const }
        : {}),
    },
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

function extractFinishReason(data: GeminiResponseParsed): string | undefined {
  return data.candidates?.[0]?.finishReason;
}

// [H1 — 2026-06-05 safety audit] ALL of Gemini's content-block reasons are
// terminal, not just `SAFETY`. Previously `PROHIBITED_CONTENT`, `BLOCKLIST`,
// and `SPII` surfaced as generic errors, which the router treats as
// *transient* — it retried and fell back to another provider, re-opening
// exactly the "Gemini refused, ask someone else" loophole that
// SafetyFilterError's no-retry/no-fallback rule (router.ts:617, 660-685) was
// built to close. `IMAGE_SAFETY` is included as the same class.
// `RECITATION` is deliberately excluded: it is a copyright/licensing block,
// not a content-safety judgment — retrying it elsewhere is acceptable.
const TERMINAL_BLOCK_REASONS = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'IMAGE_SAFETY',
]);

function isTerminalBlockReason(reason: string | undefined): boolean {
  return reason !== undefined && TERMINAL_BLOCK_REASONS.has(reason);
}

function extractResponseText(data: GeminiResponseParsed): string {
  // Prompt-level content block — the entire input was rejected
  if (isTerminalBlockReason(data.promptFeedback?.blockReason)) {
    throw new SafetyFilterError(
      'Your message could not be processed due to content safety filters. Please rephrase and try again.',
    );
  }

  // Candidate-level content block — the generated output was rejected
  if (isTerminalBlockReason(data.candidates?.[0]?.finishReason)) {
    throw new SafetyFilterError(
      'The response was blocked by content safety filters. Please try rephrasing your question.',
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    if (data.error) {
      // [FCR-2026-05-23-L11.F11] Keep only the structured type/code tokens for
      // Sentry grouping (rate-limit, auth, quota); the vendor message can echo
      // learner input, so it never enters the error.
      throw createProviderApiError('Gemini API', data.error);
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

    async chat(
      messages: ChatMessage[],
      config: ModelConfig,
      signal?: AbortSignal,
    ): Promise<ChatResult> {
      const body = toGeminiRequest(messages, config);
      const url = `${GEMINI_BASE_URL}/${config.model}:generateContent`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
          : AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw createProviderHttpError(
          'Gemini API request',
          res.status,
          errorBody,
        );
      }

      // [WI-481] Validate the raw provider body at the trust boundary instead
      // of casting — a null/malformed/wrong-shape 2xx body fails closed as a
      // typed provider error rather than a TypeError on a later field access.
      const parsed = geminiResponseSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw createProviderApiError('Gemini API', {
          type: 'invalid_response_shape',
        });
      }
      const data = parsed.data;
      const content = extractResponseText(data);
      return {
        content,
        stopReason: normalizeStopReason('gemini', extractFinishReason(data)),
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
          const body = toGeminiRequest(messages, config);
          const url = `${GEMINI_BASE_URL}/${config.model}:streamGenerateContent?alt=sse`;

          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(20_000),
          });

          if (!res.ok) {
            const errorBody = await res.text();
            throw createProviderHttpError(
              'Gemini API stream',
              res.status,
              errorBody,
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
                // [WI-481] Validate each SSE chunk at the trust boundary; a
                // well-formed-JSON-but-wrong-shape chunk is skipped like any
                // other malformed chunk rather than read via an unchecked cast.
                const parsedChunk = geminiResponseSchema.safeParse(
                  JSON.parse(jsonStr),
                );
                if (!parsedChunk.success) continue;
                const chunk = parsedChunk.data;

                // Content block during streaming — [H1] all terminal block
                // reasons, not just SAFETY (see TERMINAL_BLOCK_REASONS above).
                if (isTerminalBlockReason(chunk.promptFeedback?.blockReason)) {
                  throw new SafetyFilterError(
                    'Your message could not be processed due to content safety filters. Please rephrase and try again.',
                  );
                }
                if (
                  isTerminalBlockReason(chunk.candidates?.[0]?.finishReason)
                ) {
                  throw new SafetyFilterError(
                    'The response was blocked by content safety filters. Please try rephrasing your question.',
                  );
                }

                const finish = chunk.candidates?.[0]?.finishReason;
                if (finish) rawFinishReason = finish;

                const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  yield text;
                }
              } catch (e) {
                // Re-throw safety errors; skip malformed JSON
                if (e instanceof SafetyFilterError) {
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
                CHUNK_TIMEOUT_MS,
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
        } finally {
          resolveStop(normalizeStopReason('gemini', rawFinishReason));
        }
      }

      return makeChatStreamResult(generate(), stopReasonPromise);
    },
  };
}
