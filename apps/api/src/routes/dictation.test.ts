// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

import { createDatabaseModuleMock } from '../test-utils/database-module';
import { createRouteMeteringFixture } from '../test-utils/route-metering-fixture';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });
const meteringFixture = createRouteMeteringFixture(mockDatabaseModule.db, {
  accountId: 'test-account-id',
  profileId: 'test-profile-id',
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue(null),
    getProfile: jest.fn().mockResolvedValue({
      id: 'test-profile-id',
      birthYear: 2016,
      location: null,
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
    }),
  };
});

// Mock the dictation services — they are the internal boundary
jest.mock('../services/dictation' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/dictation',
  ) as typeof import('../services/dictation');
  return {
    ...actual,
    prepareHomework: jest.fn(),
    generateDictation: jest.fn(),
    reviewDictation: jest.fn(),
    recordDictationResult: jest.fn(),
    getDictationStreak: jest.fn(),
    fetchGenerateContext: jest.fn(),
  };
});

import { app } from '../index';
import {
  prepareHomework,
  generateDictation,
  reviewDictation,
  recordDictationResult,
  getDictationStreak,
  fetchGenerateContext,
} from '../services/dictation';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  // DATABASE_URL is needed so databaseMiddleware sets c.get('db') via the mocked createDatabase
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const TODAY = new Date().toISOString().slice(0, 10);
const COMPLETION_KEY = '550e8400-e29b-41d4-a716-446655440000';

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();
  meteringFixture.reset();
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
      TEST_ENV,
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
      TEST_ENV,
    );

    expect(prepareHomework).toHaveBeenCalledWith('Test sentence.', {
      conversationLanguage: undefined,
    });
  });

  it('returns 400 when text is empty string', async () => {
    const res = await app.request(
      '/v1/dictation/prepare-homework',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ text: '' }),
      },
      TEST_ENV,
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
      TEST_ENV,
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
        headers: makeAuthHeaders(),
        body: JSON.stringify({ text: 'Hello world.' }),
      },
      TEST_ENV,
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
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/dictation/generate
// ---------------------------------------------------------------------------

