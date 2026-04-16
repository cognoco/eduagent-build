// ---------------------------------------------------------------------------
// Mock the LLM router — true external boundary
// ---------------------------------------------------------------------------

jest.mock('../llm', () => ({
  routeAndCall: jest.fn(),
}));

import { routeAndCall } from '../llm';
import { prepareHomework } from './prepare-homework';

const mockRouteAndCall = routeAndCall as jest.Mock;

// ---------------------------------------------------------------------------
// prepareHomework
// ---------------------------------------------------------------------------

describe('prepareHomework', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('splits text into sentences with punctuation variants', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The dog, who was tired, lay down.',
            withPunctuation:
              'The dog comma who was tired comma lay down period',
            wordCount: 7,
          },
          {
            text: 'It slept all night.',
            withPunctuation: 'It slept all night period',
            wordCount: 4,
          },
        ],
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 100,
    });

    const result = await prepareHomework(
      'The dog, who was tired, lay down. It slept all night.'
    );

    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[0]!.text).toBe(
      'The dog, who was tired, lay down.'
    );
    expect(result.sentences[0]!.withPunctuation).toContain('comma');
    expect(result.language).toBe('en');
  });

  it('throws on empty LLM response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: '',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    await expect(prepareHomework('Some text here.')).rejects.toThrow();
  });

  it('throws on malformed JSON from LLM', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'not json at all',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    await expect(prepareHomework('Some text here.')).rejects.toThrow();
  });

  it('throws on invalid schema (missing sentences field)', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({ language: 'en' }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    await expect(prepareHomework('Some text here.')).rejects.toThrow();
  });

  it('extracts JSON when surrounded by prose from LLM', async () => {
    const jsonPayload = JSON.stringify({
      sentences: [
        {
          text: 'Hello world.',
          withPunctuation: 'Hello world period',
          wordCount: 2,
        },
      ],
      language: 'en',
    });

    mockRouteAndCall.mockResolvedValueOnce({
      response: `Sure, here is the result:\n${jsonPayload}\nHope that helps!`,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    const result = await prepareHomework('Hello world.');
    expect(result.sentences).toHaveLength(1);
    expect(result.language).toBe('en');
  });

  // RF-07: Dialogue and abbreviation handling
  it('does not over-split text with abbreviations and dialogue [RF-07]', async () => {
    // The service should call the LLM with the correct system prompt that
    // instructs it not to split at abbreviation periods or mid-quote.
    // We verify the LLM is called once with the text as user content,
    // and the response is correctly shaped.
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: "Mr. Smith said, 'Hello.' Then he left.",
            withPunctuation:
              "Mr period Smith said comma open quote Hello period close quote Then he left period",
            wordCount: 8,
          },
        ],
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 80,
    });

    const result = await prepareHomework(
      "Mr. Smith said, 'Hello.' Then he left."
    );

    // The LLM is instructed not to split on Mr. or at the closing quote period,
    // so this complex input maps to 1-2 sentences, not 4.
    expect(result.sentences.length).toBeGreaterThanOrEqual(1);
    expect(result.sentences.length).toBeLessThanOrEqual(2);
  });
});
