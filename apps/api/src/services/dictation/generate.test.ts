// ---------------------------------------------------------------------------
// Mock the LLM router — true external boundary
// ---------------------------------------------------------------------------

jest.mock('../llm', () => ({ // gc1-allow: external LLM boundary — routeAndCall is the sole entry point to all LLM providers
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

  it('weaves free_time / both interests into the literary theme when provided', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The young paleontologist brushed dust off the fossil.',
            withPunctuation:
              'The young paleontologist brushed dust off the fossil period',
            wordCount: 8,
          },
        ],
        title: 'Discovery',
        topic: 'a young fossil hunter',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({
      nativeLanguage: 'en',
      ageYears: 12,
      interests: [
        { label: 'dinosaurs', context: 'both' },
        { label: 'fossils', context: 'both' },
        { label: 'paleontology', context: 'both' },
      ],
    });

    const callArgs = mockRouteAndCall.mock.calls[0];
    const systemContent = callArgs[0][0].content as string;
    expect(systemContent).toContain('PERSONALIZATION:');
    expect(systemContent).toContain('dinosaurs');
    expect(systemContent).toContain('fossils');
    expect(systemContent).toContain('paleontology');
  });

  it('excludes school-only interests from the thematic block', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The horse galloped across the meadow.',
            withPunctuation: 'The horse galloped across the meadow period',
            wordCount: 6,
          },
        ],
        title: 'Meadow',
        topic: 'horses',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({
      nativeLanguage: 'en',
      ageYears: 11,
      interests: [
        { label: 'horses', context: 'free_time' },
        { label: 'algebra drills', context: 'school' }, // must be excluded
      ],
    });

    const systemContent = mockRouteAndCall.mock.calls[0][0][0]
      .content as string;
    expect(systemContent).toContain('horses');
    expect(systemContent).not.toContain('algebra drills');
  });

  it('includes library topics as setting backdrop when provided', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The soldier wrote a letter home from the trench.',
            withPunctuation:
              'The soldier wrote a letter home from the trench period',
            wordCount: 9,
          },
        ],
        title: 'A Letter',
        topic: 'wartime narrative',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({
      nativeLanguage: 'en',
      ageYears: 15,
      libraryTopics: ['WWII Pacific theater', 'Cold War origins'],
    });

    const systemContent = mockRouteAndCall.mock.calls[0][0][0]
      .content as string;
    expect(systemContent).toContain('LIBRARY TOPICS');
    expect(systemContent).toContain('WWII Pacific theater');
  });

  it('omits INTERESTS and LIBRARY TOPICS blocks when not provided (backward compat)', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'A quiet morning in the forest.',
            withPunctuation: 'A quiet morning in the forest period',
            wordCount: 6,
          },
        ],
        title: 'Forest',
        topic: 'nature',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({
      nativeLanguage: 'en',
      ageYears: 12,
    });

    const systemContent = mockRouteAndCall.mock.calls[0][0][0]
      .content as string;
    expect(systemContent).not.toContain('PERSONALIZATION:');
    expect(systemContent).not.toContain('LIBRARY TOPICS');
  });

  // [CR-770] Boundary tests proving the unified age cutpoint at 13/14.
  // Age 13 is the last "child" age; age 14 is the first "person" (adult).
  // All three age-bracketed prompt fragments (literary theme, sentence
  // length, advanced punctuation) must agree on this boundary.
  it('[CR-770] age 13 = full child register: kids lit + 5-10 word sentences + no advanced punctuation', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'A small dog ran into the field.',
            withPunctuation: 'A small dog ran into the field period',
            wordCount: 7,
          },
        ],
        title: 'The Dog',
        topic: 'adventure',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({ nativeLanguage: 'en', ageYears: 13 });

    const systemContent = mockRouteAndCall.mock.calls[0][0][0]
      .content as string;
    expect(systemContent).toContain('child');
    expect(systemContent).not.toContain(' person\n');
    expect(systemContent).toContain("children's novels and chapter books");
    expect(systemContent).toContain('5-10 words');
    expect(systemContent).not.toContain('7-14 words');
    expect(systemContent).not.toContain('Colons and semicolons');
  });

  it('[CR-770] age 14 = full adult register: adult lit + 7-14 word sentences + advanced punctuation', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The fog crept through the empty avenues without a sound.',
            withPunctuation:
              'The fog crept through the empty avenues without a sound period',
            wordCount: 11,
          },
        ],
        title: 'Foggy Morning',
        topic: 'literary fiction',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({ nativeLanguage: 'en', ageYears: 14 });

    const systemContent = mockRouteAndCall.mock.calls[0][0][0]
      .content as string;
    expect(systemContent).toContain('person');
    expect(systemContent).toContain('contemporary literature');
    expect(systemContent).toContain('7-14 words');
    expect(systemContent).not.toContain('5-10 words');
    expect(systemContent).toContain('Colons and semicolons sparingly');
  });

  it('removed dead <11 literary theme branches — ageYears=12 resolves to chapter-book theme', async () => {
    // Product ships to 11+ only. The old ≤7 (fairy tales) and ≤10 (Narnia)
    // branches were dead; confirm ageYears=12 now picks the chapter-book
    // branch and never surfaces fairy-tale or Narnia language.
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'Harry spotted something moving in the shadows.',
            withPunctuation:
              'Harry spotted something moving in the shadows period',
            wordCount: 7,
          },
        ],
        title: 'Shadows',
        topic: 'adventure',
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    await generateDictation({ nativeLanguage: 'en', ageYears: 12 });

    const systemContent = mockRouteAndCall.mock.calls[0][0][0]
      .content as string;
    expect(systemContent).toContain("children's novels and chapter books");
    expect(systemContent).not.toContain('fairy tales');
    expect(systemContent).not.toContain('Narnia');
    expect(systemContent).not.toContain('Roald Dahl');
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
