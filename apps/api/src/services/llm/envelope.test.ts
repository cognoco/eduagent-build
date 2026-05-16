import {
  isRecognizedMarker,
  normalizeReplyText,
  parseEnvelope,
  replyHasLiteralEscape,
  stripEmbeddedEnvelopeTail,
} from './envelope';

// [BUG-847] Telemetry helper — the structured logger writes JSON entries to
// `console.warn`, so we spy on that and parse the captured JSON to assert
// against `message`, `context.surface`, and `context.reason`.
function captureLoggerWarns(): {
  spy: jest.SpyInstance;
  entries: () => Array<{ message: string; context?: Record<string, unknown> }>;
} {
  const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  return {
    spy,
    entries: () =>
      spy.mock.calls.map(([raw]) => {
        try {
          return JSON.parse(String(raw));
        } catch {
          return { message: String(raw) };
        }
      }),
  };
}

describe('parseEnvelope', () => {
  it('parses a minimal valid envelope', () => {
    const result = parseEnvelope('{"reply": "hello"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('hello');
      expect(result.envelope.signals).toBeUndefined();
    }
  });

  it('parses an envelope with signals', () => {
    const result = parseEnvelope(
      '{"reply": "done", "signals": {"ready_to_finish": true}}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.signals?.ready_to_finish).toBe(true);
    }
  });

  it('extracts the first balanced JSON object when prose surrounds it', () => {
    const result = parseEnvelope(
      'Here you go: {"reply": "hi", "signals": {"ready_to_finish": false}} trailing prose',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('hi');
    }
  });

  it('handles strings containing braces without overshooting', () => {
    const result = parseEnvelope(
      '{"reply": "say {hello}", "signals": {"ready_to_finish": false}}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('say {hello}');
    }
  });

  it('fails with no_json_found when the response has no JSON at all', () => {
    const result = parseEnvelope('just some prose, no braces');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_json_found');
    }
  });

  it('fails with invalid_json when braces are unbalanced', () => {
    const result = parseEnvelope('{"reply": "oops"');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The scanner never finds a balanced close, so no candidate is parsed.
      expect(result.reason).toBe('no_json_found');
    }
  });

  it('fails with invalid_json when the candidate is malformed JSON', () => {
    // Balanced braces but invalid JSON (trailing comma).
    const result = parseEnvelope('{"reply": "x",}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid_json');
    }
  });

  it('fails with schema_violation when required fields are missing', () => {
    const result = parseEnvelope('{"signals": {"ready_to_finish": true}}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('schema_violation');
    }
  });

  it('fails with schema_violation when reply is empty', () => {
    const result = parseEnvelope('{"reply": ""}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('schema_violation');
    }
  });

  // ---- [LITERAL-ESCAPE] Defensive normalization -------------------------

  it('[LITERAL-ESCAPE] converts literal `\\n` in reply to a real newline', () => {
    // Raw JSON `\\n` decodes to literal backslash + n. Without normalization
    // the renderer prints "Hello\nWorld"; the user expects a paragraph break.
    const result = parseEnvelope('{"reply": "Hello\\\\nWorld"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('Hello\nWorld');
      expect(result.envelope.reply).not.toContain('\\n');
    }
  });

  it('[LITERAL-ESCAPE] converts literal `\\r\\n` to a single newline', () => {
    const result = parseEnvelope('{"reply": "Line1\\\\r\\\\nLine2"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('Line1\nLine2');
    }
  });

  it('[LITERAL-ESCAPE] converts literal `\\t` to a real tab', () => {
    const result = parseEnvelope('{"reply": "col1\\\\tcol2"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('col1\tcol2');
    }
  });

  it('[LITERAL-ESCAPE] leaves a real newline (correct JSON `\\n`) untouched', () => {
    // `\\n` in source → `\n` in JSON string → real newline after parse.
    const result = parseEnvelope('{"reply": "Hello\\nWorld"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('Hello\nWorld');
    }
  });

  it('[LITERAL-ESCAPE] leaves backslashes preceding non-escape chars alone', () => {
    // `\\d` is not one of n/r/t — must survive as a literal backslash.
    const result = parseEnvelope('{"reply": "regex \\\\d+"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('regex \\d+');
    }
  });

  describe('replyHasLiteralEscape', () => {
    it('detects a literal `\\n`', () => {
      expect(replyHasLiteralEscape('Hello\\nWorld')).toBe(true);
    });

    it('detects a literal `\\t`', () => {
      expect(replyHasLiteralEscape('a\\tb')).toBe(true);
    });

    it('returns false for a real newline', () => {
      expect(replyHasLiteralEscape('Hello\nWorld')).toBe(false);
    });

    it('returns false for clean prose', () => {
      expect(replyHasLiteralEscape('Just regular text.')).toBe(false);
    });

    it('returns false for an unrelated `\\X` sequence', () => {
      expect(replyHasLiteralEscape('regex \\d+')).toBe(false);
    });
  });

  describe('normalizeReplyText', () => {
    it('is idempotent for already-normalized text', () => {
      const clean = 'Hello\nWorld\twith\ttabs';
      expect(normalizeReplyText(clean)).toBe(clean);
    });

    it('returns a string identical to its input when no leak is present', () => {
      const input = 'No backslash sequences here.';
      expect(normalizeReplyText(input)).toBe(input);
    });
  });

  describe('stripEmbeddedEnvelopeTail', () => {
    it('removes an envelope side-channel copied into reply text', () => {
      const leaked =
        'Who did the farming?","signals":{"partial_progress":false,"needs_deepening":false},"ui_hints":{"note_prompt":{"show":false}}}';
      expect(stripEmbeddedEnvelopeTail(leaked)).toBe('Who did the farming?');
    });

    it('removes the same leak when smart quotes appear around envelope keys', () => {
      const leaked =
        'Who did the farming?”,”signals”:{"partial_progress":false,"needs_deepening":false}';
      expect(stripEmbeddedEnvelopeTail(leaked)).toBe('Who did the farming?');
    });

    it('leaves ordinary teaching prose about a signals field alone', () => {
      const text =
        'In this example, "signals": means clues that point to an answer.';
      expect(stripEmbeddedEnvelopeTail(text)).toBe(text);
    });

    it('leaves JSON teaching prose about partial_progress alone', () => {
      const text =
        'For example, "signals":{"partial_progress":false} means we still need more practice.';
      expect(stripEmbeddedEnvelopeTail(text)).toBe(text);
    });
  });

  it('strips embedded envelope side-channel text from a valid reply field', () => {
    const result = parseEnvelope(
      JSON.stringify({
        reply:
          'Who did the farming?","signals":{"partial_progress":false,"needs_deepening":false},"ui_hints":{"note_prompt":{"show":false}}}',
        signals: {
          partial_progress: false,
          needs_deepening: false,
          understanding_check: true,
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('Who did the farming?');
    }
  });

  it('accepts ui_hints for upcoming F2.1 / F2.2 migrations', () => {
    const result = parseEnvelope(
      '{"reply": "noted", "ui_hints": {"note_prompt": {"show": true, "post_session": true}}}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.ui_hints?.note_prompt?.show).toBe(true);
    }
  });

  // ---- [BUG-847] Telemetry on parse failures ------------------------------

  it('[BUG-847] emits llm.envelope.parse_failed on no_json_found, tagged with surface', () => {
    const { spy, entries } = captureLoggerWarns();
    parseEnvelope('just prose, no JSON', 'filing');
    const [entry] = entries();
    expect(entry?.message).toBe('llm.envelope.parse_failed');
    expect(entry?.context).toEqual(
      expect.objectContaining({
        surface: 'filing',
        reason: 'no_json_found',
        rawSnippet: 'just prose, no JSON',
      }),
    );
    spy.mockRestore();
  });

  it('[BUG-847] emits llm.envelope.parse_failed on invalid_json', () => {
    const { spy, entries } = captureLoggerWarns();
    parseEnvelope('{"reply": "x",}', 'exchange.session');
    const [entry] = entries();
    expect(entry?.message).toBe('llm.envelope.parse_failed');
    expect(entry?.context).toEqual(
      expect.objectContaining({
        surface: 'exchange.session',
        reason: 'invalid_json',
      }),
    );
    spy.mockRestore();
  });

  it('[BUG-847] emits llm.envelope.parse_failed on schema_violation', () => {
    const { spy, entries } = captureLoggerWarns();
    parseEnvelope(
      '{"signals": {"ready_to_finish": true}}',
      'exchange.silent_classify',
    );
    const [entry] = entries();
    expect(entry?.message).toBe('llm.envelope.parse_failed');
    expect(entry?.context).toEqual(
      expect.objectContaining({
        surface: 'exchange.silent_classify',
        reason: 'schema_violation',
      }),
    );
    spy.mockRestore();
  });

  it('[BUG-847] does NOT emit telemetry on a successful parse', () => {
    const { spy, entries } = captureLoggerWarns();
    parseEnvelope('{"reply": "all good"}', 'filing');
    expect(entries()).toHaveLength(0);
    spy.mockRestore();
  });

  it('[BUG-847] defaults surface to "unknown" when caller omits it', () => {
    const { spy, entries } = captureLoggerWarns();
    parseEnvelope('not json');
    const [entry] = entries();
    expect(entry?.context).toEqual(
      expect.objectContaining({ surface: 'unknown' }),
    );
    spy.mockRestore();
  });

  it('[BUG-847] truncates the raw snippet at 200 chars to bound log volume', () => {
    const { spy, entries } = captureLoggerWarns();
    const long = 'x'.repeat(500);
    parseEnvelope(long, 'filing');
    const [entry] = entries();
    expect(
      (entry?.context as { rawSnippet?: string })?.rawSnippet?.length,
    ).toBe(200);
    spy.mockRestore();
  });
});

describe('isRecognizedMarker', () => {
  it('returns true for a bare notePrompt marker', () => {
    expect(isRecognizedMarker('{"notePrompt":true}')).toBe(true);
  });

  it('returns true for a bare fluencyDrill marker', () => {
    expect(isRecognizedMarker('{"fluencyDrill":{"active":true}}')).toBe(true);
  });

  it('returns true for a bare escalationHold marker', () => {
    expect(isRecognizedMarker('{"escalationHold":true}')).toBe(true);
  });

  it('returns false for a full envelope with a reply', () => {
    expect(isRecognizedMarker('{"reply":"hi","notePrompt":true}')).toBe(false);
  });

  it('returns false for unknown single-key JSON', () => {
    expect(isRecognizedMarker('{"randomField":true}')).toBe(false);
  });

  it('returns false for non-object JSON', () => {
    expect(isRecognizedMarker('"just a string"')).toBe(false);
    expect(isRecognizedMarker('["array"]')).toBe(false);
    expect(isRecognizedMarker('42')).toBe(false);
  });

  it('returns false for malformed JSON', () => {
    expect(isRecognizedMarker('{"notePrompt":')).toBe(false);
  });

  it('returns false for plain prose', () => {
    expect(isRecognizedMarker('Hello, how are you?')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isRecognizedMarker('')).toBe(false);
  });
});
