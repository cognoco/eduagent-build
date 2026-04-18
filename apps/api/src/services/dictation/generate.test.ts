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
        nativeLanguage: 'en',
        ageYears: 8,
      })
    ).rejects.toThrow();
  });

  it('uses age-appropriate literary themes in the prompt', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The brave knight rode on.',
            withPunctuation: 'The brave knight rode on period',
            wordCount: 5,
          },
        ],
        title: 'The Brave Knight',
        topic: 'adventure tales',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    const result = await generateDictation({
      nativeLanguage: 'en',
      ageYears: 10,
    });

    expect(result.sentences).toHaveLength(1);
    expect(result.language).toBe('en');

    const callArgs = mockRouteAndCall.mock.calls[0];
    const systemContent = callArgs[0][0].content as string;
    expect(systemContent).toContain('children');
    expect(systemContent).toContain('stories');
    expect(systemContent).toContain('Do NOT use geographical');
  });

  it('uses adult literature themes for learners 14+', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The old man stared at the sea.',
            withPunctuation: 'The old man stared at the sea period',
            wordCount: 7,
          },
        ],
        title: 'By the Shore',
        topic: 'literary fiction',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({
      nativeLanguage: 'en',
      ageYears: 16,
    });

    const callArgs = mockRouteAndCall.mock.calls[0];
    const systemContent = callArgs[0][0].content as string;
    expect(systemContent).toContain('contemporary literature');
    expect(systemContent).toContain('person');
    expect(systemContent).not.toContain('fairy tales');
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
      nativeLanguage: 'fr',
      ageYears: 11,
    });

    const callArgs = mockRouteAndCall.mock.calls[0];
    const systemContent = callArgs[0][0].content as string;
    expect(systemContent).toContain('virgule');
    expect(systemContent).toContain('point');
  });
});
