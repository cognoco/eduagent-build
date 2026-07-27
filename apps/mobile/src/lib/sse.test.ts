import { parseSSEStream, streamSSEViaXHR, type StreamEvent } from './sse';
import {
  clearOnAuthExpired,
  ConsentRequiredError,
  setOnAuthExpired,
} from './api-client';
import { classifyApiError } from './format-api-error';

function createMockStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function mockResponse(body: ReadableStream<Uint8Array> | null): Response {
  return { body } as unknown as Response;
}

describe('parseSSEStream', () => {
  it('parses chunk events from SSE stream', async () => {
    const stream = createMockStream([
      'data: {"type":"chunk","content":"Hello"}\n\n',
      'data: {"type":"chunk","content":" world"}\n\n',
      'data: {"type":"done","exchangeCount":1,"escalationRung":1}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'chunk', content: 'Hello' });
    expect(events[1]).toEqual({ type: 'chunk', content: ' world' });
    expect(events[2]).toEqual({
      type: 'done',
      exchangeCount: 1,
      escalationRung: 1,
    });
  });

  it('parses replace events from SSE stream', async () => {
    const stream = createMockStream([
      'data: {"type":"chunk","content":"Partial"}\n\n',
      'data: {"type":"replace","content":"Recovered reply"}\n\n',
      'data: {"type":"done","exchangeCount":1,"escalationRung":1}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'chunk', content: 'Partial' });
    expect(events[1]).toEqual({
      type: 'replace',
      content: 'Recovered reply',
    });
    expect(events[2]).toEqual({
      type: 'done',
      exchangeCount: 1,
      escalationRung: 1,
    });
  });

  it('throws when response body is null', async () => {
    const gen = parseSSEStream(mockResponse(null));
    await expect(gen.next()).rejects.toThrow(
      'Response body is null — streaming not supported',
    );
  });

  it('handles [DONE] signal', async () => {
    const stream = createMockStream([
      'data: {"type":"chunk","content":"Hi"}\n\n',
      'data: [DONE]\n\n',
      'data: {"type":"chunk","content":"ignored"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'Hi' });
  });

  it('handles events split across chunks', async () => {
    const stream = createMockStream([
      'data: {"type":"chu',
      'nk","content":"split"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'split' });
  });

  it('skips malformed JSON events', async () => {
    const stream = createMockStream([
      'data: not-json\n\n',
      'data: {"type":"chunk","content":"valid"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'valid' });
  });

  it('ignores empty lines and comment lines', async () => {
    const stream = createMockStream([
      '\n',
      ': this is a comment\n',
      'data: {"type":"chunk","content":"ok"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'ok' });
  });

  // BC-07: malformed events with valid JSON but missing required fields
  // must be skipped — not silently cast to StreamEvent
  it('skips chunk events missing content field (BC-07)', async () => {
    const stream = createMockStream([
      'data: {"type":"chunk"}\n\n',
      'data: {"type":"chunk","content":"valid"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'valid' });
  });

  it('skips done events missing exchangeCount (BC-07)', async () => {
    const stream = createMockStream([
      'data: {"type":"done","escalationRung":1}\n\n',
      'data: {"type":"chunk","content":"ok"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'ok' });
  });

  it('accepts done events without escalationRung (interview done events)', async () => {
    const stream = createMockStream([
      'data: {"type":"done","exchangeCount":5,"isComplete":true}\n\n',
      'data: {"type":"done","exchangeCount":3,"escalationRung":2}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'done',
      exchangeCount: 5,
      isComplete: true,
    });
    expect(events[1]).toEqual({
      type: 'done',
      exchangeCount: 3,
      escalationRung: 2,
    });
  });

  // [WI-2500] Mobile SSE trust boundary: a mentorNotice on a done frame must be
  // runtime-parsed with the shared schema, not trusted from the server's type
  // declaration. A malformed notice is dropped so it never reaches UI consumers
  // as a canonical accepted notice; the rest of the done frame is preserved.
  describe('done-frame mentorNotice validation (WI-2500)', () => {
    const VALID_UUID = '11111111-1111-4111-8111-111111111111';

    it('surfaces a valid accepted mentorNotice unchanged', async () => {
      const notice = {
        id: VALID_UUID,
        concept: 'long division carrying',
        correctionHint: 'carry the remainder to the next column',
      };
      const stream = createMockStream([
        `data: {"type":"done","exchangeCount":2,"mentorNotice":${JSON.stringify(notice)}}\n\n`,
      ]);

      const events: StreamEvent[] = [];
      for await (const event of parseSSEStream(mockResponse(stream))) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'done',
        exchangeCount: 2,
        mentorNotice: notice,
      });
    });

    it('surfaces a valid notice with null correctionHint', async () => {
      const notice = { id: VALID_UUID, concept: 'topic', correctionHint: null };
      const stream = createMockStream([
        `data: {"type":"done","exchangeCount":1,"mentorNotice":${JSON.stringify(notice)}}\n\n`,
      ]);

      const events: StreamEvent[] = [];
      for await (const event of parseSSEStream(mockResponse(stream))) {
        events.push(event);
      }

      expect(events[0]).toEqual({
        type: 'done',
        exchangeCount: 1,
        mentorNotice: notice,
      });
    });

    it.each([
      [
        'invalid UUID',
        { id: 'not-a-uuid', concept: 'x', correctionHint: null },
      ],
      ['empty concept', { id: VALID_UUID, concept: '', correctionHint: null }],
      [
        'non-string correctionHint',
        { id: VALID_UUID, concept: 'x', correctionHint: 42 },
      ],
      ['missing id', { concept: 'x', correctionHint: null }],
    ])(
      'drops a malformed mentorNotice (%s) but keeps the done frame',
      async (_label, notice) => {
        const stream = createMockStream([
          `data: {"type":"done","exchangeCount":4,"mentorNotice":${JSON.stringify(notice)}}\n\n`,
        ]);

        const events: StreamEvent[] = [];
        for await (const event of parseSSEStream(mockResponse(stream))) {
          events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({ type: 'done', exchangeCount: 4 });
        expect(
          (events[0] as { mentorNotice?: unknown }).mentorNotice,
        ).toBeUndefined();
      },
    );
  });

  it('parses typed challenge round fields from done events', async () => {
    const challengeRound = {
      state: 'active',
      startedAt: '2026-05-26T10:00:00.000Z',
      questionIndex: 1,
      totalQuestions: 3,
      offerCount: 1,
      topicId: '11111111-1111-4111-8111-111111111111',
      declinedDontAskAgain: false,
      evaluations: [],
    };
    const draftedNote = {
      id: 'draft-1',
      body: null,
      sourceAnswerEventIds: ['answer-event-1'],
      fallbackPrompt: 'Write this one in your own words.',
    };
    const stream = createMockStream([
      `data: ${JSON.stringify({
        type: 'done',
        exchangeCount: 4,
        escalationRung: 2,
        challengeRound,
        challengeOffer: { pitch: 'Want a harder round?' },
        draftedNote,
      })}\n\n`,
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: 'done',
        exchangeCount: 4,
        escalationRung: 2,
        challengeRound,
        challengeOffer: { pitch: 'Want a harder round?' },
        draftedNote,
      },
    ]);
  });

  it('parses language-learning activity from done events', async () => {
    const languageLearning = {
      strand: 'meaning_input',
      activityType: 'graded_input',
      modality: 'text',
      targetWords: ['agua'],
      targetGrammar: [],
      gradedInput: {
        type: 'graded_input',
        modality: 'reading',
        cefrLevel: 'A1',
        knownWordRatioTarget: 0.85,
        knownWordEstimate: 0.82,
        targetWords: ['agua'],
        text: 'Tengo agua en la mesa.',
        comprehensionQuestions: [
          {
            id: 'q1',
            prompt: 'What is on the table?',
            answerHint: 'agua',
          },
        ],
        audioEnabled: true,
      },
    };
    const stream = createMockStream([
      `data: ${JSON.stringify({
        type: 'done',
        exchangeCount: 4,
        escalationRung: 2,
        languageLearning,
      })}\n\n`,
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: 'done',
        exchangeCount: 4,
        escalationRung: 2,
        languageLearning,
      },
    ]);
  });

  it('parses fallback events from SSE stream', async () => {
    const stream = createMockStream([
      'data: {"type":"fallback","reason":"empty_reply","fallbackText":"Try again"}\n\n',
      'data: {"type":"done","exchangeCount":1,"escalationRung":1}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'fallback',
      reason: 'empty_reply',
      fallbackText: 'Try again',
    });
  });

  it('parses error events from SSE stream (BUG-546)', async () => {
    const stream = createMockStream([
      'data: {"type":"chunk","content":"partial"}\n\n',
      'data: {"type":"error","message":"Failed to save session progress. Please try again."}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'chunk', content: 'partial' });
    expect(events[1]).toEqual({
      type: 'error',
      message: 'Failed to save session progress. Please try again.',
    });
  });

  it('skips error events missing message field (BC-07)', async () => {
    const stream = createMockStream([
      'data: {"type":"error"}\n\n',
      'data: {"type":"chunk","content":"ok"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'ok' });
  });

  it('skips events with unknown type (BC-07)', async () => {
    const stream = createMockStream([
      'data: {"type":"unknown","foo":"bar"}\n\n',
      'data: {"type":"chunk","content":"real"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'real' });
  });

  it('skips events where content is not a string (BC-07)', async () => {
    const stream = createMockStream([
      'data: {"type":"chunk","content":42}\n\n',
      'data: {"type":"chunk","content":"ok"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'ok' });
  });

  it('skips events that are arrays instead of objects (BC-07)', async () => {
    const stream = createMockStream([
      'data: [1,2,3]\n\n',
      'data: {"type":"chunk","content":"ok"}\n\n',
    ]);

    const events: StreamEvent[] = [];
    for await (const event of parseSSEStream(mockResponse(stream))) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// streamSSEViaXHR — XHR-based SSE consumer used at runtime in React Native.
// ---------------------------------------------------------------------------

interface FakeXhrInstance {
  open: jest.Mock;
  send: jest.Mock;
  setRequestHeader: jest.Mock;
  abort: jest.Mock;
  onreadystatechange: (() => void) | null;
  onprogress: (() => void) | null;
  onerror: (() => void) | null;
  onloadend: (() => void) | null;
  readyState: number;
  status: number;
  statusText: string;
  responseText: string;
  responseType: string;
  // Returns null for all headers by default; override per-test for replay tests
  getResponseHeader(header: string): string | null;
  // Helpers for tests
  _emitProgress(text: string): void;
  _emitError(status: number, body: string): void;
}

function installFakeXhr(): FakeXhrInstance {
  const instance: FakeXhrInstance = {
    open: jest.fn(),
    send: jest.fn(),
    setRequestHeader: jest.fn(),
    abort: jest.fn(),
    onreadystatechange: null,
    onprogress: null,
    onerror: null,
    onloadend: null,
    readyState: 0,
    status: 0,
    statusText: '',
    responseText: '',
    responseType: '',
    // Default: no special response headers
    getResponseHeader(_header: string) {
      return null;
    },
    _emitProgress(text: string) {
      this.responseText += text;
      this.onprogress?.();
    },
    _emitError(status: number, body: string) {
      this.readyState = 2;
      this.status = status;
      this.statusText = 'error';
      this.onreadystatechange?.();
      this.responseText = body;
      this.onloadend?.();
    },
  };
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = jest.fn(
    () => instance,
  ) as unknown;
  return instance;
}

describe('streamSSEViaXHR', () => {
  let originalXhr: unknown;

  beforeEach(() => {
    originalXhr = (global as unknown as { XMLHttpRequest?: unknown })
      .XMLHttpRequest;
  });

  afterEach(() => {
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest =
      originalXhr;
  });

  it('[WI-2102] gives the transport sole ownership of a 90-second idle budget', async () => {
    jest.useFakeTimers();
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });
    const nextEvent = events.next();
    const timeoutResult = expect(nextEvent).rejects.toMatchObject({
      message: 'The connection timed out while waiting for a reply',
      isTimeout: true,
    });

    try {
      await jest.advanceTimersByTimeAsync(89_999);
      expect(xhr.abort).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(xhr.abort).toHaveBeenCalledTimes(1);
      await timeoutResult;
    } finally {
      jest.useRealTimers();
    }
  });

  // [BUG-632 / I-21] When the server flushes a few SSE frames before returning
  // a 4xx error body, the buffered events must be DISCARDED — not yielded to
  // the consumer ahead of the thrown error. Otherwise the consumer accumulates
  // partial reply text from a request that ultimately failed.
  it('[BUG-632] discards buffered events when stream errors, throws without yielding partials', async () => {
    const xhr = installFakeXhr();

    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    // Server flushes two chunks of partial reply text...
    xhr._emitProgress('data: {"type":"chunk","content":"partial 1"}\n\n');
    xhr._emitProgress('data: {"type":"chunk","content":"partial 2"}\n\n');
    // ...then returns a 500 error before the consumer pulls.
    xhr._emitError(500, 'internal server error');

    const collected: StreamEvent[] = [];
    let caught: unknown = null;
    try {
      for await (const ev of events) {
        collected.push(ev);
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    // [BUG-955] 5xx now produces UpstreamError (not "API error 500:…") so callers
    // can distinguish server faults from network drops by .name check.
    expect((caught as Error).name).toBe('UpstreamError');
    expect((caught as { status?: number }).status).toBe(500);
    // Crucial: the partial chunks must NOT have been yielded.
    expect(collected).toEqual([]);
  });

  // [#899] Tighter than BUG-632: the error lands *mid-drain* — after the
  // consumer has already pulled one buffered chunk — so the entry guard has
  // passed and only the in-drain re-check can discard the remaining stale
  // chunks (c2/c3) instead of yielding them.
  it('[#899] discards still-buffered events when the stream errors mid-drain', async () => {
    const xhr = installFakeXhr();

    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    // Three chunks buffered before the consumer pulls anything.
    xhr._emitProgress('data: {"type":"chunk","content":"c1"}\n\n');
    xhr._emitProgress('data: {"type":"chunk","content":"c2"}\n\n');
    xhr._emitProgress('data: {"type":"chunk","content":"c3"}\n\n');

    // Pull only the first chunk — the generator suspends mid-drain with c2/c3
    // still queued.
    const first = await events.next();
    expect(first.value).toEqual({ type: 'chunk', content: 'c1' });

    // The stream errors while c2/c3 are still buffered.
    xhr._emitError(500, 'internal server error');

    // The next pull must THROW (discarding c2/c3), not yield the stale c2.
    let caught: unknown = null;
    try {
      await events.next();
    } catch (err) {
      caught = err;
    }
    expect((caught as Error | null)?.name).toBe('UpstreamError');
    expect((caught as { status?: number } | null)?.status).toBe(500);
  });

  it('[BUG-958] treats app-level done frame as terminal without waiting for XHR loadend', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    const collectedPromise = (async () => {
      const collected: StreamEvent[] = [];
      for await (const ev of events) {
        collected.push(ev);
      }
      return collected;
    })();

    xhr._emitProgress('data: {"type":"chunk","content":"answer"}\n\n');
    xhr._emitProgress(
      'data: {"type":"done","exchangeCount":3,"escalationRung":1}\n\n',
    );

    await expect(collectedPromise).resolves.toEqual([
      { type: 'chunk', content: 'answer' },
      { type: 'done', exchangeCount: 3, escalationRung: 1 },
    ]);
    expect(xhr.abort).not.toHaveBeenCalled();
  });

  // [BUG-955] classifyXhrError must produce typed errors for each HTTP error
  // class so that session-types.ts can route to the correct user-facing message.

  it('[BUG-955] throws UpstreamError (name=UpstreamError) for 5xx responses', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(500, JSON.stringify({ message: 'Internal server error' }));

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event; // drain — consume without using
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('UpstreamError');
    expect((caught as { status?: number }).status).toBe(500);
  });

  it('[BUG-955] throws UpstreamError for 503 with no JSON body', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(503, 'Service Unavailable');

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event; // drain — consume without using
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('UpstreamError');
    expect((caught as { status?: number }).status).toBe(503);
  });

  it('[BUG-955] throws an error with status 401 for session-expired mid-stream', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(
      401,
      JSON.stringify({ message: 'Session expired — please sign in again' }),
    );

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event; // drain — consume without using
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { status?: number }).status).toBe(401);
  });

  it('[BUG-955] throws QuotaExceededError for structured quota 402 responses', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(
      402,
      JSON.stringify({
        code: 'QUOTA_EXCEEDED',
        message: 'Quota reached',
        details: {
          tier: 'free',
          effectiveAccessTier: 'free',
          quotaModel: 'per-profile',
          profileRole: 'owner',
          reason: 'monthly',
          resetsAt: '2026-06-01T00:00:00.000Z',
          monthlyLimit: 10,
          usedThisMonth: 10,
          dailyLimit: null,
          usedToday: 0,
          topUpCreditsRemaining: 0,
          upgradeOptions: [],
        },
      }),
    );

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event;
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('QuotaExceededError');
    expect((caught as { details?: { monthlyLimit?: number } }).details).toEqual(
      expect.objectContaining({ monthlyLimit: 10 }),
    );
  });

  it('[BUG-955 / BUG-545] throws UpstreamError for malformed 402 (non-quota, non-JSON)', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(402, 'Payment required');

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event;
      }
    } catch (err) {
      caught = err;
    }

    // [BUG-545] Non-quota 402 must surface as UpstreamError (not plain Error)
    // so callers can inspect .status without parsing formatted message strings.
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('UpstreamError');
    expect((caught as { status?: number }).status).toBe(402);
  });

  it('[BUG-955] leaves quota-coded 402 responses with malformed details as generic API errors', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(
      402,
      JSON.stringify({
        code: 'QUOTA_EXCEEDED',
        message: 'Quota reached',
        details: {
          tier: 'plus',
          reason: 'monthly',
          monthlyLimit: 0,
          usedThisMonth: 0,
        },
      }),
    );

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event;
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).not.toBe('QuotaExceededError');
    expect((caught as Error).message).toContain('Quota reached');
  });

  it('[BUG-955 / BUG-545] throws UpstreamError for non-quota 402 with error code', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(
      402,
      JSON.stringify({ code: 'BILLING_PROVIDER_UNAVAILABLE' }),
    );

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event;
      }
    } catch (err) {
      caught = err;
    }

    // [BUG-545] Non-quota 402 with a structured code must surface as
    // UpstreamError — callers inspect .code and .status, not message strings.
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('UpstreamError');
    expect((caught as { status?: number }).status).toBe(402);
  });

  // [BUG-558] 403 with code CONSENT_REQUIRED must throw ConsentRequiredError,
  // not ForbiddenError. ForbiddenError triggers sign-out; ConsentRequiredError
  // routes to the consent flow. Break test: verify classifyXhrError branches
  // correctly on the code field.
  it('[BUG-558] throws ConsentRequiredError for 403 with CONSENT_REQUIRED code', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(
      403,
      JSON.stringify({
        code: 'CONSENT_REQUIRED',
        message: 'Consent required to continue',
      }),
    );

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event;
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConsentRequiredError);
    expect((caught as Error).name).toBe('ConsentRequiredError');
  });

  it('[BUG-558] throws ForbiddenError (not ConsentRequiredError) for plain 403 without consent code', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    xhr._emitError(403, JSON.stringify({ message: 'Access denied' }));

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event;
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('ForbiddenError');
    expect(caught).not.toBeInstanceOf(ConsentRequiredError);
  });

  it('[BUG-955] throws NetworkError for onerror (status 0 / offline)', async () => {
    const xhr = installFakeXhr();
    const { events } = streamSSEViaXHR('https://example.test/stream', {
      method: 'POST',
    });

    // Simulate onerror (no HTTP response received — CORS, offline, DNS)
    xhr.onerror?.();

    let caught: unknown = null;
    try {
      for await (const event of events) {
        void event; // drain — consume without using
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('NetworkError');
  });

  describe('[BUG-547] 401 from SSE fires onAuthExpired callback', () => {
    afterEach(() => {
      clearOnAuthExpired();
    });

    it('calls the registered onAuthExpired callback when SSE receives 401', async () => {
      const xhr = installFakeXhr();
      const onAuthExpired = jest.fn();
      setOnAuthExpired(onAuthExpired);

      const { events } = streamSSEViaXHR('https://example.test/stream', {
        method: 'POST',
      });

      xhr._emitError(401, 'Unauthorized');

      try {
        for await (const event of events) {
          void event;
        }
      } catch {
        // expected
      }

      expect(onAuthExpired).toHaveBeenCalledTimes(1);
    });

    it('does not call onAuthExpired for non-401 errors', async () => {
      const xhr = installFakeXhr();
      const onAuthExpired = jest.fn();
      setOnAuthExpired(onAuthExpired);

      const { events } = streamSSEViaXHR('https://example.test/stream', {
        method: 'POST',
      });

      xhr._emitError(500, 'Internal Server Error');

      try {
        for await (const event of events) {
          void event;
        }
      } catch {
        // expected
      }

      expect(onAuthExpired).not.toHaveBeenCalled();
    });

    it('dedup guard prevents onAuthExpired from firing twice on concurrent 401s', async () => {
      const xhr1 = installFakeXhr();
      const onAuthExpired = jest.fn();
      setOnAuthExpired(onAuthExpired);

      const { events: events1 } = streamSSEViaXHR(
        'https://example.test/stream',
        { method: 'POST' },
      );
      xhr1._emitError(401, 'Unauthorized');
      try {
        for await (const e of events1) {
          void e;
        }
      } catch {
        // expected
      }

      // Second 401 on a new stream — guard should block the second fire
      const xhr2 = installFakeXhr();
      const { events: events2 } = streamSSEViaXHR(
        'https://example.test/stream',
        { method: 'POST' },
      );
      xhr2._emitError(401, 'Unauthorized');
      try {
        for await (const e of events2) {
          void e;
        }
      } catch {
        // expected
      }

      expect(onAuthExpired).toHaveBeenCalledTimes(1);
    });

    // [BUG-547 / break-test] 401 fires onAuthExpired AND must produce
    // recovery:'none' (not 'sign-out') via classifyApiError — sign-out is
    // already in progress via the callback, so no button should be rendered.
    it('[BUG-547 / break-test] 401 calls onAuthExpired once and classifyApiError yields recovery:none', async () => {
      const xhr = installFakeXhr();
      const onAuthExpired = jest.fn();
      setOnAuthExpired(onAuthExpired);

      const { events } = streamSSEViaXHR('https://example.test/stream', {
        method: 'POST',
      });

      xhr._emitError(
        401,
        JSON.stringify({ message: 'Session expired — please sign in again' }),
      );

      let caught: unknown = null;
      try {
        for await (const event of events) {
          void event;
        }
      } catch (err) {
        caught = err;
      }

      // Callback must fire exactly once
      expect(onAuthExpired).toHaveBeenCalledTimes(1);

      // The thrown error must classify to recovery:'none' — NOT 'sign-out'.
      // sign-out is already in progress; rendering a button causes a double-fire.
      const classified = classifyApiError(caught);
      expect(classified.recovery).toBe('none');
      expect(classified.recovery).not.toBe('sign-out');
    });
  });

  // [BUG-539] onloadend buffer re-parse must be skipped when [DONE] was
  // already consumed via onprogress. Previously the no-op onDone callback
  // in the onloadend parseSSEBuffer call meant the flag was never set,
  // causing a race where onloadend could synthesise a duplicate done event
  // or drop the final event if the generator already returned.
  describe('[BUG-539] onDoneFired guard — no duplicate done when onloadend races with onprogress', () => {
    it('emits done exactly once when [DONE] consumed via onprogress and onloadend fires after', async () => {
      const xhr = installFakeXhr();
      const { events } = streamSSEViaXHR('https://example.test/stream', {
        method: 'POST',
      });

      const collectedPromise = (async () => {
        const collected: StreamEvent[] = [];
        for await (const ev of events) {
          collected.push(ev);
        }
        return collected;
      })();

      // onprogress delivers [DONE] — generator terminates
      xhr._emitProgress('data: {"type":"chunk","content":"hello"}\n\n');
      xhr._emitProgress(
        'data: {"type":"done","exchangeCount":1,"escalationRung":1}\n\n',
      );

      // onloadend fires after onprogress has already processed [DONE]
      xhr.status = 200;
      xhr.onloadend?.();

      const collected = await collectedPromise;

      // Must have exactly one done event — not two
      const doneEvents = collected.filter((e) => e.type === 'done');
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0]).toEqual({
        type: 'done',
        exchangeCount: 1,
        escalationRung: 1,
      });
    });
  });

  // [BUG-538] Replay body must pass schema validation before being pushed to
  // the event queue. Previously, an unvalidated cast allowed malformed bodies
  // (e.g. empty `{}`) to produce replay events with undefined required fields.
  describe('[BUG-538] SSE replay shape validation', () => {
    function installFakeXhrWithReplayHeader(): FakeXhrInstance {
      const instance = installFakeXhr();
      // Override the default no-op getResponseHeader to return the replay header
      instance.getResponseHeader = (header: string) =>
        header === 'Idempotency-Replay' ? 'true' : null;
      return instance;
    }

    it('sets streamError and emits no replay event when body is empty {}', async () => {
      const xhr = installFakeXhrWithReplayHeader();
      const { events } = streamSSEViaXHR('https://example.test/stream', {
        method: 'POST',
      });

      // Simulate: 200 response with Idempotency-Replay header but empty body
      xhr.status = 200;
      xhr.responseText = '{}';
      xhr.onloadend?.();

      const collected: StreamEvent[] = [];
      let caught: unknown = null;
      try {
        for await (const ev of events) {
          collected.push(ev);
        }
      } catch (e) {
        caught = e;
      }

      // No replay event must be emitted — shape validation rejected the body
      expect(collected.filter((e) => e.type === 'replay')).toHaveLength(0);
      // streamError must be set so the consumer knows confirmation is unsafe
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain(
        'Malformed idempotency replay response',
      );
    });

    it('emits a valid replay event when body passes schema validation', async () => {
      const xhr = installFakeXhrWithReplayHeader();
      const { events } = streamSSEViaXHR('https://example.test/stream', {
        method: 'POST',
      });

      const validBody = {
        replayed: true,
        clientId: 'c-abc123',
        status: 'persisted',
        assistantTurnReady: true,
        latestExchangeId: 'ex-456',
      };
      xhr.status = 200;
      xhr.responseText = JSON.stringify(validBody);
      xhr.onloadend?.();

      const collected: StreamEvent[] = [];
      for await (const ev of events) {
        collected.push(ev);
      }

      const replayEvents = collected.filter((e) => e.type === 'replay');
      expect(replayEvents).toHaveLength(1);
      expect(replayEvents[0]).toMatchObject({
        type: 'replay',
        clientId: 'c-abc123',
        replayed: true,
        status: 'persisted',
        assistantTurnReady: true,
        latestExchangeId: 'ex-456',
      });
    });
  });
});
