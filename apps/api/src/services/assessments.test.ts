import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import {
  generateQuickCheck,
  evaluateAssessmentAnswer,
  getNextVerificationDepth,
  calculateMasteryScore,
  type QuickCheckContext,
  type AssessmentContext,
  type VerificationDepth,
} from './assessments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock provider that returns specific JSON for quick checks */
function createQuickCheckMockProvider(questions: string[]): LLMProvider {
  return {
    id: 'gemini',
    async chat(
      _messages: ChatMessage[],
      _config: ModelConfig
    ): Promise<string> {
      return JSON.stringify({ questions });
    },
    async *chatStream(): AsyncIterable<string> {
      yield JSON.stringify({ questions });
    },
  };
}

/** Creates a mock provider that returns specific JSON for assessment evaluation */
function createAssessmentEvalMockProvider(evaluation: {
  feedback: string;
  passed: boolean;
  shouldEscalateDepth: boolean;
  rawScore: number;
  qualityRating: number;
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
// Shared fixtures
// ---------------------------------------------------------------------------

const quickCheckContext: QuickCheckContext = {
  topicTitle: 'Variables in JavaScript',
  topicDescription: 'Understanding let, const, and var declarations',
  recentExchanges: [
    { role: 'assistant', content: 'What do you know about variables?' },
    { role: 'user', content: 'They store data values.' },
  ],
};

const assessmentContext: AssessmentContext = {
  topicTitle: 'Variables in JavaScript',
  topicDescription: 'Understanding let, const, and var declarations',
  currentDepth: 'recall',
  exchangeHistory: [
    { role: 'assistant', content: 'What is a variable?' },
    { role: 'user', content: 'A container for data.' },
  ],
};

// ---------------------------------------------------------------------------
// generateQuickCheck
// ---------------------------------------------------------------------------

describe('generateQuickCheck', () => {
  afterEach(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('returns 2-3 questions', async () => {
    registerProvider(
      createQuickCheckMockProvider([
        'Can you explain why we use let instead of var?',
        'What happens if you try to reassign a const variable?',
        'When would you choose let over const?',
      ])
    );

    const result = await generateQuickCheck(quickCheckContext);

    expect(result.questions.length).toBeGreaterThanOrEqual(2);
    expect(result.questions.length).toBeLessThanOrEqual(3);
    expect(result.checkType).toBe('concept_boundary');
  });

  it('returns exactly 2 questions when LLM returns 2', async () => {
    registerProvider(
      createQuickCheckMockProvider([
        'Why is scoping important for variables?',
        'What is the difference between let and const?',
      ])
    );

    const result = await generateQuickCheck(quickCheckContext);

    expect(result.questions).toHaveLength(2);
  });

  it('caps at 3 questions even if LLM returns more', async () => {
    registerProvider(
      createQuickCheckMockProvider(['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?'])
    );

    const result = await generateQuickCheck(quickCheckContext);

    expect(result.questions.length).toBeLessThanOrEqual(3);
  });

  it('falls back gracefully when LLM returns non-JSON', async () => {
    const rawProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return 'Here are some questions for you to think about.';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'Here are some questions.';
      },
    };
    registerProvider(rawProvider);

    const result = await generateQuickCheck(quickCheckContext);

    expect(result.questions.length).toBeGreaterThanOrEqual(2);
    expect(result.checkType).toBe('concept_boundary');
  });
});

// ---------------------------------------------------------------------------
// evaluateAssessmentAnswer
// ---------------------------------------------------------------------------

describe('evaluateAssessmentAnswer', () => {
  afterEach(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('caps mastery at 0.5 for recall depth', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'You remembered the key facts well.',
        passed: true,
        shouldEscalateDepth: true,
        rawScore: 0.9,
        qualityRating: 4,
      })
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'A variable stores data using let, const, or var.'
    );

    expect(result.masteryScore).toBeLessThanOrEqual(0.5);
    expect(result.passed).toBe(true);
  });

  it('caps mastery at 0.8 for explain depth', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'Great explanation of how variables work.',
        passed: true,
        shouldEscalateDepth: true,
        rawScore: 0.95,
        qualityRating: 5,
      })
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'explain' },
      'Variables are named references to memory locations where data is stored.'
    );

    expect(result.masteryScore).toBeLessThanOrEqual(0.8);
    expect(result.passed).toBe(true);
  });

  it('allows mastery up to 1.0 for transfer depth', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'Excellent transfer to a new context!',
        passed: true,
        shouldEscalateDepth: false,
        rawScore: 1.0,
        qualityRating: 5,
      })
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'transfer' },
      'I would use const for the config object since it should not be reassigned.'
    );

    expect(result.masteryScore).toBeLessThanOrEqual(1.0);
    expect(result.masteryScore).toBeGreaterThan(0.8);
  });

  it('returns quality rating between 0 and 5', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'Good recall.',
        passed: true,
        shouldEscalateDepth: false,
        rawScore: 0.4,
        qualityRating: 3,
      })
    );

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Variables store data.'
    );

    expect(result.qualityRating).toBeGreaterThanOrEqual(0);
    expect(result.qualityRating).toBeLessThanOrEqual(5);
  });

  it('includes nextDepth when shouldEscalateDepth is true', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'Ready for the next level.',
        passed: true,
        shouldEscalateDepth: true,
        rawScore: 0.45,
        qualityRating: 4,
      })
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'Good answer.'
    );

    expect(result.shouldEscalateDepth).toBe(true);
    expect(result.nextDepth).toBe('explain');
  });

  it('does not include nextDepth when at transfer depth', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'Great work!',
        passed: true,
        shouldEscalateDepth: true,
        rawScore: 0.9,
        qualityRating: 5,
      })
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'transfer' },
      'Applied the concept correctly.'
    );

    expect(result.nextDepth).toBeUndefined();
  });

  it('falls back gracefully when LLM returns non-JSON', async () => {
    const rawProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return 'The answer shows partial understanding.';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'Partial understanding.';
      },
    };
    registerProvider(rawProvider);

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Some answer'
    );

    expect(result.feedback).toContain('partial understanding');
    expect(result.passed).toBe(false);
    expect(result.masteryScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getNextVerificationDepth
// ---------------------------------------------------------------------------

describe('getNextVerificationDepth', () => {
  it('progresses from recall to explain', () => {
    expect(getNextVerificationDepth('recall')).toBe('explain');
  });

  it('progresses from explain to transfer', () => {
    expect(getNextVerificationDepth('explain')).toBe('transfer');
  });

  it('returns null after transfer (no more depths)', () => {
    expect(getNextVerificationDepth('transfer')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calculateMasteryScore
// ---------------------------------------------------------------------------

describe('calculateMasteryScore', () => {
  it('caps recall at 0.5', () => {
    expect(calculateMasteryScore('recall', 0.9)).toBe(0.5);
  });

  it('caps explain at 0.8', () => {
    expect(calculateMasteryScore('explain', 0.95)).toBe(0.8);
  });

  it('allows transfer up to 1.0', () => {
    expect(calculateMasteryScore('transfer', 1.0)).toBe(1.0);
  });

  it('does not go below 0', () => {
    expect(calculateMasteryScore('recall', -0.5)).toBe(0);
  });

  it('does not exceed 1.0 even for transfer', () => {
    expect(calculateMasteryScore('transfer', 1.5)).toBe(1.0);
  });

  it('returns raw score when below cap', () => {
    expect(calculateMasteryScore('recall', 0.3)).toBeCloseTo(0.3);
    expect(calculateMasteryScore('explain', 0.6)).toBeCloseTo(0.6);
    expect(calculateMasteryScore('transfer', 0.7)).toBeCloseTo(0.7);
  });
});
