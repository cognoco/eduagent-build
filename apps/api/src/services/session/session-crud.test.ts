import { projectAiResponseContent, stripMarkdownFence } from './session-crud';

// [BUG-934] Defensive backstop in getSessionTranscript: ai_response events
// whose content is still raw envelope JSON (because the write-path stripper
// failed) must surface only `.reply` to the rendered chat bubble. Plain prose
// must pass through untouched, and unparseable JSON-looking content must NOT
// be silently dropped.
describe('projectAiResponseContent', () => {
  it('returns plain prose unchanged', () => {
    const text = 'Ciao Zuzana! Welcome back to Italian.';
    expect(projectAiResponseContent(text)).toBe(text);
  });

  it('returns multi-paragraph prose unchanged (real newlines preserved)', () => {
    const text = 'First paragraph.\n\nSecond paragraph with detail.';
    expect(projectAiResponseContent(text)).toBe(text);
  });

  it('strips full envelope JSON down to the reply field (schema-valid envelope)', () => {
    const envelope = JSON.stringify({
      reply: 'Ciao, Zuzana! Italian beginner — fantastic.',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
    });
    expect(projectAiResponseContent(envelope)).toBe(
      'Ciao, Zuzana! Italian beginner — fantastic.'
    );
  });

  it('strips the exact leaked-envelope shape from BUG-934 (schema-invalid fluency_drill)', () => {
    // This is the literal payload pasted in the bug report. It fails Zod
    // validation because `duration_s: 0` is below min(15) and `score: null`
    // is not a score object — but the JSON is structurally valid and
    // `.reply` is intact, so the backstop must still project it.
    const leaked = JSON.stringify({
      reply: 'Ciao, Zuzana! Welcome to your Italian session.',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
      ui_hints: {
        note_prompt: { show: false, post_session: false },
        fluency_drill: { active: false, duration_s: 0, score: null },
      },
    });
    expect(projectAiResponseContent(leaked)).toBe(
      'Ciao, Zuzana! Welcome to your Italian session.'
    );
  });

  it('normalizes literal `\\n` even on schema-invalid envelopes', () => {
    // Combination of the two failure modes: schema-invalid AND a
    // double-escaped newline that needs normalizing to a real `\n`.
    const leaked = JSON.stringify({
      reply: 'Line one.\\nLine two.',
      ui_hints: {
        fluency_drill: { active: false, duration_s: 0 },
      },
    });
    expect(projectAiResponseContent(leaked)).toBe('Line one.\nLine two.');
  });

  it('normalizes literal `\\n` inside the envelope reply field', () => {
    // The LLM (or a fallback model) double-escaped a newline. parseEnvelope
    // already normalizes — we just assert the projection picks up the
    // normalized text.
    const envelope = '{"reply": "First.\\\\nSecond."}';
    expect(projectAiResponseContent(envelope)).toBe('First.\nSecond.');
  });

  it('leaves bare JSON without a reply field untouched (no silent loss)', () => {
    // A persisted row that genuinely contains JSON-shaped prose (e.g. a
    // teaching example showing JSON structure) must NOT be eaten by the
    // backstop just because it starts with `{`.
    const teaching =
      'Here is the shape: {"name": "...", "age": 11}. Notice the quotes.';
    expect(projectAiResponseContent(teaching)).toBe(teaching);
  });

  it('leaves JSON-shaped content with reply key but invalid envelope alone', () => {
    // Has `"reply"` substring but won't pass schema (`reply` must be
    // non-empty string). Treat as opaque content — never drop it.
    const malformed = '{"reply": 42, "junk": true}';
    expect(projectAiResponseContent(malformed)).toBe(malformed);
  });

  it('handles leading whitespace before the envelope', () => {
    const envelope = '   \n  {"reply": "Hi there!"}';
    expect(projectAiResponseContent(envelope)).toBe('Hi there!');
  });

  it('does NOT attempt envelope parse on prose that happens to mention reply', () => {
    // Cheap pre-check requires content to start with `{`. Prose mentioning
    // the word "reply" should bypass parse and be returned unchanged.
    const text = 'In your reply, please include an example.';
    expect(projectAiResponseContent(text)).toBe(text);
  });

  // ---- [I-2] Markdown-fence leak protection --------------------------------

  it('[I-2] strips full envelope JSON wrapped in markdown ```json fence', () => {
    const envelope = JSON.stringify({
      reply: 'Ciao! Benvenuto alla sessione di italiano.',
      signals: { ready_to_finish: false },
    });
    const fenced = '```json\n' + envelope + '\n```';
    expect(projectAiResponseContent(fenced)).toBe(
      'Ciao! Benvenuto alla sessione di italiano.'
    );
  });

  it('[I-2] strips full envelope JSON wrapped in plain ``` fence', () => {
    const envelope = JSON.stringify({
      reply: 'Let us continue where we left off.',
    });
    const fenced = '```\n' + envelope + '\n```';
    expect(projectAiResponseContent(fenced)).toBe(
      'Let us continue where we left off.'
    );
  });

  it('[I-2] passes plain prose containing quoted JSON with reply through untouched', () => {
    // Teaching example: prose that *quotes* an envelope should never be
    // consumed by the backstop.
    const text =
      'The AI returns something like `{"reply":"hi","signals":{}}` — notice the structure.';
    expect(projectAiResponseContent(text)).toBe(text);
  });
});

// ---- [I-2] stripMarkdownFence unit tests ------------------------------------

describe('stripMarkdownFence', () => {
  it('strips a ```json ... ``` fence and returns trimmed inner content', () => {
    const inner = '{"reply": "hello"}';
    expect(stripMarkdownFence('```json\n' + inner + '\n```')).toBe(inner);
  });

  it('strips a plain ``` ... ``` fence', () => {
    const inner = '{"reply": "world"}';
    expect(stripMarkdownFence('```\n' + inner + '\n```')).toBe(inner);
  });

  it('strips a ```typescript ... ``` fence', () => {
    const inner = '{"reply": "typed"}';
    expect(stripMarkdownFence('```typescript\n' + inner + '\n```')).toBe(inner);
  });

  it('returns the original string when no fence is present', () => {
    const plain = '{"reply": "no fence here"}';
    expect(stripMarkdownFence(plain)).toBe(plain);
  });

  it('returns plain prose unchanged (no fence)', () => {
    const prose = 'Ciao! Come stai?';
    expect(stripMarkdownFence(prose)).toBe(prose);
  });
});

// ---- [I-1] Aggregate envelope-leak logging ----------------------------------

describe('[I-1] projectAiResponseContent aggregate logging', () => {
  function makeLeakedEnvelope(reply: string): string {
    // Schema-invalid: fluency_drill.duration_s violates min(15) constraint.
    return JSON.stringify({
      reply,
      ui_hints: {
        fluency_drill: { active: false, duration_s: 0, score: null },
      },
    });
  }

  it('does NOT emit a warn when no rows contain leaked envelopes', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Plain prose — projectAiResponseContent returns content unchanged, no warn.
    projectAiResponseContent('Plain prose row.', { silent: true });
    projectAiResponseContent('Another plain row.', { silent: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does NOT emit a per-row warn when silent:true even on a leaked envelope', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const leaked = makeLeakedEnvelope('Hi there!');
    projectAiResponseContent(leaked, { silent: true });
    // No warn should have been emitted because silent:true suppresses it.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('still emits a per-call warn when silent is not set (other callers unaffected)', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const leaked = makeLeakedEnvelope('Hi!');
    projectAiResponseContent(leaked);
    // Default (non-silent) path must still log per [BUG-847].
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
