/**
 * Lightweight SSE client for React Native.
 *
 * React Native does not provide a built-in EventSource API, so we parse
 * Server-Sent Events manually. Two implementations are provided:
 *
 * - `parseSSEStream` — uses ReadableStream (works in Node.js / browsers)
 * - `streamSSEViaXHR` — uses XMLHttpRequest with onprogress (works on React Native)
 *
 * React Native's Hermes fetch does NOT support ReadableStream on response.body
 * (it returns null), so `useStreamMessage` uses the XHR variant at runtime.
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

// ---------------------------------------------------------------------------
// ReadableStream-based parser (Node.js / browsers / tests)
// ---------------------------------------------------------------------------

/**
 * Parses SSE events from a Response with ReadableStream body.
 * Does NOT work on React Native (response.body is null on Hermes).
 * Kept for tests and future web support.
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
          const parsed: unknown = JSON.parse(data);
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'type' in parsed
          ) {
            yield parsed as StreamEvent;
          }
        } catch {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// XMLHttpRequest-based SSE stream (React Native)
// ---------------------------------------------------------------------------

/** Parse SSE data lines from a text buffer, returning unconsumed remainder. */
function parseSSEBuffer(
  buffer: string,
  queue: StreamEvent[],
  onDone: () => void
): string {
  const lines = buffer.split('\n');
  const remainder = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data: ')) continue;

    const data = trimmed.slice(6);
    if (data === '[DONE]') {
      onDone();
      return '';
    }

    try {
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
        queue.push(parsed as StreamEvent);
      }
    } catch {
      // Skip malformed events
    }
  }

  return remainder;
}

/**
 * Opens an SSE connection via XMLHttpRequest. React Native's XHR fires
 * `onprogress` events with incremental `responseText`, enabling real-time
 * streaming without the Web Streams API.
 *
 * Returns an async generator of StreamEvents and an abort handle.
 */
export function streamSSEViaXHR(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): { events: AsyncGenerator<StreamEvent>; abort: () => void } {
  const eventQueue: StreamEvent[] = [];
  let resolve: (() => void) | null = null;
  let done = false;
  let streamError: Error | null = null;
  let lastIndex = 0;
  let buffer = '';

  const xhr = new XMLHttpRequest();
  xhr.open(options.method ?? 'POST', url);

  // Set request headers
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      xhr.setRequestHeader(key, value);
    }
  }

  // Detect HTTP errors early (before streaming begins)
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 2 && xhr.status >= 400) {
      streamError = new Error(`API error ${xhr.status}: ${xhr.statusText}`);
      done = true;
      resolve?.();
    }
  };

  // Progressive data — fires as responseText grows
  xhr.onprogress = () => {
    if (done) return;

    const newData = xhr.responseText.substring(lastIndex);
    lastIndex = xhr.responseText.length;
    buffer += newData;

    buffer = parseSSEBuffer(buffer, eventQueue, () => {
      done = true;
    });

    resolve?.();
  };

  xhr.onerror = () => {
    streamError = new Error(
      `SSE connection failed: ${xhr.statusText || 'network error'}`
    );
    done = true;
    resolve?.();
  };

  xhr.onloadend = () => {
    // Parse any remaining buffer data
    if (buffer) {
      parseSSEBuffer(buffer + '\n', eventQueue, () => {
        // no-op: done flag set below
      });
      buffer = '';
    }
    done = true;
    resolve?.();
  };

  // Text mode — required for incremental responseText access
  xhr.responseType = '';
  xhr.send(options.body ?? null);

  async function* generateEvents(): AsyncGenerator<StreamEvent> {
    while (true) {
      while (eventQueue.length > 0) {
        const event = eventQueue.shift();
        if (event) yield event;
      }
      if (done) {
        if (streamError) throw streamError;
        return;
      }
      await new Promise<void>((r) => {
        resolve = r;
      });
    }
  }

  return {
    events: generateEvents(),
    abort: () => xhr.abort(),
  };
}
