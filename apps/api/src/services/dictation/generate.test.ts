// ---------------------------------------------------------------------------
// Mock the LLM router — true external boundary
// ---------------------------------------------------------------------------

jest.mock('../llm', () => ({
  routeAndCall: jest.fn(),
}));

import { routeAndCall } from '../llm';
import { generateDictation } from './generate';

const mockRouteAndCall = routeAndCall as jest.Mock;

// ---------------------------------------------------------------------------
// generateDictation
// ---------------------------------------------------------------------------

describe('generateDictation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates dictation content from profile context', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'Sopka chrlí lávu.',
            withPunctuation: 'Sopka chrlí lávu tečka',
            wordCount: 3,
          },
          {
            text: 'Popel padá na zem.',
            withPunctuation: 'Popel padá na zem tečka',
            wordCount: 4,
          },
        ],
        title: 'Sopky',
        topic: 'Přírodní jevy',
        language: 'cs',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 120,
    });

    const result = await generateDictation({
      recentTopics: ['volcanoes', 'earth science'],
      nativeLanguage: 'cs',
      ageYears: 10,
    });

    expect(result.sentences.length).toBeGreaterThanOrEqual(1);
    expect(result.title).toBe('Sopky');
    expect(result.topic).toBe('Přírodní jevy');
    expect(result.language).toBe('cs');
  });

  it('throws on empty LLM response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: '',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    await expect(
      generateDictation({
        recentTopics: ['math'],
        nativeLanguage: 'en',
        ageYears: 8,
      })
    ).rejects.toThrow();
  });

  it('throws on malformed JSON from LLM', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'not json at all',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    await expect(
      generateDictation({
        recentTopics: ['science'],
        nativeLanguage: 'en',
        ageYears: 9,
      })
    ).rejects.toThrow();
  });

  it('throws on invalid schema (missing title field)', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'Hello.',
            withPunctuation: 'Hello period',
            wordCount: 1,
          },
        ],
        topic: 'greetings',
        language: 'en',
        // missing: title
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    await expect(
      generateDictation({
        recentTopics: ['greetings'],
        nativeLanguage: 'en',
        ageYears: 8,
      })
    ).rejects.toThrow();
  });

  it('uses general knowledge when recentTopics is empty', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The sun is bright.',
            withPunctuation: 'The sun is bright period',
            wordCount: 4,
          },
        ],
        title: 'General Knowledge',
        topic: 'general knowledge',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    const result = await generateDictation({
      recentTopics: [],
      nativeLanguage: 'en',
      ageYears: 10,
    });

    expect(result.sentences).toHaveLength(1);
    expect(result.language).toBe('en');

    // Verify the LLM was called — the prompt should contain "general knowledge"
    const callArgs = mockRouteAndCall.mock.calls[0];
    const systemContent = callArgs[0][0].content as string;
    expect(systemContent).toContain('general knowledge');
  });

  it('includes Norwegian punctuation names in the prompt for nb language [RF-06]', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'Solen skinner.',
            withPunctuation: 'Solen skinner punktum',
            wordCount: 2,
          },
        ],
        title: 'Naturen',
        topic: 'natur',
        language: 'nb',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({
      recentTopics: ['nature'],
      nativeLanguage: 'nb',
      ageYears: 10,
    });

    const callArgs = mockRouteAndCall.mock.calls[0];
    const systemContent = callArgs[0][0].content as string;
    expect(systemContent).toContain('komma');
    expect(systemContent).toContain('punktum');
    expect(systemContent).toContain('spørsmålstegn');
    expect(systemContent).toContain('utropstegn');
  });

  it('includes French punctuation names in the prompt for fr language [RF-06]', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'Le chat dort.',
            withPunctuation: 'Le chat dort point',
            wordCount: 3,
          },
        ],
        title: 'Les animaux',
        topic: 'animaux',
        language: 'fr',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({
      recentTopics: ['animals'],
      nativeLanguage: 'fr',
      ageYears: 11,
    });

    const callArgs = mockRouteAndCall.mock.calls[0];
    const systemContent = callArgs[0][0].content as string;
    expect(systemContent).toContain('virgule');
    expect(systemContent).toContain('point');
  });
});
