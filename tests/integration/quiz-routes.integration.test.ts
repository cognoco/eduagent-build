import { eq } from 'drizzle-orm';
import { quizRounds, vocabulary } from '@eduagent/database';
import { ERROR_CODES } from '@eduagent/schemas';
import { app } from '../../apps/api/src/index';
import { QUIZ_CONFIG } from '../../apps/api/src/services/quiz/config';
import {
  _resetCircuits,
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
});
