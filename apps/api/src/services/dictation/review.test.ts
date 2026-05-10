// ---------------------------------------------------------------------------
// Mock the LLM router — true external boundary
// ---------------------------------------------------------------------------

jest.mock('../llm', () => ({
  routeAndCall: jest.fn(),
}));

import { routeAndCall } from '../llm';
import { reviewDictation, buildReviewSystemPrompt } from './review';
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

  it('[CCR-PR120-NEW-4] extracts first balanced JSON even when trailing braces exist', async () => {
    const validJson = JSON.stringify({
      totalSentences: 2,
      correctCount: 2,
      mistakes: [],
    });
    mockRouteAndCall.mockResolvedValueOnce({
      response: `Here is my analysis:\n${validJson}\nNote: the child wrote "day}" with an extra brace}`,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 100,
    });

    const result = await reviewDictation(BASE_INPUT);
    expect(result.totalSentences).toBe(2);
    expect(result.correctCount).toBe(2);
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

  it('passes age and explanation style through to the system prompt when provided', async () => {
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

    await reviewDictation({
      ...BASE_INPUT,
      ageYears: 17,
      preferredExplanations: ['step-by-step', 'examples'],
    });

    const [messages] = mockRouteAndCall.mock.calls[0] as [
      Array<{ role: string; content: unknown }>,
    ];
    const systemContent = messages.find((m) => m.role === 'system')
      ?.content as string;
    expect(systemContent).toContain('EXPLANATION STYLE');
    // 15+ register — precise terminology
    expect(systemContent).toContain(
      'precise grammar and punctuation terminology',
    );
    // step-by-step preference included
    expect(systemContent).toContain('numbered 1');
  });

  it('uses child-friendly register for ageYears ≤ 13', async () => {
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

    await reviewDictation({ ...BASE_INPUT, ageYears: 11 });

    const [messages] = mockRouteAndCall.mock.calls[0] as [
      Array<{ role: string; content: unknown }>,
    ];
    const systemContent = messages.find((m) => m.role === 'system')
      ?.content as string;
    // ≤11 register — simple, encouraging language
    expect(systemContent).toContain('simple, encouraging language');
    expect(systemContent).not.toContain('precise grammar');
  });

  it('includes struggle areas in the system prompt when recentStruggles is provided', async () => {
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

    await reviewDictation({
      ...BASE_INPUT,
      recentStruggles: ['silent letters', 'apostrophes'],
    });

    const [messages] = mockRouteAndCall.mock.calls[0] as [
      Array<{ role: string; content: unknown }>,
    ];
    const systemContent = messages.find((m) => m.role === 'system')
      ?.content as string;
    expect(systemContent).toContain('recently struggled with');
    expect(systemContent).toContain('silent letters');
    expect(systemContent).toContain('apostrophes');
  });

  it('omits struggle hint in system prompt when recentStruggles is empty', async () => {
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

    await reviewDictation({ ...BASE_INPUT, recentStruggles: [] });

    const [messages] = mockRouteAndCall.mock.calls[0] as [
      Array<{ role: string; content: unknown }>,
    ];
    const systemContent = messages.find((m) => m.role === 'system')
      ?.content as string;
    expect(systemContent).not.toContain('recently struggled with');
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
      Array<{ role: string; content: unknown }>,
    ];
    const userMsg = messages.find((m) => m.role === 'user');
    expect(Array.isArray(userMsg?.content)).toBe(true);
    const parts = userMsg?.content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === 'inline_data')).toBe(true);
    expect(parts.some((p) => p.type === 'text')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildReviewSystemPrompt
// ---------------------------------------------------------------------------

describe('buildReviewSystemPrompt', () => {
  it('returns the baseline static prompt unchanged when called with no options (backward compat)', () => {
    const promptA = buildReviewSystemPrompt();
    const promptB = buildReviewSystemPrompt({});
    // Both no-arg and empty-object calls must produce identical output, and
    // that output must match the original static SYSTEM_PROMPT shape —
    // we assert on key landmarks rather than the full string to stay robust
    // to trailing whitespace changes.
    expect(promptA).toBe(promptB);
    expect(promptA).toContain('You are a dictation review assistant.');
    expect(promptA).toContain('RESPOND WITH ONLY valid JSON');
    expect(promptA).toContain("child's language as instructed.");
    // No personalization sections appended when options absent
    expect(promptA).not.toContain('EXPLANATION STYLE');
  });

  it('adds an EXPLANATION STYLE section when ageYears is provided', () => {
    const prompt = buildReviewSystemPrompt({ ageYears: 11 });
    expect(prompt).toContain('EXPLANATION STYLE');
    // ≤11 register uses simple, encouraging language
    expect(prompt).toContain('simple, encouraging language');
  });

  it('uses precise terminology register for 15+ learners', () => {
    const prompt = buildReviewSystemPrompt({ ageYears: 16 });
    expect(prompt).toContain('precise grammar and punctuation terminology');
    // Confirm the child register text is absent from the EXPLANATION STYLE
    // section (the 15+ register uses technical language, not simplified).
    const styleSection = prompt.split('EXPLANATION STYLE:')[1] ?? '';
    expect(styleSection).not.toContain('simple, encouraging');
  });

  it('adds humor guidance when preferredExplanations includes humor', () => {
    const prompt = buildReviewSystemPrompt({
      ageYears: 12,
      preferredExplanations: ['humor', 'stories'],
    });
    expect(prompt).toContain('humour');
    expect(prompt).toContain('memorable story');
  });

  it('silently ignores the diagrams style (no text representation)', () => {
    const prompt = buildReviewSystemPrompt({
      ageYears: 13,
      preferredExplanations: ['diagrams'],
    });
    // diagrams alone produces no style line but ageYears block is still present
    // ageYears=13 → middle-school register
    expect(prompt).toContain('middle-schooler');
    expect(prompt).not.toContain('diagram');
  });

  it('includes struggle areas in the prompt when recentStruggles is provided', () => {
    const prompt = buildReviewSystemPrompt({
      ageYears: 12,
      recentStruggles: ['silent letters', 'comma usage'],
    });
    expect(prompt).toContain('recently struggled with');
    expect(prompt).toContain('silent letters');
    expect(prompt).toContain('comma usage');
    expect(prompt).toContain('targeted feedback');
  });

  it('does not add struggle hint when recentStruggles is empty', () => {
    const prompt = buildReviewSystemPrompt({
      ageYears: 12,
      recentStruggles: [],
    });
    expect(prompt).not.toContain('recently struggled with');
  });

  it('does not add struggle hint when recentStruggles is undefined', () => {
    const prompt = buildReviewSystemPrompt({ ageYears: 12 });
    expect(prompt).not.toContain('recently struggled with');
  });
});
