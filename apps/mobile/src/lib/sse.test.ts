import { parseSSEStream, type StreamEvent } from './sse';

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
});
