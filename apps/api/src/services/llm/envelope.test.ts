import { isRecognizedMarker, parseEnvelope } from './envelope';

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
      '{"reply": "done", "signals": {"ready_to_finish": true}}'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.signals?.ready_to_finish).toBe(true);
    }
  });

  it('extracts the first balanced JSON object when prose surrounds it', () => {
    const result = parseEnvelope(
      'Here you go: {"reply": "hi", "signals": {"ready_to_finish": false}} trailing prose'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('hi');
    }
  });

  it('handles strings containing braces without overshooting', () => {
    const result = parseEnvelope(
      '{"reply": "say {hello}", "signals": {"ready_to_finish": false}}'
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

  it('accepts ui_hints for upcoming F2.1 / F2.2 migrations', () => {
    const result = parseEnvelope(
      '{"reply": "noted", "ui_hints": {"note_prompt": {"show": true, "post_session": true}}}'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.ui_hints?.note_prompt?.show).toBe(true);
    }
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
