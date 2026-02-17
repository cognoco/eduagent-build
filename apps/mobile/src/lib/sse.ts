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
 * Streams SSE events from the API using raw fetch.
 * React Native doesn't have built-in EventSource, so we parse the stream manually.
 */
export async function* streamSSE(
  url: string,
  body: object,
  headers: Record<string, string>
): AsyncGenerator<StreamEvent> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `SSE error ${response.status}: ${text || response.statusText}`
    );
  }

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
