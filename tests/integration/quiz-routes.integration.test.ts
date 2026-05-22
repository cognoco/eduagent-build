import { eq } from 'drizzle-orm';
import { quizMasteryItems, quizRounds, vocabulary } from '@eduagent/database';
import { ERROR_CODES, type QuizQuestion } from '@eduagent/schemas';
import { app } from '../../apps/api/src/index';
import { QUIZ_CONFIG } from '../../apps/api/src/services/quiz/config';
import {
  _resetCircuits,
  CircuitOpenError,
  createMockProvider,
  registerProvider,
} from '../../apps/api/src/services/llm';
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

describe('Integration: quiz scoring integrity', () => {
  async function startCapitalsRound(profileId: string): Promise<{
    headers: HeadersInit;
    roundId: string;
    questions: QuizQuestion[];
  }> {
    const headers = buildAuthHeaders(
      { sub: QUIZ_AUTH_USER_ID, email: QUIZ_AUTH_EMAIL },
      profileId,
    );
    const startRes = await app.request(
      '/v1/quiz/rounds',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ activityType: 'capitals' }),
      },
      TEST_ENV,
    );
    expect(startRes.status).toBe(200);
    const started = (await startRes.json()) as { id: string };

    const db = createIntegrationDb();
    const activeRound = await db.query.quizRounds.findFirst({
      where: eq(quizRounds.id, started.id),
    });
    expect(activeRound).toBeDefined();
    return {
      headers,
      roundId: started.id,
      questions: activeRound!.questions as QuizQuestion[],
    };
  }

  it('[BREAK/WI-163] records wrong checks and ignores forged completion results after answer reveal', async () => {
    const profileId = await createQuizProfile();
    const { headers, roundId, questions } = await startCapitalsRound(profileId);
    const firstQuestion = questions[0]!;
    if (firstQuestion.type !== 'capitals') {
      throw new Error('Expected capitals fixture question');
    }
    const wrongAnswer = firstQuestion.distractors[0]!;

    const checkRes = await app.request(
      `/v1/quiz/rounds/${roundId}/check`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          questionIndex: 0,
          answerGiven: wrongAnswer,
          answerMode: 'multiple_choice',
        }),
      },
      TEST_ENV,
    );
    expect(checkRes.status).toBe(200);
    expect(await checkRes.json()).toMatchObject({
      correct: false,
      correctAnswer: firstQuestion.correctAnswer,
    });

    const db = createIntegrationDb();
    const afterCheck = await db.query.quizRounds.findFirst({
      where: eq(quizRounds.id, roundId),
    });
    expect(afterCheck!.results).toEqual([
      expect.objectContaining({
        questionIndex: 0,
        correct: false,
        answerGiven: wrongAnswer,
        answerMode: 'multiple_choice',
      }),
    ]);

    const completeRes = await app.request(
      `/v1/quiz/rounds/${roundId}/complete`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          results: [
            {
              questionIndex: 0,
              correct: true,
              answerGiven: firstQuestion.correctAnswer,
              timeMs: 1,
              answerMode: 'multiple_choice',
            },
          ],
        }),
      },
      TEST_ENV,
    );
    expect(completeRes.status).toBe(200);
    const completed = await completeRes.json();
    expect(completed.score).toBe(0);
    expect(completed.xpEarned).toBe(0);
    expect(completed.questionResults).toEqual([
      expect.objectContaining({
        questionIndex: 0,
        correct: false,
        answerGiven: wrongAnswer,
        correctAnswer: firstQuestion.correctAnswer,
      }),
    ]);

    const storedCompletedRound = await db.query.quizRounds.findFirst({
      where: eq(quizRounds.id, roundId),
    });
    expect(storedCompletedRound).toMatchObject({
      status: 'completed',
      score: 0,
      xpEarned: 0,
    });
    const masteryRows = await db.query.quizMasteryItems.findMany({
      where: eq(quizMasteryItems.profileId, profileId),
    });
    expect(masteryRows).toHaveLength(0);
  });

  it('[BREAK/WI-89] keeps the first check result when the same question is checked repeatedly', async () => {
    const profileId = await createQuizProfile();
    const { headers, roundId, questions } = await startCapitalsRound(profileId);
    const firstQuestion = questions[0]!;
    if (firstQuestion.type !== 'capitals') {
      throw new Error('Expected capitals fixture question');
    }
    const wrongAnswer = firstQuestion.distractors[0]!;

    const firstCheck = await app.request(
      `/v1/quiz/rounds/${roundId}/check`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          questionIndex: 0,
          answerGiven: wrongAnswer,
          answerMode: 'multiple_choice',
        }),
      },
      TEST_ENV,
    );
    expect(firstCheck.status).toBe(200);

    const secondCheck = await app.request(
      `/v1/quiz/rounds/${roundId}/check`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          questionIndex: 0,
          answerGiven: firstQuestion.correctAnswer,
          answerMode: 'multiple_choice',
        }),
      },
      TEST_ENV,
    );
    expect(secondCheck.status).toBe(200);

    const db = createIntegrationDb();
    const storedRound = await db.query.quizRounds.findFirst({
      where: eq(quizRounds.id, roundId),
    });
    expect(storedRound!.results).toEqual([
      expect.objectContaining({
        questionIndex: 0,
        correct: false,
        answerGiven: wrongAnswer,
      }),
    ]);
  });

  it('[BREAK/WI-89] preserves concurrent checks without lost JSONB updates', async () => {
    const profileId = await createQuizProfile();
    const { headers, roundId, questions } = await startCapitalsRound(profileId);
    const firstQuestion = questions[0]!;
    const secondQuestion = questions[1]!;
    if (
      firstQuestion.type !== 'capitals' ||
      secondQuestion?.type !== 'capitals'
    ) {
      throw new Error('Expected capitals fixture questions');
    }

    const [firstCheck, secondCheck] = await Promise.all([
      app.request(
        `/v1/quiz/rounds/${roundId}/check`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            questionIndex: 0,
            answerGiven: firstQuestion.distractors[0]!,
            answerMode: 'multiple_choice',
          }),
        },
        TEST_ENV,
      ),
      app.request(
        `/v1/quiz/rounds/${roundId}/check`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            questionIndex: 1,
            answerGiven: secondQuestion.distractors[0]!,
            answerMode: 'multiple_choice',
          }),
        },
        TEST_ENV,
      ),
    ]);
    expect(firstCheck.status).toBe(200);
    expect(secondCheck.status).toBe(200);

    const db = createIntegrationDb();
    const storedRound = await db.query.quizRounds.findFirst({
      where: eq(quizRounds.id, roundId),
    });
    expect(storedRound!.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionIndex: 0 }),
        expect.objectContaining({ questionIndex: 1 }),
      ]),
    );
    expect(storedRound!.results).toHaveLength(2);
  });

  it('[BREAK/WI-163] leaves another profile round unchanged when check uses a non-owner profileId', async () => {
    const ownerProfileId = await createQuizProfile();
    const { roundId, questions } = await startCapitalsRound(ownerProfileId);
    const attackerProfileId = await createQuizProfile();
    const attackerHeaders = buildAuthHeaders(
      { sub: QUIZ_AUTH_USER_ID, email: QUIZ_AUTH_EMAIL },
      attackerProfileId,
    );
    const firstQuestion = questions[0]!;
    if (firstQuestion.type !== 'capitals') {
      throw new Error('Expected capitals fixture question');
    }

    const checkRes = await app.request(
      `/v1/quiz/rounds/${roundId}/check`,
      {
        method: 'POST',
        headers: attackerHeaders,
        body: JSON.stringify({
          questionIndex: 0,
          answerGiven: firstQuestion.correctAnswer,
          answerMode: 'multiple_choice',
        }),
      },
      TEST_ENV,
    );
    expect(checkRes.status).toBe(404);

    const db = createIntegrationDb();
    const storedRound = await db.query.quizRounds.findFirst({
      where: eq(quizRounds.id, roundId),
    });
    expect(storedRound).toMatchObject({
      profileId: ownerProfileId,
      results: [],
      status: 'active',
    });
  });
});
