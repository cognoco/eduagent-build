// ---------------------------------------------------------------------------
// topic-probe-extraction.ts — Unit Tests
// ---------------------------------------------------------------------------
// Stub the LLM router — true external boundary (Anthropic / Gemini / OpenAI),
// requireActual pattern per GC1/GC6. Sentry is a true external SaaS boundary;
// mocked here so we can assert captureException escalations fire.
// ---------------------------------------------------------------------------

jest.mock('../llm', () => {
  const actual = jest.requireActual('../llm') as typeof import('../llm');
  return { ...actual, routeAndCall: jest.fn() };
});

jest.mock('../sentry', () => {
  const actual = jest.requireActual('../sentry') as typeof import('../sentry');
  return {
    ...actual,
    captureException: jest.fn(),
  };
});

import {
  inferPaceHint,
  defaultExtractedSignals,
  extractSignalsFromExchangeHistory,
} from './topic-probe-extraction';
import { routeAndCall } from '../llm';
import { captureException } from '../sentry';
import type { ExchangeEntry } from '@eduagent/schemas';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;
const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;

// ---------------------------------------------------------------------------
// Helper: produce a resolved routeAndCall response carrying a JSON body
// ---------------------------------------------------------------------------
function llmResponse(json: Record<string, unknown>): void {
  mockRouteAndCall.mockResolvedValueOnce({
    response: JSON.stringify(json),
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    latencyMs: 50,
    stopReason: 'stop',
  });
}

function llmRawResponse(text: string): void {
  mockRouteAndCall.mockResolvedValueOnce({
    response: text,
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    latencyMs: 50,
    stopReason: 'stop',
  });
}

function entry(role: 'user' | 'assistant', content: string): ExchangeEntry {
  return { role, content };
}

beforeEach(() => jest.clearAllMocks());

// ===========================================================================
// inferPaceHint
// ===========================================================================

describe('inferPaceHint', () => {
  it('returns medium/medium for empty history', () => {
    expect(inferPaceHint([])).toEqual({
      density: 'medium',
      chunkSize: 'medium',
    });
  });

  it('returns medium/medium when history contains only assistant turns (no user turns)', () => {
    const history: ExchangeEntry[] = [
      entry('assistant', 'Hello! What would you like to learn?'),
      entry('assistant', 'Let me know your goals.'),
    ];
    expect(inferPaceHint(history)).toEqual({
      density: 'medium',
      chunkSize: 'medium',
    });
  });

  it('returns low/short when user turns average ≤ 24 chars (clearly short)', () => {
    // "Hi" (2) + "Yes" (3) + "Ok sure" (7) → avg = 4
    const history: ExchangeEntry[] = [
      entry('assistant', 'Ready?'),
      entry('user', 'Hi'),
      entry('assistant', 'Great!'),
      entry('user', 'Yes'),
      entry('user', 'Ok sure'),
    ];
    expect(inferPaceHint(history)).toEqual({
      density: 'low',
      chunkSize: 'short',
    });
  });

  it('returns low/short when average is exactly 24 chars (boundary ≤ 24)', () => {
    // Two entries of exactly 24 chars each → avg = 24
    const twentyFourChars = 'a'.repeat(24);
    const history: ExchangeEntry[] = [
      entry('user', twentyFourChars),
      entry('user', twentyFourChars),
    ];
    expect(inferPaceHint(history)).toEqual({
      density: 'low',
      chunkSize: 'short',
    });
  });

  it('returns medium/medium when average is exactly 25 chars (just above low boundary)', () => {
    // Two entries of exactly 25 chars → avg = 25
    const twentyFiveChars = 'b'.repeat(25);
    const history: ExchangeEntry[] = [
      entry('user', twentyFiveChars),
      entry('user', twentyFiveChars),
    ];
    expect(inferPaceHint(history)).toEqual({
      density: 'medium',
      chunkSize: 'medium',
    });
  });

  it('returns high/long when user turns average ≥ 240 chars (clearly long)', () => {
    const longContent = 'x'.repeat(300);
    const history: ExchangeEntry[] = [
      entry('user', longContent),
      entry('assistant', 'Very detailed!'),
      entry('user', longContent),
    ];
    expect(inferPaceHint(history)).toEqual({
      density: 'high',
      chunkSize: 'long',
    });
  });

  it('returns high/long when average is exactly 240 chars (boundary ≥ 240)', () => {
    const exactly240 = 'c'.repeat(240);
    const history: ExchangeEntry[] = [
      entry('user', exactly240),
      entry('user', exactly240),
    ];
    expect(inferPaceHint(history)).toEqual({
      density: 'high',
      chunkSize: 'long',
    });
  });

  it('filters out empty-after-trim user turns before averaging', () => {
    // Only real content is "   short   " (trimmed = "short", 5 chars)
    // The empty-after-trim entries must not count toward the average
    const history: ExchangeEntry[] = [
      entry('user', '   '), // empty after trim — excluded
      entry('user', '\t\n'), // empty after trim — excluded
      entry('user', '   short   '), // 5 chars after trim
    ];
    // With only 1 real user turn of 5 chars: avg = 5 → low/short
    expect(inferPaceHint(history)).toEqual({
      density: 'low',
      chunkSize: 'short',
    });
  });

  it('trims content before computing length', () => {
    // "  " + 22 chars + "  " = 26 chars raw but 22 chars after trim
    const paddedContent = '  ' + 'd'.repeat(22) + '  ';
    const history: ExchangeEntry[] = [
      entry('user', paddedContent),
      entry('user', paddedContent),
    ];
    // avg trimmed = 22 → low/short (≤ 24)
    expect(inferPaceHint(history)).toEqual({
      density: 'low',
      chunkSize: 'short',
    });
  });
});

