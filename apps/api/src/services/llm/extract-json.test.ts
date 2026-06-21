import { extractFirstJsonObject, extractFirstJsonArray } from './extract-json';

// ---------------------------------------------------------------------------
// extractFirstJsonObject
// ---------------------------------------------------------------------------

describe('extractFirstJsonObject', () => {
  it('returns bare JSON object unchanged', () => {
    const input = '{"a": 1, "b": "hello"}';
    expect(extractFirstJsonObject(input)).toBe(input);
  });

  it('strips markdown fenced json with language tag', () => {
    const inner = '{"key": "value"}';
    const input = `\`\`\`json\n${inner}\n\`\`\``;
    expect(extractFirstJsonObject(input)).toBe(inner);
  });

  it('strips markdown fenced json without language tag', () => {
    const inner = '{"key": "value"}';
    const input = `\`\`\`\n${inner}\n\`\`\``;
    expect(extractFirstJsonObject(input)).toBe(inner);
  });

  it('extracts JSON from prose before and after', () => {
    const json = '{"a": 1}';
    const input = `Here is the result: ${json} and some trailing text.`;
    expect(extractFirstJsonObject(input)).toBe(json);
  });

  it('extracts fenced JSON after prose that contains brace placeholders', () => {
    const json = '{"a": 1}';
    const input = `Template {topic}:\n\`\`\`json\n${json}\n\`\`\``;
    expect(extractFirstJsonObject(input)).toBe(json);
  });

  it('handles nested braces correctly', () => {
    const input = '{"a": {"b": 1}}';
    expect(extractFirstJsonObject(input)).toBe(input);
  });

  it('does not get confused by braces inside string literals', () => {
    const input = '{"reply": "use { or }"}';
    expect(extractFirstJsonObject(input)).toBe(input);
  });

  it('extracts the outer envelope when reply text contains an inner fenced json block', () => {
    const envelope = {
      reply: 'Here is a snippet:\n```json\n{"inner": true}\n```\nDone.',
      signals: { understanding_check: true },
    };
    const input = JSON.stringify(envelope);

    expect(extractFirstJsonObject(input)).toBe(input);
  });

  it('handles escaped quotes inside strings', () => {
    const input = '{"reply": "she said \\"hi\\""}';
    expect(extractFirstJsonObject(input)).toBe(input);
  });

  it('returns null when no JSON object is present', () => {
    expect(extractFirstJsonObject('Hello world')).toBeNull();
  });

  it('returns null for unbalanced braces (no closing brace)', () => {
    expect(extractFirstJsonObject('{"a": 1')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(extractFirstJsonObject('')).toBeNull();
  });

  it('extracts only the first balanced object when multiple are present', () => {
    const first = '{"x": 1}';
    const second = '{"y": 2}';
    const input = `${first} and then ${second}`;
    expect(extractFirstJsonObject(input)).toBe(first);
  });

  it('handles deeply nested objects', () => {
    const input = '{"a": {"b": {"c": 3}}}';
    expect(extractFirstJsonObject(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// extractFirstJsonArray
// ---------------------------------------------------------------------------

describe('extractFirstJsonArray', () => {
  it('returns bare JSON array unchanged', () => {
    const input = '[1, 2, 3]';
    expect(extractFirstJsonArray(input)).toBe(input);
  });

  it('strips markdown fenced json with language tag', () => {
    const inner = '[{"a": 1}]';
    const input = `\`\`\`json\n${inner}\n\`\`\``;
    expect(extractFirstJsonArray(input)).toBe(inner);
  });

  it('ignores a non-array fenced block before the first valid array', () => {
    const json = '[{"a": 1}]';
    const input = `Here is a note:\n\`\`\`json\n{"not": "an array"}\n\`\`\`\nActual result:\n\`\`\`json\n${json}\n\`\`\``;
    expect(extractFirstJsonArray(input)).toBe(json);
  });

  it('strips markdown fenced json without language tag', () => {
    const inner = '[1, 2, 3]';
    const input = `\`\`\`\n${inner}\n\`\`\``;
    expect(extractFirstJsonArray(input)).toBe(inner);
  });

  it('extracts JSON array from prose before and after', () => {
    const json = '[1, 2, 3]';
    const input = `Here are the results: ${json} and some trailing text.`;
    expect(extractFirstJsonArray(input)).toBe(json);
  });

  it('ignores invalid bracket placeholders before the first valid array', () => {
    const json = '[{"term": "photosynthesis"}]';
    const input = `Template [topic]: ${json}`;
    expect(extractFirstJsonArray(input)).toBe(json);
  });

  it('handles nested brackets correctly', () => {
    const input = '[[1, 2], [3, 4]]';
    expect(extractFirstJsonArray(input)).toBe(input);
  });

  it('does not get confused by brackets inside string literals', () => {
    const input = '["use [ or ]"]';
    expect(extractFirstJsonArray(input)).toBe(input);
  });

  it('handles escaped quotes inside strings', () => {
    const input = '["she said \\"hi\\""]';
    expect(extractFirstJsonArray(input)).toBe(input);
  });

  it('returns null when no JSON array is present', () => {
    expect(extractFirstJsonArray('Hello world')).toBeNull();
  });

  it('returns null for unbalanced brackets (no closing bracket)', () => {
    expect(extractFirstJsonArray('[1, 2, 3')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(extractFirstJsonArray('')).toBeNull();
  });

  it('handles array of objects', () => {
    const input = '[{"a": 1}, {"b": 2}]';
    expect(extractFirstJsonArray(input)).toBe(input);
  });

  it('stops at end of array when prose follows', () => {
    const json = '[1, 2, 3]';
    const input = `${json} then some text`;
    expect(extractFirstJsonArray(input)).toBe(json);
  });

  it('handles nested arrays', () => {
    const input = '[[1, 2], [3, 4]]';
    expect(extractFirstJsonArray(input)).toBe(input);
  });

  it('extracts only the first balanced array when multiple are present', () => {
    const first = '[1, 2]';
    const second = '[3, 4]';
    const input = `${first} and then ${second}`;
    expect(extractFirstJsonArray(input)).toBe(first);
  });
});
