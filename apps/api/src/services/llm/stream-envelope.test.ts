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
      ]),
    );
    expect(await collect(stream)).toBe('Hello world');
  });

  it('extracts reply split across many chunks', async () => {
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply"', ':"Hel', 'lo ', 'world"', ',"signals":{}}']),
    );
    expect(await collect(stream)).toBe('Hello world');
  });

  it('does not hold ordinary streamed text until flush', async () => {
    const iterator = streamEnvelopeReply(
      fromChunks(['{"reply":"Hello', ' world"}']),
    )[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: 'Hello',
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: ' world',
    });
  });

  it('decodes JSON escapes (newline, quote, backslash)', async () => {
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply":"line1\\nline2 \\"quoted\\" \\\\end"}']),
    );
    expect(await collect(stream)).toBe('line1\nline2 "quoted" \\end');
  });

  it('decodes a \\uXXXX escape split across chunks', async () => {
    // U+00E9 = é
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply":"caf', '\\u', '00e9"}']),
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
      ]),
    );
    expect(await collect(stream)).toBe('just this');
  });

  it('strips an envelope side-channel that the model copied into the reply string', async () => {
    const raw = JSON.stringify({
      reply:
        'Who did the actual farming?","signals":{"partial_progress":false,"needs_deepening":false,"understanding_check":true},"ui_hints":{"note_prompt":{"show":false,"post_session":false}}}',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: true,
      },
      ui_hints: { note_prompt: { show: false, post_session: false } },
    });
    const stream = streamEnvelopeReply(chunked(raw, 11));

    expect(await collect(stream)).toBe('Who did the actual farming?');
  });

  it('strips a confidence side-channel that the model copied into the reply string', async () => {
    const raw = JSON.stringify({
      reply: 'Nice work!","confidence":"low"}',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: true,
      },
      confidence: 'medium',
    });
    const stream = streamEnvelopeReply(chunked(raw, 5));

    expect(await collect(stream)).toBe('Nice work!');
  });

  it('tolerates whitespace around the colon', async () => {
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply"  :  "spaced value"}']),
    );
    expect(await collect(stream)).toBe('spaced value');
  });

  it('yields nothing when the stream has no reply key', async () => {
    const stream = streamEnvelopeReply(
      fromChunks(['{"signals":{"ready_to_finish":false}}']),
    );
    expect(await collect(stream)).toBe('');
  });

  it('yields nothing when reply value is not a string', async () => {
    const stream = streamEnvelopeReply(fromChunks(['{"reply": 42}']));
    expect(await collect(stream)).toBe('');
  });

  // ---- [LITERAL-ESCAPE] Defensive normalizer for double-escaping LLMs ----

  it('[LITERAL-ESCAPE] converts literal `\\n` (raw `\\\\n`) to a real newline mid-stream', async () => {
    // Raw JSON contains `\\\\n` (4 chars). JSON-decode → literal `\n` (2 chars).
    // The normalizer collapses that to a real newline before yielding.
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply":"Hello\\\\nWorld"}']),
    );
    const out = await collect(stream);
    expect(out).toBe('Hello\nWorld');
    expect(out).not.toContain('\\n');
  });

  it('[LITERAL-ESCAPE] handles a literal escape split across chunk boundary', async () => {
    // `\` arrives in chunk N and `n` arrives in chunk N+1. The normalizer
    // must defer the trailing backslash and pair it with the next chunk.
    const stream = streamEnvelopeReply(fromChunks(['{"reply":"a\\\\', 'nb"}']));
    expect(await collect(stream)).toBe('a\nb');
  });

  it('[LITERAL-ESCAPE] preserves a backslash whose paired char is not n/r/t', async () => {
    // `\\d` in raw → literal `\d` after JSON decode → must survive untouched
    // (regexes and code samples teach learners with backslashes).
    const stream = streamEnvelopeReply(
      fromChunks(['{"reply":"regex \\\\d+ matches"}']),
    );
    expect(await collect(stream)).toBe('regex \\d+ matches');
  });

  it('[LITERAL-ESCAPE] flushes a trailing lone backslash at end of reply', async () => {
    // A `\` right before the closing quote with no partner: must end up in
    // the output, not get silently dropped.
    const stream = streamEnvelopeReply(fromChunks(['{"reply":"trail\\\\"}']));
    expect(await collect(stream)).toBe('trail\\');
  });

  it('[LITERAL-ESCAPE] does not touch real newlines (correct JSON `\\n`)', async () => {
    const stream = streamEnvelopeReply(fromChunks(['{"reply":"a\\nb"}']));
    expect(await collect(stream)).toBe('a\nb');
  });
});

