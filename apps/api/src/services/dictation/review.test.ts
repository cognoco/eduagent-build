// ---------------------------------------------------------------------------
// Mock the LLM router — true external boundary
// ---------------------------------------------------------------------------

jest.mock('../llm', () => ({
  routeAndCall: jest.fn(),
}));

import { routeAndCall } from '../llm';
import { reviewDictation } from './review';
import type { DictationSentence } from '@eduagent/schemas';

const mockRouteAndCall = routeAndCall as jest.Mock;

const SENTENCES: DictationSentence[] = [
  {
    text: 'The cat sat on the mat.',
    withPunctuation: 'The cat sat on the mat period',
    wordCount: 6,
  },
  {
    text: 'It was a sunny day.',
    withPunctuation: 'It was a sunny day period',
    wordCount: 5,
  },
];

const BASE_INPUT = {
  sentences: SENTENCES,
  imageBase64: 'aGVsbG8=',
  imageMimeType: 'image/jpeg',
  language: 'en',
};

// ---------------------------------------------------------------------------
// reviewDictation
// ---------------------------------------------------------------------------

describe('reviewDictation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns structured review with mistakes found', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        totalSentences: 2,
        correctCount: 1,
        mistakes: [
          {
            sentenceIndex: 1,
            original: 'It was a sunny day.',
            written: 'It was a suny day.',
            error: 'spelling',
            correction: 'It was a sunny day.',
            explanation: '"sunny" has double n.',
          },
        ],
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 120,
    });

    const result = await reviewDictation(BASE_INPUT);

    expect(result.totalSentences).toBe(2);
    expect(result.correctCount).toBe(1);
    expect(result.mistakes).toHaveLength(1);
    expect(result.mistakes[0]!.sentenceIndex).toBe(1);
    expect(result.mistakes[0]!.error).toBe('spelling');
  });

  it('returns perfect review with 0 mistakes', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        totalSentences: 2,
        correctCount: 2,
        mistakes: [],
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 100,
    });

    const result = await reviewDictation(BASE_INPUT);

    expect(result.totalSentences).toBe(2);
    expect(result.correctCount).toBe(2);
    expect(result.mistakes).toHaveLength(0);
  });

  it('throws on empty LLM response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: '',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    await expect(reviewDictation(BASE_INPUT)).rejects.toThrow();
  });

  it('throws on malformed JSON from LLM', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'not json at all',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    await expect(reviewDictation(BASE_INPUT)).rejects.toThrow();
  });

  it('calls routeAndCall with rung 2 for vision capability', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        totalSentences: 2,
        correctCount: 2,
        mistakes: [],
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 100,
    });

    await reviewDictation(BASE_INPUT);

    expect(mockRouteAndCall).toHaveBeenCalledWith(expect.any(Array), 2);
  });

  it('includes image inline_data part in the user message', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        totalSentences: 2,
        correctCount: 2,
        mistakes: [],
      }),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 100,
    });

    await reviewDictation(BASE_INPUT);

    const [messages] = mockRouteAndCall.mock.calls[0] as [
      Array<{ role: string; content: unknown }>
    ];
    const userMsg = messages.find((m) => m.role === 'user');
    expect(Array.isArray(userMsg?.content)).toBe(true);
    const parts = userMsg?.content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === 'inline_data')).toBe(true);
    expect(parts.some((p) => p.type === 'text')).toBe(true);
  });
});
