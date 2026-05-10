// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../test-utils/database-module';
import { createRouteMeteringFixture } from '../test-utils/route-metering-fixture';

const mockDb = createTransactionalMockDb();
const mockDatabaseModule = createDatabaseModuleMock({
  db: mockDb,
  includeActual: true,
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => ({
  // gc1-allow: route-level test isolates Inngest event bus to prevent side-effects
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
    createFunction: jest.fn().mockReturnValue(jest.fn()),
  },
}));

jest.mock('../services/account' /* gc1-allow: unit test boundary */, () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

jest.mock('../services/profile' /* gc1-allow: unit test boundary */, () => ({
  findOwnerProfile: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: 2014,
    location: null,
    consentStatus: 'CONSENTED',
    hasPremiumLlm: false,
  }),
}));

jest.mock('../services/streaks' /* gc1-allow: unit test boundary */, () => ({
  recordSessionActivity: jest
    .fn()
    .mockResolvedValue({ currentStreak: 1, longestStreak: 1 }),
}));

jest.mock('../services/llm' /* gc1-allow: unit test boundary */, () => {
  // [BUG-990] CircuitOpenError must be the real class so that
  // routeAndCallForQuiz's `instanceof CircuitOpenError` check works in tests.
  // Using jest.requireActual here is the canonical pattern (GC1 rule) for
  // preserving named exports that are not being stubbed.
  const actual = jest.requireActual(
    '../services/llm',
  ) as typeof import('../services/llm');
  return {
    ...actual,
    routeAndCall: jest.fn().mockResolvedValue({
      response: JSON.stringify({
        theme: 'Central European Capitals',
        questions: [
          {
            country: 'Austria',
            correctAnswer: 'Vienna',
            distractors: ['Salzburg', 'Graz', 'Innsbruck'],
            funFact: 'Vienna is famous for its coffee houses.',
          },
          {
            country: 'Germany',
            correctAnswer: 'Berlin',
            distractors: ['Munich', 'Hamburg', 'Frankfurt'],
            funFact: 'Berlin has more bridges than Venice.',
          },
          {
            country: 'Poland',
            correctAnswer: 'Warsaw',
            distractors: ['Krakow', 'Gdansk', 'Wroclaw'],
            funFact: 'Warsaw was rebuilt from rubble after WWII.',
          },
          {
            country: 'Czech Republic',
            correctAnswer: 'Prague',
            distractors: ['Brno', 'Ostrava', 'Pilsen'],
            funFact: 'Prague Castle is the largest ancient castle complex.',
          },
          {
            country: 'Hungary',
            correctAnswer: 'Budapest',
            distractors: ['Debrecen', 'Szeged', 'Pecs'],
            funFact: 'Budapest was originally two cities.',
          },
          {
            country: 'Slovakia',
            correctAnswer: 'Bratislava',
            distractors: ['Kosice', 'Zilina', 'Nitra'],
            funFact: 'Bratislava borders two countries.',
          },
          {
            country: 'Slovenia',
            correctAnswer: 'Ljubljana',
            distractors: ['Maribor', 'Celje', 'Kranj'],
            funFact: 'Ljubljana has dragon statues on its bridge.',
          },
          {
            country: 'Croatia',
            correctAnswer: 'Zagreb',
            distractors: ['Split', 'Rijeka', 'Dubrovnik'],
            funFact: 'Zagreb has one of the oldest tram networks.',
          },
        ],
      }),
      provider: 'mock',
      model: 'mock',
      latencyMs: 50,
    }),
  };
});

import { app } from '../index';
import { routeAndCall, CircuitOpenError } from '../services/llm';
import { UpstreamLlmError } from '../errors';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { inngest } from '../inngest/client';

const mockInngestSend = inngest.send as jest.Mock;

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

let meteringFixture: ReturnType<typeof createRouteMeteringFixture>;

function setInsertReturning(id = '01933b3c-0000-7000-8000-000000000999') {
  const returning = jest.fn().mockResolvedValue([{ id }]);
  const values = jest.fn().mockReturnValue({ returning });
  (mockDb as any).insert = jest.fn().mockReturnValue({ values });
}

/**
 * By default simulate the happy path: the UPDATE affects one row
 * (status: 'active' → 'completed' succeeded). Tests that exercise the
 * concurrent-race guard override this to return [] so `completeActive`
 * returns undefined and the service throws ConflictError.
 */
