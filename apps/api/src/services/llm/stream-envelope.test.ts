import { streamEnvelopeReply, teeEnvelopeStream } from './stream-envelope';

async function collect(source: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of source) out += chunk;
  return out;
}

async function* fromChunks(chunks: string[]): AsyncGenerator<string> {
  for (const c of chunks) yield c;
}

// Yield `text` in fixed-size chunks of `size` characters.
async function* chunked(text: string, size: number): AsyncIterable<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

// Fully drain an async iterable, returning the concatenated output.
async function drain(stream: AsyncIterable<string>): Promise<string> {
  let result = '';
  for await (const chunk of stream) {
    result += chunk;
  }
  return result;
}

describe('streamEnvelopeReply', () => {
  it('extracts reply text from a single-chunk envelope', async () => {
    const stream = streamEnvelopeReply(
      fromChunks([
        '{"reply":"Hello world","signals":{"partial_progress":false}}',
      ])
    );
    expect(await collect(stream)).toBe('Hello world');
  });

  it('extracts reply split across many chunks', async () => {
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply"', ':"Hel', 'lo ', 'world"', ',"signals":{}}'])
    );
    expect(await collect(stream)).toBe('Hello world');
  });

  it('decodes JSON escapes (newline, quote, backslash)', async () => {
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply":"line1\\nline2 \\"quoted\\" \\\\end"}'])
    );
    expect(await collect(stream)).toBe('line1\nline2 "quoted" \\end');
  });

  it('decodes a \\uXXXX escape split across chunks', async () => {
    // U+00E9 = é
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply":"caf', '\\u', '00e9"}'])
    );
    expect(await collect(stream)).toBe('café');
  });

  it('handles escape char split across chunk boundary', async () => {
    const stream = streamEnvelopeReply(fromChunks(['{"reply":"a\\', 'nb"}']));
    expect(await collect(stream)).toBe('a\nb');
  });

  it('discards content after the reply closing quote', async () => {
    const stream = streamEnvelopeReply(
      fromChunks([
        '{"reply":"just this","signals":{"needs_deepening":true},"ui_hints":{}}',
      ])
    );
    expect(await collect(stream)).toBe('just this');
  });

  it('tolerates whitespace around the colon', async () => {
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply"  :  "spaced value"}'])
    );
    expect(await collect(stream)).toBe('spaced value');
  });

  it('yields nothing when the stream has no reply key', async () => {
    const stream = streamEnvelopeReply(
      fromChunks(['{"signals":{"ready_to_finish":false}}'])
    );
    expect(await collect(stream)).toBe('');
  });

  it('yields nothing when reply value is not a string', async () => {
    const stream = streamEnvelopeReply(fromChunks(['{"reply": 42}']));
    expect(await collect(stream)).toBe('');
  });
});

describe('teeEnvelopeStream', () => {
  it('happy path: cleanReplyStream yields reply text, rawResponsePromise resolves with full raw', async () => {
    const raw = '{"reply":"Hello world","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks([raw])
    );

    const reply = await drain(cleanReplyStream);
    const fullRaw = await rawResponsePromise;

    expect(reply).toBe('Hello world');
    expect(fullRaw).toBe(raw);
  });

  it('multi-chunk: reply is correctly reassembled when source is split into 5-char chunks', async () => {
    const raw = '{"reply":"Hello world","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      chunked(raw, 5)
    );

    const reply = await drain(cleanReplyStream);
    const fullRaw = await rawResponsePromise;

    expect(reply).toBe('Hello world');
    expect(fullRaw).toBe(raw);
  });

  it('escape sequences: cleanReplyStream yields decoded characters (\\n → actual newline)', async () => {
    const raw = '{"reply":"Line 1\\nLine 2","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks([raw])
    );

    const reply = await drain(cleanReplyStream);
    const fullRaw = await rawResponsePromise;

    // The encoded \n in JSON becomes a real newline in the decoded reply.
    expect(reply).toBe('Line 1\nLine 2');
    // The raw text is the original JSON string, escape sequences intact.
    expect(fullRaw).toBe(raw);
  });

  it('deadlock safety: draining cleanReplyStream first, then awaiting rawResponsePromise, resolves correctly', async () => {
    const raw = '{"reply":"Safe order","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks([raw])
    );

    // Drain the clean stream first — this is the correct, non-deadlocking order.
    const reply = await drain(cleanReplyStream);
    // Only then await the raw promise — it must already be settled.
    const fullRaw = await rawResponsePromise;

    expect(reply).toBe('Safe order');
    expect(fullRaw).toBe(raw);
  });

  it('source error: rawResponsePromise rejects with the same error thrown by the source', async () => {
    const boom = new Error('stream exploded');

    async function* errorSource(): AsyncGenerator<string> {
      yield '{"reply":"par';
      throw boom;
    }

    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      errorSource()
    );

    // Draining cleanReplyStream will throw once the source throws.
    await expect(drain(cleanReplyStream)).rejects.toThrow('stream exploded');
    // rawResponsePromise must reject with the same error.
    await expect(rawResponsePromise).rejects.toThrow('stream exploded');
  });

  it('empty reply: cleanReplyStream yields nothing, rawResponsePromise resolves with full raw', async () => {
    const raw = '{"reply":"","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks([raw])
    );

    const reply = await drain(cleanReplyStream);
    const fullRaw = await rawResponsePromise;

    expect(reply).toBe('');
    expect(fullRaw).toBe(raw);
  });

  it('[A-2] rejects rawResponsePromise with deadlock error when awaited before draining', async () => {
    const { rawResponsePromise } = teeEnvelopeStream(
      fromChunks(['{"reply":"nope"}'])
    );

    // Awaiting the raw promise without ever draining cleanReplyStream
    // should reject with a deadlock-detection error, not hang forever.
    await expect(rawResponsePromise).rejects.toThrow(
      'Drain cleanReplyStream first'
    );
  });
});
