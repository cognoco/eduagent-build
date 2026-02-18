/**
 * Lightweight SSE client for React Native.
 *
 * React Native does not provide a built-in EventSource API, so we parse
 * Server-Sent Events manually from a raw fetch ReadableStream.
 *
 * Used by `useStreamMessage` to pipe real-time LLM tokens into the chat UI.
 */

export interface StreamChunkEvent {
  type: 'chunk';
  content: string;
}

export interface StreamDoneEvent {
  type: 'done';
  exchangeCount: number;
  escalationRung: number;
}

export type StreamEvent = StreamChunkEvent | StreamDoneEvent;

/**
 * Parses SSE events from a Response already fetched via the RPC client.
 * The RPC client handles auth headers and error status codes;
 * this function only reads the stream body.
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<StreamEvent> {
  if (!response.body) {
    throw new Error('Response body is null — streaming not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6); // Remove 'data: ' prefix
        if (data === '[DONE]') return;

        try {
          const event = JSON.parse(data) as StreamEvent;
          yield event;
        } catch {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
