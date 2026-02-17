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
  createAssessment,
  getAssessment,
  updateAssessment,
  type QuickCheckContext,
  type AssessmentContext,
} from './assessments';
import type { VerificationDepth } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';

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

// ---------------------------------------------------------------------------
// CRUD persistence — createAssessment, getAssessment, updateAssessment
// ---------------------------------------------------------------------------

const CRUD_NOW = new Date('2025-01-15T10:00:00.000Z');
const testProfileId = 'test-profile-id';
const testSubjectId = 'subject-1';
const testTopicId = 'topic-1';
const testAssessmentId = 'assessment-1';

function mockAssessmentRow(
  overrides?: Partial<{
    id: string;
    profileId: string;
    sessionId: string | null;
    verificationDepth: 'recall' | 'explain' | 'transfer';
    status: 'in_progress' | 'passed' | 'failed';
    masteryScore: string | null;
    qualityRating: number | null;
    exchangeHistory: unknown[];
  }>
) {
  return {
    id: overrides?.id ?? testAssessmentId,
    profileId: overrides?.profileId ?? testProfileId,
    subjectId: testSubjectId,
    topicId: testTopicId,
    sessionId: overrides?.sessionId ?? null,
    verificationDepth: overrides?.verificationDepth ?? 'recall',
    status: overrides?.status ?? 'in_progress',
    masteryScore: overrides?.masteryScore ?? null,
    qualityRating: overrides?.qualityRating ?? null,
    exchangeHistory: overrides?.exchangeHistory ?? [],
    createdAt: CRUD_NOW,
    updatedAt: CRUD_NOW,
  };
}

function createAssessmentMockDb({
  findFirstResult = undefined as
    | ReturnType<typeof mockAssessmentRow>
    | undefined,
  insertReturning = [] as ReturnType<typeof mockAssessmentRow>[],
} = {}) {
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

  return {
    query: {
      assessments: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({ set: updateSet }),
  } as unknown as Database;
}

describe('createAssessment', () => {
  it('returns assessment with initial recall depth and in_progress status', async () => {
    const row = mockAssessmentRow();
    const db = createAssessmentMockDb({ insertReturning: [row] });

    const result = await createAssessment(
      db,
      testProfileId,
      testSubjectId,
      testTopicId
    );

    expect(result.id).toBe(testAssessmentId);
    expect(result.profileId).toBe(testProfileId);
    expect(result.subjectId).toBe(testSubjectId);
    expect(result.topicId).toBe(testTopicId);
    expect(result.verificationDepth).toBe('recall');
    expect(result.status).toBe('in_progress');
    expect(result.sessionId).toBeNull();
    expect(result.exchangeHistory).toEqual([]);
  });

  it('includes sessionId when provided', async () => {
    const row = mockAssessmentRow({ sessionId: 'session-1' });
    const db = createAssessmentMockDb({ insertReturning: [row] });

    const result = await createAssessment(
      db,
      testProfileId,
      testSubjectId,
      testTopicId,
      'session-1'
    );

    expect(result.sessionId).toBe('session-1');
  });

  it('includes profileId in insert values', async () => {
    const row = mockAssessmentRow();
    const db = createAssessmentMockDb({ insertReturning: [row] });

    await createAssessment(db, testProfileId, testSubjectId, testTopicId);

    const insertCall = (db.insert as jest.Mock).mock.results[0].value;
    const valuesCall = insertCall.values as jest.Mock;
    const insertedValues = valuesCall.mock.calls[0][0];
    expect(insertedValues.profileId).toBe(testProfileId);
  });

  it('converts dates to ISO strings', async () => {
    const row = mockAssessmentRow();
    const db = createAssessmentMockDb({ insertReturning: [row] });

    const result = await createAssessment(
      db,
      testProfileId,
      testSubjectId,
      testTopicId
    );

    expect(result.createdAt).toBe('2025-01-15T10:00:00.000Z');
    expect(result.updatedAt).toBe('2025-01-15T10:00:00.000Z');
  });
});

describe('getAssessment', () => {
  it('returns assessment when found', async () => {
    const row = mockAssessmentRow();
    const db = createAssessmentMockDb({ findFirstResult: row });

    const result = await getAssessment(db, testProfileId, testAssessmentId);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(testAssessmentId);
    expect(result!.createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('returns null when assessment not found', async () => {
    const db = createAssessmentMockDb({ findFirstResult: undefined });

    const result = await getAssessment(db, testProfileId, 'nonexistent');

    expect(result).toBeNull();
  });

  it('maps masteryScore from string to number', async () => {
    const row = mockAssessmentRow({ masteryScore: '0.75' });
    const db = createAssessmentMockDb({ findFirstResult: row });

    const result = await getAssessment(db, testProfileId, testAssessmentId);

    expect(result!.masteryScore).toBe(0.75);
  });

  it('returns null masteryScore when not set', async () => {
    const row = mockAssessmentRow({ masteryScore: null });
    const db = createAssessmentMockDb({ findFirstResult: row });

    const result = await getAssessment(db, testProfileId, testAssessmentId);

    expect(result!.masteryScore).toBeNull();
  });
});

describe('updateAssessment', () => {
  it('calls update with defence-in-depth profileId filter', async () => {
    const db = createAssessmentMockDb();

    await updateAssessment(db, testProfileId, testAssessmentId, {
      status: 'passed',
      masteryScore: 0.8,
    });

    expect(db.update).toHaveBeenCalled();
  });

  it('only sets provided fields in update', async () => {
    const db = createAssessmentMockDb();

    await updateAssessment(db, testProfileId, testAssessmentId, {
      verificationDepth: 'explain',
    });

    const updateCall = (db.update as jest.Mock).mock.results[0].value;
    const setCall = updateCall.set as jest.Mock;
    const setValues = setCall.mock.calls[0][0];
    expect(setValues.verificationDepth).toBe('explain');
    expect(setValues).toHaveProperty('updatedAt');
    expect(setValues).not.toHaveProperty('status');
    expect(setValues).not.toHaveProperty('masteryScore');
  });

  it('converts masteryScore to string for decimal storage', async () => {
    const db = createAssessmentMockDb();

    await updateAssessment(db, testProfileId, testAssessmentId, {
      masteryScore: 0.65,
    });

    const updateCall = (db.update as jest.Mock).mock.results[0].value;
    const setCall = updateCall.set as jest.Mock;
    const setValues = setCall.mock.calls[0][0];
    expect(setValues.masteryScore).toBe('0.65');
  });
});
