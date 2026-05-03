import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import { evaluateSummary } from './summaries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock provider that returns a specific JSON evaluation response */
function createEvalMockProvider(evaluation: {
  feedback: string;
  hasUnderstandingGaps: boolean;
  gapAreas?: string[];
  isAccepted: boolean;
}): LLMProvider {
  return {
    id: 'gemini',
    async chat(
      _messages: ChatMessage[],
      _config: ModelConfig
    ): Promise<string> {
      return JSON.stringify(evaluation);
    },
    async *chatStream(): AsyncIterable<string> {
      yield JSON.stringify(evaluation);
    },
  };
}

// ---------------------------------------------------------------------------
// evaluateSummary
// ---------------------------------------------------------------------------

describe('evaluateSummary', () => {
  afterEach(() => {
    // Restore generic mock after each test
    registerProvider(createMockProvider('gemini'));
  });

  it('returns a SummaryEvaluation with feedback', async () => {
    registerProvider(
      createEvalMockProvider({
        feedback: 'Great summary! You captured the key ideas well.',
        hasUnderstandingGaps: false,
        gapAreas: [],
        isAccepted: true,
      })
    );

    const result = await evaluateSummary(
      'Variables',
      'Understanding variables in programming',
      'Variables are containers that store data values.'
    );

    expect(result.feedback).toContain('Great summary');
    expect(result.hasUnderstandingGaps).toBe(false);
    expect(result.isAccepted).toBe(true);
  });

  it('detects understanding gaps', async () => {
    registerProvider(
      createEvalMockProvider({
        feedback:
          "You have a good start! You haven't quite captured the difference between let and const yet.",
        hasUnderstandingGaps: true,
        gapAreas: ['let vs const distinction', 'block scoping'],
        isAccepted: false,
      })
    );

    const result = await evaluateSummary(
      'Variables',
      'Let, const, and var in JavaScript',
      'Variables store data. You use var to create them.'
    );

    expect(result.hasUnderstandingGaps).toBe(true);
    expect(Array.isArray(result.gapAreas)).toBe(true);
    expect(result.gapAreas).toContain('let vs const distinction');
    expect(result.isAccepted).toBe(false);
  });

  it('accepts a good summary', async () => {
    registerProvider(
      createEvalMockProvider({
        feedback: 'Excellent work — you nailed it!',
        hasUnderstandingGaps: false,
        gapAreas: [],
        isAccepted: true,
      })
    );

    const result = await evaluateSummary(
      'Loops',
      'For and while loops',
      'For loops repeat a block a fixed number of times. While loops repeat until a condition is false.'
    );

    expect(result.isAccepted).toBe(true);
    expect(result.hasUnderstandingGaps).toBe(false);
  });

  it('falls back gracefully when LLM returns non-JSON', async () => {
    const rawProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return 'Your summary looks good overall!';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'Your summary looks good overall!';
      },
    };
    registerProvider(rawProvider);

    const result = await evaluateSummary(
      'Arrays',
      'Working with arrays',
      'Arrays are ordered collections.'
    );

    // Fallback: LLM returned non-JSON — show safe error message, do not accept.
    // The raw LLM text is never passed through as feedback (it could be an error
    // message, safety refusal, or rate-limit JSON).
    expect(result.feedback).toContain("couldn't provide AI feedback");
    expect(result.isAccepted).toBe(false);
    expect(result.hasUnderstandingGaps).toBe(false);
  });

  it('handles JSON embedded in surrounding text', async () => {
    const embeddedProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return (
          'Here is my evaluation:\n' +
          JSON.stringify({
            feedback: 'Well done!',
            hasUnderstandingGaps: false,
            gapAreas: [],
            isAccepted: true,
          }) +
          '\nEnd of evaluation.'
        );
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'Well done!';
      },
    };
    registerProvider(embeddedProvider);

    const result = await evaluateSummary(
      'Functions',
      'Function declarations',
      'Functions are reusable blocks of code.'
    );

    expect(result.feedback).toBe('Well done!');
    expect(result.isAccepted).toBe(true);
  });

  // [BUG-664 / S-4] Break tests for the brittle /\{[\s\S]*\}/ regex.
  it('parses correctly when prose with braces FOLLOWS the JSON envelope', async () => {
    // The original regex matched first `{` to LAST `}`, so trailing prose
    // braces would corrupt the substring fed to JSON.parse. The brace-depth
    // walker stops at the first balanced object, recovering correctly here.
    const messyProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return (
          'Here is the evaluation:\n' +
          JSON.stringify({
            feedback: 'Captured the main idea.',
            hasUnderstandingGaps: false,
            gapAreas: [],
            isAccepted: true,
          }) +
          '\n(rubric reference: see {section-3})'
        );
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'unused';
      },
    };
    registerProvider(messyProvider);

    const result = await evaluateSummary(
      'Functions',
      'Function declarations',
      'Functions are reusable blocks of code.'
    );

    // Without the brace-walker fix, this would fall back to the canned message.
    expect(result.feedback).toBe('Captured the main idea.');
    expect(result.isAccepted).toBe(true);
  });

  it('parses correctly when JSON is wrapped in a markdown code fence', async () => {
    const fencedProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return (
          '```json\n' +
          JSON.stringify({
            feedback: 'Solid.',
            hasUnderstandingGaps: false,
            gapAreas: [],
            isAccepted: true,
          }) +
          '\n```'
        );
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'unused';
      },
    };
    registerProvider(fencedProvider);

    const result = await evaluateSummary(
      'Loops',
      'For and while loops',
      'For loops repeat n times.'
    );

    expect(result.feedback).toBe('Solid.');
    expect(result.isAccepted).toBe(true);
  });

  // [BUG-670 / S-16] Break test — never leak raw LLM string as feedback.
  it('uses canned fallback when parsed JSON is missing the feedback field', async () => {
    const missingFeedbackProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return JSON.stringify({
          hasUnderstandingGaps: true,
          gapAreas: ['x'],
          isAccepted: false,
        });
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'unused';
      },
    };
    registerProvider(missingFeedbackProvider);

    const result = await evaluateSummary(
      'Arrays',
      'Arrays',
      'Some summary text.'
    );

    expect(result.feedback).toContain("couldn't provide AI feedback");
    expect(result.isAccepted).toBe(false);
  });
});
