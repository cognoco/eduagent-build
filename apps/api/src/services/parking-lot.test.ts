import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import {
  shouldParkQuestion,
  formatParkedQuestionForContext,
  MAX_PARKING_LOT_PER_TOPIC,
} from './parking-lot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock provider that returns a specific classification */
function createClassifierMock(
  classification: 'tangential' | 'relevant'
): LLMProvider {
  return {
    id: 'gemini',
    async chat(
      _messages: ChatMessage[],
      _config: ModelConfig
    ): Promise<string> {
      return classification;
    },
    async *chatStream(): AsyncIterable<string> {
      yield classification;
    },
  };
}

// ---------------------------------------------------------------------------
// shouldParkQuestion
// ---------------------------------------------------------------------------

describe('shouldParkQuestion', () => {
  afterEach(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('returns true when LLM classifies question as tangential', async () => {
    registerProvider(createClassifierMock('tangential'));

    const result = await shouldParkQuestion(
      'How does blockchain work?',
      'Quadratic Equations'
    );

    expect(result).toBe(true);
  });

  it('returns false when LLM classifies question as relevant', async () => {
    registerProvider(createClassifierMock('relevant'));

    const result = await shouldParkQuestion(
      'What about the discriminant?',
      'Quadratic Equations'
    );

    expect(result).toBe(false);
  });

  it('handles response with extra whitespace', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return '  tangential  \n';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'tangential';
      },
    };
    registerProvider(provider);

    const result = await shouldParkQuestion(
      'What about CSS animations?',
      'JavaScript Variables'
    );

    expect(result).toBe(true);
  });

  it('handles response with surrounding text', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return 'The question is tangential to the topic.';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'tangential';
      },
    };
    registerProvider(provider);

    const result = await shouldParkQuestion(
      'How do databases work?',
      'CSS Flexbox'
    );

    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatParkedQuestionForContext
// ---------------------------------------------------------------------------

describe('formatParkedQuestionForContext', () => {
  it('returns empty string for no questions', () => {
    const result = formatParkedQuestionForContext([]);
    expect(result).toBe('');
  });

  it('formats a single question', () => {
    const result = formatParkedQuestionForContext([
      { question: 'How does blockchain work?' },
    ]);

    expect(result).toContain('Parking Lot');
    expect(result).toContain('1. How does blockchain work?');
  });

  it('formats multiple questions with numbering', () => {
    const result = formatParkedQuestionForContext([
      { question: 'Question A' },
      { question: 'Question B' },
      { question: 'Question C' },
    ]);

    expect(result).toContain('1. Question A');
    expect(result).toContain('2. Question B');
    expect(result).toContain('3. Question C');
  });

  it('includes guidance about referencing parked questions', () => {
    const result = formatParkedQuestionForContext([
      { question: 'Some question' },
    ]);

    expect(result).toContain('reference');
  });

  it('limits to MAX_PARKING_LOT_PER_TOPIC questions', () => {
    const questions = Array.from({ length: 15 }, (_, i) => ({
      question: `Question ${i + 1}`,
    }));

    const result = formatParkedQuestionForContext(questions);

    // Should include first 10
    expect(result).toContain(`1. Question 1`);
    expect(result).toContain(
      `${MAX_PARKING_LOT_PER_TOPIC}. Question ${MAX_PARKING_LOT_PER_TOPIC}`
    );

    // Should NOT include question 11+
    expect(result).not.toContain('11. Question 11');

    // Should note the overflow
    expect(result).toContain('5 additional questions not shown');
  });

  it('does not show overflow message when within limit', () => {
    const questions = Array.from(
      { length: MAX_PARKING_LOT_PER_TOPIC },
      (_, i) => ({
        question: `Question ${i + 1}`,
      })
    );

    const result = formatParkedQuestionForContext(questions);

    expect(result).not.toContain('additional questions');
  });

  it('MAX_PARKING_LOT_PER_TOPIC is 10', () => {
    expect(MAX_PARKING_LOT_PER_TOPIC).toBe(10);
  });
});
