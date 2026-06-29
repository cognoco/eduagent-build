import {
  anthropicResponseSchema,
  geminiResponseSchema,
  openAIResponseSchema,
} from './llm-providers.js';

// [WI-481] Trust-boundary validation for raw LLM provider response bodies.
// These schemas replace `as` casts in the anthropic/gemini provider adapters,
// so malformed/wrong-shape vendor bodies fail closed at the boundary instead of
// surfacing as a TypeError on a later field access.

describe('[WI-481] anthropicResponseSchema', () => {
  it('parses a well-formed Anthropic Messages response', () => {
    const parsed = anthropicResponseSchema.safeParse({
      content: [{ type: 'text', text: '{"answer": 42}' }],
      stop_reason: 'end_turn',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content?.[0]?.text).toBe('{"answer": 42}');
      expect(parsed.data.stop_reason).toBe('end_turn');
    }
  });

  it('parses an error-only body (2xx with structured error)', () => {
    const parsed = anthropicResponseSchema.safeParse({
      error: { type: 'rate_limit_error', message: 'Too many requests' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.error?.type).toBe('rate_limit_error');
    }
  });

  it('coerces a null stop_reason to undefined', () => {
    const parsed = anthropicResponseSchema.safeParse({
      content: [{ type: 'text', text: 'hi' }],
      stop_reason: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.stop_reason).toBeUndefined();
    }
  });

  it('rejects a null body', () => {
    expect(anthropicResponseSchema.safeParse(null).success).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect(anthropicResponseSchema.safeParse('nope').success).toBe(false);
  });

  it('rejects a content block whose type is not a string', () => {
    const parsed = anthropicResponseSchema.safeParse({
      content: [{ type: 123, text: 'hi' }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('[WI-481] geminiResponseSchema', () => {
  it('parses a well-formed Gemini generateContent response', () => {
    const parsed = geminiResponseSchema.safeParse({
      candidates: [
        { content: { parts: [{ text: 'hello' }] }, finishReason: 'STOP' },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'hello',
      );
      expect(parsed.data.candidates?.[0]?.finishReason).toBe('STOP');
    }
  });

  it('parses a prompt-feedback block body', () => {
    const parsed = geminiResponseSchema.safeParse({
      promptFeedback: { blockReason: 'SAFETY' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.promptFeedback?.blockReason).toBe('SAFETY');
    }
  });

  it('parses an error-only body', () => {
    const parsed = geminiResponseSchema.safeParse({
      error: { code: 429, message: 'quota' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.error?.code).toBe(429);
    }
  });

  it('rejects a null body', () => {
    expect(geminiResponseSchema.safeParse(null).success).toBe(false);
  });

  it('rejects a candidate part whose text is not a string', () => {
    const parsed = geminiResponseSchema.safeParse({
      candidates: [{ content: { parts: [{ text: 5 }] } }],
    });
    expect(parsed.success).toBe(false);
  });
});

// Guard against an accidental regression of the already-compliant OpenAI schema.
describe('openAIResponseSchema (existing, sanity)', () => {
  it('parses a well-formed OpenAI chat completion', () => {
    const parsed = openAIResponseSchema.safeParse({
      choices: [{ message: { content: 'hi' } }],
    });
    expect(parsed.success).toBe(true);
  });
});
