import { parseSSEStream, streamSSEViaXHR, type StreamEvent } from './sse';

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

  it('throws when response body is null', async () => {
    const gen = parseSSEStream(mockResponse(null));
    await expect(gen.next()).rejects.toThrow(
      'Response body is null — streaming not supported'
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
    () => instance
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
    expect((caught as Error).message).toMatch(/500/);
    // Crucial: the partial chunks must NOT have been yielded.
    expect(collected).toEqual([]);
  });
});
