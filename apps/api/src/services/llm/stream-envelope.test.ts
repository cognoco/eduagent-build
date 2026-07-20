import { parseEnvelope } from './envelope';
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

async function expectStreamedReplyToMatchParsedEnvelope(
  raw: string,
  chunkSize: number,
  expectedReply: string,
): Promise<void> {
  const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
    chunked(raw, chunkSize),
  );

  const streamedReply = await drain(cleanReplyStream);
  const rawResponse = await rawResponsePromise;
  const parsed = parseEnvelope(rawResponse, 'exchange.session');

  expect(rawResponse).toBe(raw);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(`parseEnvelope failed: ${parsed.reason}`);
  }

  expect(streamedReply).toBe(expectedReply);
  expect(parsed.envelope.reply).toBe(expectedReply);
  expect(streamedReply).toBe(parsed.envelope.reply);
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

  it('strips private source side-channel copied into the reply string', async () => {
    const raw = JSON.stringify({
      reply:
        'Use the roads example.","private_sources":{"relied_on":["current_topic"],"insufficient":false},"confidence":"high"}',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: true,
      },
      private_sources: {
        relied_on: ['current_topic'],
        insufficient: false,
      },
      confidence: 'high',
    });
    const stream = streamEnvelopeReply(chunked(raw, 7));

    expect(await collect(stream)).toBe('Use the roads example.');
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

  // ---- Top-level reply only — streamed text must match what persists ----
  // The extractor must emit the envelope's TOP-LEVEL reply, never a `reply`
  // key nested inside an earlier object: completion-time parseEnvelope reads
  // the top-level field, so emitting a nested one shows the learner text
  // that never persists to the transcript/export/parent view.

  describe('[WI-581/F-131] top-level reply extraction', () => {
    it('emits the top-level reply, not a nested pre-reply object reply (single chunk)', async () => {
      const raw = '{"x":{"reply":"AAA"},"reply":"BBB","signals":{}}';
      const stream = streamEnvelopeReply(fromChunks([raw]));
      expect(await collect(stream)).toBe('BBB');
    });

    it('emits the top-level reply with a nested object, split into tiny chunks', async () => {
      const raw =
        '{"meta":{"reply":"nested decoy","deep":{"reply":"deeper"}},"reply":"Real reply","signals":{"partial_progress":false}}';
      const stream = streamEnvelopeReply(chunked(raw, 3));
      expect(await collect(stream)).toBe('Real reply');
    });

    it('streamed text matches the parsed+persisted reply for a nested-decoy envelope', async () => {
      const raw =
        '{"x":{"reply":"DECOY"},"reply":"Persisted text","signals":{}}';
      await expectStreamedReplyToMatchParsedEnvelope(raw, 5, 'Persisted text');
    });

    it('ignores "reply" appearing inside a top-level string VALUE before the real key', async () => {
      const raw =
        '{"a":"see \\"reply\\": value inside a string","reply":"REAL"}';
      const stream = streamEnvelopeReply(chunked(raw, 4));
      expect(await collect(stream)).toBe('REAL');
    });

    it('ignores a reply key nested inside a top-level array element', async () => {
      const raw = '{"list":[{"reply":"in array"}],"reply":"top"}';
      const stream = streamEnvelopeReply(fromChunks([raw]));
      expect(await collect(stream)).toBe('top');
    });

    it('still finds the top-level reply key when split across chunk boundaries', async () => {
      const raw = '{"signals":{"ready_to_finish":false},"reply":"split key"}';
      const stream = streamEnvelopeReply(chunked(raw, 2));
      expect(await collect(stream)).toBe('split key');
    });

    it('still extracts a fence-prefixed envelope top-level reply', async () => {
      const raw = '```json\n{"reply":"fenced","signals":{}}\n```';
      const stream = streamEnvelopeReply(chunked(raw, 6));
      expect(await collect(stream)).toBe('fenced');
    });

    // Deterministic property check: for adversarial envelope shapes, the
    // streamed reply must equal the parsed top-level reply under many
    // different chunk fragmentations (seeded LCG — fully reproducible).
    const adversarialEnvelopes: string[] = [
      '{"x":{"reply":"AAA","arr":[{"reply":"B"}]},"reply":"top level","signals":{"partial_progress":true}}',
      '{"a":"val with \\"reply\\": fake","b":{"c":"{\\"reply\\":\\"nope\\"}"},"reply":"real one","confidence":"high"}',
      '```json\n{"meta":[1,2,{"reply":"no"}],"reply":"fenced real","ui_hints":{}}\n```',
      '{"deep":{"deeper":{"deepest":{"reply":"x"}}},"reply":"surface","private_sources":{"relied_on":["a"]}}',
      '{"weird key with spaces":"v","reply":"after weird","signals":{}}',
      '{"a":123,"b":true,"c":null,"reply":"after scalars"}',
      '{"a":[[],[[{"reply":"nested arr"}]]],"reply":"after arrays"}',
    ];

    async function* chunkSeeded(
      text: string,
      seed: number,
    ): AsyncGenerator<string> {
      let s = seed;
      let i = 0;
      while (i < text.length) {
        s = (s * 1103515245 + 12345) % 2147483648;
        const n = 1 + (s % 7);
        yield text.slice(i, i + n);
        i += n;
      }
    }

    it.each(adversarialEnvelopes.map((raw) => [raw]))(
      'streamed reply equals parsed top-level reply under 25 chunkings — case %#',
      async (raw) => {
        const parsed = parseEnvelope(raw, 'exchange.session', {
          silent: true,
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        for (let seed = 1; seed <= 25; seed += 1) {
          const streamed = await collect(
            streamEnvelopeReply(chunkSeeded(raw, seed)),
          );
          expect(streamed).toBe(parsed.envelope.reply);
        }
      },
    );
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

  // -----------------------------------------------------------------------
  // [BUG-124] maxTailPendingChars overflow path.
  //
  // The tail-pending buffer caps at 512 chars. When the buffered candidate
  // exceeds the cap WITHOUT being a real envelope side-channel, the helper
  // must release the buffered text back to the visible stream instead of
  // silently dropping it. The previous suite had no test for this branch —
  // a regression that flipped the overflow behavior to "discard" would have
  // shipped silently.
  // -----------------------------------------------------------------------
  it('[BUG-124] flushes the tail-pending buffer back to the stream when content exceeds the 512-char cap', async () => {
    // The tail filter activates when the model copies an envelope-tail
    // lookalike INTO the reply string (e.g. literal `","signals":`). It
    // buffers up to `maxTailPendingChars` = 512 chars while waiting to
    // confirm whether the lookalike is a real side-channel. If the buffer
    // crosses 512 chars without a confirming key, the helper must release
    // the buffered bytes back to the visible stream rather than discard
    // them.
    const visibleHead = 'Hello there. ';
    // 700 chars of `A` — guaranteed not to contain `partial_progress`,
    // `needs_deepening`, etc., so the confirm-key regex never matches.
    const longTail = 'A'.repeat(700);
    const replyValue = `${visibleHead}","signals":${longTail}`;
    // Valid JSON envelope; JSON.stringify escapes the inner quotes so the
    // on-wire form has `\",\"signals\":` inside the reply string.
    const envelope = JSON.stringify({ reply: replyValue });

    const stream = streamEnvelopeReply(chunked(envelope, 17));
    const output = await collect(stream);

    // The visible head must always make it through (yielded before the
    // tail-trigger fired).
    expect(output).toContain(visibleHead);
    // The overflow path must yield the buffered text rather than silently
    // dropping it — pin >512 chars to prove the cap branch fired and
    // released.
    expect(output.length).toBeGreaterThan(512);
  });

  it('[BUG-124] stays bounded — tail-pending does not grow without limit', async () => {
    // Same shape as above but with a 10k-char run. If the cap were broken,
    // the helper would buffer all 10k inside `tailPending` before yielding
    // anything past the tail trigger; with the cap intact, it releases
    // around 512 chars and continues normally — total memory for the helper
    // stays O(cap), not O(input).
    //
    // A pathological O(n^2) regression in the tail-pending branch
    // (re-scanning the whole buffer per chunk) blows well past 1s on 10k
    // chars, so wall-clock is a meaningful proxy for the cap holding.
    const visibleHead = 'prefix. ';
    const hugeTail = 'B'.repeat(10_000);
    const replyValue = `${visibleHead}","signals":${hugeTail}`;
    const envelope = JSON.stringify({ reply: replyValue });

    const start = Date.now();
    const stream = streamEnvelopeReply(chunked(envelope, 23));
    const output = await collect(stream);
    const elapsedMs = Date.now() - start;

    expect(output).toContain(visibleHead);
    expect(elapsedMs).toBeLessThan(1000);
  });
});

describe('teeEnvelopeStream', () => {
  it.each([
    {
      name: 'strips embedded signals/ui_hints copied inside reply',
      raw: JSON.stringify({
        reply:
          'Who did the actual farming?","signals":{"partial_progress":false,"needs_deepening":false,"understanding_check":true},"ui_hints":{"note_prompt":{"show":false,"post_session":false}}}',
        signals: {
          partial_progress: false,
          needs_deepening: false,
          understanding_check: true,
        },
        ui_hints: { note_prompt: { show: false, post_session: false } },
      }),
      chunkSize: 11,
      expectedReply: 'Who did the actual farming?',
    },
    {
      name: 'strips embedded private_sources/confidence copied inside reply',
      raw: JSON.stringify({
        reply:
          'Use the roads example.","private_sources":{"relied_on":["current_topic"],"insufficient":false},"confidence":"high"}',
        signals: {
          partial_progress: false,
          needs_deepening: false,
          understanding_check: true,
        },
        private_sources: {
          relied_on: ['current_topic'],
          insufficient: false,
        },
        confidence: 'high',
      }),
      chunkSize: 7,
      expectedReply: 'Use the roads example.',
    },
    {
      name: 'keeps an unconfirmed side-channel lookalike in legitimate prose',
      raw: JSON.stringify({
        reply:
          'When you see ","signals": in a JSON example, it marks metadata, but this sentence is visible.',
        signals: {
          partial_progress: false,
          needs_deepening: false,
          understanding_check: true,
        },
        confidence: 'medium',
      }),
      chunkSize: 9,
      expectedReply:
        'When you see ","signals": in a JSON example, it marks metadata, but this sentence is visible.',
    },
    {
      name: 'leaves a normal well-formed envelope unchanged',
      raw: JSON.stringify({
        reply: 'Nice work. Now compare the two examples.',
        signals: {
          partial_progress: true,
          needs_deepening: false,
          understanding_check: true,
        },
        ui_hints: { note_prompt: { show: false, post_session: false } },
        private_sources: {
          relied_on: ['current_topic'],
          insufficient: false,
        },
        confidence: 'high',
      }),
      chunkSize: 13,
      expectedReply: 'Nice work. Now compare the two examples.',
    },
  ])(
    'keeps streamed reply equal to parsed envelope reply: $name',
    async ({ raw, chunkSize, expectedReply }) => {
      await expectStreamedReplyToMatchParsedEnvelope(
        raw,
        chunkSize,
        expectedReply,
      );
    },
  );

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

  it('source error does not emit an unhandled rejection when only the clean stream is consumed', async () => {
    const boom = new Error('stream exploded');
    const unhandledRejections: unknown[] = [];
    const captureUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };

    async function* errorSource(): AsyncGenerator<string> {
      yield '{"reply":"par';
      throw boom;
    }

    process.on('unhandledRejection', captureUnhandledRejection);
    try {
      const { cleanReplyStream } = teeEnvelopeStream(errorSource());

      await expect(drain(cleanReplyStream)).rejects.toBe(boom);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', captureUnhandledRejection);
    }
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