describe('teeEnvelopeStream', () => {
  it('happy path: cleanReplyStream yields reply text, rawResponsePromise resolves with full raw', async () => {
    const raw = '{"reply":"Hello world","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks([raw]),
    );

    const reply = await drain(cleanReplyStream);
    const fullRaw = await rawResponsePromise;

    expect(reply).toBe('Hello world');
    expect(fullRaw).toBe(raw);
  });

  it('multi-chunk: reply is correctly reassembled when source is split into 5-char chunks', async () => {
    const raw = '{"reply":"Hello world","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      chunked(raw, 5),
    );

    const reply = await drain(cleanReplyStream);
    const fullRaw = await rawResponsePromise;

    expect(reply).toBe('Hello world');
    expect(fullRaw).toBe(raw);
  });

  it('escape sequences: cleanReplyStream yields decoded characters (\\n → actual newline)', async () => {
    const raw = '{"reply":"Line 1\\nLine 2","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks([raw]),
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
      fromChunks([raw]),
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

    const { cleanReplyStream, rawResponsePromise } =
      teeEnvelopeStream(errorSource());

    // Draining cleanReplyStream will throw once the source throws.
    await expect(drain(cleanReplyStream)).rejects.toThrow('stream exploded');
    // rawResponsePromise must reject with the same error.
    await expect(rawResponsePromise).rejects.toThrow('stream exploded');
  });

  it('empty reply: cleanReplyStream yields nothing, rawResponsePromise resolves with full raw', async () => {
    const raw = '{"reply":"","signals":{}}';
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks([raw]),
    );

    const reply = await drain(cleanReplyStream);
    const fullRaw = await rawResponsePromise;

    expect(reply).toBe('');
    expect(fullRaw).toBe(raw);
  });

  it('[A-2] rawResponsePromise only settles after cleanReplyStream is drained', async () => {
    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks(['{"reply":"order matters","signals":{}}']),
    );

    // rawResponsePromise must NOT settle before draining cleanReplyStream.
    // Verify by racing against a short timeout — it should time out.
    const timedOut = Symbol('timeout');
    const result = await Promise.race([
      rawResponsePromise,
      new Promise<typeof timedOut>((r) => setTimeout(() => r(timedOut), 50)),
    ]);
    expect(result).toBe(timedOut);

    // Now drain and verify it settles correctly.
    await drain(cleanReplyStream);
    await expect(rawResponsePromise).resolves.toBe(
      '{"reply":"order matters","signals":{}}',
    );
  });

  it('[BUG-628] rawResponsePromise resolves with partial text when cleanReplyStream is abandoned early', async () => {
    // Simulates a client disconnect / SSE write error where the caller stops
    // consuming cleanReplyStream before the source is exhausted. The
    // rawResponsePromise must still settle (with whatever was accumulated)
    // rather than suspending forever and timing out the Cloudflare Worker.
    const raw = '{"reply":"Hello world","signals":{}}';

    const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
      fromChunks([raw]),
    );

    // Consume only the first chunk of cleanReplyStream, then abandon it.

    for await (const _chunk of cleanReplyStream) {
      break; // stop after first yield
    }

    // rawResponsePromise must settle even though cleanReplyStream was not
    // fully drained. It resolves with whatever was accumulated up to the
    // break point (at minimum, empty string — not a hanging promise).
    const settled = await Promise.race([
      rawResponsePromise.then(() => 'resolved'),
      new Promise<string>((r) => setTimeout(() => r('timed_out'), 500)),
    ]);
    expect(settled).toBe('resolved');
  });
});
