import { registerProvider, type LLMProvider } from '../services/llm';
import {
  makeChatStreamResult,
  type ChatMessage,
  type ChatResult,
  type ModelConfig,
} from '../services/llm/types';
import type { StopReason } from '../services/llm/stop-reason';

export type LlmFixtureContent =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];

export interface LlmProviderFixtureCall {
  messages: ChatMessage[];
  config: ModelConfig;
}

export interface LlmProviderFixtureOptions {
  id?: string;
  chatResponse?: LlmFixtureContent;
  chatResponses?: LlmFixtureContent[];
  chatError?: unknown;
  chatErrors?: unknown[];
  streamResponse?: LlmFixtureContent;
  streamResponses?: LlmFixtureContent[];
  streamError?: unknown;
  stopReason?: StopReason;
  chunkSize?: number;
}

export interface LlmEnvelopeFixtureOptions {
  signals?: Record<string, unknown>;
  uiHints?: Record<string, unknown>;
}

const DEFAULT_REPLY = 'Fixture LLM response';
const DEFAULT_CHUNK_SIZE = 12;

export function llmStructuredJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('LLM fixture content must be JSON-serializable');
  }
  return serialized;
}

export function llmEnvelopeReply(
  reply: string = DEFAULT_REPLY,
  options: LlmEnvelopeFixtureOptions = {},
): string {
  return llmStructuredJson({
    reply,
    signals: options.signals ?? {},
    ...(options.uiHints ? { ui_hints: options.uiHints } : {}),
  });
}

export function llmInvalidJson(): string {
  return '{"reply": "unfinished"';
}

export function llmPlainText(text: string): string {
  return text;
}

function contentToString(content: LlmFixtureContent): string {
  return typeof content === 'string' ? content : llmStructuredJson(content);
}

function throwFixtureError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error(String(error));
}

function chunkText(content: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }
  return chunks;
}

export function createLlmProviderFixture(
  options: LlmProviderFixtureOptions = {},
) {
  const id = options.id ?? 'gemini';
  const stopReason = options.stopReason ?? 'stop';
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

  let chatResponse = contentToString(
    options.chatResponse ?? llmEnvelopeReply(),
  );
  let streamResponse =
    options.streamResponse === undefined
      ? null
      : contentToString(options.streamResponse);
  let chatError = options.chatError;
  let streamError = options.streamError;

  const queuedChatResponses = (options.chatResponses ?? []).map(
    contentToString,
  );
  const queuedChatErrors = [...(options.chatErrors ?? [])];
  const queuedStreamResponses = (options.streamResponses ?? []).map(
    contentToString,
  );
  const chatCalls: LlmProviderFixtureCall[] = [];
  const streamCalls: LlmProviderFixtureCall[] = [];

  const provider: LLMProvider = {
    id,
    async chat(
      messages: ChatMessage[],
      config: ModelConfig,
    ): Promise<ChatResult> {
      chatCalls.push({ messages, config });
      const queuedError = queuedChatErrors.shift();
      if (queuedError !== undefined) {
        throwFixtureError(queuedError);
      }
      if (chatError !== undefined) {
        throwFixtureError(chatError);
      }
      return {
        content: queuedChatResponses.shift() ?? chatResponse,
        stopReason,
      };
    },
    chatStream(messages: ChatMessage[], config: ModelConfig) {
      streamCalls.push({ messages, config });
      const response =
        queuedStreamResponses.shift() ?? streamResponse ?? chatResponse;

      let resolveStopReason!: (reason: StopReason) => void;
      const stopReasonPromise = new Promise<StopReason>((resolve) => {
        resolveStopReason = resolve;
      });

      async function* streamChunks(): AsyncIterable<string> {
        try {
          if (streamError !== undefined) {
            throwFixtureError(streamError);
          }
          for (const chunk of chunkText(response, chunkSize)) {
            yield chunk;
          }
        } finally {
          resolveStopReason(streamError === undefined ? stopReason : 'unknown');
        }
      }

      return makeChatStreamResult(streamChunks(), stopReasonPromise);
    },
  };

  return {
    provider,
    chatCalls,
    streamCalls,
    setChatResponse(content: LlmFixtureContent): void {
      chatResponse = contentToString(content);
    },
    queueChatResponse(content: LlmFixtureContent): void {
      queuedChatResponses.push(contentToString(content));
    },
    setChatError(error: unknown): void {
      chatError = error;
    },
    queueChatError(error: unknown): void {
      queuedChatErrors.push(error);
    },
    clearChatError(): void {
      chatError = undefined;
    },
    setStreamResponse(content: LlmFixtureContent): void {
      streamResponse = contentToString(content);
    },
    queueStreamResponse(content: LlmFixtureContent): void {
      queuedStreamResponses.push(contentToString(content));
    },
    setStreamError(error: unknown): void {
      streamError = error;
    },
    clearStreamError(): void {
      streamError = undefined;
    },
    clearCalls(): void {
      chatCalls.length = 0;
      streamCalls.length = 0;
    },
  };
}

export function registerLlmProviderFixture(
  options: LlmProviderFixtureOptions = {},
): ReturnType<typeof createLlmProviderFixture> {
  const fixture = createLlmProviderFixture(options);
  registerProvider(fixture.provider);
  return fixture;
}
