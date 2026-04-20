import { streamEnvelopeReply } from './stream-envelope';

async function collect(source: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of source) out += chunk;
  return out;
}

async function* fromChunks(chunks: string[]): AsyncGenerator<string> {
  for (const c of chunks) yield c;
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
