import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
  type StopReason,
} from './llm';
import { makeChatStreamResult } from './llm/types';
import {
  generateQuickCheck,
  evaluateAssessmentAnswer,
  getNextVerificationDepth,
  calculateMasteryScore,
  createAssessment,
  getAssessment,
  getActiveAssessmentForTopic,
  buildAssessmentAppHelpEvaluation,
  buildAssessmentEvaluationMessages,
  resolveAssessmentStatus,
  recordAssessmentCompletionActivity,
  shouldEndAssessmentForReview,
  updateAssessment,
} from './assessments';
import type {
  QuickCheckContext,
  AssessmentContext,
  AssessmentEvaluation,
  AssessmentRecord,
} from '@eduagent/schemas';
import { NotFoundError } from '../errors';
import type { Database } from '@eduagent/database';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock provider that returns specific JSON for quick checks */
function createQuickCheckMockProvider(questions: string[]): LLMProvider {
  return {
    id: 'gemini',
    async chat(_messages: ChatMessage[], _config: ModelConfig) {
      return {
        content: JSON.stringify({ questions }),
        stopReason: 'stop' as StopReason,
      };
    },
    chatStream() {
      const s = (async function* () {
        yield JSON.stringify({ questions });
      })();
      return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
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
    async chat(_messages: ChatMessage[], _config: ModelConfig) {
      return {
        content: JSON.stringify(evaluation),
        stopReason: 'stop' as StopReason,
      };
    },
    chatStream() {
      const s = (async function* () {
        yield JSON.stringify(evaluation);
      })();
      return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
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
      ]),
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
      ]),
    );

    const result = await generateQuickCheck(quickCheckContext);

    expect(result.questions).toHaveLength(2);
  });

  it('caps at 3 questions even if LLM returns more', async () => {
    registerProvider(
      createQuickCheckMockProvider(['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?']),
    );

    const result = await generateQuickCheck(quickCheckContext);

    expect(result.questions.length).toBeLessThanOrEqual(3);
  });

  it('falls back gracefully when LLM returns non-JSON', async () => {
    const rawProvider: LLMProvider = {
      id: 'gemini',
      async chat() {
        return {
          content: 'Here are some questions for you to think about.',
          stopReason: 'stop' as StopReason,
        };
      },
      chatStream() {
        const s = (async function* () {
          yield 'Here are some questions.';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
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
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'A variable stores data using let, const, or var.',
    );

    expect(result.masteryScore).toBeLessThanOrEqual(0.5);
    expect(result.passed).toBe(true);
    expect(result.shouldEscalateDepth).toBe(true);
    expect(result.nextDepth).toBe('explain');
  });

  it('caps mastery at 0.8 for explain depth', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'Great explanation of how variables work.',
        passed: true,
        shouldEscalateDepth: true,
        rawScore: 0.95,
        qualityRating: 5,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'explain' },
      'Variables are named references to memory locations where data is stored.',
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
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'transfer' },
      'I would use const for the config object since it should not be reassigned.',
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
      }),
    );

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Variables store data.',
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
        rawScore: 0.8,
        qualityRating: 4,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'Good answer.',
    );

    expect(result.shouldEscalateDepth).toBe(true);
    expect(result.nextDepth).toBe('explain');
  });

  it('adds language-specific grading guidance and concrete topic scope', () => {
    const messages = buildAssessmentEvaluationMessages(
      {
        topicTitle: 'Greetings & Introductions',
        topicDescription:
          'Meet people, say hello, and share simple personal details.',
        currentDepth: 'recall',
        exchangeHistory: [
          {
            role: 'assistant',
            content:
              'Try 2-3 greetings or intro phrases. Add meanings if you know them.',
          },
        ],
        subjectName: 'Italian',
        pedagogyMode: 'four_strands',
        languageCode: 'it',
      },
      'ciao, buongiorno, va bene',
    );

    expect(messages[0]?.content).toContain('LANGUAGE ASSESSMENT MODE');
    expect(messages[0]?.content).toContain(
      'Do NOT ask for "main ideas" or broad summaries',
    );
    expect(messages[0]?.content).toContain(
      'ask direct production tasks: say hello',
    );
    expect(messages[0]?.content).toContain(
      'Avoid generic praise or overheated intensifiers',
    );
    expect(messages[0]?.content).toContain('tiny realistic exchange');
    expect(messages[1]?.content).toContain(
      'Description: <topic_description>Meet people, say hello, and share simple personal details.</topic_description>',
    );
    expect(messages[1]?.content).toContain('Target language: it');
  });

  it('appends a concrete language follow-up when feedback omits the next question', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback:
          'Nice work. You provided two strong examples of Italian greetings.',
        passed: true,
        shouldEscalateDepth: true,
        rawScore: 0.9,
        qualityRating: 4,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      {
        topicTitle: 'Greetings & Introductions',
        topicDescription:
          'Meet people, say hello, and share simple personal details.',
        currentDepth: 'recall',
        exchangeHistory: [],
        subjectName: 'Italian',
        pedagogyMode: 'four_strands',
        languageCode: 'it',
      },
      'ciao, buongiorno',
    );

    expect(result.feedback).toContain(
      'Add one more greeting in the target language, or translate one greeting you wrote into English.',
    );
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
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'transfer' },
      'Applied the concept correctly.',
    );

    expect(result.nextDepth).toBeUndefined();
  });

  it('falls back gracefully when LLM returns non-JSON', async () => {
    const rawProvider: LLMProvider = {
      id: 'gemini',
      async chat() {
        return {
          content: 'The answer shows partial understanding.',
          stopReason: 'stop' as StopReason,
        };
      },
      chatStream() {
        const s = (async function* () {
          yield 'Partial understanding.';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    };
    registerProvider(rawProvider);

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Some answer',
    );

    // [BUG-670 / S-16] Break test — raw LLM string MUST NOT leak as feedback.
    // This catches regressions of the `?? response` / `feedback: response`
    // antipattern where rate-limit JSON or safety refusals would surface
    // directly to the learner.
    expect(result.feedback).not.toContain('partial understanding');
    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
    expect(result.masteryScore).toBe(0);
  });

  // [BUG-664 / S-4] Break tests for the brittle /\{[\s\S]*\}/ regex.
  // The regex would match from the first `{` to the LAST `}`, so any prose
  // containing braces around the JSON would cause JSON.parse to throw and
  // silently grade correct learner answers as failed.

  it('parses correctly when prose with braces FOLLOWS the JSON envelope', async () => {
    // The original /\{[\s\S]*\}/ regex went from the first `{` to the LAST `}`
    // in the response. Any trailing prose containing `{}` would be glommed
    // onto the parsed object, breaking JSON.parse and silently grading the
    // learner as failed. The brace-depth walker stops at the first balanced
    // object, so trailing braces no longer break extraction.
    const messyProvider: LLMProvider = {
      id: 'gemini',
      async chat() {
        return {
          content:
            'Here is my evaluation:\n' +
            JSON.stringify({
              feedback: 'Solid recall of the key concepts.',
              passed: true,
              shouldEscalateDepth: false,
              rawScore: 0.45,
              qualityRating: 4,
            }) +
            '\n(See {appendix} for grading rubric — irrelevant to envelope.)',
          stopReason: 'stop' as StopReason,
        };
      },
      chatStream() {
        const s = (async function* () {
          yield 'unused';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    };
    registerProvider(messyProvider);

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'Variables store data.',
    );

    expect(result.feedback).toBe('Solid recall of the key concepts.');
    expect(result.passed).toBe(false);
    expect(result.masteryScore).toBeGreaterThan(0);
  });

  it('parses correctly when JSON is wrapped in markdown fence', async () => {
    const fencedProvider: LLMProvider = {
      id: 'gemini',
      async chat() {
        return {
          content:
            '```json\n' +
            JSON.stringify({
              feedback: 'Excellent explanation.',
              passed: true,
              shouldEscalateDepth: false,
              rawScore: 0.7,
              qualityRating: 4,
            }) +
            '\n```',
          stopReason: 'stop' as StopReason,
        };
      },
      chatStream() {
        const s = (async function* () {
          yield 'unused';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    };
    registerProvider(fencedProvider);

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'explain' },
      'Some answer',
    );

    expect(result.feedback).toContain('Excellent explanation.');
    expect(result.passed).toBe(true);
  });

  it('uses canned fallback when parsed JSON is missing feedback field', async () => {
    const missingFeedbackProvider: LLMProvider = {
      id: 'gemini',
      async chat() {
        // Valid JSON, but no `feedback` field — caller used to default to
        // raw response under the old `?? response` pattern.
        return {
          content: JSON.stringify({
            passed: false,
            shouldEscalateDepth: false,
            rawScore: 0.2,
            qualityRating: 1,
          }),
          stopReason: 'stop' as StopReason,
        };
      },
      chatStream() {
        const s = (async function* () {
          yield 'unused';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    };
    registerProvider(missingFeedbackProvider);

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Some answer',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
  });

  it('uses parsed reply as feedback when the LLM returns a session-envelope shape', async () => {
    const envelopeProvider: LLMProvider = {
      id: 'gemini',
      async chat() {
        return {
          content: JSON.stringify({
            reply:
              'Not yet. You named a useful phrase; now add what it means and when you would use it.',
            signals: {
              understanding_check: true,
              partial_progress: true,
              needs_deepening: false,
            },
            ui_hints: {
              note_prompt: {
                show: false,
                post_session: false,
              },
            },
          }),
          stopReason: 'stop' as StopReason,
        };
      },
      chatStream() {
        const s = (async function* () {
          yield 'unused';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    };
    registerProvider(envelopeProvider);

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Some answer',
    );

    expect(result.feedback).toBe(
      'Not yet. You named a useful phrase; now add what it means and when you would use it.',
    );
    expect(result.feedback).not.toContain("couldn't evaluate");
    expect(result.passed).toBe(false);
  });
});

describe('buildAssessmentAppHelpEvaluation', () => {
  it('turns app questions into app-help feedback instead of assessment grading', () => {
    const result = buildAssessmentAppHelpEvaluation(
      'Where do I find my notes about this topic or subject?',
      0.4,
    );

    expect(result).not.toBeNull();
    expect(result?.feedback).toContain('Home > My Notes > Notes');
    expect(result?.feedback).toContain('Library > choose the subject');
    expect(result?.passed).toBe(false);
    expect(result?.shouldEscalateDepth).toBe(false);
    expect(result?.masteryScore).toBe(0.4);
  });

  it('does not intercept ordinary assessment answers', () => {
    expect(
      buildAssessmentAppHelpEvaluation('Ciao means hello in Italian.'),
    ).toBeNull();
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
// Assessment flow recovery
// ---------------------------------------------------------------------------

describe('assessment review handoff', () => {
  it('ends the assessment when the learner says they do not remember', () => {
    expect(shouldEndAssessmentForReview("I don't remember", [])).toBe(true);
    expect(shouldEndAssessmentForReview('No idea', [])).toBe(true);
  });

  it('treats acknowledgement-only replies as review handoff after a prior answer', () => {
    expect(
      shouldEndAssessmentForReview('Ok', [
        { role: 'user', content: 'Not much. We talked about feudalism.' },
        {
          role: 'assistant',
          content: "Let's review the ideas together.",
        },
      ]),
    ).toBe(true);
  });

  it('does not end on an initial readiness acknowledgement', () => {
    expect(shouldEndAssessmentForReview('Ok', [])).toBe(false);
  });

  it('forces a review status instead of keeping the check in progress', () => {
    const status = resolveAssessmentStatus({
      evaluation: {
        feedback:
          "No problem. This topic needs a quick review before another check. Let's go through it together.",
        passed: false,
        shouldEscalateDepth: false,
        masteryScore: 0,
        qualityRating: 0,
      },
      answerCount: 2,
      forceReview: true,
    });

    expect(status).toBe('failed_exhausted');
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
    masteryScore: number | null;
    qualityRating: number | null;
    exchangeHistory: unknown[];
  }>,
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
  findManyResult = [] as ReturnType<typeof mockAssessmentRow>[],
  insertReturning = [] as ReturnType<typeof mockAssessmentRow>[],
  updateReturning = [mockAssessmentRow()] as ReturnType<
    typeof mockAssessmentRow
  >[],
  // ownershipMatch: what the ownership-verification select returns.
  // Defaults to [{ id: testTopicId }] so existing tests continue to pass
  // (topic is owned). Pass [] to simulate an unowned/nonexistent topic.
  ownershipMatch = [{ id: testTopicId }] as { id: string }[],
} = {}) {
  const updateReturningFn = jest.fn().mockResolvedValue(updateReturning);
  const updateWhere = jest
    .fn()
    .mockReturnValue({ returning: updateReturningFn });
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

  // Ownership check: db.select().from().innerJoin().innerJoin().where().limit()
  const ownershipChain = {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(ownershipMatch),
  };

  return {
    query: {
      assessments: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
        findMany: jest.fn().mockResolvedValue(findManyResult),
      },
    },
    select: jest.fn().mockReturnValue(ownershipChain),
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
      testTopicId,
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
      'session-1',
    );

    expect(result.sessionId).toBe('session-1');
  });

  it('includes profileId in insert values', async () => {
    const row = mockAssessmentRow();
    const db = createAssessmentMockDb({ insertReturning: [row] });

    await createAssessment(db, testProfileId, testSubjectId, testTopicId);

    const insertCall = (db.insert as jest.Mock).mock.results[0]!.value;
    const valuesCall = insertCall.values as jest.Mock;
    const insertedValues = valuesCall.mock.calls[0]![0];
    expect(insertedValues.profileId).toBe(testProfileId);
  });

  it('converts dates to ISO strings', async () => {
    const row = mockAssessmentRow();
    const db = createAssessmentMockDb({ insertReturning: [row] });

    const result = await createAssessment(
      db,
      testProfileId,
      testSubjectId,
      testTopicId,
    );

    expect(result.createdAt).toBe('2025-01-15T10:00:00.000Z');
    expect(result.updatedAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('[BUG-460 / P2 BREAK] throws NotFoundError and does NOT insert when topic is not owned by profileId', async () => {
    // Break test: BEFORE the fix, createAssessment called db.insert directly
    // with subjectId/topicId from URL params — no ownership check. An attacker
    // could POST /subjects/:victimSubject/topics/:victimTopic/assessments with
    // their own auth token and create assessment rows tagged with victim's IDs.
    // With the fix, the ownership-verification select returns [] (no match) and
    // createAssessment must throw NotFoundError before touching db.insert.
    const row = mockAssessmentRow();
    // ownershipMatch: [] simulates foreign/nonexistent topic (no ownership match)
    const db = createAssessmentMockDb({
      insertReturning: [row],
      ownershipMatch: [],
    });

    await expect(
      createAssessment(
        db,
        testProfileId,
        'attacker-subject-id',
        'victim-topic-id',
      ),
    ).rejects.toThrow(NotFoundError);

    // Insert must never be called — no row written for unowned topic.
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('[BUG-460 / P2] succeeds when topic is owned by profileId', async () => {
    const row = mockAssessmentRow();
    // ownershipMatch: [{ id: testTopicId }] — owned (default)
    const db = createAssessmentMockDb({ insertReturning: [row] });

    const result = await createAssessment(
      db,
      testProfileId,
      testSubjectId,
      testTopicId,
    );

    expect(result.id).toBe(testAssessmentId);
    expect(db.insert).toHaveBeenCalledTimes(1);
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

  it('returns masteryScore as number from the row (BUG-641 [P-1])', async () => {
    // BUG-641: masteryScore is now declared as `number` end-to-end via
    // numericAsNumber customType — the driver does the string→number
    // conversion at column read time, not the service layer.
    const row = mockAssessmentRow({ masteryScore: 0.75 });
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

describe('getActiveAssessmentForTopic', () => {
  it('returns the newest in-progress assessment for a topic', async () => {
    const older = mockAssessmentRow({
      id: 'assessment-older',
      exchangeHistory: [{ role: 'user', content: 'ciao' }],
    });
    const newer = {
      ...mockAssessmentRow({
        id: 'assessment-newer',
        exchangeHistory: [{ role: 'user', content: 'buongiorno' }],
      }),
      updatedAt: new Date('2025-01-15T11:00:00.000Z'),
    };
    const db = createAssessmentMockDb({
      findManyResult: [older, newer],
    });

    const result = await getActiveAssessmentForTopic(
      db,
      testProfileId,
      testSubjectId,
      testTopicId,
    );

    expect(result?.id).toBe('assessment-newer');
    expect(result?.exchangeHistory).toEqual([
      { role: 'user', content: 'buongiorno' },
    ]);
  });

  it('returns null when no in-progress topic assessment exists', async () => {
    const db = createAssessmentMockDb({ findManyResult: [] });

    const result = await getActiveAssessmentForTopic(
      db,
      testProfileId,
      testSubjectId,
      testTopicId,
    );

    expect(result).toBeNull();
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

    const updateCall = (db.update as jest.Mock).mock.results[0]!.value;
    const setCall = updateCall.set as jest.Mock;
    const setValues = setCall.mock.calls[0]![0];
    expect(setValues.verificationDepth).toBe('explain');
    expect(setValues).toHaveProperty('updatedAt');
    expect(setValues).not.toHaveProperty('status');
    expect(setValues).not.toHaveProperty('masteryScore');
  });

  it('passes masteryScore as number to update (BUG-641 [P-1])', async () => {
    // BUG-641: numericAsNumber customType handles number→string conversion
    // at the driver, so the service no longer needs `String(score)`.
    const db = createAssessmentMockDb();

    await updateAssessment(db, testProfileId, testAssessmentId, {
      masteryScore: 0.65,
    });

    const updateCall = (db.update as jest.Mock).mock.results[0]!.value;
    const setCall = updateCall.set as jest.Mock;
    const setValues = setCall.mock.calls[0]![0];
    expect(setValues.masteryScore).toBe(0.65);
  });
});

describe('recordAssessmentCompletionActivity', () => {
  it('records assessment score without awarding undefined assessment XP', async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const onConflictDoNothing = jest.fn().mockReturnValue({ returning });
    const values = jest.fn().mockReturnValue({ onConflictDoNothing });
    const db = {
      insert: jest.fn().mockReturnValue({ values }),
    } as unknown as Database;
    const assessment: AssessmentRecord = {
      id: testAssessmentId,
      profileId: testProfileId,
      subjectId: testSubjectId,
      topicId: testTopicId,
      sessionId: null,
      verificationDepth: 'transfer',
      status: 'passed',
      masteryScore: 0.92,
      qualityRating: 5,
      exchangeHistory: [],
      createdAt: '2025-01-15T10:00:00.000Z',
      updatedAt: '2025-01-15T10:30:00.000Z',
    };
    const evaluation: AssessmentEvaluation = {
      feedback: 'Strong transfer answer.',
      passed: true,
      shouldEscalateDepth: false,
      masteryScore: 0.92,
      qualityRating: 5,
    };

    await recordAssessmentCompletionActivity(
      db,
      testProfileId,
      assessment,
      'passed',
      evaluation,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'assessment',
        activitySubtype: 'passed',
        pointsEarned: 0,
        score: 92,
        total: 100,
      }),
    );
  });
});