describe('POST /v1/dictation/generate', () => {
  it('returns 200 with generated dictation content', async () => {
    (fetchGenerateContext as jest.Mock).mockResolvedValueOnce({
      recentTopics: [],
      nativeLanguage: 'cs',
      ageYears: 10,
    });
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
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Sopky');
    expect(body.sentences).toHaveLength(1);
    expect(body.language).toBe('cs');
  });

  it('calls fetchGenerateContext then generateDictation with the result', async () => {
    const mockCtx = {
      recentTopics: ['Nature'],
      nativeLanguage: 'en',
      ageYears: 10,
    };
    (fetchGenerateContext as jest.Mock).mockResolvedValueOnce(mockCtx);
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
      TEST_ENV,
    );

    expect(fetchGenerateContext).toHaveBeenCalledTimes(1);
    expect(generateDictation).toHaveBeenCalledTimes(1);
    expect(generateDictation).toHaveBeenCalledWith(mockCtx);
  });

  // RF-01 / BUG-975: Missing X-Profile-Id header — proxy-guard fails closed
  // because profileMeta cannot be set (no profile resolved). Earlier behavior
  // was 400 from requireProfileId; the fail-closed change in proxy-guard.ts
  // now refuses with 403 before the route reaches requireProfileId.
  it('returns 403 when X-Profile-Id header is missing [RF-01 / BUG-975]', async () => {
    const res = await app.request(
      '/v1/dictation/generate',
      {
        method: 'POST',
        headers: makeAuthHeaders(),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    expect(generateDictation).not.toHaveBeenCalled();
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/dictation/generate',
      { method: 'POST' },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/dictation/result
// ---------------------------------------------------------------------------

describe('POST /v1/dictation/result', () => {
  it('returns 201 when result is recorded successfully', async () => {
    (recordDictationResult as jest.Mock).mockResolvedValueOnce({
      id: 'a0000000-0000-4000-a000-000000000001',
      profileId: 'a0000000-0000-4000-a000-000000000002',
      completionKey: COMPLETION_KEY,
      date: TODAY,
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: false,
      createdAt: new Date().toISOString(),
    });

    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          completionKey: COMPLETION_KEY,
          localDate: TODAY,
          sentenceCount: 5,
          mistakeCount: 2,
          mode: 'homework',
          reviewed: false,
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.result).toEqual(expect.objectContaining({}));
    expect(recordDictationResult).toHaveBeenCalledWith(
      mockDatabaseModule.db, // exact scoped db handle — guards against wrong-db injection
      'test-profile-id',
      expect.objectContaining({
        completionKey: COMPLETION_KEY,
        localDate: TODAY,
        sentenceCount: 5,
        mode: 'homework',
      }),
    );
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
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('[WI-84 review] leaves legacy completionKey fallback to the dictation service', async () => {
    (recordDictationResult as jest.Mock).mockResolvedValueOnce({
      id: 'a0000000-0000-4000-a000-000000000001',
      profileId: 'a0000000-0000-4000-a000-000000000002',
      completionKey: COMPLETION_KEY,
      date: TODAY,
      sentenceCount: 5,
      mistakeCount: null,
      mode: 'homework',
      reviewed: false,
      createdAt: new Date().toISOString(),
    });

    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          localDate: TODAY,
          sentenceCount: 5,
          mode: 'homework',
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(201);
    expect(recordDictationResult).toHaveBeenCalledWith(
      expect.anything(),
      'test-profile-id',
      expect.objectContaining({
        completionKey: undefined,
        localDate: TODAY,
        mode: 'homework',
      }),
    );
  });

  it('returns 400 when localDate is more than 1 day from server date [RF-04]', async () => {
    const farFutureDate = '2099-01-01';

    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          completionKey: COMPLETION_KEY,
          localDate: farFutureDate,
          sentenceCount: 5,
          mode: 'homework',
        }),
      },
      TEST_ENV,
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
          completionKey: COMPLETION_KEY,
          localDate: TODAY,
          sentenceCount: 5,
          mode: 'invalid-mode',
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // RF-01 / BUG-975: Missing X-Profile-Id header — proxy-guard fails closed
  // because profileMeta cannot be set (no profile resolved). zValidator runs
  // first and the body is valid, so proxy-guard is the next gate and returns
  // 403 (not the previous 400 from requireProfileId).
  it('returns 403 when X-Profile-Id header is missing [RF-01 / BUG-975]', async () => {
    const res = await app.request(
      '/v1/dictation/result',
      {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          completionKey: COMPLETION_KEY,
          localDate: TODAY,
          sentenceCount: 5,
          mode: 'homework',
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
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
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/dictation/streak
// ---------------------------------------------------------------------------

describe('GET /v1/dictation/streak', () => {
  it('returns 200 with streak 0 when no results exist', async () => {
    (getDictationStreak as jest.Mock).mockResolvedValueOnce({
      streak: 0,
      lastDate: null,
    });

    const res = await app.request(
      '/v1/dictation/streak',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(0);
    expect(body.lastDate).toBeNull();
  });

  it('returns 200 with correct streak when practiced today', async () => {
    (getDictationStreak as jest.Mock).mockResolvedValueOnce({
      streak: 2,
      lastDate: TODAY,
    });

    const res = await app.request(
      '/v1/dictation/streak',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(2);
    expect(body.lastDate).toBe(TODAY);
  });

  it('returns streak 0 when last practice was more than 1 day ago', async () => {
    const twoDaysAgo = '2020-01-01';
    (getDictationStreak as jest.Mock).mockResolvedValueOnce({
      streak: 0,
      lastDate: twoDaysAgo,
    });

    const res = await app.request(
      '/v1/dictation/streak',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toBe(0);
    expect(body.lastDate).toBe(twoDaysAgo);
  });

  it('delegates to getDictationStreak with profileId', async () => {
    (getDictationStreak as jest.Mock).mockResolvedValueOnce({
      streak: 0,
      lastDate: null,
    });

    await app.request(
      '/v1/dictation/streak',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(getDictationStreak).toHaveBeenCalledWith(
      mockDatabaseModule.db, // exact scoped db handle — guards against wrong-db injection
      'test-profile-id',
    );
  });

  // RF-01: Missing X-Profile-Id header must return 400
  it('returns 400 when X-Profile-Id header is missing [RF-01]', async () => {
    const res = await app.request(
      '/v1/dictation/streak',
      {
        headers: makeAuthHeaders(),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request('/v1/dictation/streak', {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/dictation/review
// ---------------------------------------------------------------------------

const REVIEW_SENTENCES = [
  {
    text: 'The cat sat on the mat.',
    withPunctuation: 'The cat sat on the mat period',
    wordCount: 6,
  },
  {
    text: 'It was a sunny day.',
    withPunctuation: 'It was a sunny day period',
    wordCount: 5,
  },
];

const REVIEW_BODY = {
  imageBase64: 'aGVsbG8=',
  imageMimeType: 'image/jpeg',
  sentences: REVIEW_SENTENCES,
  language: 'en',
};

describe('POST /v1/dictation/review', () => {
  it('returns 200 with review result', async () => {
    (reviewDictation as jest.Mock).mockResolvedValueOnce({
      totalSentences: 2,
      correctCount: 1,
      mistakes: [
        {
          sentenceIndex: 1,
          original: 'It was a sunny day.',
          written: 'It was a suny day.',
          error: 'spelling',
          correction: 'It was a sunny day.',
          explanation: '"sunny" has double n.',
        },
      ],
    });

    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify(REVIEW_BODY),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalSentences).toBe(2);
    expect(body.correctCount).toBe(1);
    expect(body.mistakes).toHaveLength(1);
    expect(body.mistakes[0].error).toBe('spelling');
  });

  it('returns 400 when X-Profile-Id header is missing', async () => {
    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify(REVIEW_BODY),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(reviewDictation).not.toHaveBeenCalled();
  });

  it('returns 400 when imageBase64 is missing', async () => {
    const { imageBase64: _omitted, ...bodyWithoutImage } = REVIEW_BODY;

    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify(bodyWithoutImage),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when imageMimeType is unsupported', async () => {
    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ ...REVIEW_BODY, imageMimeType: 'image/gif' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when sentences array is empty', async () => {
    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ ...REVIEW_BODY, sentences: [] }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REVIEW_BODY),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });

  it('returns 429 when the per-profile review limit is exhausted [CR-4]', async () => {
    meteringFixture.setNotificationLogCount(10);

    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify(REVIEW_BODY),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(reviewDictation).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // [WI-150 / WI-206] Payload caps — schema cap (400) and total-prompt-char
  // budget (413). Verifies the cheap reject paths fire BEFORE the LLM call.
  // -------------------------------------------------------------------------

  it('returns 400 when sentences array exceeds the schema cap [WI-150]', async () => {
    // Schema caps the array at 50. 51 entries trips the zod validator.
    const overCount = Array.from({ length: 51 }, (_, i) => ({
      text: `Sentence ${i}.`,
      withPunctuation: `Sentence ${i} period`,
      wordCount: 2,
    }));

    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ ...REVIEW_BODY, sentences: overCount }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(reviewDictation).not.toHaveBeenCalled();
  });

  it('returns 400 when a sentence text exceeds the per-sentence cap [WI-150]', async () => {
    const oversizedSentence = {
      text: 'a'.repeat(501), // schema cap is 500
      withPunctuation: 'short',
      wordCount: 1,
    };

    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          ...REVIEW_BODY,
          sentences: [oversizedSentence],
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(reviewDictation).not.toHaveBeenCalled();
  });

  it('returns 413 when total prompt-char count exceeds the budget [WI-150]', async () => {
    // 50 sentences × 250 chars (text + withPunctuation) = 12_500 chars > 12_000 cap.
    // Each sentence's text 125 chars + withPunctuation 125 chars = 250 chars.
    // All within per-field caps; only the aggregate budget rejects.
    const aggregateOversized = Array.from({ length: 50 }, () => ({
      text: 'a'.repeat(125),
      withPunctuation: 'b'.repeat(125),
      wordCount: 25,
    }));

    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          ...REVIEW_BODY,
          sentences: aggregateOversized,
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(reviewDictation).not.toHaveBeenCalled();
  });

  it('accepts a request just under the total prompt-char budget [WI-150]', async () => {
    (reviewDictation as jest.Mock).mockResolvedValueOnce({
      totalSentences: 30,
      correctCount: 30,
      mistakes: [],
    });

    // 30 sentences × 200 chars = 6_000 prompt chars; well under 12_000.
    const inBudget = Array.from({ length: 30 }, () => ({
      text: 'a'.repeat(100),
      withPunctuation: 'b'.repeat(100),
      wordCount: 20,
    }));

    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ ...REVIEW_BODY, sentences: inBudget }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(reviewDictation).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// [IMP-7] Quota-exhaustion tests for dictation LLM routes
// Ensures the metering middleware correctly rejects requests when quota is
// exceeded. Without these tests, the CRIT-1 billing fix can silently regress.
// ---------------------------------------------------------------------------

describe('Dictation LLM routes — quota exhaustion [IMP-7]', () => {
  beforeEach(() => {
    // Seed the real billing service state so metering rejects before the route.
    meteringFixture.state.monthlyLimit = 100;
    meteringFixture.setQuotaUsage(100, 0);
  });

  it('POST /dictation/generate returns 402 QUOTA_EXCEEDED', async () => {
    const res = await app.request(
      '/v1/dictation/generate',
      { method: 'POST', headers: AUTH_HEADERS, body: '{}' },
      TEST_ENV,
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('QUOTA_EXCEEDED');
  });

  it('POST /dictation/prepare-homework returns 402 QUOTA_EXCEEDED', async () => {
    const res = await app.request(
      '/v1/dictation/prepare-homework',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ text: 'Hello world.' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('QUOTA_EXCEEDED');
  });

  it('POST /dictation/review returns 402 QUOTA_EXCEEDED', async () => {
    const res = await app.request(
      '/v1/dictation/review',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify(REVIEW_BODY),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('QUOTA_EXCEEDED');
  });

  it('GET /dictation/streak is NOT metered (DB-only)', async () => {
    (getDictationStreak as jest.Mock).mockResolvedValueOnce({
      streak: 0,
      lastDate: null,
    });

    const res = await app.request(
      '/v1/dictation/streak',
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV,
    );

    // Streak endpoint should still return 200 even when quota is exhausted
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// F-047 regression: struggle fetch failure logging in dictation review
// ---------------------------------------------------------------------------

import * as sentryModule from '../services/sentry';

describe('POST /v1/dictation/review — struggle fetch failure logging (errors-api F-047)', () => {
  it('logs warn + captureException when getLearningProfile DB call throws', async () => {
    // Make the dictation review succeed (so we reach the struggle fetch)
    (reviewDictation as jest.Mock).mockResolvedValueOnce({
      totalSentences: 1,
      correctCount: 1,
      mistakes: [],
    });

    // Override db.query to throw for learningProfiles only.
    // The existing db.query is already a metering-fixture Proxy that handles
    // subscriptions / quotaPools / etc. — we wrap it so that only
    // learningProfiles throws while all other table accessors delegate through
    // to the fixture (so ensureFreeSubscription and metering continue working).
    const dbFetchError = new Error('Neon: connection pool exhausted');
    const originalQuery = (mockDatabaseModule.db as Record<string, unknown>)
      .query;
    (mockDatabaseModule.db as Record<string, unknown>).query = new Proxy(
      originalQuery as object,
      {
        get(target, prop, receiver) {
          if (prop === 'learningProfiles') {
            return {
              findFirst: jest.fn().mockRejectedValue(dbFetchError),
              findMany: jest.fn().mockResolvedValue([]),
            };
          }
          // All other tables delegate to the metering fixture's query proxy
          return Reflect.get(target, prop, receiver);
        },
      },
    );

    const captureExceptionSpy = jest
      .spyOn(sentryModule, 'captureException')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      const res = await app.request(
        '/v1/dictation/review',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify(REVIEW_BODY),
        },
        TEST_ENV,
      );

      // Review still succeeds — degradation is graceful
      expect(res.status).toBe(200);

      // captureException must have been called with the DB error
      expect(captureExceptionSpy).toHaveBeenCalled();
      const [caughtErr, context] = captureExceptionSpy.mock.calls[0] as [
        Error,
        { extra: { context: string } },
      ];
      expect(caughtErr).toBe(dbFetchError);
      expect(context?.extra?.context).toBe('dictation.review.struggles');

      // logger.warn must also have been emitted
      expect(warnSpy).toHaveBeenCalled();
      const matchingEntry = warnSpy.mock.calls
        .map((call) => {
          try {
            return JSON.parse(call[0] as string) as { message?: string };
          } catch {
            return null;
          }
        })
        .find((entry) => entry?.message?.includes('struggle fetch failed'));
      expect(matchingEntry).not.toBeNull();
    } finally {
      (mockDatabaseModule.db as Record<string, unknown>).query = originalQuery;
      captureExceptionSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