function setUpdateReturning(rows: Array<{ id: string }> = [{ id: 'round-1' }]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  (mockDb as any).update = jest.fn().mockReturnValue({ set });
}

const ACTIVE_ROUND = {
  id: 'a0000000-0000-4000-a000-000000000001',
  profileId: 'test-profile-id',
  activityType: 'capitals',
  theme: 'Central European Capitals',
  questions: [
    {
      type: 'capitals',
      country: 'Austria',
      correctAnswer: 'Vienna',
      acceptedAliases: ['Vienna', 'Wien'],
      distractors: ['Salzburg', 'Graz', 'Innsbruck'],
      funFact: 'Fact',
      isLibraryItem: false,
    },
    {
      type: 'capitals',
      country: 'Germany',
      correctAnswer: 'Berlin',
      acceptedAliases: ['Berlin'],
      distractors: ['Munich', 'Hamburg', 'Frankfurt'],
      funFact: 'Fact',
      isLibraryItem: false,
    },
  ],
  total: 2,
  status: 'active' as const,
};

// [F-032] Fixture for a completed round — same shape as ACTIVE_ROUND plus
// the grading fields the completed-branch reads. Mirrors what
// getRoundByIdOrThrow returns after completeQuizRound has persisted.
const COMPLETED_ROUND = {
  ...ACTIVE_ROUND,
  id: 'a0000000-0000-4000-a000-000000000002',
  status: 'completed' as const,
  score: 1,
  xpEarned: 15,
  completedAt: new Date('2026-04-18T10:00:00Z'),
  results: [
    { questionIndex: 0, correct: true, answerGiven: 'Vienna', timeMs: 3000 },
    { questionIndex: 1, correct: false, answerGiven: 'Munich', timeMs: 5000 },
  ],
};

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();
  (mockDb as any).query = {
    quizRounds: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(undefined),
    },
    subjects: {
      findFirst: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
    },
    vocabulary: {
      findFirst: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
    },
    vocabularyRetentionCards: {
      findFirst: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
    },
    quizMasteryItems: {
      findFirst: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
    },
    quizMissedItems: {
      findFirst: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  setInsertReturning();
  setUpdateReturning();
  (mockDb as any).transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockDb));
  meteringFixture = createRouteMeteringFixture(mockDb, {
    accountId: 'test-account-id',
    profileId: 'test-profile-id',
  });
});

