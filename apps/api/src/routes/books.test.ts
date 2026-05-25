// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Mock database module
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Mock account + profile services
// ---------------------------------------------------------------------------

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
      birthYear: 2014,
      location: null,
      consentStatus: 'CONSENTED',
    }),
    getProfileAge: jest.fn().mockResolvedValue(12),
  };
});

// ---------------------------------------------------------------------------
// Mock curriculum + book-generation services
// ---------------------------------------------------------------------------

const mockBook = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  subjectId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Ancient Egypt',
  description: 'Explore pyramids and pharaohs',
  emoji: '🏛️',
  sortOrder: 1,
  topicsGenerated: false,
  createdAt: '2026-04-04T00:00:00.000Z',
  updatedAt: '2026-04-04T00:00:00.000Z',
};

const mockBookWithTopics = {
  book: { ...mockBook, topicsGenerated: true },
  topics: [
    {
      id: '550e8400-e29b-41d4-a716-446655440010',
      curriculumId: 'curr-1',
      title: 'Timeline of Egypt',
      description: 'How it all began',
      chapter: 'The Story',
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: mockBook.id,
      skipped: false,
      source: 'generated',
    },
  ],
  connections: [],
  status: 'NOT_STARTED' as const,
};

jest.mock(
  '../services/curriculum' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/curriculum',
    ) as typeof import('../services/curriculum');
    return {
      ...actual,
      getBooks: jest.fn().mockResolvedValue([]),
      getAllProfileBooks: jest.fn().mockResolvedValue({ subjects: [] }),
      getBookWithTopics: jest.fn().mockResolvedValue(null),
      persistBookTopics: jest.fn().mockResolvedValue(mockBookWithTopics),
      claimBookForGeneration: jest.fn().mockResolvedValue(null),
      releaseBookGenerationClaimIfEmpty: jest.fn().mockResolvedValue(undefined),
      moveTopicToBook: jest.fn().mockResolvedValue({ ok: true }),
      // expandExistingBookTopics is the extracted orchestration service.
      // We stub it here so the route test isolates the route's dispatch
      // contract (forwarding inputs + returning the persisted shape).
      // End-to-end coverage of the orchestration lives in
      // curriculum.test.ts → describe('expandExistingBookTopics').
      expandExistingBookTopics: jest.fn().mockResolvedValue(mockBookWithTopics),
    };
  },
);

jest.mock(
  '../services/book-generation' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/book-generation',
    ) as typeof import('../services/book-generation');
    return {
      ...actual,
      generateBookTopics: jest.fn().mockResolvedValue({
        topics: [
          {
            title: 'Timeline of Egypt',
            description: 'How it all began',
            chapter: 'The Story',
            sortOrder: 1,
            estimatedMinutes: 30,
          },
        ],
        connections: [],
      }),
    };
  },
);

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
      createFunction: jest.fn().mockReturnValue(jest.fn()),
    },
  };
});

