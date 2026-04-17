jest.mock('../middleware/jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  }),
  verifyJWT: jest.fn().mockResolvedValue({
    sub: 'user_test',
    email: 'test@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
}));

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../test-utils/database-module';

const mockDb = createTransactionalMockDb();
const mockDatabaseModule = createDatabaseModuleMock({
  db: mockDb,
  includeActual: true,
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// Billing/metering mock — POST /v1/quiz/rounds + /prefetch are now
// LLM-metered, so the metering middleware runs before our handler and needs
// these service boundaries mocked. Values chosen so quota check always
// passes unless a specific test overrides them.
jest.mock('../services/billing', () => ({
  getSubscriptionByAccountId: jest.fn().mockResolvedValue({
    id: 'sub-1',
    accountId: 'test-account-id',
    tier: 'free',
    status: 'ACTIVE',
  }),
  ensureFreeSubscription: jest.fn().mockResolvedValue({
    id: 'sub-1',
    accountId: 'test-account-id',
    tier: 'free',
    status: 'ACTIVE',
  }),
  getQuotaPool: jest.fn().mockResolvedValue({
    id: 'qp-1',
    subscriptionId: 'sub-1',
    monthlyLimit: 500,
    usedThisMonth: 10,
    dailyLimit: null,
    usedToday: 0,
  }),
  decrementQuota: jest.fn().mockResolvedValue({
    success: true,
    source: 'monthly',
    remainingMonthly: 489,
    remainingTopUp: 0,
    remainingDaily: null,
  }),
  getTopUpCreditsRemaining: jest.fn().mockResolvedValue(0),
  incrementQuota: jest.fn().mockResolvedValue(undefined),
  createSubscription: jest.fn(),
}));

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

jest.mock('../services/profile', () => ({
  findOwnerProfile: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: 2014,
    location: null,
    consentStatus: 'CONSENTED',
    hasPremiumLlm: false,
  }),
}));

jest.mock('../services/llm', () => ({
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
}));

import { app } from '../index';
import { routeAndCall } from '../services/llm';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

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
  id: 'round-1',
  profileId: 'test-profile-id',
  activityType: 'capitals',
  theme: 'Central European Capitals',
  questions: [
    {
      type: 'capitals',
      country: 'Austria',
      correctAnswer: 'Vienna',
      acceptedAliases: ['Vienna'],
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

beforeEach(() => {
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
  };
  setInsertReturning();
  setUpdateReturning();
  (mockDb as any).transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockDb));
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.theme).toBe('Central European Capitals');
      expect(body.questions.length).toBeGreaterThanOrEqual(1);
      expect(body.questions[0].acceptedAliases).toBeDefined();
    });

    it('returns 400 without a profile id header', async () => {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ activityType: 'capitals' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid activity type', async () => {
      const res = await app.request(
        '/v1/quiz/rounds',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ activityType: 'invalid' }),
        },
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(400);
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.activityType).toBe('vocabulary');
      expect(body.questions[0].type).toBe('vocabulary');
      expect(body.total).toBe(6);
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
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('round-1');
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.score).toBe(1);
      expect(body.xpEarned).toBeGreaterThan(0);
      expect(['perfect', 'great', 'nice']).toContain(body.celebrationTier);
    });

    it('returns 400 for empty results', async () => {
      const res = await app.request(
        '/v1/quiz/rounds/round-1/complete',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ results: [] }),
        },
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(409);
    });
  });

  describe('GET /v1/quiz/rounds/recent', () => {
    it('returns completed rounds', async () => {
      (mockDb as any).query.quizRounds.findMany = jest.fn().mockResolvedValue([
        {
          id: 'round-1',
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].score).toBe(7);
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
      const aggregateRows = [
        {
          activityType: 'capitals',
          roundsPlayed: 2,
          totalXp: 140,
          bestRatio: 1,
        },
      ];
      const bestRoundRows = [{ score: 8, total: 8 }];

      const groupByReturn = Promise.resolve(aggregateRows);
      const limitReturn = Promise.resolve(bestRoundRows);
      const whereAggregate = Object.assign(Promise.resolve(aggregateRows), {
        groupBy: jest.fn().mockReturnValue(groupByReturn),
      });
      const whereBestRound = {
        limit: jest.fn().mockReturnValue(limitReturn),
      };
      const fromReturn = {
        where: jest
          .fn()
          // First call → aggregate GROUP BY (thenable)
          .mockReturnValueOnce(whereAggregate)
          // Subsequent calls → best-round lookup per activity (has .limit)
          .mockReturnValue(whereBestRound),
      };
      (mockDb as any).select = jest
        .fn()
        .mockReturnValue({ from: jest.fn().mockReturnValue(fromReturn) });

      const res = await app.request(
        '/v1/quiz/stats',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[0]).toMatchObject({
        activityType: 'capitals',
        roundsPlayed: 2,
        bestScore: 8,
        bestTotal: 8,
        totalXp: 140,
      });
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
          })
        ),
      };
      (mockDb as any).select = jest
        .fn()
        .mockReturnValue({ from: jest.fn().mockReturnValue(fromReturn) });

      const res = await app.request(
        '/v1/quiz/stats',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });
});