// ===========================================================================
// defaultExtractedSignals
// ===========================================================================

describe('defaultExtractedSignals', () => {
  it('returns default shape with medium paceHint for empty history', () => {
    const result = defaultExtractedSignals([]);
    expect(result).toEqual({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: [],
      paceHint: { density: 'medium', chunkSize: 'medium' },
    });
  });

  it('carries short-turn paceHint from inferPaceHint when history has short user turns', () => {
    const history: ExchangeEntry[] = [
      entry('user', 'yes'),
      entry('user', 'ok'),
    ];
    const result = defaultExtractedSignals(history);
    expect(result.paceHint).toEqual({ density: 'low', chunkSize: 'short' });
  });

  it('always sets goals=[], experienceLevel=beginner, currentKnowledge="", interests=[]', () => {
    const history: ExchangeEntry[] = [entry('user', 'x'.repeat(300))];
    const result = defaultExtractedSignals(history);
    expect(result.goals).toEqual([]);
    expect(result.experienceLevel).toBe('beginner');
    expect(result.currentKnowledge).toBe('');
    expect(result.interests).toEqual([]);
  });
});

// ===========================================================================
// extractSignalsFromExchangeHistory
// ===========================================================================

describe('extractSignalsFromExchangeHistory', () => {
  const sampleHistory: ExchangeEntry[] = [
    entry('assistant', 'What do you want to learn?'),
    entry('user', 'I love chess and football. I want to get better at maths.'),
    entry('assistant', 'Great! What level are you at?'),
    entry('user', 'Intermediate, I think. I know basic algebra.'),
  ];

  it('happy path — parses valid LLM JSON and returns all fields correctly', async () => {
    llmResponse({
      goals: ['improve at maths', 'learn algebra'],
      experienceLevel: 'intermediate',
      currentKnowledge: 'Basic algebra',
      interests: ['chess', 'football'],
      interestContext: { chess: 'free_time', football: 'free_time' },
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.goals).toEqual(['improve at maths', 'learn algebra']);
    expect(result.experienceLevel).toBe('intermediate');
    expect(result.currentKnowledge).toBe('Basic algebra');
    expect(result.interests).toEqual(['chess', 'football']);
    expect(result.interestContext).toEqual({
      chess: 'free_time',
      football: 'free_time',
    });
    expect(result.analogyFraming).toBe('concrete');
    expect(result.paceHint).toBeDefined();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('truncates interests to 8 when LLM returns 9', async () => {
    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      interestContext: {},
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.interests).toHaveLength(8);
    expect(result.interests).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('dedupes interests case-insensitively, keeping the first occurrence', async () => {
    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['Chess', 'chess', 'Football', 'FOOTBALL'],
      interestContext: {},
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.interests).toEqual(['Chess', 'Football']);
  });

  it('filters out interests longer than 60 chars', async () => {
    const longLabel = 'x'.repeat(61);
    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['chess', longLabel, 'football'],
      interestContext: {},
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.interests).toEqual(['chess', 'football']);
  });

  it('omits interestContext key when interests array is empty', async () => {
    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: [],
      interestContext: {},
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.interests).toEqual([]);
    expect('interestContext' in result).toBe(false);
  });

  it('defaults invalid interestContext value to "both"', async () => {
    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['chess'],
      interestContext: { chess: 'playground' }, // invalid
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.interestContext).toEqual({ chess: 'both' });
  });

  it('defaults to "both" for all interests when interestContext is null', async () => {
    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['chess', 'football'],
      interestContext: null,
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.interestContext).toEqual({
      chess: 'both',
      football: 'both',
    });
  });

  it('defaults to "both" for all interests when interestContext is an array', async () => {
    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['chess'],
      interestContext: ['school'], // array is not a valid object map
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.interestContext).toEqual({ chess: 'both' });
  });

  it('defaults analogyFraming to "concrete" when LLM returns an invalid value', async () => {
    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: [],
      interestContext: {},
      analogyFraming: 'funny', // invalid
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.analogyFraming).toBe('concrete');
  });

  it('returns empty goals array when LLM goals field is not an array', async () => {
    llmResponse({
      goals: 'improve at maths', // string, not array
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: [],
      interestContext: {},
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.goals).toEqual([]);
  });

  it('filters non-string values out of goals array', async () => {
    llmResponse({
      goals: ['valid goal', 42, null, 'another goal', true],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: [],
      interestContext: {},
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.goals).toEqual(['valid goal', 'another goal']);
  });

  it('defaults experienceLevel to "beginner" when missing from LLM response', async () => {
    llmResponse({
      goals: [],
      // experienceLevel omitted
      currentKnowledge: '',
      interests: [],
      interestContext: {},
      analogyFraming: 'concrete',
    });

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    expect(result.experienceLevel).toBe('beginner');
  });

  it('falls back to defaultExtractedSignals and calls captureException when LLM returns no JSON', async () => {
    llmRawResponse('I cannot extract signals from this transcript.');

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    // Must be the default shape
    expect(result.goals).toEqual([]);
    expect(result.experienceLevel).toBe('beginner');
    expect(result.currentKnowledge).toBe('');
    expect(result.interests).toEqual([]);

    // Must escalate to Sentry
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = mockCaptureException.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('no JSON object found');
    expect(ctx).toMatchObject({
      extra: expect.objectContaining({
        surface: 'topic-probe-signal-extraction',
        reason: 'no_json_found',
      }),
    });
  });

  it('falls back to defaultExtractedSignals and calls captureException when LLM returns malformed JSON', async () => {
    // The string must contain a brace-balanced `{...}` so extractFirstJsonObject
    // returns a non-null string — but the extracted string must fail JSON.parse.
    // `{"goals": undefined}` satisfies both: braces balance, but `undefined` is
    // not valid JSON so JSON.parse throws.
    llmRawResponse('{"goals": undefined}');

    const result = await extractSignalsFromExchangeHistory(sampleHistory);

    // Default shape
    expect(result.goals).toEqual([]);
    expect(result.experienceLevel).toBe('beginner');

    // captureException fires with invalid_json reason
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [, ctx] = mockCaptureException.mock.calls[0]!;
    expect(ctx).toMatchObject({
      extra: expect.objectContaining({
        surface: 'topic-probe-signal-extraction',
        reason: 'invalid_json',
      }),
    });
  });

  it('truncates transcript from the head when it exceeds 12000 chars, preserving the tail', async () => {
    // Build a transcript that exceeds MAX_TRANSCRIPT_CHARS = 12000.
    // We need the joined "ROLE: content\n" text to exceed 12000.
    // One big user turn of 13000 chars will produce a line "USER: <13000 chars>\n" > 12000.
    const bigContent = 'z'.repeat(13000);
    const bigHistory: ExchangeEntry[] = [entry('user', bigContent)];

    llmResponse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: [],
      interestContext: {},
      analogyFraming: 'concrete',
    });

    await extractSignalsFromExchangeHistory(bigHistory);

    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    const callArgs = mockRouteAndCall.mock.calls[0]!;
    const messages = callArgs[0] as Array<{ role: string; content: string }>;
    // The user message (index 1) contains the <transcript> block
    const transcriptMessage = messages[1]!.content;
    expect(transcriptMessage.length).toBeLessThanOrEqual(12000 + 200); // 200 for wrapper text

    // The source code slices conversationText to MAX_TRANSCRIPT_CHARS (12000)
    // before embedding it. The <transcript> body in the message is:
    //   \n{conversationText}\n
    // so its raw length may be up to 12002 (two surrounding newlines).
    // We extract conversationText itself and assert it is ≤ 12000.
    const transcriptBodyMatch = transcriptMessage.match(
      /<transcript>\n([\s\S]*)\n<\/transcript>/,
    );
    expect(transcriptBodyMatch).not.toBeNull();
    const conversationTextInMessage = transcriptBodyMatch![1]!;
    expect(conversationTextInMessage.length).toBeLessThanOrEqual(12000);
  });
});
