// ---------------------------------------------------------------------------
// Vocabulary Extraction — Tests [4A.4]
// ---------------------------------------------------------------------------

jest.mock('./llm', () => ({
  routeAndCall: jest.fn(),
}));

import { extractVocabularyFromTranscript } from './vocabulary-extract';
import { routeAndCall } from './llm';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

function llmResponse(json: Record<string, unknown>): void {
  mockRouteAndCall.mockResolvedValueOnce({
    response: JSON.stringify(json),
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    latencyMs: 50,
  });
}

const sampleTranscript = [
  { role: 'user' as const, content: 'How do I say hello in Spanish?' },
  {
    role: 'assistant' as const,
    content: 'You can say "hola" for hello, or "buenos días" for good morning.',
  },
];

beforeEach(() => jest.clearAllMocks());

describe('extractVocabularyFromTranscript', () => {
  it('extracts valid vocabulary items from LLM response', async () => {
    llmResponse({
      items: [
        { term: 'hola', translation: 'hello', type: 'word' },
        { term: 'buenos días', translation: 'good morning', type: 'chunk' },
      ],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      term: 'hola',
      translation: 'hello',
      type: 'word',
    });
    expect(result[1]).toEqual({
      term: 'buenos días',
      translation: 'good morning',
      type: 'chunk',
    });
  });

  it('returns empty array for empty transcript', async () => {
    const result = await extractVocabularyFromTranscript([], 'es');

    expect(result).toEqual([]);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('returns empty array for unsupported language code', async () => {
    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'zz'
    );

    expect(result).toEqual([]);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('returns empty array when LLM returns no JSON', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'I cannot extract vocabulary from this.',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toEqual([]);
  });

  it('returns empty array when LLM call throws', async () => {
    mockRouteAndCall.mockRejectedValueOnce(new Error('LLM unavailable'));

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toEqual([]);
  });

  it('handles malformed LLM JSON response — invalid JSON string', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: '{"items": [{"term": "hola", "translation": "hello", BROKEN',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toEqual([]);
  });

  it('filters out items with invalid type field', async () => {
    llmResponse({
      items: [
        { term: 'hola', translation: 'hello', type: 'word' },
        { term: 'adiós', translation: 'goodbye', type: 'adjective' },
      ],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe('hola');
  });

  it('filters out items with empty term', async () => {
    llmResponse({
      items: [
        { term: '', translation: 'hello', type: 'word' },
        { term: '  ', translation: 'goodbye', type: 'word' },
        { term: 'hola', translation: 'hello', type: 'word' },
      ],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe('hola');
  });

  it('filters out items with empty translation', async () => {
    llmResponse({
      items: [
        { term: 'hola', translation: '', type: 'word' },
        { term: 'adiós', translation: 'goodbye', type: 'word' },
      ],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe('adiós');
  });

  it('filters out items with missing fields', async () => {
    llmResponse({
      items: [
        { term: 'hola', type: 'word' },
        { translation: 'hello', type: 'word' },
        { term: 'adiós', translation: 'goodbye', type: 'word' },
      ],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe('adiós');
  });

  it('limits output to 8 items maximum', async () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => ({
      term: `word${i}`,
      translation: `meaning${i}`,
      type: 'word' as const,
    }));
    llmResponse({ items: manyItems });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toHaveLength(8);
  });

  it('trims whitespace from term and translation', async () => {
    llmResponse({
      items: [{ term: '  hola  ', translation: '  hello  ', type: 'word' }],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result[0].term).toBe('hola');
    expect(result[0].translation).toBe('hello');
  });

  it('calls routeAndCall with target language info', async () => {
    llmResponse({ items: [] });

    await extractVocabularyFromTranscript(sampleTranscript, 'fr');

    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    const [messages, rung] = mockRouteAndCall.mock.calls[0];
    expect(rung).toBe(1);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    // The user message contains the language name (lowercase from data)
    expect(messages[1].content).toMatch(/french/i);
  });

  it('handles LLM response with missing items array', async () => {
    llmResponse({ vocabulary: 'unexpected format' });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toEqual([]);
  });

  it('handles LLM response with null items', async () => {
    llmResponse({ items: null as unknown as undefined });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es'
    );

    expect(result).toEqual([]);
  });
});
