// ---------------------------------------------------------------------------
// Vocabulary Extraction — Tests [4A.4]
// ---------------------------------------------------------------------------

jest.mock('./llm' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: jest.fn(),
  };
});

jest.mock('./sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
  };
});

import { extractVocabularyFromTranscript } from './vocabulary-extract';
import { routeAndCall } from './llm';
import { captureException } from './sentry';

const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

function llmResponse(json: Record<string, unknown>): void {
  mockRouteAndCall.mockResolvedValueOnce({
    response: JSON.stringify(json),
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    latencyMs: 50,
    stopReason: 'stop',
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
      'es',
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      term: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: null,
    });
    expect(result[1]).toEqual({
      term: 'buenos días',
      translation: 'good morning',
      type: 'chunk',
      cefrLevel: null,
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
      'zz',
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
      stopReason: 'stop',
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
    );

    expect(result).toEqual([]);
  });

  it('returns empty array when LLM call throws', async () => {
    mockRouteAndCall.mockRejectedValueOnce(new Error('LLM unavailable'));

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
    );

    expect(result).toEqual([]);
  });

  // [AUDIT-SILENT-FAIL] Break test — empty-on-error is indistinguishable
  // from a genuine-empty extraction for the Inngest caller. Without Sentry
  // escalation an LLM outage would silently skip ALL vocabulary updates
  // with no signal.
  it('[AUDIT-SILENT-FAIL] escalates to Sentry when extraction throws', async () => {
    const err = new Error('LLM unavailable');
    mockRouteAndCall.mockRejectedValueOnce(err);

    await extractVocabularyFromTranscript(sampleTranscript, 'es', 'A2');

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        extra: expect.objectContaining({
          site: 'extractVocabularyFromTranscript',
          languageCode: 'es',
          cefrLevel: 'A2',
          transcriptTurns: sampleTranscript.length,
        }),
      }),
    );
  });

  it('handles malformed LLM JSON response — invalid JSON string', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: '{"items": [{"term": "hola", "translation": "hello", BROKEN',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
      stopReason: 'stop',
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
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
      'es',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      term: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: null,
    });
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
      'es',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      term: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: null,
    });
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
      'es',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      term: 'adiós',
      translation: 'goodbye',
      type: 'word',
      cefrLevel: null,
    });
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
      'es',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      term: 'adiós',
      translation: 'goodbye',
      type: 'word',
      cefrLevel: null,
    });
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
      'es',
    );

    expect(result).toHaveLength(8);
  });

  it('trims whitespace from term and translation', async () => {
    llmResponse({
      items: [{ term: '  hola  ', translation: '  hello  ', type: 'word' }],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
    );

    expect(result[0]).toEqual({
      term: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: null,
    });
  });

  it('calls routeAndCall with target language info', async () => {
    llmResponse({ items: [] });

    await extractVocabularyFromTranscript(sampleTranscript, 'fr');

    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    const [messages, rung] = mockRouteAndCall.mock.calls[0]!;
    expect(rung).toBe(1);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
    // The user message contains the language name (lowercase from data)
    expect(messages[1]!.content).toMatch(/french/i);
  });

  it('handles LLM response with missing items array', async () => {
    llmResponse({ vocabulary: 'unexpected format' });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
    );

    expect(result).toEqual([]);
  });

  it('handles LLM response with null items', async () => {
    llmResponse({ items: null as unknown as undefined });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
    );

    expect(result).toEqual([]);
  });

  it('returns cefrLevel from LLM response when cefrLevel argument is provided', async () => {
    llmResponse({
      items: [
        { term: 'hola', translation: 'hello', type: 'word', cefrLevel: 'A2' },
      ],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
      'A2',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      term: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: 'A2',
    });
  });

  it('maps invalid (non-string) cefrLevel from LLM to null', async () => {
    llmResponse({
      items: [
        {
          term: 'hola',
          translation: 'hello',
          type: 'word',
          cefrLevel: 42,
        },
      ],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
      'A2',
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.cefrLevel).toBeNull();
  });

  it('works without cefrLevel argument (backward compatible)', async () => {
    llmResponse({
      items: [{ term: 'hola', translation: 'hello', type: 'word' }],
    });

    const result = await extractVocabularyFromTranscript(
      sampleTranscript,
      'es',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      term: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: null,
    });
  });

  it('includes CEFR target level in user message when cefrLevel is provided', async () => {
    llmResponse({ items: [] });

    await extractVocabularyFromTranscript(sampleTranscript, 'es', 'B1');

    const [messages] = mockRouteAndCall.mock.calls[0]!;
    expect(messages[1]!.content).toMatch(/CEFR target level: B1/);
  });

  it('does not include CEFR target level in user message when cefrLevel is not provided', async () => {
    llmResponse({ items: [] });

    await extractVocabularyFromTranscript(sampleTranscript, 'es');

    const [messages] = mockRouteAndCall.mock.calls[0]!;
    expect(messages[1]!.content).not.toMatch(/CEFR target level/);
  });
});
