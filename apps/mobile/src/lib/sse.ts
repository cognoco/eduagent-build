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
import {
  maybeReplayResponseSchema,
  mentorNoticeAcceptedSchema,
  type ChallengeRoundSessionState,
  type StreamLanguageMeaningOutput,
  type StreamLanguageSpeakingPractice,
} from '@eduagent/schemas';
import {
  BadRequestError,
  classifyPaymentRequired,
  ConsentRequiredError,
  ForbiddenError,
  type IdempotencyReplayBody,
  NetworkError,
  NotFoundError,
  RateLimitedError,
  ResourceGoneError,
  triggerAuthExpired,
  UpstreamError,
  type QuotaExceededDetails,
} from './api-client';

export interface StreamChunkEvent {
  type: 'chunk';
  content: string;
}

export interface StreamReplaceEvent {
  type: 'replace';
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

export interface StreamReplayEvent extends IdempotencyReplayBody {
  type: 'replay';
}

/** Fluency drill annotation surfaced via SSE done event */
export interface FluencyDrillEvent {
  active: boolean;
  durationSeconds?: number;
  score?: { correct: number; total: number };
}

export interface LanguageComprehensionQuestionEvent {
  id: string;
  prompt: string;
  answerHint: string;
}

export interface LanguageGradedInputEvent {
  type: 'graded_input';
  modality: 'reading' | 'listening';
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  knownWordRatioTarget: number;
  knownWordEstimate: number;
  targetWords: string[];
  text: string;
  comprehensionQuestions: LanguageComprehensionQuestionEvent[];
  audioEnabled: boolean;
}

export type LanguageMeaningOutputEvent = StreamLanguageMeaningOutput;

// WI-1777: derived (not hand-redeclared) — the WI-1756 rework this repo
// already paid for once, applied from the start here.
export type LanguageSpeakingPracticeEvent = StreamLanguageSpeakingPractice;

export interface LanguageLearningActivityEvent {
  strand: 'meaning_input' | 'meaning_output' | 'language_focus' | 'fluency';
  activityType:
    | 'graded_input'
    | 'free_response'
    | 'correction_retry'
    | 'timed_drill'
    | 'repeat_after_me'
    | 'shadowing';
  modality: 'text' | 'voice' | 'listening';
  targetWords: string[];
  targetGrammar: string[];
  gradedInput?: LanguageGradedInputEvent;
  meaningOutput?: LanguageMeaningOutputEvent;
  speakingPractice?: LanguageSpeakingPracticeEvent;
}

export interface ChallengeRoundOfferEvent {
  pitch: string;
}

export interface DraftedChallengeNoteEvent {
  id: string;
  body: string | null;
  sourceAnswerEventIds: string[];
  fallbackPrompt?: string;
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
  /** Server-selected four-strands language activity for the completed turn. */
  languageLearning?: LanguageLearningActivityEvent;
  /** Challenge Round state snapshot after the server has parsed and gated the exchange. */
  challengeRound?: ChallengeRoundSessionState;
  /** Server-gated Challenge Round offer. Mobile never parses raw envelope JSON. */
  challengeOffer?: ChallengeRoundOfferEvent;
  /** Server-validated draft or fallback composer prompt for learner-owned notes. */
  draftedNote?: DraftedChallengeNoteEvent;
  /** F6: LLM self-reported confidence. Absent or 'medium'/'high' = no indicator. Only 'low' shows a UI prompt. */
  confidence?: 'low' | 'medium' | 'high';
  /** [WI-2107] LLM opened a topic without delivering content or a question this turn. */
  topicOpenedPendingContent?: boolean;
  /** Server-accepted homework observation; never present on token/fallback frames. */
  mentorNotice?: import('@eduagent/schemas').MentorNoticeAccepted;
}

export interface StreamErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

export type StreamEvent =
  | StreamChunkEvent
  | StreamReplaceEvent
  | StreamFallbackEvent
  | StreamReplayEvent
  | StreamDoneEvent
  | StreamErrorEvent;

/** BC-07: runtime validation for SSE events — verifies required fields exist
 * before casting, preventing malformed events from corrupting accumulated text.
 * Note: `escalationRung` is only present on learning-session done events;
 * interview done events carry `isComplete` instead. Both are valid. */
function isValidStreamEvent(obj: Record<string, unknown>): boolean {
  if (obj.type === 'chunk') return typeof obj.content === 'string';
  if (obj.type === 'replace') return typeof obj.content === 'string';
  if (obj.type === 'fallback') {
    return (
      typeof obj.reason === 'string' && typeof obj.fallbackText === 'string'
    );
  }
  if (obj.type === 'replay') return obj.replayed === true;
  if (obj.type === 'done') {
    if (typeof obj.exchangeCount !== 'number') return false;
    // [WI-2500] Mobile trust boundary: the server validates a mentorNotice
    // before emitting it, but this parser must not forward a malformed one to
    // use-stream-message.ts / UI consumers as if it were a canonical accepted
    // notice (invalid UUID, empty concept, non-string correctionHint). Runtime-
    // parse the field with the shared schema and DROP an invalid notice rather
    // than the whole done frame — the notice is a non-core adornment, and
    // "only a committed server acceptance may enter UI output".
    if (
      obj.mentorNotice !== undefined &&
      !mentorNoticeAcceptedSchema.safeParse(obj.mentorNotice).success
    ) {
      delete obj.mentorNotice;
    }
    return true;
  }
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
  response: Response,
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
  onDone: () => void,
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
        const event = parsed as StreamEvent;
        queue.push(event);
        if (event.type === 'done') {
          onDone();
          return '';
        }
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
  },
): { events: AsyncGenerator<StreamEvent>; abort: () => void } {
  const eventQueue: StreamEvent[] = [];
  let resolve: (() => void) | null = null;
  let done = false;
  // [BUG-539] Track whether the [DONE] signal was already processed via
  // onprogress so that the onloadend fallback buffer-replay can be skipped.
  // Without this flag, if onloadend fires after onprogress already consumed
  // [DONE], the remaining buffer is re-parsed with a no-op onDone callback
  // but the generator may have already returned — creating a subtle race where
  // the final done event is dropped or a duplicate is synthesised.
  let onDoneFired = false;
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
        `API error ${xhr.status}: ${xhr.statusText || 'request failed'}`,
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
  const IDLE_TIMEOUT_MS = 90_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (done) return;
    const timeoutError = new Error(
      'The connection timed out while waiting for a reply',
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
        'The connection timed out while waiting for a reply',
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
      // [BUG-539] Set onDoneFired BEFORE setting done so that the onloadend
      // handler can skip its fallback buffer re-parse, preventing a duplicate
      // done event or dropped final event when onloadend races with onprogress.
      onDoneFired = true;
      done = true;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    });

    const r = resolve;
    resolve = null;
    r?.();
  };

  xhr.onerror = () => {
    if (idleTimer) clearTimeout(idleTimer);
    streamError = new NetworkError(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
    );
    done = true;
    const r = resolve;
    resolve = null;
    r?.();
  };

  /** Classify a non-ok XHR response into a typed error using the same
   * hierarchy as customFetch in api-client.ts. Reads body from xhr.responseText
   * (already fully received at this point). */
  function classifyXhrError(status: number, responseText: string): Error {
    type ParsedErrBody = {
      code?: string;
      message?: string;
      details?: QuotaExceededDetails;
      error?: { code?: string; message?: string };
    };
    let parsed: ParsedErrBody | null = null;
    try {
      parsed = JSON.parse(responseText || '{}') as ParsedErrBody;
    } catch {
      // Not JSON
    }
    const code = parsed?.error?.code ?? parsed?.code;
    const apiMessage = parsed?.error?.message ?? parsed?.message;
    if (status === 400) {
      return new BadRequestError(apiMessage ?? (responseText || 'Bad request'));
    }
    if (status === 401) {
      // [BUG-547] Session expired mid-stream — fire the shared auth-expired
      // callback (same dedup guard as customFetch) so the user is signed out
      // immediately rather than waiting ~30s for the next non-stream API call.
      // The callback is registered by the root layout via setOnAuthExpired().
      triggerAuthExpired();
      const err = new Error(
        apiMessage ?? 'Session expired — please sign in again',
      ) as Error & { status: number };
      err.status = 401;
      return err;
    }
    if (status === 402) {
      // [#899 / BUG-545] Shared 402 classifier — quota body → QuotaExceededError,
      // otherwise UpstreamError(402) so callers inspect .status/.code without
      // parsing message strings.
      return classifyPaymentRequired({
        parsed,
        message: apiMessage,
        fallbackText: responseText,
        code,
        defaultCode: 'UPSTREAM_ERROR',
      });
    }
    if (status === 403) {
      // [BUG-558] Mirror api-client.ts 403 branching: CONSENT_REQUIRED must
      // surface as ConsentRequiredError so screens route to the consent flow
      // instead of the sign-out path that ForbiddenError triggers.
      if (code === 'CONSENT_REQUIRED') {
        return new ConsentRequiredError(apiMessage ?? undefined, code);
      }
      return new ForbiddenError(apiMessage ?? undefined, code ?? undefined);
    }
    if (status === 404) {
      return new NotFoundError(
        apiMessage ?? (responseText || 'Resource not found'),
      );
    }
    if (status === 409) {
      return new Error(apiMessage ?? 'Request conflicts with current state');
    }
    if (status === 410) {
      return new ResourceGoneError(
        apiMessage ?? undefined,
        code ?? undefined,
        parsed?.details,
      );
    }
    if (status === 429) {
      return new RateLimitedError(
        apiMessage ?? undefined,
        code ?? undefined,
        undefined,
        undefined,
      );
    }
    if (status >= 500) {
      // 5xx — always surface as UpstreamError so callers can distinguish a
      // server fault from a network drop. Use code when present, otherwise
      // synthesise 'UPSTREAM_ERROR' so isReconnectableSessionError can
      // classify by .name rather than by message heuristics.
      return new UpstreamError(
        apiMessage ?? (responseText || 'Server error'),
        code ?? 'UPSTREAM_ERROR',
        status,
      );
    }
    // [BUG-545] Always surface as UpstreamError — plain Error("API error {n}:…")
    // forces callers to regex-parse formatted message strings to re-derive the
    // status (violates "Classify errors before formatting" rule).
    return new UpstreamError(
      apiMessage ?? (responseText || 'request failed'),
      code ?? 'UPSTREAM_ERROR',
      status,
    );
  }

  xhr.onloadend = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (
      !streamError &&
      xhr.status >= 200 &&
      xhr.status < 300 &&
      xhr.getResponseHeader('Idempotency-Replay') === 'true'
    ) {
      // [BUG-538] Validate the replay response shape before pushing to the
      // event queue. An unvalidated cast (previous code) allowed malformed
      // bodies (e.g. empty `{}`) to produce a replay event with
      // `clientId: undefined`, causing OutboxDrainProvider to call
      // `markConfirmed` for an entry the server may never have persisted.
      let replayParsedRaw: unknown;
      try {
        replayParsedRaw = JSON.parse(xhr.responseText || '{}');
      } catch {
        streamError = new Error(
          'Malformed idempotency replay response: invalid JSON',
        );
        // fall through to done/resolve below
        replayParsedRaw = null;
      }
      if (replayParsedRaw !== null) {
        const replayResult =
          maybeReplayResponseSchema.safeParse(replayParsedRaw);
        if (replayResult.success) {
          eventQueue.push({
            type: 'replay',
            ...replayResult.data,
          });
        } else {
          // Shape validation failed — do NOT push a partial replay event.
          // Signal a stream error so the consumer knows the replay was not
          // confirmed and can avoid calling markConfirmed on unverified data.
          streamError = new Error(
            'Malformed idempotency replay response: missing required fields',
          );
        }
      }
      done = true;
      const r = resolve;
      resolve = null;
      r?.();
      return;
    }
    // If headers-received handler already flagged an error, enrich it with the
    // full response body (now available) by replacing with a fully typed error.
    if (streamError && xhr.status >= 400) {
      streamError = classifyXhrError(xhr.status, xhr.responseText);
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
      streamError = classifyXhrError(xhr.status, xhr.responseText);
      done = true;
      const r = resolve;
      resolve = null;
      r?.();
      return;
    }
    // [BUG-539] Skip buffer re-parse if [DONE] was already consumed via
    // onprogress. Re-parsing after the generator has already returned risks
    // producing a duplicate done event or silently dropping the final event.
    if (!onDoneFired && buffer) {
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

  // Hoisted executor so the closure isn't re-declared per loop iteration.
  // The XHR callbacks read `resolve` to wake the generator; the executor only
  // needs to install the latest resolver before each await.
  const installResolver = (r: () => void) => {
    resolve = r;
  };

  async function* generateEvents(): AsyncGenerator<StreamEvent> {
    while (true) {
      // [BUG-632 / I-21] Check streamError BEFORE draining the queue. If a
      // 4xx response arrived alongside buffered SSE chunks (server may flush
      // headers + a few `data:` frames before returning the error body), the
      // consumer must not see those stale chunks — they would corrupt the
      // accumulated response text before the error surfaces. Discard the
      // queue and throw immediately.
      if (done && streamError) {
        eventQueue.length = 0;
        throw streamError;
      }
      while (eventQueue.length > 0) {
        // [#899] Re-check inside the drain, not just at the loop top. A 4xx can
        // land *between* yields (the consumer awaits downstream work while the
        // XHR error fires), and the entry guard above only covers the case
        // where the error is already set when the generator resumes. Without
        // this, still-buffered pre-error chunks would keep being yielded.
        if (done && streamError) {
          eventQueue.length = 0;
          throw streamError;
        }
        const event = eventQueue.shift();
        if (event) yield event;
      }
      if (done) {
        if (streamError) {
          eventQueue.length = 0;
          throw streamError;
        }
        return;
      }
      await new Promise<void>(installResolver);
    }
  }

  return {
    events: generateEvents(),
    abort: () => xhr.abort(),
  };
}
