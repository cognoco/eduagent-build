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
  updatedAt: new Date().toISOString(),
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
    {
      id: '550e8400-e29b-41d4-a716-446655440011',
      curriculumId: 'curr-1',
      title: 'Old Kingdom',
      description: 'The age of pyramid builders',
      chapter: 'The Story',
      sortOrder: 2,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: mockBook.id,
      skipped: false,
      source: 'generated',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440012',
      curriculumId: 'curr-1',
      title: 'Middle Kingdom',
      description: 'Reunification and stability',
      chapter: 'The Story',
      sortOrder: 3,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: mockBook.id,
      skipped: false,
      source: 'generated',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440013',
      curriculumId: 'curr-1',
      title: 'New Kingdom',
      description: 'The age of empire',
      chapter: 'The Story',
      sortOrder: 4,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: mockBook.id,
      skipped: false,
      source: 'generated',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440014',
      curriculumId: 'curr-1',
      title: 'Daily Life',
      description: 'How ordinary people lived',
      chapter: 'Society',
      sortOrder: 5,
      relevance: 'core',
      estimatedMinutes: 25,
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
      repairIncompleteBookGenerationClaim: jest
        .fn()
        .mockResolvedValue({ status: 'not_incomplete' }),
      moveTopicToBook: jest.fn().mockResolvedValue({ ok: true }),
      deleteBook: jest.fn().mockResolvedValue({
        deleted: true,
        bookId: mockBook.id,
        subjectId: mockBook.subjectId,
        topicCount: 0,
        startedTopicCount: 0,
      }),
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
    getEffectiveAccessForSubscription: jest.fn().mockResolvedValue({
      subscription: {
        id: 'sub-1',
        accountId: 'test-account-id',
        tier: 'free',
        status: 'active',
      },
      effectiveAccessTier: 'free',
      billingAccess: 'current',
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
    getOrProvisionProfileQuotaUsage: jest.fn().mockResolvedValue({
      id: 'pqu-1',
      subscriptionId: 'sub-1',
      profileId: 'test-profile-id',
      role: 'owner',
      monthlyLimit: 100,
      usedThisMonth: 10,
      dailyLimit: 10,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
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
// [WI-586] v2 identity + billing twins — mocked so flag-ON route unit tests
// reach the route handler without hitting the unmocked DB. account-middleware
// resolveIdentityV2, profile-scope findOwnerPersonScope, and metering's v2
// billing twins all run under IDENTITY_V2_ENABLED=true. getPersonAge returns a
// distinct age (36) from the legacy getProfileAge mock (12) so the flag-ON vs
// flag-OFF generation age is differential (non-vacuous). External-DB coverage
// lives in identity / billing integration suites.
// ---------------------------------------------------------------------------

jest.mock(
  '../services/identity-v2/identity-resolve' /* gc1-allow: route unit test — DB mocked; resolver covered by identity integration tests */,
  () => ({
    resolveIdentityV2: jest.fn().mockResolvedValue({
      account: {
        id: 'test-account-id',
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      personId: 'test-profile-id',
      organizationId: 'test-account-id',
      isOwner: true,
      roles: ['admin'],
    }),
  }),
);

jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: route unit test — DB mocked; profile scope covered by identity integration tests */,
  () => ({
    findOwnerPersonScope: jest.fn().mockResolvedValue({
      profileId: 'test-profile-id',
      meta: {
        birthYear: 2014,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    }),
    getPersonScope: jest.fn().mockResolvedValue({
      profileId: 'test-profile-id',
      meta: {
        birthYear: 2014,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    }),
  }),
);

jest.mock(
  '../services/identity-v2/helpers' /* gc1-allow: route unit test — DB mocked; person-age reader covered by helpers unit + integration tests */,
  () => {
    const actual = jest.requireActual(
      '../services/identity-v2/helpers',
    ) as typeof import('../services/identity-v2/helpers');
    return {
      ...actual,
      // Distinct from the legacy getProfileAge mock (12) so flag-ON generation
      // is asserted at age 36 — proves the v2 reader ran.
      getPersonAge: jest.fn().mockResolvedValue(36),
    };
  },
);

jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: route unit test — DB mocked; v2 billing twins covered by billing integration tests */,
  () => ({
    ensureFreeSubscriptionV2: jest.fn().mockResolvedValue({
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
    getEffectiveAccessForSubscriptionV2: jest.fn().mockResolvedValue({
      subscription: {
        id: 'sub-1',
        accountId: 'test-account-id',
        tier: 'free',
        status: 'active',
      },
      effectiveAccessTier: 'free',
      billingAccess: 'current',
    }),
    getQuotaPoolV2: jest.fn().mockResolvedValue({
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
    getOrProvisionProfileQuotaUsageV2: jest.fn().mockResolvedValue({
      id: 'pqu-1',
      subscriptionId: 'sub-1',
      profileId: 'test-profile-id',
      role: 'owner',
      monthlyLimit: 100,
      usedThisMonth: 10,
      dailyLimit: 10,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
    }),
  }),
);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { Hono, type ExecutionContext } from 'hono';
import { app } from '../index';
import { bookRoutes } from './books';
import {
  getBooks,
  getAllProfileBooks,
  getBookWithTopics,
  claimBookForGeneration,
  releaseBookGenerationClaimIfEmpty,
  repairIncompleteBookGenerationClaim,
  deleteBook,
} from '../services/curriculum';
import { inngest } from '../inngest/client';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { ERROR_CODES, type BookWithTopics } from '@eduagent/schemas';

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
const mockRepairIncompleteBookGenerationClaim =
  repairIncompleteBookGenerationClaim as jest.MockedFunction<
    typeof repairIncompleteBookGenerationClaim
  >;
const mockDeleteBook = deleteBook as jest.MockedFunction<typeof deleteBook>;
const mockInngestSend = inngest.send as jest.MockedFunction<
  typeof inngest.send
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
      expect(body.topics).toHaveLength(5);
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

  // ---- DELETE /v1/subjects/:subjectId/books/:bookId ----

  describe('DELETE /v1/subjects/:subjectId/books/:bookId', () => {
    it('deletes a book with no started topics', async () => {
      mockDeleteBook.mockResolvedValueOnce({
        deleted: true,
        bookId: BOOK_ID,
        subjectId: SUBJECT_ID,
        topicCount: 3,
        startedTopicCount: 0,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        deleted: true,
        bookId: BOOK_ID,
        subjectId: SUBJECT_ID,
        topicCount: 3,
        startedTopicCount: 0,
      });
      expect(mockDeleteBook).toHaveBeenCalledWith(
        undefined,
        'test-profile-id',
        SUBJECT_ID,
        BOOK_ID,
        { confirmStartedTopics: false },
      );
    });

    it('requires explicit confirmation when the book has started topics', async () => {
      mockDeleteBook.mockResolvedValueOnce({
        deleted: false,
        reason: 'started_topics',
        bookId: BOOK_ID,
        subjectId: SUBJECT_ID,
        topicCount: 7,
        startedTopicCount: 2,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({
        code: ERROR_CODES.CONFLICT,
        details: {
          reason: 'started_topics',
          bookId: BOOK_ID,
          subjectId: SUBJECT_ID,
          topicCount: 7,
          startedTopicCount: 2,
        },
      });
    });

    it('passes confirmation through when deleting a book with started topics', async () => {
      mockDeleteBook.mockResolvedValueOnce({
        deleted: true,
        bookId: BOOK_ID,
        subjectId: SUBJECT_ID,
        topicCount: 7,
        startedTopicCount: 2,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ confirmStartedTopics: true }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockDeleteBook).toHaveBeenCalledWith(
        undefined,
        'test-profile-id',
        SUBJECT_ID,
        BOOK_ID,
        { confirmStartedTopics: true },
      );
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
      mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
        status: 'in_progress',
      });
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: {
          ...mockBook,
          topicsGenerated: true,
          updatedAt: new Date().toISOString(),
        },
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
      mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
        status: 'in_progress',
      });
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: {
          ...mockBook,
          topicsGenerated: true,
          updatedAt: new Date().toISOString(),
        },
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

    it('[WI-142] repairs a stale empty generation claim instead of leaving the book stuck generated', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
        status: 'repaired',
        book: mockBookWithTopics as BookWithTopics,
      });
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: {
          ...mockBook,
          topicsGenerated: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
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

      expect(res.status).toBe(200);
      expect(mockRepairIncompleteBookGenerationClaim).toHaveBeenCalledTimes(1);
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'app/book.topics-generated',
        data: {
          subjectId: SUBJECT_ID,
          bookId: BOOK_ID,
          profileId: 'test-profile-id',
          timestamp: expect.any(String),
        },
      });
      expect(mockReleaseBookGenerationClaimIfEmpty).not.toHaveBeenCalled();
    });

    it('[WI-142] repairs a stale partial generation claim instead of reporting success', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
        status: 'repaired',
        book: mockBookWithTopics as BookWithTopics,
      });
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: {
          ...mockBook,
          topicsGenerated: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        topics: [mockBookWithTopics.topics[0]],
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

      expect(res.status).toBe(200);
      expect(mockRepairIncompleteBookGenerationClaim).toHaveBeenCalledTimes(1);
      expect(mockReleaseBookGenerationClaimIfEmpty).not.toHaveBeenCalled();
    });

    it('[WI-142] blocks fresh partial generation claims while the generator may still be active', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
        status: 'in_progress',
      });
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: {
          ...mockBook,
          topicsGenerated: true,
          updatedAt: new Date().toISOString(),
        },
        topics: [mockBookWithTopics.topics[0]],
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
      const { expandExistingBookTopics } = jest.requireMock(
        '../services/curriculum',
      );
      expect(expandExistingBookTopics).not.toHaveBeenCalled();
      expect(mockReleaseBookGenerationClaimIfEmpty).not.toHaveBeenCalled();
    });

    it('[WI-142] blocks explicit expansion for fresh partial generation claims', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
        status: 'in_progress',
      });
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: {
          ...mockBook,
          topicsGenerated: true,
          updatedAt: new Date().toISOString(),
        },
        topics: [mockBookWithTopics.topics[0]],
      } as never);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ expandExisting: true }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({
        code: ERROR_CODES.CONFLICT,
      });
      const { expandExistingBookTopics } = jest.requireMock(
        '../services/curriculum',
      );
      expect(expandExistingBookTopics).not.toHaveBeenCalled();
      expect(mockReleaseBookGenerationClaimIfEmpty).not.toHaveBeenCalled();
    });

    it('[WI-142] repairs stale skipped-only generated topics instead of looping on a no-op release', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
        status: 'repaired',
        book: mockBookWithTopics as BookWithTopics,
      });
      mockGetBookWithTopics.mockResolvedValueOnce({
        ...mockBookWithTopics,
        book: {
          ...mockBook,
          topicsGenerated: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
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

      expect(res.status).toBe(200);
      expect(mockRepairIncompleteBookGenerationClaim).toHaveBeenCalledTimes(1);
      expect(mockReleaseBookGenerationClaimIfEmpty).not.toHaveBeenCalled();
    });

    it('expands a stale already-generated thin book when requested', async () => {
      const staleThinBookWithTopics = {
        ...mockBookWithTopics,
        book: {
          ...mockBookWithTopics.book,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        topics: [mockBookWithTopics.topics[0]],
      };
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
        status: 'repaired',
        book: mockBookWithTopics as BookWithTopics,
      });
      mockGetBookWithTopics.mockResolvedValueOnce(
        staleThinBookWithTopics as never,
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
      // Route delegates the stale-repair decision to the curriculum service.
      expect(mockRepairIncompleteBookGenerationClaim).toHaveBeenCalledTimes(1);
      const call = mockRepairIncompleteBookGenerationClaim.mock.calls[0]!;
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
      expect(existingArg).toEqual(staleThinBookWithTopics);
      expect(priorArg).toBeUndefined();
      expect(depsArg).toEqual(
        expect.objectContaining({
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

    // -----------------------------------------------------------------------
    // [WI-586 MISS 3] learner-age reader is flag-gated at both route sites.
    // Flag OFF (default TEST_ENV) → legacy getProfileAge (mocked age 12).
    // Flag ON (V2_TEST_ENV) → v2 getPersonAge (mocked age 36). The asserted
    // generation age is differential — proves which reader ran. Both sites
    // (claimed-fresh generation + stale-thin expand) are covered.
    // -----------------------------------------------------------------------
    describe('[WI-586] learner-age reader is flag-gated', () => {
      const V2_TEST_ENV = { ...TEST_ENV, IDENTITY_V2_ENABLED: 'true' };

      it('flag OFF → claimed-fresh generation uses legacy age 12', async () => {
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
          { method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify({}) },
          TEST_ENV,
        );

        expect(res.status).toBe(200);
        expect(generateBookTopics).toHaveBeenCalledWith(
          'Ancient Egypt',
          'Explore pyramids and pharaohs',
          12,
          undefined,
        );
      });

      it('flag ON → claimed-fresh generation uses v2 age 36', async () => {
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
          { method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify({}) },
          V2_TEST_ENV,
        );

        expect(res.status).toBe(200);
        expect(generateBookTopics).toHaveBeenCalledWith(
          'Ancient Egypt',
          'Explore pyramids and pharaohs',
          36,
          undefined,
        );
      });

      // Stale-thin expand branch (site 251): CAS lost, repair returns
      // not_incomplete, expandExisting requested, active topics < MIN → the
      // route's own getProfileAge/getPersonAge read drives expansion.
      const staleThinBook = {
        ...mockBookWithTopics,
        book: {
          ...mockBookWithTopics.book,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        topics: [mockBookWithTopics.topics[0]],
      };

      it('flag OFF → stale-thin expand uses legacy age 12', async () => {
        mockClaimBookForGeneration.mockResolvedValueOnce(null);
        mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
          status: 'not_incomplete',
        });
        mockGetBookWithTopics.mockResolvedValueOnce(staleThinBook as never);
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
        expect(expandExistingBookTopics).toHaveBeenCalledTimes(1);
        const deps = (expandExistingBookTopics as jest.Mock).mock.calls[0]?.[6];
        expect(deps.learnerAge).toBe(12);
      });

      it('flag ON → stale-thin expand uses v2 age 36', async () => {
        mockClaimBookForGeneration.mockResolvedValueOnce(null);
        mockRepairIncompleteBookGenerationClaim.mockResolvedValueOnce({
          status: 'not_incomplete',
        });
        mockGetBookWithTopics.mockResolvedValueOnce(staleThinBook as never);
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
          V2_TEST_ENV,
        );

        expect(res.status).toBe(200);
        expect(expandExistingBookTopics).toHaveBeenCalledTimes(1);
        const deps = (expandExistingBookTopics as jest.Mock).mock.calls[0]?.[6];
        expect(deps.learnerAge).toBe(36);
      });
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

  it('DELETE /subjects/:subjectId/books/:bookId returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/books/${BOOK_ID}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(403);
    expect(mockDeleteBook).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pre-generation dispatch lifetime guard
//
// Regression coverage for: "Book topic generation fires pre-generation event
// via unawaited safeSend in request path". On Cloudflare Workers, background
// work that is neither awaited nor registered via executionCtx.waitUntil can be
// torn down once the response is sent — the `app/book.topics-generated`
// dispatch (and safeSend's failure capture) would then be lost.
//
// The handler must register the safeSend promise with c.executionCtx.waitUntil
// so the runtime keeps the worker alive until the dispatch settles, without
// blocking the user response. Mounts bookRoutes on a mini-Hono app with an
// owner profileMeta (mirrors the proxy-guard block above) so the real
// claim → generate → persist → dispatch path runs against the existing
// service mocks.
// ---------------------------------------------------------------------------
describe('POST generate-topics — pre-generation dispatch lifetime', () => {
  function makeOwnerApp() {
    const ownerApp = new Hono();
    ownerApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'test-profile-id');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: true });
      await next();
    });
    ownerApp.route('/', bookRoutes);
    return ownerApp;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockClaimBookForGeneration.mockResolvedValue({
      id: BOOK_ID,
      title: 'Ancient Egypt',
      description: 'Explore pyramids and pharaohs',
    });
  });

  it('registers the topics-generated dispatch with executionCtx.waitUntil', async () => {
    const waitUntil = jest.fn();
    const executionCtx = {
      waitUntil,
      passThroughOnException: jest.fn(),
    } as unknown as ExecutionContext;

    const res = await makeOwnerApp().fetch(
      new Request(
        `http://local/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      ),
      { ...TEST_ENV },
      executionCtx,
    );

    expect(res.status).toBe(200);

    // The dispatch promise must be handed to waitUntil so the Worker stays
    // alive until safeSend settles — not left as an orphaned `void` promise.
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const registered = waitUntil.mock.calls[0]![0] as unknown;
    expect(registered).toBeInstanceOf(Promise);

    // The registered promise drives the dispatch: awaiting it lets safeSend
    // run inngest.send with the pre-generation event.
    await registered;
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'app/book.topics-generated',
      data: {
        subjectId: SUBJECT_ID,
        bookId: BOOK_ID,
        profileId: 'test-profile-id',
        timestamp: expect.any(String),
      },
    });
  });

  it('still dispatches (and does not 500) when executionCtx.waitUntil is unavailable', async () => {
    // Some runtimes / test paths expose no usable executionCtx; accessing
    // c.executionCtx then throws. The handler must fall back to discarding the
    // never-rejecting safeSend handle rather than failing the request.
    const res = await makeOwnerApp().fetch(
      new Request(
        `http://local/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      ),
      { ...TEST_ENV },
      // No executionCtx passed — Hono leaves c.executionCtx unset and accessing
      // it throws, exercising the catch fallback.
    );

    expect(res.status).toBe(200);
    // Dispatch still fires on the fallback path (microtask), just untracked.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/book.topics-generated' }),
    );
  });
});
