import { eq } from 'drizzle-orm';
import { quizRounds, vocabulary } from '@eduagent/database';
import {
  ERROR_CODES,
  type QuizActivityType,
  type QuizQuestion,
} from '@eduagent/schemas';
import { app } from '../../apps/api/src/index';
import { QUIZ_CONFIG } from '../../apps/api/src/services/quiz/config';
import {
  _resetCircuits,
  CircuitOpenError,
  registerProvider,
} from '../../apps/api/src/services/llm';
import { createMockProvider } from '../../apps/api/src/services/llm/test-utils';
import { registerLlmProviderFixture } from '../../apps/api/src/test-utils/llm-provider-fixtures';
import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedSubject,
} from './route-fixtures';

const TEST_ENV = buildIntegrationEnv();
const QUIZ_AUTH_USER_ID = 'integration-quiz-routes-user';
const QUIZ_AUTH_EMAIL = 'integration-quiz-routes@integration.test';

async function createQuizProfile(): Promise<string> {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: {
      userId: QUIZ_AUTH_USER_ID,
      email: QUIZ_AUTH_EMAIL,
    },
    displayName: 'Quiz Integration Learner',
    birthYear: 2000,
  });
  return profile.id;
}

async function seedLanguageSubject(profileId: string): Promise<string> {
  const subject = await seedSubject(profileId, "Emma's German", {
    pedagogyMode: 'four_strands',
    languageCode: 'de',
  });
  const db = createIntegrationDb();
  await db.insert(vocabulary).values(
    [
      ['der Hund', 'dog'],
      ['die Katze', 'cat'],
      ['der Vogel', 'bird'],
      ['der Fisch', 'fish'],
    ].map(([term, translation]) => ({
      profileId,
      subjectId: subject.id,
      term: term!,
      termNormalized: term!.toLowerCase(),
      translation: translation!,
      type: 'word' as const,
      cefrLevel: 'A1' as const,
    })),
  );
  return subject.id;
}

function restoreDefaultLlmProvider() {
  _resetCircuits();
  registerProvider(createMockProvider('gemini'));
}

beforeEach(async () => {
  _resetCircuits();
  await cleanupAccounts({
    emails: [QUIZ_AUTH_EMAIL],
    clerkUserIds: [QUIZ_AUTH_USER_ID],
  });
  restoreDefaultLlmProvider();
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [QUIZ_AUTH_EMAIL],
    clerkUserIds: [QUIZ_AUTH_USER_ID],
  });
  restoreDefaultLlmProvider();
});

