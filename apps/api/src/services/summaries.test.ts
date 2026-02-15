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
    expect(result.gapAreas).toBeDefined();
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

    // Fallback: raw response becomes feedback, accepted by default
    expect(result.feedback).toContain('Your summary looks good overall');
    expect(result.isAccepted).toBe(true);
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
});
