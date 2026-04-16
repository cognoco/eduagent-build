// ---------------------------------------------------------------------------
// Mock JWT module so auth middleware passes with a valid token
// ---------------------------------------------------------------------------

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

import { createDatabaseModuleMock } from '../test-utils/database-module';

// Provide a mock scoped repository so the /dictation/generate route's
// createScopedRepository call doesn't blow up in tests.
const mockScopedRepo = {
  teachingPreferences: {
    findFirst: jest.fn().mockResolvedValue({ nativeLanguage: 'en' }),
  },
  sessions: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  subjects: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockDatabaseModule = createDatabaseModuleMock({
  exports: {
    createScopedRepository: jest.fn().mockReturnValue(mockScopedRepo),
    dictationResults: {},
  },
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
    birthYear: 2016,
    location: null,
    consentStatus: 'CONSENTED',
    hasPremiumLlm: false,
  }),
}));

// Mock the dictation services — they are the internal boundary
jest.mock('../services/dictation', () => ({
  prepareHomework: jest.fn(),
  generateDictation: jest.fn(),
}));

import { app } from '../index';
import { prepareHomework, generateDictation } from '../services/dictation';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  // DATABASE_URL is needed so databaseMiddleware sets c.get('db') via the mocked createDatabase
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

const TODAY = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /v1/dictation/prepare-homework
// ---------------------------------------------------------------------------

