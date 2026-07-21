import {
  registerProvider,
  setLlmRoutingV2Enabled,
  _clearProviders,
  _resetCircuits,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
  type StopReason,
} from './llm';
import { createMockProvider, getModelConfigForTest } from './llm/test-utils';
// [WI-2433] GRADER_MODEL is the anthropic judge-grader occupant. It is a
// production constant (not a barrel export); router.test.ts imports it the same
// way to assert the resolved judge config.
import { GRADER_MODEL } from './llm/router';
import { makeChatStreamResult } from './llm/types';
import {
  generateQuickCheck,
  evaluateAssessmentAnswer,
  evaluateQuickCheckAnswer,
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
// [BUG-391] parseAssessmentExchangeHistory used via mapAssessmentRow — imported
// here to confirm the schema-level parser integrates with the service mapper.
import { parseAssessmentExchangeHistory } from '@eduagent/schemas';

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

/**
 * Creates a mock provider that returns specific JSON for assessment evaluation.
 * [WI-2433] Registered under 'anthropic' because evaluateAssessmentAnswer /
 * evaluateQuickCheckAnswer now route on capability:'judge', which resolves to
 * the vendor-independent grader (anthropic + GRADER_MODEL) — never the tutor's
 * text provider (gemini). See the judge-routing describe block below.
 */
function createAssessmentEvalMockProvider(evaluation: {
  feedback: string;
  passed: boolean;
  shouldEscalateDepth: boolean;
  rawScore: number;
  qualityRating: number;
}): LLMProvider {
  return {
    id: 'anthropic',
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

function createRawAssessmentEvalMockProvider(
  evaluation: Record<string, unknown>,
): LLMProvider {
  // [WI-2433] 'anthropic' — the judge grader the eval calls now resolve to.
  return {
    id: 'anthropic',
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

  // ---------------------------------------------------------------------
  // [WI-136] Terminal-state replay guard. Submitting an answer against an
  // already-terminal assessment must throw ConflictError before the LLM
  // call so the metering middleware refunds the decrement and quota is
  // never burned on replay.
  // ---------------------------------------------------------------------

  it.each(['passed', 'failed', 'borderline', 'failed_exhausted'] as const)(
    '[WI-136] rejects answer submission for terminal status "%s" without calling LLM',
    async (terminalStatus) => {
      const llmSpy = jest.fn();
      registerProvider({
        id: 'gemini',
        async chat(...args) {
          llmSpy(...args);
          return {
            content: JSON.stringify({
              feedback: 'should not be called',
              passed: true,
              shouldEscalateDepth: false,
              rawScore: 0.5,
              qualityRating: 3,
            }),
            stopReason: 'stop' as StopReason,
          };
        },
        chatStream() {
          const s = (async function* () {
            yield '';
          })();
          return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
        },
      });

      await expect(
        evaluateAssessmentAnswer(
          assessmentContext,
          'I think variables store data.',
          { assessmentStatus: terminalStatus },
        ),
      ).rejects.toThrow(/terminal state/);

      expect(llmSpy).not.toHaveBeenCalled();
    },
  );

  it('[WI-136] proceeds normally when assessmentStatus is in_progress', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'OK',
        passed: false,
        shouldEscalateDepth: false,
        rawScore: 0.4,
        qualityRating: 3,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'variables store data',
      { assessmentStatus: 'in_progress' },
    );
    expect(result.feedback).toBe('OK');
  });

  it('[WI-136] proceeds normally when no assessmentStatus option is provided (back-compat)', async () => {
    registerProvider(
      createAssessmentEvalMockProvider({
        feedback: 'OK',
        passed: false,
        shouldEscalateDepth: false,
        rawScore: 0.4,
        qualityRating: 3,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'variables store data',
    );
    expect(result.feedback).toBe('OK');
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
      id: 'anthropic', // [WI-2433] judge grader
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
      id: 'anthropic', // [WI-2433] judge grader
      async chat() {
        return {
          content:
            'Here is my evaluation:\n' +
            JSON.stringify({
              feedback: 'Solid recall of the key concepts.',
              passed: false,
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
      id: 'anthropic', // [WI-2433] judge grader
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
      id: 'anthropic', // [WI-2433] judge grader
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

  it('[WI-372] rejects session-envelope-shaped output for discrete assessment evaluation', async () => {
    const envelopeProvider: LLMProvider = {
      id: 'anthropic', // [WI-2433] judge grader
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
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
    expect(result.masteryScore).toBe(0);
  });

  it('[WI-372] rejects stringified llm pass boolean', async () => {
    registerProvider(
      createRawAssessmentEvalMockProvider({
        feedback: 'Looks passing.',
        passed: 'false',
        shouldEscalateDepth: false,
        rawScore: 0.9,
        qualityRating: 4,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Variables store values.',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
    expect(result.masteryScore).toBe(0);
  });

  it('[WI-372] rejects stringified escalation boolean', async () => {
    registerProvider(
      createRawAssessmentEvalMockProvider({
        feedback: 'Good recall.',
        passed: true,
        shouldEscalateDepth: 'false',
        rawScore: 0.9,
        qualityRating: 4,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'Variables store values.',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.shouldEscalateDepth).toBe(false);
    expect(result.nextDepth).toBeUndefined();
  });

  it('[WI-372] falls back when numeric scores are malformed strings', async () => {
    registerProvider(
      createRawAssessmentEvalMockProvider({
        feedback: 'Looks passing.',
        passed: true,
        shouldEscalateDepth: false,
        rawScore: 'abc',
        qualityRating: 'four',
      }),
    );

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Variables store values.',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
    expect(result.masteryScore).toBe(0);
    expect(result.qualityRating).toBe(0);
  });

  it('[WI-372] falls back closed when high-score output has no learner feedback', async () => {
    registerProvider(
      createRawAssessmentEvalMockProvider({
        passed: true,
        shouldEscalateDepth: true,
        rawScore: 0.95,
        qualityRating: 5,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'Variables store values.',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
    expect(result.shouldEscalateDepth).toBe(false);
    expect(result.nextDepth).toBeUndefined();
    expect(result.masteryScore).toBe(0);
  });

  it('[WI-372] falls back closed when high-score output omits state booleans', async () => {
    registerProvider(
      createRawAssessmentEvalMockProvider({
        feedback: 'Good recall.',
        rawScore: 0.95,
        qualityRating: 5,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'Variables store values.',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
    expect(result.shouldEscalateDepth).toBe(false);
    expect(result.nextDepth).toBeUndefined();
    expect(result.masteryScore).toBe(0);
  });

  it('[WI-372] falls back closed when quality rating is decimal', async () => {
    registerProvider(
      createRawAssessmentEvalMockProvider({
        feedback: 'Looks passing.',
        passed: true,
        shouldEscalateDepth: false,
        rawScore: 0.9,
        qualityRating: 4.5,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Variables store values.',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
    expect(result.masteryScore).toBe(0);
    expect(result.qualityRating).toBe(0);
  });

  it('[WI-372] falls back closed when pass state contradicts raw score', async () => {
    registerProvider(
      createRawAssessmentEvalMockProvider({
        feedback: 'Good recall.',
        passed: false,
        shouldEscalateDepth: false,
        rawScore: 0.95,
        qualityRating: 5,
      }),
    );

    const result = await evaluateAssessmentAnswer(
      { ...assessmentContext, currentDepth: 'recall' },
      'Variables store values.',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.passed).toBe(false);
    expect(result.shouldEscalateDepth).toBe(false);
    expect(result.nextDepth).toBeUndefined();
    expect(result.masteryScore).toBe(0);
  });

  it('[WI-372] falls back when weak areas exceed the response contract', async () => {
    registerProvider(
      createRawAssessmentEvalMockProvider({
        feedback: 'Needs another pass.',
        passed: false,
        shouldEscalateDepth: false,
        rawScore: 0.4,
        qualityRating: 2,
        weakAreas: ['x'.repeat(121)],
      }),
    );

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'Variables store values.',
    );

    expect(result.feedback).toBe(
      "We couldn't evaluate your answer right now — please try again.",
    );
    expect(result.weakAreas).toBeUndefined();
    expect(result.passed).toBe(false);
    expect(result.masteryScore).toBe(0);
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
// resolveAssessmentStatus — deterministic decision logic (Tracks 16/17)
// ---------------------------------------------------------------------------
// These tests replace Maestro flows 16 (borderline result card) and 17
// (failed_exhausted result card), which cannot be driven deterministically via
// E2E because terminalResult is set only from the live submitAnswer LLM
// response. The server decision logic is the correct coverage boundary.
//
// The E2E entry-button tap
// (assessment-gap-fill / assessment-start-session → session screen) remains
// uncovered by design: it requires a flaky live LLM grade to reach a terminal
// state, and the decision under test is purely the server-side status resolver.
// ---------------------------------------------------------------------------

const baseEval: AssessmentEvaluation = {
  feedback: 'Good effort.',
  passed: false,
  shouldEscalateDepth: false,
  masteryScore: 0.3,
  qualityRating: 2,
};

describe('resolveAssessmentStatus — terminal and non-terminal states', () => {
  it('returns "passed" when evaluation.passed is true and cap is not reached', () => {
    const status = resolveAssessmentStatus({
      evaluation: { ...baseEval, passed: true, masteryScore: 0.9 },
      answerCount: 1,
      forceReview: false,
    });
    expect(status).toBe('passed');
  });

  it('returns "in_progress" when not passed, no escalation, and cap not reached', () => {
    const status = resolveAssessmentStatus({
      evaluation: { ...baseEval, passed: false, masteryScore: 0.3 },
      answerCount: 1,
      forceReview: false,
    });
    expect(status).toBe('in_progress');
  });

  it('returns "borderline" when masteryScore >= 0.6 and cap reached without escalation', () => {
    // capReached (answerCount >= MAX_ASSESSMENT_EXCHANGES=4) AND passed=false
    // AND masteryScore >= 0.6 AND !shouldEscalateDepth → borderline
    const status = resolveAssessmentStatus({
      evaluation: {
        ...baseEval,
        passed: false,
        shouldEscalateDepth: false,
        masteryScore: 0.65,
      },
      answerCount: 4, // MAX_ASSESSMENT_EXCHANGES
      forceReview: false,
    });
    expect(status).toBe('borderline');
  });

  it('returns "borderline" when masteryScore >= 0.6 and no escalation path (no nextDepth)', () => {
    // Not at cap, but !shouldEscalateDepth AND masteryScore >= 0.6 → borderline
    const status = resolveAssessmentStatus({
      evaluation: {
        ...baseEval,
        passed: false,
        shouldEscalateDepth: false,
        masteryScore: 0.7,
      },
      answerCount: 2,
      forceReview: false,
    });
    expect(status).toBe('borderline');
  });

  it('does NOT return "borderline" when masteryScore is below 0.6 (failed_exhausted at cap)', () => {
    // masteryScore < 0.6 at cap → skips borderline → failed_exhausted
    const status = resolveAssessmentStatus({
      evaluation: {
        ...baseEval,
        passed: false,
        shouldEscalateDepth: false,
        masteryScore: 0.4,
      },
      answerCount: 4,
      forceReview: false,
    });
    expect(status).toBe('failed_exhausted');
  });

  it('returns "failed_exhausted" when forceReview is true regardless of other inputs', () => {
    const status = resolveAssessmentStatus({
      evaluation: {
        ...baseEval,
        passed: true,
        masteryScore: 1.0,
      },
      answerCount: 1,
      forceReview: true,
    });
    expect(status).toBe('failed_exhausted');
  });

  it('returns "failed_exhausted" when cap is reached with masteryScore below 0.6', () => {
    const status = resolveAssessmentStatus({
      evaluation: {
        ...baseEval,
        passed: false,
        shouldEscalateDepth: false,
        masteryScore: 0.2,
      },
      answerCount: 4,
      forceReview: false,
    });
    expect(status).toBe('failed_exhausted');
  });

  it('returns "in_progress" when passed and shouldEscalateDepth and cap not reached', () => {
    const status = resolveAssessmentStatus({
      evaluation: {
        ...baseEval,
        passed: true,
        shouldEscalateDepth: true,
        nextDepth: 'explain',
        masteryScore: 0.5,
      },
      answerCount: 1,
      forceReview: false,
    });
    expect(status).toBe('in_progress');
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

// ---------------------------------------------------------------------------
// [BUG-391] mapAssessmentRow — parseAssessmentExchangeHistory integration
// ---------------------------------------------------------------------------
// mapAssessmentRow is private so we exercise it via createAssessment /
// getAssessment which both call it internally.
describe('mapAssessmentRow — parseAssessmentExchangeHistory integration [BUG-391]', () => {
  it('degrades to empty array when DB returns corrupted exchangeHistory', async () => {
    // Simulates a row where exchange_history contains data that fails the
    // ChatExchange schema (e.g. role: 'system' is not in the enum).
    const corruptedRow = mockAssessmentRow({
      exchangeHistory: [{ role: 'system', content: 'injected' }],
    });
    const db = createAssessmentMockDb({ insertReturning: [corruptedRow] });

    const result = await createAssessment(
      db,
      testProfileId,
      testSubjectId,
      testTopicId,
    );

    // parseAssessmentExchangeHistory returns [] on parse failure — the
    // assessment degrades to empty-history state rather than crashing.
    expect(result.exchangeHistory).toEqual([]);
  });

  it('returns typed ChatExchange array for a well-formed neon-serverless row', async () => {
    // Simulates the real neon-serverless shape: JSONB column is already
    // parsed to plain JS objects by the driver before reaching Drizzle.
    const validRow = mockAssessmentRow({
      exchangeHistory: [
        { role: 'assistant', content: 'What is a variable?' },
        { role: 'user', content: 'A named storage location.' },
      ],
    });
    const db = createAssessmentMockDb({ insertReturning: [validRow] });

    const result = await createAssessment(
      db,
      testProfileId,
      testSubjectId,
      testTopicId,
    );

    expect(result.exchangeHistory).toHaveLength(2);
    expect(result.exchangeHistory[0]!.role).toBe('assistant');
    expect(result.exchangeHistory[1]!.role).toBe('user');
  });

  it('parseAssessmentExchangeHistory parser itself returns [] for null (direct unit test)', () => {
    expect(parseAssessmentExchangeHistory(null)).toEqual([]);
  });

  it('parseAssessmentExchangeHistory parser returns [] for corrupt data', () => {
    expect(parseAssessmentExchangeHistory({ role: 'user' })).toEqual([]);
  });

  it('parseAssessmentExchangeHistory parser returns typed array for valid data', () => {
    const result = parseAssessmentExchangeHistory([
      { role: 'user', content: 'Hello' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// [WI-2432] ageBracket threads to the router's under-18 vendor-exclusion gate.
//
// Before this fix, none of generateQuickCheck / evaluateAssessmentAnswer /
// evaluateQuickCheckAnswer supplied ageBracket to routeAndCall, so the
// router's under-18 Gemini/Vertex exclusion (isUnder18AgeBracket, router.ts)
// could never fire for these calls on the legacy (routing V2 off) path — a
// registered Gemini provider would silently serve a minor. These tests force
// the legacy path and an under-18 ageBracket, then assert the Gemini
// provider is never invoked (using the REAL router — registerProvider +
// setLlmRoutingV2Enabled(false) — this file does not mock ./llm).
// ---------------------------------------------------------------------------
describe('[WI-2432] ageBracket threads to vendor-exclusion (legacy path)', () => {
  let geminiSpy: jest.Mock;

  function approvedQuickCheckProvider(
    id: string,
    questions: string[],
  ): LLMProvider {
    return {
      id,
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

  /**
   * [WI-2432] Mock provider whose chat() fails `failCount` times then
   * succeeds — same pattern as router.test.ts's local
   * `createTransientFailProvider` (not exported from providers/mock, so
   * re-declared per file). Used to force the primary provider past
   * MAX_RETRIES(3) (4 attempts) so routeAndCall actually reaches
   * getFallbackConfig (router.ts:1064), not just getModelConfig
   * (router.ts:908) — the two sites have independent isUnder18AgeBracket
   * gates, so a test that only exercises the primary path would not prove
   * ageBracket also reaches the fallback call.
   */
  function createTransientFailProvider(
    id: string,
    failCount: number,
    successContent: string,
  ): LLMProvider & { callCount: number } {
    let calls = 0;
    return {
      id,
      async chat(): Promise<{ content: string; stopReason: StopReason }> {
        calls++;
        if (calls <= failCount) {
          throw new Error(
            `[WI-2432 test] simulated transient failure #${calls}`,
          );
        }
        return { content: successContent, stopReason: 'stop' };
      },
      get callCount() {
        return calls;
      },
      chatStream() {
        const s = (async function* () {
          yield 'unused';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    };
  }

  function approvedEvalProvider(
    id: string,
    evaluation: {
      feedback: string;
      passed: boolean;
      shouldEscalateDepth: boolean;
      rawScore: number;
      qualityRating: number;
    },
  ): LLMProvider {
    return {
      id,
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

  beforeEach(() => {
    _clearProviders();
    _resetCircuits();
    setLlmRoutingV2Enabled(false);
    geminiSpy = jest.fn();
    registerProvider({
      id: 'gemini',
      async chat(...args: Parameters<LLMProvider['chat']>) {
        geminiSpy(...args);
        return {
          content: JSON.stringify({
            questions: ['GEMINI SHOULD NEVER SERVE AN UNDER-18 SUBJECT', 'Q2?'],
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
    });
  });

  afterEach(() => {
    _clearProviders();
    setLlmRoutingV2Enabled(false);
    registerProvider(createMockProvider('gemini'));
  });

  it.each(['child', 'adolescent'] as const)(
    'generateQuickCheck never calls Gemini for an under-18 subject (%s)',
    async (ageBracket) => {
      registerProvider(
        approvedQuickCheckProvider('cerebras', [
          'Can you explain why we use let instead of var?',
          'What happens if you try to reassign a const variable?',
        ]),
      );

      const result = await generateQuickCheck(quickCheckContext, {
        ageBracket,
      });

      expect(geminiSpy).not.toHaveBeenCalled();
      expect(result.questions.length).toBeGreaterThanOrEqual(2);
    },
  );

  // [WI-2433] evaluateAssessmentAnswer / evaluateQuickCheckAnswer now route on
  // capability:'judge'. The judge branch (router.ts getModelConfig) is evaluated
  // BEFORE the under-18 vendor gate and is age-blind + vendor-independent, so it
  // resolves to the anthropic grader (never Gemini) regardless of ageBracket.
  // The WI-2432 safety property — a minor is never served by Gemini for these
  // calls — therefore still holds, now guaranteed more strongly by the judge
  // routing rather than the under-18 text-fallback gate. The eval provider is
  // registered under 'anthropic' (the grader vendor) accordingly. generateQuickCheck
  // below is a generation call and still exercises the under-18 gate.
  it.each(['child', 'adolescent'] as const)(
    'evaluateAssessmentAnswer never calls Gemini for an under-18 subject (%s) — judge grader serves',
    async (ageBracket) => {
      registerProvider(
        approvedEvalProvider('anthropic', {
          feedback: 'Good progress.',
          passed: true,
          shouldEscalateDepth: false,
          rawScore: 0.8,
          qualityRating: 3,
        }),
      );

      const result = await evaluateAssessmentAnswer(
        assessmentContext,
        'A variable stores data.',
        { ageBracket },
      );

      expect(geminiSpy).not.toHaveBeenCalled();
      expect(result.feedback).toContain('Good progress.');
    },
  );

  it.each(['child', 'adolescent'] as const)(
    'evaluateQuickCheckAnswer never calls Gemini for an under-18 subject (%s) — judge grader serves',
    async (ageBracket) => {
      registerProvider(
        approvedEvalProvider('anthropic', {
          feedback: 'Nicely done.',
          passed: true,
          shouldEscalateDepth: false,
          rawScore: 0.8,
          qualityRating: 3,
        }),
      );

      const result = await evaluateQuickCheckAnswer(
        assessmentContext,
        'A variable stores data.',
        { ageBracket },
      );

      expect(geminiSpy).not.toHaveBeenCalled();
      expect(result.feedback).toBe('Nicely done.');
    },
  );

  it('an unambiguously adult subject is unaffected (no regression) — Gemini remains eligible', async () => {
    const result = await generateQuickCheck(quickCheckContext, {
      ageBracket: 'adult',
    });

    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(result.questions.length).toBeGreaterThanOrEqual(2);
  });

  it('forces a primary-provider failure past MAX_RETRIES, driving generateQuickCheck through getFallbackConfig — still never selects Gemini for an under-18 subject', async () => {
    const flakyCerebras = createTransientFailProvider(
      'cerebras',
      4, // 1 + MAX_RETRIES(3) — exhausts the primary's withRetry loop
      JSON.stringify({
        questions: [
          'Can you explain why we use let instead of var?',
          'What happens if you try to reassign a const variable?',
        ],
      }),
    );
    registerProvider(flakyCerebras);

    const result = await generateQuickCheck(quickCheckContext, {
      ageBracket: 'child',
    });

    expect(geminiSpy).not.toHaveBeenCalled();
    expect(result.questions.length).toBeGreaterThanOrEqual(2);
    // 4 failing primary attempts + 1 succeeding fallback attempt: proves
    // execution actually reached getFallbackConfig's isUnder18AgeBracket
    // gate (router.ts:1064), not just getModelConfig's (router.ts:908).
    expect(flakyCerebras.callCount).toBe(5);
  }, 15000);
});

// ---------------------------------------------------------------------------
// [WI-2433] Answer graders route on capability:'judge'.
//
// evaluateAssessmentAnswer and evaluateQuickCheckAnswer grade a learner's
// answer — a judge task. They pass capability:'judge' to routeAndCall, which
// resolves the vendor-independent, tier/age-blind grader (anthropic +
// GRADER_MODEL, no reasoningEffort) per MMT-ADR-0016 §2 — the same routing
// posture as the challenge-round / teach-back / suitability graders.
//
// These tests assert the RESOLVED ModelConfig is the judge path (NOT merely
// that the capability param was threaded), and that the resolution is
// age-invariant — i.e. exempt from the under-18 model restriction that makes
// the default text path age-sensitive. Uses the REAL router (this file does
// not mock ./llm).
// ---------------------------------------------------------------------------
describe("[WI-2433] answer graders resolve the capability:'judge' model config", () => {
  /**
   * Capturing anthropic grader — records the ModelConfig routeAndCall selected,
   * so the end-to-end tests assert the RESOLVED config (not just the param
   * passed in). Mirrors router.test.ts's `createCapturingProvider`.
   */
  function createCapturingAnthropicProvider(
    evaluationJson: string,
  ): LLMProvider & { lastConfig: ModelConfig | null } {
    let captured: ModelConfig | null = null;
    return {
      id: 'anthropic',
      get lastConfig() {
        return captured;
      },
      async chat(_messages: ChatMessage[], config: ModelConfig) {
        captured = config;
        return { content: evaluationJson, stopReason: 'stop' as StopReason };
      },
      chatStream() {
        const s = (async function* () {
          yield evaluationJson;
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    };
  }

  const EVAL_JSON = JSON.stringify({
    feedback: 'Good recall of the key idea.',
    passed: true,
    shouldEscalateDepth: false,
    rawScore: 0.8,
    qualityRating: 4,
  });

  beforeEach(() => {
    _clearProviders();
    _resetCircuits();
    // Legacy routing (V2 off) is production today; the judge branch behaves
    // identically under both, and resolveGraderConfig is flag-independent.
    setLlmRoutingV2Enabled(false);
  });

  afterEach(() => {
    _clearProviders();
    setLlmRoutingV2Enabled(false);
    registerProvider(createMockProvider('gemini'));
  });

  // --- AC-2 (literal acceptance criterion): the resolved judge config is
  // age-blind and is NOT the default (gemini) text config. Asserts the two
  // invariants — identical across brackets, and ≠ the default config — WITHOUT
  // hardcoding a grader vendor: the judge resolves to the anthropic GRADER_MODEL
  // normally but to openai when anthropic is the tutor vendor, so an
  // `=== 'anthropic'` assertion would be brittle/wrong. Mirrors the
  // getModelConfigForTest precedent in router.test.ts. ------------------------

  it("[AC-2] capability:'judge' resolves an age-blind config that differs from the default (gemini) config", () => {
    registerProvider(createMockProvider('gemini'));
    // Approved non-Gemini text provider so the age-SENSITIVE default path
    // resolves for a minor (Gemini-banned) instead of throwing.
    registerProvider(createMockProvider('cerebras'));

    // Rung 2 is the rung both grader call sites use.
    const judgeAdult = getModelConfigForTest(2, {
      capability: 'judge',
      ageBracket: 'adult',
    });
    const judgeChild = getModelConfigForTest(2, {
      capability: 'judge',
      ageBracket: 'child',
    });
    const judgeAdolescent = getModelConfigForTest(2, {
      capability: 'judge',
      ageBracket: 'adolescent',
    });

    // Invariant 1 — AGE-BLIND: the judge branch is evaluated BEFORE the under-18
    // gate, so a minor resolves to the IDENTICAL config as an adult.
    expect(judgeChild).toEqual(judgeAdult);
    expect(judgeAdolescent).toEqual(judgeAdult);

    // Invariant 2 — NOT the default: the judge config is not Gemini and differs
    // from the default text config a learner would otherwise get. No grader
    // vendor is hardcoded; the grader vendor depends on the tutor vendor.
    const defaultAdult = getModelConfigForTest(2, { ageBracket: 'adult' });
    expect(defaultAdult.provider).toBe('gemini'); // baseline: default IS gemini
    expect(judgeAdult.provider).not.toBe('gemini');
    expect(judgeAdult).not.toEqual(defaultAdult);

    // The default path IS age-sensitive — proving the age-blindness above is
    // meaningful, not vacuous: a minor is redirected off the banned Gemini.
    const defaultChild = getModelConfigForTest(2, { ageBracket: 'child' });
    expect(defaultChild.provider).not.toBe('gemini');
    expect(defaultChild).not.toEqual(defaultAdult);
  });

  // --- End-to-end: the actual call sites resolve to the judge grader ----------

  it('evaluateAssessmentAnswer routes to the judge grader even for a minor (child)', async () => {
    registerProvider(createMockProvider('gemini')); // tutor vendor to exclude
    const grader = createCapturingAnthropicProvider(EVAL_JSON);
    registerProvider(grader);

    const result = await evaluateAssessmentAnswer(
      assessmentContext,
      'A variable stores data.',
      { ageBracket: 'child' },
    );

    // The capturing anthropic provider served — proving the call site resolved
    // to the judge grader, not the (age-gated) text path.
    expect(grader.lastConfig).not.toBeNull();
    expect(grader.lastConfig?.provider).toBe('anthropic');
    expect(grader.lastConfig?.model).toBe(GRADER_MODEL);
    expect(grader.lastConfig?.reasoningEffort).toBeUndefined();
    expect(result.feedback).toContain('Good recall of the key idea.');
  });

  it('evaluateQuickCheckAnswer routes to the judge grader even for a minor (adolescent)', async () => {
    registerProvider(createMockProvider('gemini'));
    const grader = createCapturingAnthropicProvider(EVAL_JSON);
    registerProvider(grader);

    const result = await evaluateQuickCheckAnswer(
      assessmentContext,
      'A variable stores data.',
      { ageBracket: 'adolescent' },
    );

    expect(grader.lastConfig?.provider).toBe('anthropic');
    expect(grader.lastConfig?.model).toBe(GRADER_MODEL);
    expect(grader.lastConfig?.reasoningEffort).toBeUndefined();
    expect(result.feedback).toContain('Good recall of the key idea.');
  });
});
