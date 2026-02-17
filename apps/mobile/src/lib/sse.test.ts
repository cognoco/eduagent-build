import { streamSSE, type StreamEvent } from './sse';

// Mock fetch
const originalFetch = globalThis.fetch;

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

describe('streamSSE', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses chunk events from SSE stream', async () => {
    const mockStream = createMockStream([
      'data: {"type":"chunk","content":"Hello"}\n\n',
      'data: {"type":"chunk","content":" world"}\n\n',
      'data: {"type":"done","exchangeCount":1,"escalationRung":1}\n\n',
    ]);

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const events: StreamEvent[] = [];
    for await (const event of streamSSE(
      'http://test/stream',
      { message: 'hi' },
      {}
    )) {
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

  it('throws on non-ok response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: jest.fn().mockResolvedValue('Server error'),
    });

    const gen = streamSSE('http://test/stream', { message: 'hi' }, {});
    await expect(gen.next()).rejects.toThrow('SSE error 500');
  });

  it('throws when response body is null', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    const gen = streamSSE('http://test/stream', { message: 'hi' }, {});
    await expect(gen.next()).rejects.toThrow(
      'Response body is null — streaming not supported'
    );
  });

  it('handles [DONE] signal', async () => {
    const mockStream = createMockStream([
      'data: {"type":"chunk","content":"Hi"}\n\n',
      'data: [DONE]\n\n',
      'data: {"type":"chunk","content":"ignored"}\n\n',
    ]);

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const events: StreamEvent[] = [];
    for await (const event of streamSSE(
      'http://test/stream',
      { message: 'hi' },
      {}
    )) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'Hi' });
  });

  it('handles events split across chunks', async () => {
    const mockStream = createMockStream([
      'data: {"type":"chu',
      'nk","content":"split"}\n\n',
    ]);

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const events: StreamEvent[] = [];
    for await (const event of streamSSE(
      'http://test/stream',
      { message: 'hi' },
      {}
    )) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'split' });
  });

  it('skips malformed JSON events', async () => {
    const mockStream = createMockStream([
      'data: not-json\n\n',
      'data: {"type":"chunk","content":"valid"}\n\n',
    ]);

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const events: StreamEvent[] = [];
    for await (const event of streamSSE(
      'http://test/stream',
      { message: 'hi' },
      {}
    )) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'valid' });
  });

  it('passes correct headers and body to fetch', async () => {
    const mockStream = createMockStream([]);
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const events: StreamEvent[] = [];
    for await (const event of streamSSE(
      'http://test/stream',
      { message: 'hello' },
      { Authorization: 'Bearer tok', 'X-Profile-Id': 'p1' }
    )) {
      events.push(event);
    }

    expect(globalThis.fetch).toHaveBeenCalledWith('http://test/stream', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok',
        'X-Profile-Id': 'p1',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(events).toHaveLength(0);
  });

  it('ignores empty lines and comment lines', async () => {
    const mockStream = createMockStream([
      '\n',
      ': this is a comment\n',
      'data: {"type":"chunk","content":"ok"}\n\n',
    ]);

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const events: StreamEvent[] = [];
    for await (const event of streamSSE(
      'http://test/stream',
      { message: 'hi' },
      {}
    )) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'chunk', content: 'ok' });
  });
});