describe('POST /v1/dictation/prepare-homework', () => {
  it('returns 200 with prepared sentences', async () => {
    (prepareHomework as jest.Mock).mockResolvedValueOnce({
      sentences: [
        {
          text: 'Hello world.',
          withPunctuation: 'Hello world period',
          wordCount: 2,
        },
      ],
      language: 'en',
    });

    const res = await app.request(
      '/v1/dictation/prepare-homework',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ text: 'Hello world.' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sentences).toHaveLength(1);
    expect(body.sentences[0].text).toBe('Hello world.');
    expect(body.language).toBe('en');
  });

  it('calls prepareHomework with the provided text', async () => {
    (prepareHomework as jest.Mock).mockResolvedValueOnce({
      sentences: [
        {
          text: 'Test sentence.',
          withPunctuation: 'Test sentence period',
          wordCount: 2,
        },
      ],
      language: 'en',
    });

    await app.request(
      '/v1/dictation/prepare-homework',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ text: 'Test sentence.' }),
      },
      TEST_ENV
    );

    expect(prepareHomework).toHaveBeenCalledWith('Test sentence.');
  });

  it('returns 400 when text is empty string', async () => {
    const res = await app.request(
      '/v1/dictation/prepare-homework',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ text: '' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when text field is missing', async () => {
    const res = await app.request(
      '/v1/dictation/prepare-homework',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({}),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // RF-01: Missing X-Profile-Id header must return 400
  it('returns 400 when X-Profile-Id header is missing [RF-01]', async () => {
    const res = await app.request(
      '/v1/dictation/prepare-homework',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid.jwt.token',
          'Content-Type': 'application/json',
          // No X-Profile-Id
        },
        body: JSON.stringify({ text: 'Hello world.' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    expect(prepareHomework).not.toHaveBeenCalled();
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/dictation/prepare-homework',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello world.' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/dictation/generate
// ---------------------------------------------------------------------------

describe('POST /v1/dictation/generate', () => {
  it('returns 200 with generated dictation content', async () => {
    (generateDictation as jest.Mock).mockResolvedValueOnce({
      sentences: [
        {
          text: 'Sopka chrlí lávu.',
          withPunctuation: 'Sopka chrlí lávu tečka',
          wordCount: 3,
        },
      ],
      title: 'Sopky',
      topic: 'Přírodní jevy',
      language: 'cs',
    });

    const res = await app.request(
      '/v1/dictation/generate',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Sopky');
    expect(body.sentences).toHaveLength(1);
    expect(body.language).toBe('cs');
  });

  it('calls generateDictation with context derived from profile', async () => {
    (generateDictation as jest.Mock).mockResolvedValueOnce({
      sentences: [
        {
          text: 'The sun is bright.',
          withPunctuation: 'The sun is bright period',
          wordCount: 4,
        },
      ],
      title: 'Nature',
      topic: 'nature',
      language: 'en',
    });

    await app.request(
      '/v1/dictation/generate',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
      },
      TEST_ENV
    );

    expect(generateDictation).toHaveBeenCalledTimes(1);
    const callArgs = (generateDictation as jest.Mock).mock.calls[0][0];
    expect(callArgs).toHaveProperty('ageYears');
    expect(callArgs).toHaveProperty('nativeLanguage');
    expect(callArgs).toHaveProperty('recentTopics');
  });

  // RF-01: Missing X-Profile-Id header must return 400
  it('returns 400 when X-Profile-Id header is missing [RF-01]', async () => {
    const res = await app.request(
      '/v1/dictation/generate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid.jwt.token',
          // No X-Profile-Id
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    expect(generateDictation).not.toHaveBeenCalled();
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/dictation/generate',
      { method: 'POST' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/dictation/result
// ---------------------------------------------------------------------------

describe('POST /v1/dictation/result', () => {
  it('returns 201 when result is recorded successfully', async () => {
    const mockDb = mockDatabaseModule.db;
    const insertReturning = jest.fn().mockResolvedValue([
      {
        id: 'result-uuid-001',
        profileId: 'test-profile-id',
        date: TODAY,
        sentenceCount: 5,
        mistakeCount: 2,
        mode: 'homework',
        reviewed: false,
        createdAt: new Date().toISOString(),
      },
    ]);
    const insertValues = jest.fn().mockReturnValue({ returning: insertReturning });
    (mockDb as any).insert = jest.fn().mockReturnValue({ values: insertValues });

    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          localDate: TODAY,
          sentenceCount: 5,
          mistakeCount: 2,
          mode: 'homework',
          reviewed: false,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.result).toBeDefined();
  });

  it('returns 400 when localDate is missing', async () => {
    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          sentenceCount: 5,
          mode: 'homework',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when localDate is more than 1 day from server date [RF-04]', async () => {
    const farFutureDate = '2099-01-01';

    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          localDate: farFutureDate,
          sentenceCount: 5,
          mode: 'homework',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when mode is invalid', async () => {
    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          localDate: TODAY,
          sentenceCount: 5,
          mode: 'invalid-mode',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // RF-01: Missing X-Profile-Id header must return 400
  it('returns 400 when X-Profile-Id header is missing [RF-01]', async () => {
    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid.jwt.token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          localDate: TODAY,
          sentenceCount: 5,
          mode: 'homework',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localDate: TODAY,
          sentenceCount: 5,
          mode: 'homework',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/dictation/streak
// ---------------------------------------------------------------------------

describe('GET /v1/dictation/streak', () => {
  it('returns 200 with streak 0 when no results exist', async () => {
    const mockDb = mockDatabaseModule.db;
    (mockDb as any).query = {
      ...((mockDb as any).query ?? {}),
      dictationResults: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const res = await app.request(
      '/v1/dictation/streak',
      { headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(0);
    expect(body.lastDate).toBeNull();
  });

  it('returns 200 with correct streak when practiced today', async () => {
    const mockDb = mockDatabaseModule.db;
    const yesterday = getPreviousDateStr(TODAY);
    (mockDb as any).query = {
      ...((mockDb as any).query ?? {}),
      dictationResults: {
        findMany: jest.fn().mockResolvedValue([
          { profileId: 'test-profile-id', date: TODAY },
          { profileId: 'test-profile-id', date: yesterday },
        ]),
      },
    };

    const res = await app.request(
      '/v1/dictation/streak',
      { headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(2);
    expect(body.lastDate).toBe(TODAY);
  });

  it('returns streak 0 when last practice was more than 1 day ago', async () => {
    const twoDaysAgo = getPreviousDateStr(getPreviousDateStr(TODAY));
    const mockDb = mockDatabaseModule.db;
    (mockDb as any).query = {
      ...((mockDb as any).query ?? {}),
      dictationResults: {
        findMany: jest.fn().mockResolvedValue([
          { profileId: 'test-profile-id', date: twoDaysAgo },
        ]),
      },
    };

    const res = await app.request(
      '/v1/dictation/streak',
      { headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(0);
    expect(body.lastDate).toBe(twoDaysAgo);
  });

  // RF-01: Missing X-Profile-Id header must return 400
  it('returns 400 when X-Profile-Id header is missing [RF-01]', async () => {
    const res = await app.request(
      '/v1/dictation/streak',
      {
        headers: {
          Authorization: 'Bearer valid.jwt.token',
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request('/v1/dictation/streak', {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function getPreviousDateStr(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