describe('Integration: POST /v1/quiz/rounds', () => {
  it('generates capitals from reference data without calling the LLM [J10 release blocker]', async () => {
    const profileId = await createQuizProfile();
    const llmFixture = registerLlmProviderFixture({
      id: 'gemini',
      chatError: new Error('capitals route must not call the LLM'),
    });

    try {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: QUIZ_AUTH_USER_ID, email: QUIZ_AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        activityType: 'capitals',
        total: QUIZ_CONFIG.perActivity.capitals.roundSize,
      });
      expect(body.questions).toHaveLength(
        QUIZ_CONFIG.perActivity.capitals.roundSize,
      );
      expect(body.questions[0].type).toBe('capitals');
      expect(Array.isArray(body.questions[0].options)).toBe(true);
      expect(body.questions[0].correctAnswer).toBeUndefined();
      expect(body.questions[0].acceptedAliases).toBeUndefined();
      expect(llmFixture.chatCalls).toHaveLength(0);

      const db = createIntegrationDb();
      const storedRound = await db.query.quizRounds.findFirst({
        where: eq(quizRounds.id, body.id),
      });
      expect(storedRound).toMatchObject({
        id: body.id,
        profileId,
        activityType: 'capitals',
        total: QUIZ_CONFIG.perActivity.capitals.roundSize,
        status: 'active',
      });
    } finally {
      llmFixture.dispose();
      restoreDefaultLlmProvider();
    }
  });

  it('returns 502 UPSTREAM_ERROR when an LLM-backed quiz returns invalid structured output [BUG-990]', async () => {
    const profileId = await createQuizProfile();
    const subjectId = await seedLanguageSubject(profileId);
    const llmFixture = registerLlmProviderFixture({
      id: 'gemini',
      chatResponse: '{"theme": "unfinished"',
    });

    try {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: QUIZ_AUTH_USER_ID, email: QUIZ_AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({
            activityType: 'vocabulary',
            subjectId,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({
        code: ERROR_CODES.UPSTREAM_ERROR,
      });
      expect(llmFixture.chatCalls).toHaveLength(1);
    } finally {
      llmFixture.dispose();
      restoreDefaultLlmProvider();
    }
  });

  it('returns 502 UPSTREAM_ERROR when an LLM-backed quiz request aborts [BUG-990]', async () => {
    const profileId = await createQuizProfile();
    const subjectId = await seedLanguageSubject(profileId);
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const llmFixture = registerLlmProviderFixture({
      id: 'gemini',
      chatError: abortError,
    });

    try {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: QUIZ_AUTH_USER_ID, email: QUIZ_AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({
            activityType: 'vocabulary',
            subjectId,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({
        code: ERROR_CODES.UPSTREAM_ERROR,
      });
      expect(llmFixture.chatCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      llmFixture.dispose();
      restoreDefaultLlmProvider();
    }
  });

  it('returns 502 UPSTREAM_ERROR when an LLM-backed quiz circuit is open [BUG-990]', async () => {
    const profileId = await createQuizProfile();
    const subjectId = await seedLanguageSubject(profileId);
    const llmFixture = registerLlmProviderFixture({
      id: 'gemini',
      chatError: new CircuitOpenError('gemini'),
    });

    try {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: QUIZ_AUTH_USER_ID, email: QUIZ_AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({
            activityType: 'vocabulary',
            subjectId,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({
        code: ERROR_CODES.UPSTREAM_ERROR,
      });
      expect(llmFixture.chatCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      llmFixture.dispose();
      restoreDefaultLlmProvider();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// [WI-89] Score-integrity end-to-end coverage.
//
// The scoring rules (first-attempt-wins, server-side correctness, final-attempt
// filtering for guess_who, single-winner completion) are unit-tested against a
// mocked DB in complete-round.test.ts and quiz.test.ts. These tests exercise the
// same guarantees against a REAL database — covering the atomic JSONB append and
// the `status = 'active'` compare-and-swap that a mocked DB cannot validate.
// ───────────────────────────────────────────────────────────────────────────

const CAPITALS_QUESTION: QuizQuestion = {
  type: 'capitals',
  country: 'France',
  correctAnswer: 'Paris',
  acceptedAliases: ['Paris'],
  distractors: ['Berlin', 'Madrid', 'Rome'],
  funFact: 'Paris is the capital of France.',
  isLibraryItem: false,
};

const GUESS_WHO_QUESTION: QuizQuestion = {
  type: 'guess_who',
  canonicalName: 'Albert Einstein',
  correctAnswer: 'Albert Einstein',
  acceptedAliases: ['Einstein'],
  clues: [
    'This physicist was born in 1879.',
    'They developed the theory of relativity.',
    'They won the 1921 Nobel Prize in Physics.',
    'Their most famous equation relates energy and mass.',
    'They had famously unruly white hair.',
  ],
  mcFallbackOptions: [
    'Albert Einstein',
    'Isaac Newton',
    'Marie Curie',
    'Nikola Tesla',
  ],
  funFact: 'Einstein never received a Nobel Prize for relativity.',
  isLibraryItem: false,
};

function quizAuthHeaders(profileId: string): Record<string, string> {
  return buildAuthHeaders(
    { sub: QUIZ_AUTH_USER_ID, email: QUIZ_AUTH_EMAIL },
    profileId,
  );
}

async function seedActiveRound(
  profileId: string,
  activityType: QuizActivityType,
  questions: QuizQuestion[],
): Promise<string> {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(quizRounds)
    .values({
      profileId,
      activityType,
      theme: 'Integration score-integrity',
      questions,
      total: questions.length,
    })
    .returning({ id: quizRounds.id });
  return row!.id;
}

function checkAnswer(
  roundId: string,
  profileId: string,
  body: Record<string, unknown>,
) {
  return app.request(
    `/v1/quiz/rounds/${roundId}/check`,
    {
      method: 'POST',
      headers: quizAuthHeaders(profileId),
      body: JSON.stringify(body),
    },
    TEST_ENV,
  );
}

function completeRound(
  roundId: string,
  profileId: string,
  results: Record<string, unknown>[],
) {
  return app.request(
    `/v1/quiz/rounds/${roundId}/complete`,
    {
      method: 'POST',
      headers: quizAuthHeaders(profileId),
      body: JSON.stringify({ results }),
    },
    TEST_ENV,
  );
}

describe('Integration: quiz scoring integrity [WI-89]', () => {
  it('[BREAK/WI-163] does not retro-score a wrong capitals answer after the correct answer is revealed', async () => {
    const profileId = await createQuizProfile();
    const roundId = await seedActiveRound(profileId, 'capitals', [
      CAPITALS_QUESTION,
    ]);

    // First /check is wrong → recorded as the (final) first attempt, and the
    // correct answer is revealed as post-submission feedback.
    const wrong = await checkAnswer(roundId, profileId, {
      questionIndex: 0,
      answerGiven: 'Berlin',
      answerMode: 'multiple_choice',
    });
    expect(wrong.status).toBe(200);
    expect(await wrong.json()).toMatchObject({
      correct: false,
      correctAnswer: 'Paris',
    });

    // Knowing the answer, the attacker re-checks with the correct value...
    const retry = await checkAnswer(roundId, profileId, {
      questionIndex: 0,
      answerGiven: 'Paris',
      answerMode: 'multiple_choice',
    });
    expect(retry.status).toBe(200);

    // ...and submits a /complete body that lies about correctness.
    const res = await completeRound(roundId, profileId, [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 1000 },
    ]);
    expect(res.status).toBe(200);
    const body = await res.json();

    // First-attempt-wins + server-side correctness: the wrong first attempt is
    // authoritative and the lying /complete payload is ignored.
    expect(body.score).toBe(0);
    expect(body.xpEarned).toBe(0);
    expect(body.questionResults[0]).toMatchObject({
      questionIndex: 0,
      correct: false,
    });
  });

  it('[BREAK/WI-89] scores a guess_who round from the final probe, not the wrong intermediate guess', async () => {
    const profileId = await createQuizProfile();
    const roundId = await seedActiveRound(profileId, 'guess_who', [
      GUESS_WHO_QUESTION,
    ]);

    // Intermediate wrong probe: recorded for integrity, marked non-final, and
    // must NOT reveal the answer.
    const probe = await checkAnswer(roundId, profileId, {
      questionIndex: 0,
      answerGiven: 'Isaac Newton',
      answerMode: 'free_text',
      finalAttempt: false,
      cluesUsed: 2,
    });
    expect(probe.status).toBe(200);
    const probeBody = await probe.json();
    expect(probeBody.correct).toBe(false);
    expect(probeBody.correctAnswer).toBeUndefined();

    // Final correct guess.
    const finalGuess = await checkAnswer(roundId, profileId, {
      questionIndex: 0,
      answerGiven: 'Albert Einstein',
      answerMode: 'free_text',
      cluesUsed: 3,
    });
    expect(finalGuess.status).toBe(200);
    expect(await finalGuess.json()).toMatchObject({ correct: true });

    const res = await completeRound(roundId, profileId, [
      {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Albert Einstein',
        timeMs: 1000,
        cluesUsed: 3,
        answerMode: 'free_text',
      },
    ]);
    expect(res.status).toBe(200);
    const body = await res.json();

    // The non-final wrong probe must not block the legitimate final attempt.
    expect(body.score).toBe(1);
    expect(body.xpEarned).toBeGreaterThan(0);
    expect(body.questionResults[0]).toMatchObject({
      questionIndex: 0,
      correct: true,
    });
  });
});
