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
import { QuotaExceededError, type QuotaExceededDetails } from './api-client';

export interface StreamChunkEvent {
  type: 'chunk';
  content: string;
}

export type StreamFallbackReason =
  | 'empty_reply'
  | 'malformed_envelope'
  | 'orphan_marker';

export interface StreamFallbackEvent {
  type: 'fallback';
  reason: StreamFallbackReason;
  fallbackText: string;
}

/** Fluency drill annotation surfaced via SSE done event */
export interface FluencyDrillEvent {
  active: boolean;
  durationSeconds?: number;
  score?: { correct: number; total: number };
}

export interface StreamDoneEvent {
  type: 'done';
  exchangeCount: number;
  /** Present on learning sessions; absent on interview done events. */
  escalationRung?: number;
  /** Present on interview done events; absent on learning sessions. */
  isComplete?: boolean;
  /** LLM-estimated response time for adaptive silence detection. */
  expectedResponseMinutes?: number;
  /** Whether the LLM offered a note prompt to the learner. */
  notePrompt?: boolean;
  /** Whether the note prompt is a post-session prompt. */
  notePromptPostSession?: boolean;
  /** Fluency drill start/end annotation for language sessions. */
  fluencyDrill?: FluencyDrillEvent;
  /** F6: LLM self-reported confidence. Absent or 'medium'/'high' = no indicator. Only 'low' shows a UI prompt. */
  confidence?: 'low' | 'medium' | 'high';
}

export interface StreamErrorEvent {
  type: 'error';
  message: string;
}

export type StreamEvent =
  | StreamChunkEvent
  | StreamFallbackEvent
  | StreamDoneEvent
  | StreamErrorEvent;

/** BC-07: runtime validation for SSE events — verifies required fields exist
 * before casting, preventing malformed events from corrupting accumulated text.
 * Note: `escalationRung` is only present on learning-session done events;
 * interview done events carry `isComplete` instead. Both are valid. */
