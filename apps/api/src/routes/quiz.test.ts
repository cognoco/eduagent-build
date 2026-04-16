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

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

function setRoundInsertReturning(id = '01933b3c-0000-7000-8000-000000000999') {
  const returning = jest.fn().mockResolvedValue([{ id }]);
  const values = jest.fn().mockReturnValue({ returning });
  (mockDb as any).insert = jest.fn().mockReturnValue({ values });
}

function setRoundUpdateWhere() {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn().mockReturnValue({ where });
  (mockDb as any).update = jest.fn().mockReturnValue({ set });
}

beforeEach(() => {
  jest.clearAllMocks();
  (mockDb as any).query = {
    quizRounds: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(undefined),
    },
  };
  setRoundInsertReturning();
  setRoundUpdateWhere();
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
  });

  describe('POST /v1/quiz/rounds/:id/complete', () => {
    it('scores the round and persists results', async () => {
      (mockDb as any).query.quizRounds.findFirst = jest.fn().mockResolvedValue({
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
        status: 'active',
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
          status: 'completed',
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
      (mockDb as any).query.quizRounds.findMany = jest.fn().mockResolvedValue([
        {
          id: 'round-1',
          activityType: 'capitals',
          theme: 'Theme 1',
          score: 6,
          total: 8,
          xpEarned: 60,
          status: 'completed',
        },
        {
          id: 'round-2',
          activityType: 'capitals',
          theme: 'Theme 2',
          score: 8,
          total: 8,
          xpEarned: 80,
          status: 'completed',
        },
      ]);

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
  });
});