// Billing mock — required by metering middleware now that
// POST /v1/subjects/:subjectId/books/:bookId/generate-topics is metered
// [WI-141 / WI-77 allowlist sweep].
jest.mock('../services/billing' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/billing',
  ) as typeof import('../services/billing');
  return {
    ...actual,
    ensureFreeSubscription: jest.fn().mockResolvedValue({
      id: 'sub-1',
      accountId: 'test-account-id',
      tier: 'free',
      status: 'active',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date().toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getQuotaPool: jest.fn().mockResolvedValue({
      id: 'qp-1',
      subscriptionId: 'sub-1',
      monthlyLimit: 500,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    decrementQuota: jest.fn().mockResolvedValue({
      success: true,
      source: 'monthly',
      remainingMonthly: 489,
      remainingTopUp: 0,
      remainingDaily: null,
    }),
    getTopUpCreditsRemaining: jest.fn().mockResolvedValue(0),
    safeRefundQuota: jest.fn().mockResolvedValue({ refunded: true }),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { app } from '../index';
import { bookRoutes } from './books';
import {
  getBooks,
  getAllProfileBooks,
  getBookWithTopics,
  claimBookForGeneration,
  releaseBookGenerationClaimIfEmpty,
} from '../services/curriculum';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { ERROR_CODES } from '@eduagent/schemas';

const mockGetBooks = getBooks as jest.MockedFunction<typeof getBooks>;
const mockGetAllProfileBooks = getAllProfileBooks as jest.MockedFunction<
  typeof getAllProfileBooks
>;
const mockGetBookWithTopics = getBookWithTopics as jest.MockedFunction<
  typeof getBookWithTopics
>;
const mockClaimBookForGeneration =
  claimBookForGeneration as jest.MockedFunction<typeof claimBookForGeneration>;
const mockReleaseBookGenerationClaimIfEmpty =
  releaseBookGenerationClaimIfEmpty as jest.MockedFunction<
    typeof releaseBookGenerationClaimIfEmpty
  >;

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BOOK_ID = '550e8400-e29b-41d4-a716-446655440001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('book routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
    jest.clearAllMocks();
  });

  // ---- [BUG-733 / PERF-3] GET /v1/library/books ----

  describe('GET /v1/library/books', () => {
    it('returns aggregated books across all subjects', async () => {
      mockGetAllProfileBooks.mockResolvedValueOnce({
        subjects: [
          {
            subjectId: SUBJECT_ID,
            subjectName: 'History',
            books: [mockBook as never],
          },
        ],
      });

      const res = await app.request(
        '/v1/library/books',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.subjects).toHaveLength(1);
      expect(body.subjects[0].subjectId).toBe(SUBJECT_ID);
      expect(body.subjects[0].books).toHaveLength(1);
      expect(mockGetAllProfileBooks).toHaveBeenCalledTimes(1);
      // Second arg must be the profile ID — proves the route passes scope.
      expect((mockGetAllProfileBooks as jest.Mock).mock.calls[0]?.[1]).toBe(
        'test-profile-id',
      );
    });

    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        '/v1/library/books',
        {
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockGetAllProfileBooks).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/library/books', {}, TEST_ENV);
      expect(res.status).toBe(401);
      expect(mockGetAllProfileBooks).not.toHaveBeenCalled();
    });
  });

  // ---- GET /v1/subjects/:subjectId/books ----

  describe('GET /v1/subjects/:subjectId/books', () => {
    it('returns 200 with empty books array', async () => {
      mockGetBooks.mockResolvedValueOnce([]);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('books');
      expect(body.books).toEqual([]);
    });

    it('returns 200 with books list', async () => {
      mockGetBooks.mockResolvedValueOnce([mockBook as never]);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.books).toHaveLength(1);
      expect(body.books[0].title).toBe('Ancient Egypt');
      expect(body.books[0].emoji).toBe('🏛️');
    });

    it('returns 400 for invalid subjectId', async () => {
      const res = await app.request(
        '/v1/subjects/not-a-uuid/books',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books`,
        { headers: { 'Content-Type': 'application/json' } },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/subjects/:subjectId/books/:bookId ----

  describe('GET /v1/subjects/:subjectId/books/:bookId', () => {
    it('returns 200 with book and topics', async () => {
      mockGetBookWithTopics.mockResolvedValueOnce(mockBookWithTopics as never);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.book.title).toBe('Ancient Egypt');
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].chapter).toBe('The Story');
      expect(body.status).toBe('NOT_STARTED');
    });

    it('returns 404 when book not found', async () => {
      mockGetBookWithTopics.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid bookId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/not-a-uuid`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  // ---- POST /v1/subjects/:subjectId/books/:bookId/generate-topics ----

  describe('POST /v1/subjects/:subjectId/books/:bookId/generate-topics', () => {
    it('generates topics for an unbuilt book', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce({
        id: BOOK_ID,
        title: 'Ancient Egypt',
        description: 'Explore pyramids and pharaohs',
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.book).toEqual(expect.objectContaining({}));
      expect(Array.isArray(body.topics)).toBe(true);
    });

    it('returns existing topics for already-generated book', async () => {
      // CAS returns null — another request already claimed it
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockGetBookWithTopics.mockResolvedValueOnce(mockBookWithTopics as never);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.book.topicsGenerated).toBe(true);
    });

    it('[WI-78 review] rejects an empty generated claim without releasing an active generator', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: { ...mockBook, topicsGenerated: true },
        topics: [],
      } as never);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({
        code: ERROR_CODES.CONFLICT,
      });
      expect(mockReleaseBookGenerationClaimIfEmpty).not.toHaveBeenCalled();
    });

    it('[WI-78 review] treats skipped-only generated topics as empty', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: { ...mockBook, topicsGenerated: true },
        topics: mockBookWithTopics.topics.map((topic) => ({
          ...topic,
          skipped: true,
        })),
      } as never);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({
        code: ERROR_CODES.CONFLICT,
      });
      expect(mockReleaseBookGenerationClaimIfEmpty).not.toHaveBeenCalled();
    });

    it('expands an already-generated thin book when requested', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockGetBookWithTopics.mockResolvedValueOnce(mockBookWithTopics as never);

      const { expandExistingBookTopics } = jest.requireMock(
        '../services/curriculum',
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ expandExisting: true }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // Route delegates to the extracted service. We verify the route
      // forwards the right inputs; the orchestration itself (LLM call,
      // fallback, prepareTopicExpansion, persistBookTopics) is covered in
      // curriculum.test.ts → describe('expandExistingBookTopics').
      expect(expandExistingBookTopics).toHaveBeenCalledTimes(1);
      const call = expandExistingBookTopics.mock.calls[0];
      const [
        ,
        profileIdArg,
        subjectIdArg,
        bookIdArg,
        existingArg,
        priorArg,
        depsArg,
      ] = call;
      expect(profileIdArg).toBe('test-profile-id');
      expect(subjectIdArg).toBe(SUBJECT_ID);
      expect(bookIdArg).toBe(BOOK_ID);
      expect(existingArg).toBe(mockBookWithTopics);
      expect(priorArg).toBeUndefined();
      expect(depsArg).toEqual(
        expect.objectContaining({
          learnerAge: 12,
          generateBookTopics: expect.any(Function),
          captureException: expect.any(Function),
        }),
      );
    });

    it('passes prior knowledge to generation', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce({
        id: BOOK_ID,
        title: 'Ancient Egypt',
        description: 'Explore pyramids and pharaohs',
      });

      const { generateBookTopics } = jest.requireMock(
        '../services/book-generation',
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            priorKnowledge: 'I already know about pyramids',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(generateBookTopics).toHaveBeenCalledWith(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        12,
        'I already know about pyramids',
      );
    });

    it('returns 404 when book not found in subject', async () => {
      // CAS returns null (no matching row), getBookWithTopics also returns null
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockGetBookWithTopics.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-139 / DS-050] Proxy-mode write guard
//
// Mini-Hono mount of bookRoutes with profileMeta.isOwner=false so
// assertNotProxyMode rejects every write before the service is touched.
// Mirrors proxy-guard.test.ts + assessments.test.ts.
// ---------------------------------------------------------------------------
describe('[WI-139 / DS-050] books proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'test-profile-id');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', bookRoutes);
    return proxyApp;
  }

  beforeEach(() => jest.clearAllMocks());

  it('POST /subjects/:subjectId/books/:bookId/generate-topics returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(403);
    expect(mockClaimBookForGeneration).not.toHaveBeenCalled();
  });

  it('PATCH /subjects/:subjectId/books/:bookId/topics/:topicId/move returns 403 when caller is in proxy mode', async () => {
    const TARGET_BOOK_ID = '550e8400-e29b-41d4-a716-446655440099';
    const TOPIC_ID = '550e8400-e29b-41d4-a716-446655440042';
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/books/${BOOK_ID}/topics/${TOPIC_ID}/move`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetBookId: TARGET_BOOK_ID }),
      },
    );
    expect(res.status).toBe(403);
  });
});
