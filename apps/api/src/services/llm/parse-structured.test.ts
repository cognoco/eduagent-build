// WI-1073: regression tests for parseStructuredLlmOutput
import { z } from 'zod';
import { parseStructuredLlmOutput } from './parse-structured';

const testSchema = z.object({
  name: z.string(),
  value: z.number(),
});

describe('parseStructuredLlmOutput', () => {
  it('returns parsed data when JSON is valid and matches schema', () => {
    const result = parseStructuredLlmOutput(
      testSchema,
      '{"name":"hello","value":42}',
      'test',
    );
    expect(result).toEqual({ name: 'hello', value: 42 });
  });

  it('strips markdown code fences and parses the inner JSON', () => {
    const result = parseStructuredLlmOutput(
      testSchema,
      '```json\n{"name":"world","value":7}\n```',
      'test',
    );
    expect(result).toEqual({ name: 'world', value: 7 });
  });

  it('returns null when response contains no JSON object', () => {
    const result = parseStructuredLlmOutput(
      testSchema,
      'No JSON here at all.',
      'test',
    );
    expect(result).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    const result = parseStructuredLlmOutput(
      testSchema,
      '{not valid json}',
      'test',
    );
    expect(result).toBeNull();
  });

  it('returns null when JSON object fails schema validation', () => {
    const result = parseStructuredLlmOutput(
      testSchema,
      '{"name": 123, "value": "not-a-number"}',
      'test',
    );
    expect(result).toBeNull();
  });

  it('extracts first object when LLM wraps a single object in an array', () => {
    // extractFirstJsonObject finds the first {…} brace-balanced substring,
    // so [{"name":"a","value":1}] yields {"name":"a","value":1}.
    // This is the extractor's documented behavior: it is NOT an array extractor.
    const result = parseStructuredLlmOutput(
      testSchema,
      '[{"name":"a","value":1}]',
      'test',
    );
    expect(result).toEqual({ name: 'a', value: 1 });
  });

  it('extracts first JSON object from prose-wrapped response', () => {
    const result = parseStructuredLlmOutput(
      testSchema,
      'Here is the result: {"name":"extracted","value":99} — hope that helps!',
      'test',
    );
    expect(result).toEqual({ name: 'extracted', value: 99 });
  });

  it('works with schemas that use safeParse-friendly partial shapes', () => {
    const lenientSchema = z.object({
      a: z.number().optional(),
      b: z.string().optional(),
    });
    const result = parseStructuredLlmOutput(
      lenientSchema,
      '{"a": 1}',
      'test-lenient',
    );
    expect(result).toEqual({ a: 1 });
  });

  it('passes missing-field test: homework-summary fallback scenario', () => {
    // Regression for WI-993/WI-1073: a response missing required fields
    // should return null, not throw.
    const schema = z.object({
      problemCount: z.number(),
      summary: z.string(),
    });
    const result = parseStructuredLlmOutput(
      schema,
      '{"problemCount": 3}', // missing 'summary'
      'homework-summary',
    );
    expect(result).toBeNull();
  });
});
