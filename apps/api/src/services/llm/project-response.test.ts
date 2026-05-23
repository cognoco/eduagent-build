// ---------------------------------------------------------------------------
// project-response.test.ts
//
// Unit tests for stripMarkdownFence and projectAiResponseContent.
// No internal jest.mock() — all implementations are real (GC1 ratchet).
// ---------------------------------------------------------------------------

import {
  projectAiResponseContent,
  stripMarkdownFence,
} from './project-response';

// ---------------------------------------------------------------------------
// Helper: captures console.warn calls from the structured logger so we can
// assert on telemetry without polluting test output.
// ---------------------------------------------------------------------------
function captureWarns(): {
  spy: jest.SpyInstance;
  calls: () => unknown[][];
} {
  const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  return {
    spy,
    calls: () => spy.mock.calls,
  };
}

// ---------------------------------------------------------------------------
// stripMarkdownFence
// ---------------------------------------------------------------------------

describe('stripMarkdownFence', () => {
  it('returns plain text unchanged', () => {
    expect(stripMarkdownFence('Hello there!')).toBe('Hello there!');
  });

  it('strips a ```json fence', () => {
    const input = '```json\n{"reply": "hi"}\n```';
    expect(stripMarkdownFence(input)).toBe('{"reply": "hi"}');
  });

  it('strips a ```typescript fence', () => {
    const input = '```typescript\nconst x = 1;\n```';
    expect(stripMarkdownFence(input)).toBe('const x = 1;');
  });

  it('strips a bare ``` fence with no language tag', () => {
    const input = '```\n{"reply": "bare"}\n```';
    expect(stripMarkdownFence(input)).toBe('{"reply": "bare"}');
  });

  it('returns text unchanged when no closing fence is present', () => {
    const input = '```json\n{"reply": "no close"';
    expect(stripMarkdownFence(input)).toBe(input);
  });

  it('returns empty string unchanged', () => {
    expect(stripMarkdownFence('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// projectAiResponseContent
// ---------------------------------------------------------------------------

describe('projectAiResponseContent', () => {
  // ---- Case 1: Plain prose passes through early exit ---------------------

  it('returns plain prose unchanged (early exit — no { or no "reply")', () => {
    const prose = 'Hello there!';
    expect(projectAiResponseContent(prose)).toBe(prose);
  });

  // ---- Case 2: JSON without "reply" key — passes through stripEmbeddedEnvelopeTail

  it('returns JSON that has no "reply" key via stripEmbeddedEnvelopeTail (no mutation for clean JSON)', () => {
    const input = '{"foo": "bar"}';
    // No "reply" substring → early exit → stripEmbeddedEnvelopeTail(rawContent)
    // The input has no embedded envelope tail, so it passes through unchanged.
    expect(projectAiResponseContent(input)).toBe(input);
  });

  it('strips embedded envelope tail from plain prose that contains the leaked tail pattern', () => {
    // This is the embedded-tail case that stripEmbeddedEnvelopeTail handles:
    // a string that looks like the learner-visible reply leaked the side-channel.
    const leaked =
      'Who did the farming?","signals":{"partial_progress":false,"needs_deepening":false}';
    // The pre-check: trimmed starts with '"' not '{' → early exit via
    // stripEmbeddedEnvelopeTail. Tail IS present so it should be stripped.
    expect(projectAiResponseContent(leaked)).toBe('Who did the farming?');
  });

  // ---- Case 3: Valid strict envelope — returns .reply (normalized) -------

  it('returns the reply field from a valid strict envelope', () => {
    const envelope = JSON.stringify({
      reply: 'Great answer!',
      signals: { ready_to_finish: true },
    });
    expect(projectAiResponseContent(envelope)).toBe('Great answer!');
  });

  it('normalizes literal \\n escape sequences in the reply via the strict parse path', () => {
    // JSON with literal backslash-n in the reply string (double-escaped in JSON)
    const envelope = '{"reply": "Line1\\\\nLine2"}';
    const result = projectAiResponseContent(envelope);
    expect(result).toBe('Line1\nLine2');
    expect(result).not.toContain('\\n');
  });

  it('returns a minimal valid envelope reply (no signals)', () => {
    const envelope = JSON.stringify({ reply: 'Just the reply.' });
    expect(projectAiResponseContent(envelope)).toBe('Just the reply.');
  });

  // ---- Case 4: Fence-wrapped envelope ------------------------------------

  it('strips a ```json fence then projects the envelope reply', () => {
    const wrapped = '```json\n{"reply": "hi", "signals": {}}\n```';
    expect(projectAiResponseContent(wrapped)).toBe('hi');
  });

  it('strips a bare ``` fence then projects the envelope reply', () => {
    const wrapped = '```\n{"reply": "bare fence works"}\n```';
    expect(projectAiResponseContent(wrapped)).toBe('bare fence works');
  });

  // ---- Case 5: Schema-invalid but JSON-parseable — falls to JSON.parse path

  it('falls through to JSON.parse path when reply contains a [MARKER] token (fails Zod refine) and returns .reply', () => {
    // The reply field contains [INTERVIEW_COMPLETE] which fails the Zod refine,
    // so parseEnvelope returns schema_violation. The JSON.parse fallback path
    // then extracts .reply directly.
    const input = JSON.stringify({
      reply: 'You did it! [INTERVIEW_COMPLETE]',
      signals: { ready_to_finish: true },
    });
    const { spy } = captureWarns();
    try {
      const result = projectAiResponseContent(input, { silent: true });
      // The fallback returns the raw .reply string, normalized and tail-stripped.
      // No embedded tail here, so it should equal the reply text.
      expect(result).toBe('You did it! [INTERVIEW_COMPLETE]');
    } finally {
      spy.mockRestore();
    }
  });

  it('falls through to JSON.parse path when reply is empty string (fails min(1)) and returns rawContent', () => {
    // Empty reply fails Zod (min 1). Falls to JSON.parse path, but
    // (parsed.reply.length > 0) guard blocks it → returns rawContent.
    const input = JSON.stringify({ reply: '' });
    const { spy } = captureWarns();
    try {
      const result = projectAiResponseContent(input, { silent: true });
      expect(result).toBe(input);
    } finally {
      spy.mockRestore();
    }
  });

  // ---- Case 6: Malformed JSON in JSON.parse fallback ---------------------

  it('returns rawContent unchanged when nested JSON is syntactically malformed', () => {
    // Has { and "reply" → passes pre-check.
    // parseEnvelope tries JSON.parse → fails (bad is not valid JSON).
    // The repair helper (bare-quote repair) doesn't fix `{bad}` → invalid_json.
    // projectAiResponseContent then calls extractFirstJsonObject → finds the
    // outer balanced `{}` → JSON.parse throws → returns rawContent unchanged.
    const input = '{"reply": "oops", "nested": {bad}}';
    const { spy } = captureWarns();
    try {
      expect(projectAiResponseContent(input, { silent: true })).toBe(input);
    } finally {
      spy.mockRestore();
    }
  });

  it('returns rawContent when truly unparseable JSON is in the candidate', () => {
    // Construct input that passes the pre-check (starts with { and has "reply")
    // but the inner JSON is totally malformed after extraction, so JSON.parse
    // throws and we fall back to returning rawContent.
    // The brace walker will extract the outer {}, but JSON.parse will fail.
    const input = '{"reply": "test",,,,}';
    const { spy } = captureWarns();
    try {
      const result = projectAiResponseContent(input, { silent: true });
      expect(result).toBe(input);
    } finally {
      spy.mockRestore();
    }
  });

  // ---- Case 7: Empty reply in fallback path (length > 0 guard) ----------

  it('returns rawContent when reply is empty string (length > 0 guard blocks fallback return)', () => {
    // This specifically tests the `(parsed.reply.length > 0)` guard.
    // parseEnvelope fails for empty reply (min 1 violation).
    // JSON.parse fallback finds reply: "" → length === 0 → guard blocks it.
    // Returns rawContent.
    const input = '{"reply": ""}';
    const { spy } = captureWarns();
    try {
      expect(projectAiResponseContent(input, { silent: true })).toBe(input);
    } finally {
      spy.mockRestore();
    }
  });

  // ---- Case 8: Reply is not a string in fallback path -------------------

  it('returns rawContent when reply is a number (typeof guard in fallback)', () => {
    // parseEnvelope fails (reply is not a string → schema_violation).
    // JSON.parse fallback: typeof parsed.reply === 'number' → guard blocks it.
    // Returns rawContent.
    const input = '{"reply": 42}';
    const { spy } = captureWarns();
    try {
      expect(projectAiResponseContent(input, { silent: true })).toBe(input);
    } finally {
      spy.mockRestore();
    }
  });

  it('returns rawContent when reply is an object (typeof guard in fallback)', () => {
    const input = '{"reply": {"nested": "object"}}';
    const { spy } = captureWarns();
    try {
      expect(projectAiResponseContent(input, { silent: true })).toBe(input);
    } finally {
      spy.mockRestore();
    }
  });

  // ---- Case 9: silent option — no crash, produces correct output --------

  it('silent: true suppresses console.warn telemetry on parse failure', () => {
    // A parse failure on a schema-invalid envelope normally emits warn.
    // With silent: true it must NOT emit.
    const input = '{"reply": ""}'; // fails Zod min(1)
    const { spy, calls } = captureWarns();
    try {
      projectAiResponseContent(input, { silent: true });
      expect(calls()).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('silent: false (default) emits console.warn telemetry on parse failure', () => {
    // Without silent, a failed parse SHOULD emit a warn.
    const input = '{"reply": ""}'; // fails Zod min(1)
    const { spy, calls } = captureWarns();
    try {
      projectAiResponseContent(input); // default: silent not set
      expect(calls().length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('silent: true still returns the correct output (non-crashing)', () => {
    const input = JSON.stringify({ reply: 'Works silently.' });
    // Valid envelope → strict parse succeeds → returns reply regardless of silent
    expect(projectAiResponseContent(input, { silent: true })).toBe(
      'Works silently.',
    );
  });

  // ---- Additional edge cases --------------------------------------------

  it('trims leading/trailing whitespace from rawContent before fence-stripping', () => {
    const input = '  {"reply": "trimmed input"}  ';
    // rawContent.trim() → '{"reply": "trimmed input"}' → valid envelope
    expect(projectAiResponseContent(input)).toBe('trimmed input');
  });

  it('handles a full envelope with all optional fields', () => {
    const input = JSON.stringify({
      reply: 'Excellent work!',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: true,
      },
      ui_hints: {
        note_prompt: { show: true, post_session: false },
      },
      private_sources: {
        relied_on: ['current_topic'],
        insufficient: false,
        reason: 'Grounded in topic source.',
      },
      confidence: 'high',
    });
    expect(projectAiResponseContent(input)).toBe('Excellent work!');
  });
});