function isValidStreamEvent(obj: Record<string, unknown>): boolean {
  if (obj.type === 'chunk') return typeof obj.content === 'string';
  if (obj.type === 'fallback') {
    return (
      typeof obj.reason === 'string' && typeof obj.fallbackText === 'string'
    );
  }
  if (obj.type === 'done') return typeof obj.exchangeCount === 'number';
  if (obj.type === 'error') return typeof obj.message === 'string';
  return false;
}

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
      // SSE spec allows \r\n, \r, and \n as line terminators
      const lines = buffer.split(/\r\n|\r|\n/);
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
            'type' in parsed &&
            isValidStreamEvent(parsed as Record<string, unknown>)
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
  // SSE spec allows \r\n, \r, and \n as line terminators
  const lines = buffer.split(/\r\n|\r|\n/);
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
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'type' in parsed &&
        isValidStreamEvent(parsed as Record<string, unknown>)
      ) {
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
 *
 * @remarks Callers MUST call `abort()` when they stop consuming `events`
 * (e.g. on component unmount or early exit from `for await`). The XHR runs
 * independently of the generator — abandoning the generator without aborting
 * leaves the connection open until the 30s timeout fires.
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

  // Detect HTTP errors as soon as headers arrive (readyState 2) — prevents
  // onprogress from parsing error response bodies as SSE data.  We set the
  // error and `done` flag here but do NOT wake the generator yet — onloadend
  // will enrich the error with the full response body and then resolve.
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 2 && xhr.status >= 400) {
      // Placeholder — onloadend will overwrite with a richer error once the
      // full response body is available (needed for QuotaExceededError on 402).
      streamError = new Error(
        `API error ${xhr.status}: ${xhr.statusText || 'request failed'}`
      ) as Error & { status?: number };
      (streamError as Error & { status?: number }).status = xhr.status;
      done = true;
    }
  };

  // Idle timeout: reset on each progress event. Unlike XHR's built-in timeout
  // (which counts total request time), this only fires when the server stops
  // sending data for IDLE_TIMEOUT_MS. The server may take 20s+ for LLM
  // streaming then another 10s for post-stream DB writes — the total easily
  // exceeds a fixed 30s timeout, but the stream is never truly idle.
  const IDLE_TIMEOUT_MS = 45_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (done) return;
    const timeoutError = new Error(
      'The connection timed out while waiting for a reply'
    ) as Error & { isTimeout: boolean };
    timeoutError.isTimeout = true;
    streamError = timeoutError;
    done = true;
    xhr.abort();
    const r = resolve;
    resolve = null;
    r?.();
  }, IDLE_TIMEOUT_MS);

  const resetIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (done) return;
      const timeoutError = new Error(
        'The connection timed out while waiting for a reply'
      ) as Error & { isTimeout: boolean };
      timeoutError.isTimeout = true;
      streamError = timeoutError;
      done = true;
      xhr.abort();
      const r = resolve;
      resolve = null;
      r?.();
    }, IDLE_TIMEOUT_MS);
  };

  // Progressive data — fires as responseText grows
  xhr.onprogress = () => {
    if (done) return;
    resetIdleTimer();

    const newData = xhr.responseText.substring(lastIndex);
    lastIndex = xhr.responseText.length;
    buffer += newData;

    buffer = parseSSEBuffer(buffer, eventQueue, () => {
      done = true;
    });

    const r = resolve;
    resolve = null;
    r?.();
  };

  xhr.onerror = () => {
    if (idleTimer) clearTimeout(idleTimer);
    streamError = new Error(
      `SSE connection failed: ${xhr.statusText || 'network error'}`
    );
    done = true;
    const r = resolve;
    resolve = null;
    r?.();
  };

  xhr.onloadend = () => {
    if (idleTimer) clearTimeout(idleTimer);
    // If headers-received handler already flagged an error, enrich it with the
    // full response body (now available) and extract any structured error code.
    if (streamError && xhr.status >= 400) {
      // Promote 402 to QuotaExceededError so downstream code gets quota details
      // and can show the upgrade CTA — a plain Error silently drops them.
      if (xhr.status === 402) {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as {
            code?: string;
            message?: string;
            details?: QuotaExceededDetails;
          };
          if (parsed.code === 'QUOTA_EXCEEDED' && parsed.details) {
            streamError = new QuotaExceededError(
              parsed.message ?? 'Quota exceeded',
              parsed.details
            );
            done = true;
            const r = resolve;
            resolve = null;
            r?.();
            return;
          }
        } catch {
          // Fall through to generic error enrichment below.
        }
      }
      const apiError = streamError as Error & {
        status?: number;
        code?: string;
      };
      // Overwrite with full body now that it's available
      apiError.message = `API error ${xhr.status}: ${
        xhr.responseText || xhr.statusText
      }`;
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          code?: string;
          error?: { code?: string };
        };
        const errorCode = parsed.code ?? parsed.error?.code;
        if (typeof errorCode === 'string') {
          apiError.code = errorCode;
        }
      } catch {
        // Ignore malformed error bodies — formatApiError handles plain text.
      }
      done = true;
      const r = resolve;
      resolve = null;
      r?.();
      return;
    }
    // Skip if already errored for non-HTTP reasons (timeout, network)
    if (streamError) {
      done = true;
      const r = resolve;
      resolve = null;
      r?.();
      return;
    }
    if (xhr.status >= 400) {
      // Promote 402 to QuotaExceededError so downstream code gets quota details
      // and can show the upgrade CTA — a plain Error silently drops them.
      if (xhr.status === 402) {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as {
            code?: string;
            message?: string;
            details?: QuotaExceededDetails;
          };
          if (parsed.code === 'QUOTA_EXCEEDED' && parsed.details) {
            streamError = new QuotaExceededError(
              parsed.message ?? 'Quota exceeded',
              parsed.details
            );
            done = true;
            const r = resolve;
            resolve = null;
            r?.();
            return;
          }
        } catch {
          // Fall through to generic error path below.
        }
      }
      const apiError = new Error(
        `API error ${xhr.status}: ${xhr.responseText || xhr.statusText}`
      ) as Error & { status?: number; code?: string };
      apiError.status = xhr.status;
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          code?: string;
          error?: { code?: string };
        };
        const errorCode = parsed.code ?? parsed.error?.code;
        if (typeof errorCode === 'string') {
          apiError.code = errorCode;
        }
      } catch {
        // Ignore malformed error bodies here — formatApiError handles plain text.
      }
      streamError = apiError;
      done = true;
      const r = resolve;
      resolve = null;
      r?.();
      return;
    }
    // Parse any remaining buffer data
    if (buffer) {
      parseSSEBuffer(buffer + '\n', eventQueue, () => {
        // no-op: done flag set below
      });
      buffer = '';
    }
    done = true;
    const r = resolve;
    resolve = null;
    r?.();
  };

  // Text mode — required for incremental responseText access
  xhr.responseType = '';
  // No XHR.timeout — we use the idle timer above instead, which resets on
  // every onprogress event. XHR.timeout counts total request time and would
  // fire prematurely when the server does post-stream work (extractSignals,
  // DB writes) after LLM streaming finishes.
  xhr.send(options.body ?? null);

  async function* generateEvents(): AsyncGenerator<StreamEvent> {
    while (true) {
      while (eventQueue.length > 0) {
        const event = eventQueue.shift();
        if (event) yield event;
      }
      if (done) {
        if (streamError) {
          // [I-21] Discard any partial SSE events that were buffered before
          // a 4xx error arrived. Without this, the consumer would receive
          // stale/incomplete chunks before the error is thrown, corrupting
          // the accumulated response text.
          eventQueue.length = 0;
          throw streamError;
        }
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