describe('Quiz routes', () => {
  describe('POST /v1/quiz/rounds', () => {
    it('generates a round with validated questions', async () => {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.id).toBe('string');
      expect(body.theme).toBe('Central European Capitals');
      expect(body.questions.length).toBeGreaterThanOrEqual(1);
      // [CR-1] Answer fields (correctAnswer, acceptedAliases) are now stripped.
      // Client receives pre-shuffled `options` instead.
      expect(Array.isArray(body.questions[0].options)).toBe(true);
      expect(body.questions[0].options.length).toBeGreaterThanOrEqual(2);
      expect(body.questions[0].correctAnswer).toBeUndefined();
      expect(body.questions[0].acceptedAliases).toBeUndefined();
    });

    // BUG-975: Missing X-Profile-Id — proxy-guard fails closed (no profileMeta)
    // before requireProfileId runs, so the response is 403 not 400.
    it('returns 403 without a profile id header [BUG-975]', async () => {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
    });

    it('returns 400 for an invalid activity type', async () => {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'invalid' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for vocabulary without subjectId', async () => {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'vocabulary' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 402 when seeded quota is exhausted [Phase 2C]', async () => {
      meteringFixture.state.monthlyLimit = 25;
      meteringFixture.setQuotaUsage(25, 0);

      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(routeAndCall).not.toHaveBeenCalled();
    });

    // [BUG-990] UpstreamLlmError from quiz generation must propagate as 502
    // (UPSTREAM_ERROR) so clients know to retry, not show a generic 500 error.
    it('returns 502 UPSTREAM_ERROR when LLM fails during quiz generation [BUG-990]', async () => {
      (routeAndCall as jest.Mock).mockRejectedValueOnce(
        new UpstreamLlmError('Quiz LLM returned invalid structured output'),
      );

      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.code).toBe('UPSTREAM_ERROR');
    });

    // [BUG-990] AbortError from Cloudflare Worker timeout must NOT crash the
    // Worker with a hard 502 Bad Gateway. It must be converted to UpstreamLlmError
    // and returned as a proper 502 JSON response with code UPSTREAM_ERROR.
    it('returns 502 UPSTREAM_ERROR when routeAndCall throws AbortError (CF Worker timeout) [BUG-990]', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      (routeAndCall as jest.Mock).mockRejectedValueOnce(abortErr);

      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.code).toBe('UPSTREAM_ERROR');
    });

    // [BUG-990] CircuitOpenError must also surface as 502 UPSTREAM_ERROR, not
    // a generic 500 INTERNAL_ERROR. The circuit breaker trips when the LLM
    // provider has 3+ consecutive failures — clients need a retryable signal.
    it('returns 502 UPSTREAM_ERROR when routeAndCall throws CircuitOpenError [BUG-990]', async () => {
      (routeAndCall as jest.Mock).mockRejectedValueOnce(
        new CircuitOpenError('gemini'),
      );

      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.code).toBe('UPSTREAM_ERROR');
    });

    it('generates a vocabulary round with a valid language subject', async () => {
      (mockDb as any).query.subjects.findFirst = jest.fn().mockResolvedValue({
        id: '01933b3c-0000-7000-8000-000000000111',
        profileId: 'test-profile-id',
        name: "Emma's German",
        status: 'active',
        pedagogyMode: 'four_strands',
        languageCode: 'de',
      });
      (mockDb as any).query.vocabulary.findMany = jest.fn().mockResolvedValue([
        {
          id: '01933b3c-0000-7000-8000-000000000211',
          profileId: 'test-profile-id',
          subjectId: '01933b3c-0000-7000-8000-000000000111',
          term: 'der Hund',
          translation: 'dog',
          cefrLevel: 'A1',
        },
        {
          id: '01933b3c-0000-7000-8000-000000000212',
          profileId: 'test-profile-id',
          subjectId: '01933b3c-0000-7000-8000-000000000111',
          term: 'die Katze',
          translation: 'cat',
          cefrLevel: 'A1',
        },
        {
          id: '01933b3c-0000-7000-8000-000000000213',
          profileId: 'test-profile-id',
          subjectId: '01933b3c-0000-7000-8000-000000000111',
          term: 'der Vogel',
          translation: 'bird',
          cefrLevel: 'A1',
        },
        {
          id: '01933b3c-0000-7000-8000-000000000214',
          profileId: 'test-profile-id',
          subjectId: '01933b3c-0000-7000-8000-000000000111',
          term: 'der Fisch',
          translation: 'fish',
          cefrLevel: 'A1',
        },
      ]);
      (mockDb as any).query.vocabularyRetentionCards.findMany = jest
        .fn()
        .mockResolvedValue([
          {
            vocabularyId: '01933b3c-0000-7000-8000-000000000211',
            repetitions: 3,
            nextReviewAt: new Date('2026-04-16T00:00:00.000Z'),
          },
          {
            vocabularyId: '01933b3c-0000-7000-8000-000000000212',
            repetitions: 3,
            nextReviewAt: new Date('2026-04-18T00:00:00.000Z'),
          },
        ]);
      (routeAndCall as jest.Mock).mockResolvedValueOnce({
        response: JSON.stringify({
          theme: 'German Animals',
          targetLanguage: 'German',
          questions: [
            {
              term: 'das Pferd',
              correctAnswer: 'horse',
              acceptedAnswers: ['horse'],
              distractors: ['dog', 'cat', 'bird'],
              funFact: 'Pferd comes from an old High German root.',
              cefrLevel: 'A1',
            },
            {
              term: 'die Maus',
              correctAnswer: 'mouse',
              acceptedAnswers: ['mouse'],
              distractors: ['fish', 'cat', 'dog'],
              funFact: 'Maus is also used for computer mouse.',
              cefrLevel: 'A1',
            },
            {
              term: 'die Kuh',
              correctAnswer: 'cow',
              acceptedAnswers: ['cow'],
              distractors: ['horse', 'bird', 'fish'],
              funFact: 'Kuh is a common farm-animal word.',
              cefrLevel: 'A1',
            },
            {
              term: 'das Schaf',
              correctAnswer: 'sheep',
              acceptedAnswers: ['sheep'],
              distractors: ['cow', 'dog', 'cat'],
              funFact: 'Schaf has the same singular and plural meaning.',
              cefrLevel: 'A1',
            },
            {
              term: 'die Ente',
              correctAnswer: 'duck',
              acceptedAnswers: ['duck'],
              distractors: ['bird', 'fish', 'horse'],
              funFact: 'Ente is a useful early-storybook word.',
              cefrLevel: 'A1',
            },
          ],
        }),
        provider: 'mock',
        model: 'mock',
        latencyMs: 50,
      });

      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            activityType: 'vocabulary',
            subjectId: '01933b3c-0000-7000-8000-000000000111',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.activityType).toBe('vocabulary');
      expect(body.questions[0].type).toBe('vocabulary');
      expect(body.total).toBe(6);
      // [F-014 break test] Answer fields MUST be stripped from vocabulary
      // questions. Pre-shuffled `options` is the only legitimate answer-
      // bearing field. This catches a stale deploy regression where the
      // client sees correctAnswer/acceptedAnswers/distractors in DevTools.
      for (const q of body.questions) {
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.correctAnswer).toBeUndefined();
        expect(q.acceptedAnswers).toBeUndefined();
        expect(q.acceptedAliases).toBeUndefined();
        expect(q.distractors).toBeUndefined();
      }
    });
  });

  describe('POST /v1/quiz/rounds/prefetch', () => {
    it('returns only the round id on success', async () => {
      const res = await app.request(
        '/v1/quiz/rounds/prefetch',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.id).toBe('string');
      // prefetch must NOT leak questions/theme to the response
      expect(body.questions).toBeUndefined();
      expect(body.theme).toBeUndefined();
    });

    it('returns 400 for an invalid activity type', async () => {
      const res = await app.request(
        '/v1/quiz/rounds/prefetch',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'bogus' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/quiz/rounds (guess_who)', () => {
    it('generates a guess_who round with topic titles', async () => {
      // Mock the select().from().innerJoin()... chain used by getGuessWhoRoundContext
      const { profiles, topUpCredits } = jest.requireActual(
        '@eduagent/database',
      ) as typeof import('@eduagent/database');
      const chainResult = [
        { title: 'Albert Einstein' },
        { title: 'Marie Curie' },
        { title: 'Isaac Newton' },
      ];
      const profileLimitFn = jest
        .fn()
        .mockResolvedValue([{ id: 'test-profile-id' }]);
      const profileWhereFn = jest
        .fn()
        .mockReturnValue({ limit: profileLimitFn });
      const profileInnerJoinFn = jest.fn().mockReturnValue({
        where: profileWhereFn,
      });
      const limitFn = jest.fn().mockResolvedValue(chainResult);
      const orderByFn = jest.fn().mockReturnValue({ limit: limitFn });
      const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn });
      const innerJoinFn2 = jest.fn().mockReturnValue({ where: whereFn });
      const innerJoinFn1 = jest
        .fn()
        .mockReturnValue({ innerJoin: innerJoinFn2 });
      const fromFn = jest.fn().mockImplementation((table: unknown) => {
        if (table === topUpCredits) {
          return {
            where: jest.fn().mockResolvedValue([{ total: 0 }]),
          };
        }
        if (table === profiles) {
          return {
            innerJoin: profileInnerJoinFn,
          };
        }
        return { innerJoin: innerJoinFn1 };
      });
      (mockDb as any).select = jest.fn().mockReturnValue({ from: fromFn });

      (routeAndCall as jest.Mock).mockResolvedValueOnce({
        response: JSON.stringify({
          theme: 'Famous Scientists',
          questions: [
            {
              canonicalName: 'Albert Einstein',
              acceptedAliases: ['Einstein'],
              clues: [
                'Born in Germany in 1879.',
                'Developed the theory of relativity.',
                'Won the Nobel Prize in Physics in 1921.',
                'Famous equation: E=mc².',
                'Worked at the Institute for Advanced Study.',
              ],
              mcFallbackOptions: [
                'Albert Einstein',
                'Isaac Newton',
                'Niels Bohr',
                'Marie Curie',
              ],
              funFact: 'He played the violin.',
            },
            {
              canonicalName: 'Marie Curie',
              acceptedAliases: ['Curie', 'Maria Sklodowska'],
              clues: [
                'Born in Poland in 1867.',
                'Pioneered research on radioactivity.',
                'First woman to win a Nobel Prize.',
                'Won Nobel Prizes in both Physics and Chemistry.',
                'Discovered polonium and radium.',
              ],
              mcFallbackOptions: [
                'Marie Curie',
                'Rosalind Franklin',
                'Ada Lovelace',
                'Dorothy Hodgkin',
              ],
              funFact: 'She carried test tubes in her pockets.',
            },
          ],
        }),
        provider: 'mock',
        model: 'mock',
        latencyMs: 50,
      });

      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'guess_who' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.activityType).toBe('guess_who');
      expect(body.questions[0].type).toBe('guess_who');
      expect(body.questions[0].clues).toHaveLength(5);
      expect(Array.isArray(body.questions[0].mcFallbackOptions)).toBe(true);
      // [F-014 break test] Guess Who questions leak correctAnswer +
      // canonicalName + acceptedAliases if the answer-stripping projection
      // is bypassed. Users can peek the answer in DevTools before the first
      // clue is revealed. Clues and mcFallbackOptions are the only fields
      // the client legitimately needs.
      for (const q of body.questions) {
        expect(q.correctAnswer).toBeUndefined();
        expect(q.canonicalName).toBeUndefined();
        expect(q.acceptedAliases).toBeUndefined();
      }
    });
  });

  describe('GET /v1/quiz/rounds/:id', () => {
    it('returns 404 for a round not owned by the caller (IDOR break-test)', async () => {
      // Scoped-repo findFirst returns undefined because profile_id predicate
      // eliminates rounds owned by a different profile. That's the guard:
      // the route MUST surface 404, not 500 or 200 with someone else's data.
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(undefined);

      const res = await app.request(
        '/v1/quiz/rounds/round-belonging-to-profile-b',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns the round for the owning profile', async () => {
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(ACTIVE_ROUND);

      const res = await app.request(
        '/v1/quiz/rounds/round-1',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('a0000000-0000-4000-a000-000000000001');
    });

    it('returns correctAnswer + acceptedAliases + celebrationTier for completed rounds [F-032]', async () => {
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(COMPLETED_ROUND);

      const res = await app.request(
        '/v1/quiz/rounds/round-completed',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('completed');
      expect(body.score).toBe(1);
      expect(body.total).toBe(2);
      expect(body.xpEarned).toBe(15);
      expect(body.celebrationTier).toBe('nice');
      expect(typeof body.completedAt).toBe('string');
      expect(body.results).toHaveLength(2);
      // Completed rounds expose the grading context
      expect(body.questions[0].correctAnswer).toBe('Vienna');
      expect(body.questions[0].acceptedAliases).toEqual(['Vienna', 'Wien']);
      expect(body.questions[1].correctAnswer).toBe('Berlin');
      // [F-032 break test] Distractors stay stripped — round is graded, no
      // reason to leak them. The only answer fields exposed are the
      // correct answer + its aliases.
      expect(body.questions[0].distractors).toBeUndefined();
    });

    it('does NOT expose correctAnswer or acceptedAliases for in-progress rounds [F-032 break test]', async () => {
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(ACTIVE_ROUND);

      const res = await app.request(
        '/v1/quiz/rounds/round-1',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      // Active rounds have no status field on the response
      expect(body.status).toBeUndefined();
      for (const q of body.questions) {
        expect(q.correctAnswer).toBeUndefined();
        expect(q.acceptedAliases).toBeUndefined();
      }
    });

    it('includes activityLabel for both completed and in-progress rounds [F-036b]', async () => {
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(COMPLETED_ROUND);

      const completedRes = await app.request(
        '/v1/quiz/rounds/round-completed',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      const completedBody = await completedRes.json();
      expect(completedBody.activityLabel).toBe('Capitals');

      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(ACTIVE_ROUND);

      const activeRes = await app.request(
        '/v1/quiz/rounds/round-1',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      const activeBody = await activeRes.json();
      expect(activeBody.activityLabel).toBe('Capitals');
    });

    it('strips answer fields and returns pre-shuffled options (GET endpoint)', async () => {
      // [F-014 break test] The POST endpoint already has stripping tests,
      // but the GET endpoint was untested. Observed 2026-04-18: staging
      // returned unstripped questions on GET /v1/quiz/rounds/:id, leaking
      // correctAnswer / acceptedAliases / distractors to the network layer.
      // This asserts BOTH: the functional requirement (client gets options)
      // AND the security requirement (no answer fields in response).
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(ACTIVE_ROUND);

      const res = await app.request(
        '/v1/quiz/rounds/round-1',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.questions.length).toBeGreaterThanOrEqual(1);
      for (const q of body.questions) {
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.correctAnswer).toBeUndefined();
        expect(q.acceptedAliases).toBeUndefined();
        expect(q.acceptedAnswers).toBeUndefined();
        expect(q.distractors).toBeUndefined();
        expect(q.canonicalName).toBeUndefined();
      }
    });
  });

  describe('POST /v1/quiz/rounds/:id/complete', () => {
    it('scores the round and persists results', async () => {
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(ACTIVE_ROUND);

      const res = await app.request(
        '/v1/quiz/rounds/round-1/complete',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            results: [
              {
                questionIndex: 0,
                correct: true,
                answerGiven: 'Vienna',
                timeMs: 3000,
              },
              {
                questionIndex: 1,
                correct: false,
                answerGiven: 'Munich',
                timeMs: 5000,
              },
            ],
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.score).toBe(1);
      expect(body.xpEarned).toBeGreaterThan(0);
      expect(['perfect', 'great', 'nice']).toContain(body.celebrationTier);
      // [F-040] Results must include the user's submitted answer so the
      // mobile results screen can render "You said: X" on missed-question
      // cards without refetching the round.
      expect(body.questionResults[0]).toHaveProperty('answerGiven');
      expect(body.questionResults[0].answerGiven).toBe('Vienna');
      expect(body.questionResults[1].answerGiven).toBe('Munich');

      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/streak.record',
          data: expect.objectContaining({
            profileId: 'test-profile-id',
            date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          }),
        }),
      );
    });

    it('returns 400 for empty results', async () => {
      const res = await app.request(
        '/v1/quiz/rounds/round-1/complete',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ results: [] }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it("returns 404 when completing another profile's round (IDOR break-test)", async () => {
      // Scoped lookup filters out rows owned by a different profile.
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(undefined);

      const res = await app.request(
        '/v1/quiz/rounds/someone-elses-round/complete',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            results: [
              {
                questionIndex: 0,
                correct: true,
                answerGiven: 'Vienna',
                timeMs: 3000,
              },
            ],
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 409 when the round is already completed', async () => {
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue({ ...ACTIVE_ROUND, status: 'completed' });

      const res = await app.request(
        '/v1/quiz/rounds/round-1/complete',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            results: [
              {
                questionIndex: 0,
                correct: true,
                answerGiven: 'Vienna',
                timeMs: 3000,
              },
            ],
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
    });

    it('returns 409 when a concurrent complete wins the race (double-grading break-test)', async () => {
      // Initial SELECT saw status='active', but by the time our UPDATE fires,
      // another transaction has already flipped it. completeActive returns
      // zero rows → service must throw ConflictError → 409 (no double XP).
      (mockDb as any).query.quizRounds.findFirst = jest
        .fn()
        .mockResolvedValue(ACTIVE_ROUND);
      setUpdateReturning([]);
      meteringFixture = createRouteMeteringFixture(mockDb, {
        accountId: 'test-account-id',
        profileId: 'test-profile-id',
      });

      const res = await app.request(
        '/v1/quiz/rounds/round-1/complete',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            results: [
              {
                questionIndex: 0,
                correct: true,
                answerGiven: 'Vienna',
                timeMs: 3000,
              },
            ],
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
    });
  });

  describe('GET /v1/quiz/rounds/recent', () => {
    it('returns completed rounds', async () => {
      (mockDb as any).query.quizRounds.findMany = jest.fn().mockResolvedValue([
        {
          id: 'a0000000-0000-4000-a000-000000000010',
          activityType: 'capitals',
          theme: 'Central European Capitals',
          score: 7,
          total: 8,
          xpEarned: 74,
          createdAt: new Date('2026-04-16T10:00:00.000Z'),
          completedAt: new Date('2026-04-16T10:05:00.000Z'),
        },
      ]);

      const res = await app.request(
        '/v1/quiz/rounds/recent',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].score).toBe(7);
    });
  });

  describe('POST /v1/quiz/missed-items/mark-surfaced', () => {
    it('marks items for an activityType and returns markedCount [F-033]', async () => {
      // The default beforeEach setUpdateReturning() returns one row from
      // the UPDATE — so markSurfaced resolves to 1.
      const res = await app.request(
        '/v1/quiz/missed-items/mark-surfaced',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('markedCount');
      expect(typeof body.markedCount).toBe('number');
      expect(body.markedCount).toBe(1);
    });

    it('returns 400 for an invalid activityType [F-033 negative]', async () => {
      const res = await app.request(
        '/v1/quiz/missed-items/mark-surfaced',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'not_a_real_activity' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/quiz/stats', () => {
    it('returns aggregate stats per activity', async () => {
      // [Q-10] The aggregator issues two SQL shapes:
      //   1. `.select({...}).from().where().groupBy()` for count/sum/bestRatio
      //      per activity (one row per activityType).
      //   2. `.select({ score, total }).from().where(...ratio...).limit(1)`
      //      once per aggregate row, to resolve the best round's score/total.
      // The first call returns the aggregate rows; subsequent calls resolve
      // the best-round rows for each activity.
      // [CR-3] Single-query approach: array_agg resolves bestScore/bestTotal
      // in the same GROUP BY scan — no separate best-round lookup.
      const statsRows = [
        {
          activityType: 'capitals',
          languageCode: null,
          roundsPlayed: 2,
          totalXp: 140,
          bestScore: 8,
          bestTotal: 8,
        },
      ];

      const groupByReturn = Promise.resolve(statsRows);
      const whereReturn = Object.assign(Promise.resolve(statsRows), {
        groupBy: jest.fn().mockReturnValue(groupByReturn),
      });
      const fromReturn = {
        where: jest.fn().mockReturnValue(whereReturn),
      };
      (mockDb as any).select = jest
        .fn()
        .mockReturnValue({ from: jest.fn().mockReturnValue(fromReturn) });

      const res = await app.request(
        '/v1/quiz/stats',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[0]).toMatchObject({
        activityType: 'capitals',
        languageCode: null,
        roundsPlayed: 2,
        bestScore: 8,
        bestTotal: 8,
        totalXp: 140,
      });
    });

    // [BUG-926] Per-language stats: vocabulary rounds for different languages
    // now produce separate stat rows keyed on (activityType, languageCode).
    it('returns separate stat rows for vocabulary rounds in different languages (BUG-926)', async () => {
      const statsRows = [
        {
          activityType: 'vocabulary',
          languageCode: 'it',
          roundsPlayed: 3,
          totalXp: 90,
          bestScore: 5,
          bestTotal: 6,
        },
        {
          activityType: 'vocabulary',
          languageCode: 'es',
          roundsPlayed: 1,
          totalXp: 20,
          bestScore: 4,
          bestTotal: 6,
        },
      ];

      const groupByReturn = Promise.resolve(statsRows);
      const whereReturn = Object.assign(Promise.resolve(statsRows), {
        groupBy: jest.fn().mockReturnValue(groupByReturn),
      });
      const fromReturn = {
        where: jest.fn().mockReturnValue(whereReturn),
      };
      (mockDb as any).select = jest
        .fn()
        .mockReturnValue({ from: jest.fn().mockReturnValue(fromReturn) });

      const res = await app.request(
        '/v1/quiz/stats',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      const itRow = body.find(
        (r) => r.activityType === 'vocabulary' && r.languageCode === 'it',
      );
      const esRow = body.find(
        (r) => r.activityType === 'vocabulary' && r.languageCode === 'es',
      );
      expect(itRow).toMatchObject({ roundsPlayed: 3, bestScore: 5 });
      expect(esRow).toMatchObject({ roundsPlayed: 1, bestScore: 4 });
    });

    it('returns an empty array when the profile has no completed rounds', async () => {
      // [Q-10 break test] When no rounds exist, the GROUP BY returns no rows
      // and the best-round sub-query must not run at all. Previously the
      // in-memory aggregator handled this via a Map default; now we rely on
      // SQL returning [].
      const fromReturn = {
        where: jest.fn().mockReturnValue(
          Object.assign(Promise.resolve([]), {
            groupBy: jest.fn().mockReturnValue(Promise.resolve([])),
          }),
        ),
      };
      (mockDb as any).select = jest
        .fn()
        .mockReturnValue({ from: jest.fn().mockReturnValue(fromReturn) });

      const res = await app.request(
        '/v1/quiz/stats',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });
});
